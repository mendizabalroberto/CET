-- =============================================================================
-- web_write_paths.sql — cada escritura de la web, con el rol que la hace
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: 0012_rls_policies.sql · 0013_grants.sql · 0025 · VERIFICATION_PLAN R3
-- =============================================================================
-- LA FAMILIA QUE CAZA ESTE FICHERO
--
--   «Un cliente de Supabase escribe en una tabla para la que su rol no tiene
--    permiso, y el código afirma en un comentario que sí lo tiene.»
--
-- Van tres apariciones y las tres se descubrieron en producción, nunca en CI:
--
--   1. `/api/events` insertaba en `learning_events` con el cliente de SESIÓN.
--      `0012` solo le había dado SELECT. -> 500 en bucle. (0024, y el hermano
--      de este fichero: `telemetry_ingest.sql`.)
--   2. `lib/auth/actions.ts` insertaba en `registration_requests` con el
--      cliente ANÓNIMO, y su comentario decía que existía una política para
--      `anon`. `0012` dice literalmente lo contrario, y a propósito. Ni
--      política ni GRANT. Comprobado contra producción el 27/08/2026:
--
--        [ANON alta] 42501 :: permission denied for table registration_requests
--
--      El formulario de alta pública llevaba desde siempre sin escribir una
--      fila. Corregido en el CÓDIGO —el alta pasa a service_role— y NO en la
--      base: dar INSERT a `anon` sería el formulario de spam que `0012` teme.
--   3. Buscando lo anterior apareció el otro extremo de la misma tabla: el
--      superadmin no tiene política de UPDATE, su `current_school_id()` es
--      NULL, y resolver una solicitud afecta a 0 filas SIN error (0025).
--
-- Las tres son la misma frontera rota entre TypeScript y SQL, y ninguna la
-- podía ver un test que solo probara la lógica. Por eso el mapa de la sección A
-- se mantiene A MANO: SQL no puede leer TypeScript, así que la lista de "quién
-- escribe qué" es un contrato explícito. Cambiar el cliente de una escritura en
-- la web sin tocar este fichero deja el test rojo, que es exactamente lo que
-- ninguna de las tres veces pasó.
-- =============================================================================
begin;
select plan(14);

\ir helpers/fixture.psql

-- El fixture sabe entrar como `authenticated`; aquí hace falta además el rol
-- del visitante sin sesión, que es el que hacía el alta pública.
create or replace function pg_temp.login_as_anon()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $fn$;


-- =============================================================================
-- A. EL MAPA: cada escritura de la web y el rol que la ejecuta
-- =============================================================================
-- Sacado de `grep -rn "\.from(.*)\.\(insert\|update\|delete\)" apps/web/src`
-- cruzado con `grep -rn "createAdminClient(" apps/web/src`, que por diseño
-- lista todas las escaladas del repo (ver la cabecera de `lib/supabase/admin.ts`).

-- A1 · El rol de cada escritura tiene el GRANT. Sin él, PostgREST devuelve
-- 42501 y el usuario ve un error genérico o —peor— nada.
select is(
  (select coalesce(string_agg(m.rol || ' ' || m.priv || ' ' || m.tabla, ', '
                              order by m.tabla, m.rol), '')
   from (values
     -- cliente de SESIÓN (`lib/supabase/server.ts`, rol `authenticated`)
     ('authenticated', 'INSERT', 'public.learning_events'),      -- /api/events
     ('authenticated', 'INSERT', 'public.attempt_gradings'),     -- corrección manual
     ('authenticated', 'INSERT', 'public.sections'),             -- panel de clases
     ('authenticated', 'INSERT', 'public.section_members'),
     ('authenticated', 'UPDATE', 'public.registration_requests'),-- aprobar / rechazar
     -- NO esta `exam_attempts` UPDATE: 0012 y 0013 dan grant y politica al staff
     -- para "anular un intento", pero HOY NINGUN codigo de la web lo ejerce (el
     -- motor de examen escribe esa tabla con service_role). Un mapa de "lo que
     -- la web escribe" con una fila que la web no escribe deja de ser un mapa.
     -- Que ese grant y esa politica sigan emparejados lo cubre B2.
     -- cliente de SERVICIO (`lib/supabase/admin.ts`, rol `service_role`)
     ('service_role',  'INSERT', 'public.registration_requests'),-- ALTA PÚBLICA (el fallo 2)
     ('service_role',  'INSERT', 'public.profiles'),             -- createStudent
     ('service_role',  'INSERT', 'public.students'),
     ('service_role',  'INSERT', 'public.attempt_items'),        -- motor de examen
     ('service_role',  'INSERT', 'public.learning_events'),
     ('service_role',  'DELETE', 'public.exam_attempts')
   ) as m(rol, priv, tabla)
   where not has_table_privilege(m.rol, m.tabla, m.priv)),
  '',
  'Toda escritura de la web tiene el GRANT del rol que la ejecuta');

