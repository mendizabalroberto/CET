-- =============================================================================
-- public_rpc_surface.sql — lo que la web llama por PostgREST tiene que ESTAR
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: migración 0023 · VERIFICATION_PLAN M12 · MASTER_PLAN §9
-- =============================================================================
-- EL FALLO QUE ORIGINA ESTE FICHERO
--
-- `actions.ts` llamaba a `app.audit()` y a `app.attempt_item_answer_key()` con
-- `.schema("app").rpc(...)`. PostgREST expone SOLO `public` y `graphql_public`,
-- así que respondía 406 / PGRST106 «Invalid schema: app». Ni una sola acción de
-- staff hecha desde la web llegó nunca al `audit_log`, y revelar una clave de
-- respuesta —que M12 exige registrar— fallaba entero.
--
-- El caso concreto se prueba abajo. Pero lo que de verdad cierra la familia es
-- la parte A: **ninguna función que la web necesite llamar puede vivir solo en
-- un esquema que PostgREST no expone**. Ese test falla HOY contra producción
-- (devuelve `audit_staff_action, attempt_item_answer_key`) y pasa con 0023
-- aplicada. Es la prueba con evidencia que pide el plan, pasada C.
--
-- Si mañana alguien añade una llamada `.rpc("lo_que_sea")` desde la web, su
-- nombre va a la lista de la parte A. Es la única parte que hay que mantener a
-- mano: SQL no puede leer TypeScript.
-- =============================================================================
begin;
select plan(20);

\ir helpers/fixture.psql

-- =============================================================================
-- A. INVARIANTES DE FAMILIA
-- =============================================================================

-- A1 · Toda función que la web invoca por PostgREST existe en `public`.
select is(
  (select coalesce(string_agg(f.nombre, ', ' order by f.nombre), '')
   from (values
     -- apps/web/src/lib/data/schools.ts
     ('list_active_schools'),
     -- apps/web/src/components/staff/audit-rpc.ts  (AUDIT_RPC.publicFn)
     ('audit_staff_action'),
     -- apps/web/src/components/staff/audit-rpc.ts  (ANSWER_KEY_RPC.publicFn)
     ('attempt_item_answer_key'),
     -- apps/web/src/app/api/events/route.ts  (el colegio del evento, 0077)
     ('colegio_del_evento'),
     -- canjearEnlace / olvidarDispositivo (web) y auth-pin (edge), 0078.
     -- Es la cuarta vez que una funcion que la aplicacion necesita nace solo en
     -- `app`; esta se escribio con envoltorio desde el primer dia y este assert
     -- es quien impide que alguien lo quite creyendo que sobra.
     ('registrar_acceso')
   ) as f(nombre)
   where not exists (
     select 1
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f.nombre)),
  '',
  'NINGUNA función que la web llama vive solo en un esquema no expuesto: '
  'PostgREST solo sirve `public`, y desde `app` responde 406/PGRST106');

-- A2 · Ninguna función de `public` al alcance de `authenticated` acepta la
-- identidad del llamante. Los envoltorios de service_role (0014, 0019) reciben
-- `p_actor_id`/`p_school_id` porque corren SIN sesión desde una Edge Function;
-- si uno de ésos quedara al alcance del rol de la aplicación, cualquier
-- profesor podría firmar una entrada de auditoría con el nombre de otro.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and exists (
       select 1 from unnest(coalesce(p.proargnames, '{}')) a
       where a in ('p_actor_id', 'p_school_id', 'p_role'))),
  '',
  'NINGUNA función de public alcanzable por `authenticated` recibe actor, '
  'colegio o rol del cliente: esos tres los deriva el servidor de la sesión');

-- A3 · Los dos envoltorios de las Edge Functions siguen siendo solo de
-- service_role. Es el reverso exacto de A2.
select is(
  (select coalesce(string_agg(f.nombre || ':' || f.rol, ', ' order by f.nombre, f.rol), '')
   from (values
     ('public.audit_student_pin_reset(uuid, uuid, uuid, text)', 'authenticated'),
     ('public.audit_student_pin_reset(uuid, uuid, uuid, text)', 'anon'),
     ('public.audit_staff_password_change(uuid, uuid)', 'authenticated'),
     ('public.audit_staff_password_change(uuid, uuid)', 'anon')
   ) as f(nombre, rol)
   where has_function_privilege(f.rol, f.nombre, 'EXECUTE')),
  '',
  'Los envoltorios de las Edge Functions NO son alcanzables por anon ni por '
  'authenticated: aceptan un actor_id y ese dato solo es fiable sin sesión');

-- A4 · `anon` no llega a ninguno de los dos envoltorios nuevos: uno escribe en
-- el registro forense y el otro devuelve claves de respuesta.
select is(
  (select coalesce(string_agg(f.nombre, ', ' order by f.nombre), '')
   from (values
     ('public.audit_staff_action(text, text, uuid, jsonb, jsonb)'),
     ('public.attempt_item_answer_key(uuid)')
   ) as f(nombre)
   where has_function_privilege('anon', f.nombre, 'EXECUTE')),
  '',
  '`anon` no ejecuta ninguno de los dos envoltorios de 0023');

-- A5 · Y `authenticated` sí llega a los dos: sin esto, el arreglo sería un
-- 406 cambiado por un 42501 y la auditoría seguiría perdiéndose.
select ok(
  has_function_privilege('authenticated',
    'public.audit_staff_action(text, text, uuid, jsonb, jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.attempt_item_answer_key(uuid)', 'EXECUTE'),
  '`authenticated` ejecuta los dos envoltorios de 0023');

