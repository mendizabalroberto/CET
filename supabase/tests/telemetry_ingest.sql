-- =============================================================================
-- telemetry_ingest.sql — el alumno escribe SU telemetría, y solo la suya
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: migración 0024 · DATA_MODEL §7 · VERIFICATION_PLAN M11
-- =============================================================================
-- EL FALLO QUE ORIGINA ESTE FICHERO
--
--   POST /api/events -> 500 cada 2-3 segundos, en bucle con backoff:
--   "[events] insert falló permission denied for table learning_events"
--
-- `0012_rls_policies.sql` dio a `authenticated` SOLO lectura sobre
-- `learning_events` porque daba por hecho que la ingesta iría por un Route
-- Handler con service_role. `apps/web/src/app/api/events/route.ts` inserta con
-- el cliente de SESIÓN —decisión mejor: la RLS queda como segunda defensa— y su
-- comentario afirmaba que existía una política `student_writes_own`. Nunca
-- existió. Frontera rota entre dos piezas escritas por separado: R3.
--
-- Hacían falta TRES cosas, y con dos de las tres el 500 sigue igual con otro
-- mensaje (comprobado contra producción en una transacción revertida):
--   1. `grant insert on learning_events to authenticated`
--   2. `grant usage on sequence learning_events_id_seq` (el `id` es nextval)
--   3. una política de INSERT
--
-- La parte A es lo que cierra la familia. La A2 en particular: `learning_events`
-- está particionada, y la partición del mes que viene la crea sola una función
-- de mantenimiento. Un arreglo hecho partición a partición se rompería solo el
-- día 1 del mes siguiente, en silencio y en producción.
-- =============================================================================
begin;
select plan(14);

\ir helpers/fixture.psql

-- =============================================================================
-- A. INVARIANTES DE FAMILIA
-- =============================================================================

-- A1 · Toda tabla que la web escribe CON LA SESIÓN DEL USUARIO tiene las dos
-- mitades: el GRANT de INSERT y una política de INSERT. Falta una de las dos y
-- el endpoint devuelve 500 con dos mensajes distintos, ninguno de los cuales
-- llega al usuario.
--
-- La lista se mantiene a mano porque SQL no puede leer TypeScript. Hoy son las
-- dos que insertan con `createClient()` (sesión), no con `createAdminClient()`.
--
-- NO está `registration_requests` a propósito, y es un hallazgo abierto:
-- `lib/auth/actions.ts` la inserta con el cliente ANÓNIMO y su comentario dice
-- que hay una política para `anon`, mientras que 0012 declara justo lo
-- contrario ("Dar INSERT a `anon` sobre esta tabla sería un formulario de spam
-- abierto a internet") y manda esa alta por service_role. Comprobado contra
-- producción: `anon` recibe 42501, o sea el alta pública está rota igual que lo
-- estaba la telemetría. Cuál de las dos declaraciones gana es una decisión de
-- producto; quien la tome añade aquí la fila que corresponda.
select is(
  (select coalesce(string_agg(t.tabla || ':' || t.falta, ', ' order by t.tabla), '')
   from (
     select v.tabla,
            case when not has_table_privilege('authenticated', v.tabla, 'INSERT')
                 then 'sin-grant' else 'sin-politica' end as falta
     from (values ('public.learning_events'), ('public.attempt_gradings')) as v(tabla)
     where not has_table_privilege('authenticated', v.tabla, 'INSERT')
        or not exists (
          select 1 from pg_catalog.pg_policy p
          where p.polrelid = v.tabla::regclass
            and p.polcmd::text = 'a'
            and 'authenticated' in (
              select r.rolname from pg_catalog.pg_roles r where r.oid = any(p.polroles)))
   ) t),
  '',
  'Toda tabla que la web escribe con la sesión del usuario tiene GRANT de '
  'INSERT y política de INSERT para `authenticated`');

-- A2 · Ninguna partición concede nada a los roles de aplicación. El acceso va
-- SIEMPRE por la tabla padre —Postgres comprueba los privilegios de la tabla
-- nombrada, no los de la partición a la que enruta— así que un GRANT aquí no
-- añade acceso legítimo y sí abre la puerta directa, que se rige por la RLS de
-- la partición y no por la del padre.
--
-- Este es el test que caza el fallo del mes que viene: cubre TODA partición de
-- TODA tabla particionada, incluidas las que aún no existen.
select is(
  (select coalesce(string_agg(c.relname || ':' || t.rol, ', ' order by c.relname, t.rol), '')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) as t(rol)
   where n.nspname = 'public'
     and c.relispartition
     and c.relkind in ('r', 'p')
     and (has_table_privilege(t.rol, c.oid, 'SELECT')
       or has_table_privilege(t.rol, c.oid, 'INSERT')
       or has_table_privilege(t.rol, c.oid, 'UPDATE')
       or has_table_privilege(t.rol, c.oid, 'DELETE'))),
  '',
  'NINGUNA partición es alcanzable directamente por anon ni por authenticated');