-- A2 · Y para las que van con la sesión del usuario, además la política. Falta
-- una de las dos mitades y el 500 es idéntico con dos mensajes distintos:
-- ninguno de los cuales llega nunca al usuario.
select is(
  (select coalesce(string_agg(m.tabla || ':' || m.priv, ', ' order by m.tabla), '')
   from (values
     ('INSERT', 'a', 'public.learning_events'),
     ('INSERT', 'a', 'public.attempt_gradings'),
     ('INSERT', 'a', 'public.sections'),
     ('INSERT', 'a', 'public.section_members'),
     ('UPDATE', 'w', 'public.registration_requests')
   ) as m(priv, cmd, tabla)
   where not exists (
     select 1 from pg_catalog.pg_policy p
     where p.polrelid = m.tabla::regclass
       and p.polcmd::text = m.cmd
       and 'authenticated' in (
         select r.rolname from pg_catalog.pg_roles r where r.oid = any(p.polroles)))),
  '',
  'Toda escritura con la sesión del usuario tiene además su política de RLS');


-- =============================================================================
-- B. INVARIANTES DE FAMILIA — los que cazan a los hermanos que aún no existen
-- =============================================================================

-- B1 · `anon` NO ESCRIBE EN NINGUNA TABLA. Es la prosa de `0012` («Aquí `anon`
-- no tiene ninguna política y tampoco ningún GRANT») convertida en algo
-- ejecutable, y cubre TODA tabla de `public`, incluidas las que no existen aún.
--
-- Este es el test que cierra la puerta por la que el alta pública quiso entrar:
-- el día que alguien "arregle" un formulario público concediéndole INSERT a
-- `anon`, el test se pone rojo antes de que la tabla sea un buzón de spam.
select is(
  (select coalesce(string_agg(c.relname || ':' || v.priv, ', '
                              order by c.relname, v.priv), '')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as v(priv)
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and has_table_privilege('anon', c.oid, v.priv)),
  '',
  '`anon` no tiene INSERT, UPDATE ni DELETE sobre NINGUNA tabla de public');

-- B2 · Ningún GRANT de escritura a `authenticated` se queda sin política. Un
-- GRANT sin política es una escritura que la RLS rechaza siempre: código que
-- parece autorizado y nunca funciona.
select is(
  (select coalesce(string_agg(c.relname || ':' || v.priv, ', '
                              order by c.relname, v.priv), '')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join (values ('INSERT', 'a'), ('UPDATE', 'w'), ('DELETE', 'd')) as v(priv, cmd)
   where n.nspname = 'public'
     and c.relkind = 'r'
     and has_table_privilege('authenticated', c.oid, v.priv)
     and not exists (
       select 1 from pg_catalog.pg_policy p
       where p.polrelid = c.oid
         and p.polcmd::text in (v.cmd, '*')
         and 'authenticated' in (
           select r.rolname from pg_catalog.pg_roles r where r.oid = any(p.polroles)))),
  '',
  'Todo GRANT de escritura a `authenticated` tiene su política: un GRANT sin '
  'política es una escritura que la RLS rechaza siempre');

-- B3 · Y la dirección contraria, que es la que hoy NO se cumple del todo.
--
-- Una política sin GRANT es lo simétrico: RLS aprobaría la fila, pero el
-- privilegio no existe y la escritura muere antes de llegar a la política. Las
-- tres de la lista son deliberadas —esas escrituras van por `service_role`,
-- que no pasa por RLS— pero se PINCHAN aquí en vez de ignorarse: si mañana
-- aparece una cuarta, es un fallo nuevo y este test lo dice por su nombre.
--
-- (`schools:UPDATE` es la que peor pinta tiene de las tres: la política
--  `schools_update` promete al school_admin que puede ajustar su colegio y el
--  GRANT no está. Hoy no hay pantalla que lo intente. Queda anotado.)
select is(
  (select coalesce(string_agg(c.relname || ':' || v.priv, ', '
                              order by c.relname, v.priv), '')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join (values ('INSERT', 'a'), ('UPDATE', 'w'), ('DELETE', 'd')) as v(priv, cmd)
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not has_table_privilege('authenticated', c.oid, v.priv)
     and exists (
       select 1 from pg_catalog.pg_policy p
       where p.polrelid = c.oid
         and p.polcmd::text in (v.cmd, '*')
         and 'authenticated' in (
           select r.rolname from pg_catalog.pg_roles r where r.oid = any(p.polroles)))),
  'schools:UPDATE, students:INSERT, students:UPDATE',
  'Las políticas sin GRANT son exactamente las tres conocidas y ninguna más');