-- A6 · Toda función `security definer` de public con `search_path` fijado. Se
-- repite aquí, además del bloque de la migración, porque 0023 crea dos nuevas y
-- un `create or replace` que se deje la línea no rompe nada visible.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
       where cfg like 'search_path=%')),
  '',
  'NINGUNA función security definer sin search_path fijado');


-- =============================================================================
-- B. El envoltorio de auditoría, con la sesión de un profesor de verdad
-- =============================================================================
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');  -- teacher_a

select ok(
  (select public.audit_staff_action(
     'attempt.answer_key_viewed', 'attempt_items',
     'a1a1a1a1-0000-4000-8000-000000000001',
     null,
     '{"attempt_id":"33333333-0000-4000-8000-0000000000a1","granted":true}'::jsonb)) > 0,
  'teacher_a registra la revelación de una clave de respuesta (M12)');

select pg_temp.logout();

-- Las tres columnas de identidad las pone el SERVIDOR. El envoltorio ni
-- siquiera tiene un parámetro para decir quién es: por eso son ciertas.
select is(
  (select actor_id from public.audit_log order by id desc limit 1),
  'aaaaaaaa-0000-4000-8000-00000000002a'::uuid,
  'El actor_id lo pone auth.uid(), no el cliente');

select is(
  (select actor_role from public.audit_log order by id desc limit 1),
  'teacher'::public.user_role,
  'El actor_role queda congelado desde la base de datos, no desde el cliente');

select is(
  (select school_id from public.audit_log order by id desc limit 1),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'El school_id sale de app.current_school_id(), no del cuerpo de la petición');

select is(
  (select action || ' ' || entity_type from public.audit_log order by id desc limit 1),
  'attempt.answer_key_viewed attempt_items',
  'La acción y la entidad llegan tal cual a la fila');


-- =============================================================================
-- C. Lo que el envoltorio NO deja hacer
-- =============================================================================
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');  -- s1a, alumno

-- 22023 y ya no 42501, y el matiz importa. Desde 0068 el envoltorio tiene un
-- vocabulario POR ROL: el alumno pasa la puerta del rol y se estrella contra la
-- de las acciones. La garantia es la misma -no escribe acciones de personal- y
-- el motivo es distinto, asi que el codigo tambien.
select is(pg_temp.errcode_of(
  $$select public.audit_staff_action('student.created', 'students',
      'aaaaaaaa-0000-4000-8000-00000000003a', null, null)$$),
  '22023',
  'Un ALUMNO no escribe acciones de PERSONAL en el audit_log');

-- El positivo de esa misma decision. Un alumno SI audita una cosa: el canje de
-- su propio enlace, porque el actor de ese hecho es el y auditarlo con
-- service_role dejaria el registro sin actor. Sin este assert, la unica
-- capacidad nueva que 0068 concede quedaria sin probar — y una capacidad sin
-- probar es donde se esconde el siguiente agujero.
select isnt(pg_temp.errcode_of(
  $$select public.audit_staff_action('alumno.enlace_canjeado', 'student_access_links',
      'aaaaaaaa-0000-4000-8000-00000000003a', null, null)$$),
  '42501',
  'pero SI audita el canje de su propio enlace');

select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');  -- teacher_a

select is(pg_temp.errcode_of(
  $$select public.audit_staff_action('mentira.inventada', 'students', null, null, null)$$),
  '22023',
  'Una acción fuera de la lista blanca se rechaza: el vocabulario del log se '
  'amplía con una migración, no desde el cliente');

select is(pg_temp.errcode_of(
  $$select public.audit_staff_action('student.created', 'attempt_item', null, null, null)$$),
  '22023',
  'Un entity_type que no es una tabla real se rechaza: una errata deja una '
  'entrada que la investigación de ese alumno nunca encontraría');

-- Control positivo: ninguna de las tres llamadas rechazadas dejó fila. Sin
-- esto, una guarda que lanzara DESPUÉS del insert pasaría los tests de arriba.
--
-- Se cuenta SIN sesión (como propietario): contarlo desde la sesión del
-- profesor daría 0 aunque la fila existiera, porque la RLS del audit_log ya
-- filtra — un control positivo que no puede fallar no es un control.
select pg_temp.logout();

select is(
  (select count(*)::int from public.audit_log
   where action in ('mentira.inventada', 'student.created')),
  0,
  'Ninguna llamada rechazada dejó fila en el audit_log');


-- =============================================================================
-- D. El envoltorio de la clave de respuesta — rol y tenant siguen mandando
-- =============================================================================
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');  -- teacher_a

select ok(
  (select public.attempt_item_answer_key('a1a1a1a1-0000-4000-8000-000000000001')) is not null,
  'teacher_a obtiene por `public` la clave de un item de SU colegio');

select is(pg_temp.errcode_of(
  $$select public.attempt_item_answer_key('b1b1b1b1-0000-4000-8000-000000000001')$$),
  '42501',
  'teacher_a NO obtiene la clave de un item del colegio Beta');

select pg_temp.logout();
select pg_temp.login_as('bbbbbbbb-0000-4000-8000-00000000002b');  -- teacher_b

select is(pg_temp.errcode_of(
  $$select public.attempt_item_answer_key('a1a1a1a1-0000-4000-8000-000000000001')$$),
  '42501',
  'teacher_b NO obtiene la clave de un item del colegio Alfa: el envoltorio '
  'público no ha aflojado el tenant');

select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');  -- s1a, alumno

select is(pg_temp.errcode_of(
  $$select public.attempt_item_answer_key('a1a1a1a1-0000-4000-8000-000000000001')$$),
  '42501',
  'Un ALUMNO no llega a la clave de respuesta de su propio examen por el '
  'envoltorio público');

select pg_temp.logout();

select * from finish();
rollback;