-- A3 · Y toda partición lleva su propia RLS activada. El GRANT ausente ya cierra
-- la puerta, pero si alguien concede un privilegio por descuido, la RLS de la
-- partición es lo único que queda detrás.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   join pg_catalog.pg_inherits i on i.inhrelid = c.oid
   join pg_catalog.pg_class padre on padre.oid = i.inhparent
   where n.nspname = 'public'
     and c.relkind = 'r'
     and padre.relrowsecurity
     and not c.relrowsecurity),
  '',
  'TODA partición de una tabla con RLS tiene RLS activada: si el padre la '
  'tiene y la hija no, la hija es la puerta de atrás');

-- A4 · `learning_events` sigue siendo append-only para el rol de aplicación.
-- Un alumno que pudiera reescribir sus eventos podría maquillar las horas de
-- estudio que el informe del tutor va a afirmar.
select ok(
  not has_table_privilege('authenticated', 'public.learning_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.learning_events', 'DELETE'),
  '`authenticated` no puede UPDATE ni DELETE sobre learning_events');

-- A5 · El permiso invisible: sin USAGE sobre la secuencia, el `default nextval`
-- del `id` falla con «permission denied for sequence» y el 500 es idéntico.
select ok(
  has_sequence_privilege('authenticated', 'public.learning_events_id_seq', 'USAGE'),
  '`authenticated` tiene USAGE sobre learning_events_id_seq (el id es nextval)');


-- =============================================================================
-- B. Comportamiento con la sesión de un alumno de verdad
-- =============================================================================
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');  -- s1a

select is(pg_temp.affected(
  $$insert into public.learning_events
      (school_id, student_id, session_id, seq, event_type, payload)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-00000000003a',
            '0e0e0e0e-0000-4000-8000-000000000001', 0, 'lesson_opened',
            '{"lesson":"fractions"}'::jsonb)$$),
  1,
  's1a escribe SU propio evento: es lo que /api/events lleva meses sin poder hacer');

select is(pg_temp.errcode_of(
  $$insert into public.learning_events (school_id, student_id, session_id, seq, event_type)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-00000000004a',
            '0e0e0e0e-0000-4000-8000-000000000002', 0, 'lesson_opened')$$),
  '42501',
  's1a NO puede escribir un evento a nombre de s2a: falsear las horas de un '
  'compañero envenenaría su mastery');

select is(pg_temp.errcode_of(
  $$insert into public.learning_events (school_id, student_id, session_id, seq, event_type)
    values ('22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-0000-4000-8000-00000000003a',
            '0e0e0e0e-0000-4000-8000-000000000003', 0, 'lesson_opened')$$),
  '42501',
  's1a NO puede escribir un evento en el colegio Beta');

select is(pg_temp.affected(
  $$update public.learning_events set seq = 99
     where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  -1,
  's1a no tiene siquiera el GRANT de UPDATE: no puede reescribir su historial');

-- La puerta de atrás: escribir DIRECTAMENTE en la partición, saltándose las
-- políticas del padre.
select is(pg_temp.errcode_of(
  format($$insert into public.%I (school_id, student_id, session_id, seq, event_type)
           values ('11111111-1111-4111-8111-111111111111',
                   'aaaaaaaa-0000-4000-8000-00000000003a',
                   '0e0e0e0e-0000-4000-8000-000000000004', 1, 'lesson_opened')$$,
         'learning_events_' || to_char(now(), 'YYYY_MM'))),
  '42501',
  's1a no puede insertar DIRECTAMENTE en la partición del mes');

-- Control positivo de lectura: el arreglo no ha tocado el SELECT.
select is(pg_temp.visible_count(
  $$select count(*)::int from public.learning_events
     where session_id = '0e0e0e0e-0000-4000-8000-000000000001'$$),
  1,
  's1a sigue leyendo su propio evento (la política de SELECT no se ha tocado)');

select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');  -- teacher_a

select is(pg_temp.errcode_of(
  $$insert into public.learning_events (school_id, student_id, session_id, seq, event_type)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-00000000002a',
            '0e0e0e0e-0000-4000-8000-000000000005', 0, 'lesson_opened')$$),
  '42501',
  'Un PROFESOR no genera telemetría de aprendizaje: /api/events le responde 204 '
  'sin insertar, y la base de datos dice lo mismo');

select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');  -- s1a

-- Enrutado de particiones (M11): un evento con fecha del mes siguiente tiene
-- que aterrizar en la partición del mes siguiente, no en la `default`.
select ok(
  pg_temp.affected(
    $$insert into public.learning_events
        (school_id, student_id, session_id, seq, event_type, server_ts)
      values ('11111111-1111-4111-8111-111111111111',
              'aaaaaaaa-0000-4000-8000-00000000003a',
              '0e0e0e0e-0000-4000-8000-000000000006', 555, 'lesson_opened',
              date_trunc('month', now()) + interval '1 month' + interval '2 days')$$) = 1,
  's1a escribe un evento fechado el mes que viene');

select pg_temp.logout();

select is(
  (select c.relname
     from public.learning_events e
     join pg_catalog.pg_class c on c.oid = e.tableoid
    where e.seq = 555),
  'learning_events_' || to_char(date_trunc('month', now()) + interval '1 month', 'YYYY_MM'),
  'El evento del mes que viene aterriza en la partición del mes que viene, '
  'no en learning_events_default');

select * from finish();
rollback;