-- B4 · LA FAMILIA DEL SUPERADMIN SIN COLEGIO, detectada por ESTRUCTURA.
--
--   «Una política cuyo `school_id = app.current_school_id()` deja fuera al
--    superadmin, que no tiene colegio.»
--
-- Ojo con la trampa, que es donde cayó la primera versión de este test: NO se
-- detecta mirando QUÉ predicado de rol usa la política. Aquella versión buscaba
-- "usa is_school_admin y no usa is_superadmin", y por eso solo encontró
-- `registration_requests`: las otras usan `is_staff()`. El predicado de rol no
-- era el problema. El problema es la OTRA mitad de la condición.
--
--     school_id = NULL   no es FALSE.   Es NULL.   Y NULL no deja pasar.
--
-- Comprobado contra producción con el superadmin real, aislando las dos mitades
-- sobre una fila de verdad:
--
--   is_staff=false  is_superadmin=true  current_school_id=NULL
--   (school_id = app.current_school_id()) sobre una fila real = NULL
--
-- O sea que arreglar `is_staff()` no habría arreglado nada: `true and NULL`
-- sigue siendo NULL. Por eso este test busca `current_school_id` en el texto de
-- la política —la mitad que excluye— y no el predicado de rol.
--
-- Se PINCHA la lista conocida en vez de exigir que esté vacía: estas diez
-- exclusiones (cinco tablas) son correctas: un superadmin no da de alta clases
-- ni emite telemetría de aprendizaje. Lo que no puede pasar es que aparezca una
-- más sin que nadie lo haya decidido, y esa es la que este test señala por su
-- nombre.
select is(
  (select coalesce(string_agg(x.tabla || ':' || x.cmd, ', ' order by x.tabla, x.cmd), '')
   from (
     select distinct c.relname as tabla,
            case p.polcmd when 'a' then 'INSERT' when 'w' then 'UPDATE'
                          when 'd' then 'DELETE' end as cmd
     from pg_catalog.pg_policy p
     join pg_catalog.pg_class c on c.oid = p.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and p.polcmd::text in ('a', 'w', 'd')
       and (coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')
         || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''))
            like '%current_school_id%'
       and not exists (
         select 1 from pg_catalog.pg_policy p2
         where p2.polrelid = p.polrelid and p2.polcmd = p.polcmd
           and (coalesce(pg_catalog.pg_get_expr(p2.polqual, p2.polrelid), '')
             || coalesce(pg_catalog.pg_get_expr(p2.polwithcheck, p2.polrelid), ''))
               like '%is_superadmin%')
   ) x),
  'exam_assignments:DELETE, exam_assignments:INSERT, exam_assignments:UPDATE, '
  'exam_attempts:UPDATE, learning_events:INSERT, '
  'section_members:DELETE, section_members:INSERT, '
  'sections:DELETE, sections:INSERT, sections:UPDATE',
  'Las escrituras que excluyen al superadmin son exactamente las diez '
  'conocidas: ninguna nueva se ha colado copiando el patrón');

-- B5 · Y AHORA POR COMPORTAMIENTO, que es lo único que demuestra que el
-- superadmin puede hacer lo que la aplicación le deja intentar.
--
-- B4 dice quién queda fuera leyendo el catálogo; esto EJECUTA la sentencia. Los
-- dos casos de este fichero (aquí y D3) se corresponden uno a uno con los
-- `requireRole([...])` de `components/staff/actions.ts` que incluyen
-- "superadmin" y escriben con el cliente de SESIÓN, el único que pasa por RLS.
--
-- Éste es la calificación manual: M09 y M12. Antes de `0025`, `affected`
-- devuelve -1, porque el `with check` de un INSERT falla RUIDOSAMENTE con
-- 42501 — al revés que el UPDATE de D3, que devuelve 0 filas y no dice nada.
-- Las dos formas del mismo fallo, y conviene tenerlas escritas juntas: en un
-- INSERT la RLS grita, en un UPDATE y en un DELETE calla.
--
-- El `supersedes_id` no es adorno, y apuntarlo bien tampoco es trivial:
-- `attempt_gradings_current_uniq` solo admite UNA fila por item con
-- `supersedes_id is null` —la primera calificación, no la vigente— y
-- `attempt_gradings_one_successor_uniq` (0015) impide que dos filas sustituyan
-- a la misma. Así que recalificar es encadenar POR LA HOJA: la fila a la que no
-- sustituye ninguna otra, que es el mismo anti-join de la vista
-- `attempt_gradings_current`. Encadenar por la primera devuelve 23505, no
-- 42501 — y un 23505 aquí sería un test que pasa por el motivo equivocado.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000000a');  -- superadmin

select is(pg_temp.affected(
  $$insert into public.attempt_gradings
      (attempt_id, attempt_item_id, points_awarded, max_points, is_correct,
       partial_ratio, graded_by, grader_id, supersedes_id)
    select g.attempt_id, g.attempt_item_id, 0, g.max_points, false, 0, 'manual',
           'aaaaaaaa-0000-4000-8000-00000000000a', g.id
      from public.attempt_gradings g
     where not exists (select 1 from public.attempt_gradings s
                        where s.supersedes_id = g.id)
     limit 1$$),
  1,
  'El superadmin califica a mano. Sin 0025 esto es 42501: is_staff() es false Y '
  'su current_school_id() es NULL, o sea que falla por las dos mitades a la vez');

select pg_temp.logout();


-- =============================================================================
-- C. Comportamiento del alta pública, extremo a extremo
-- =============================================================================

-- C1 · El fallo, tal cual se reprodujo contra producción.
select pg_temp.login_as_anon();

select is(pg_temp.errcode_of(
  $$insert into public.registration_requests
      (school_id, full_name, requested_year_level, guardian_email, status)
    values ('11111111-1111-4111-8111-111111111111', 'Tutor Anonimo', 6,
            'tutor@example.invalid', 'pending')$$),
  '42501',
  '`anon` NO puede insertar una solicitud de alta: es lo que hacía la web y '
  'por lo que /register llevaba desde siempre sin guardar nada');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.registration_requests$$),
  0,
  '`anon` tampoco LEE la cola de solicitudes (correos de tutores de menores)');

select pg_temp.logout();

-- C2 · Y el camino nuevo: el servidor, con service_role.
set local role service_role;

select is(pg_temp.affected(
  $$insert into public.registration_requests
      (school_id, full_name, requested_year_level, guardian_email, status)
    values ('11111111-1111-4111-8111-111111111111', 'Alumno Solicitante', 6,
            'tutor@example.invalid', 'pending')$$),
  1,
  'service_role SÍ inserta el alta: es el camino que usa hoy submitRegistration');

reset role;

-- C3 · Y ningún usuario con sesión puede fabricar solicitudes. Si pudiera, el
-- formulario de spam existiría igual, solo que hace falta una cuenta primero.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');  -- s1a, alumno

select is(pg_temp.affected(
  $$insert into public.registration_requests
      (school_id, full_name, requested_year_level, guardian_email, status)
    values ('11111111-1111-4111-8111-111111111111', 'Alumno Fantasma', 6,
            'otro@example.invalid', 'pending')$$),
  -1,
  'Un alumno con sesión no tiene siquiera el GRANT de INSERT sobre la cola');

select pg_temp.logout();


-- =============================================================================
-- D. Resolver la solicitud — el segundo camino roto (0025)
-- =============================================================================

-- D1 · El school_admin de su propio colegio. Esto ya funcionaba.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000001a');  -- admin_a

select is(pg_temp.affected(
  $$update public.registration_requests
       set status = 'rejected', rejection_reason = 'prueba',
           reviewed_by = 'aaaaaaaa-0000-4000-8000-00000000001a', reviewed_at = now()
     where full_name = 'Alumno Solicitante' and status = 'pending'$$),
  1,
  'El school_admin resuelve una solicitud de SU colegio');

select pg_temp.logout();

-- Se repone una solicitud pendiente para los dos casos que quedan.
set local role service_role;
insert into public.registration_requests
  (school_id, full_name, requested_year_level, guardian_email, status)
values ('11111111-1111-4111-8111-111111111111', 'Segundo Solicitante', 6,
        'tutor2@example.invalid', 'pending');
reset role;

-- D2 · El admin del colegio de al lado, no.
select pg_temp.login_as('bbbbbbbb-0000-4000-8000-00000000001b');  -- admin_b

select is(pg_temp.affected(
  $$update public.registration_requests
       set status = 'rejected', rejection_reason = 'prueba',
           reviewed_by = 'bbbbbbbb-0000-4000-8000-00000000001b', reviewed_at = now()
     where full_name = 'Segundo Solicitante'$$),
  0,
  'El admin del colegio Beta no puede resolver una solicitud del colegio Alfa');

select pg_temp.logout();

-- D3 · EL FALLO 3. Hoy, en producción, el superadmin es el único miembro del
-- personal que existe, así que sin `0025` la cola no la puede resolver NADIE.
-- Y no lo dice nada: el UPDATE afecta a 0 filas y PostgREST responde 204.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000000a');  -- superadmin

select is(pg_temp.affected(
  $$update public.registration_requests
       set status = 'rejected', rejection_reason = 'prueba',
           reviewed_by = 'aaaaaaaa-0000-4000-8000-00000000000a', reviewed_at = now()
     where full_name = 'Segundo Solicitante' and status = 'pending'$$),
  1,
  'El superadmin resuelve la solicitud. Sin 0025 esto devuelve 0 filas y '
  'NINGÚN error: el alumno se crea y la solicitud se queda pendiente para siempre');

select pg_temp.logout();

select * from finish();
rollback;
