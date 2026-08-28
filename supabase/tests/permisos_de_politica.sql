-- =============================================================================
-- permisos_de_politica.sql — una politica no puede citar una tabla que quien la
-- evalua no tiene permiso de leer
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- QUE FAMILIA CAZA ESTE FICHERO
--
-- Postgres evalua la subconsulta de una politica CON LOS PRIVILEGIOS DE QUIEN
-- PREGUNTA, no con los del dueno de la politica. Si una politica de `profiles`
-- cita `student_school_memberships` y `authenticated` no tiene SELECT sobre esa
-- tabla, entonces NINGUN usuario autenticado puede leer `profiles` — ni siquiera
-- su propia fila, que otra politica le concede.
--
-- Paso de verdad el 28 de agosto de 2026. `0057_tutor_y_membresias.sql` creo
-- tres tablas con RLS y sin un solo `grant`, y reescribio `profiles_select_school`
-- para que consultara una de ellas. El resultado en produccion: el alumno metia
-- su PIN, la sesion se abria, y la app le devolvia a la pantalla de ingreso SIN
-- UN MENSAJE DE ERROR, porque `requireRole()` no distingue "fallo la consulta"
-- de "no hay perfil".
--
-- POR QUE LA BATERIA DE RLS NO LO VIO
--
-- `pg_temp.visible_count()` captura `insufficient_privilege` y devuelve 0. Es
-- deliberado y es correcto para lo suyo —mide filas visibles, no privilegios—
-- pero convierte este fallo en indistinguible de "la RLS filtro todo". Por eso
-- la parte B de aqui NO usa ese ayudante: deja que el error salga.
-- =============================================================================
begin;
select plan(4);

\ir helpers/fixture.psql

-- =============================================================================
-- A. Ninguna politica cita una tabla que `authenticated` no pueda leer
-- =============================================================================
-- Las tablas citadas se leen de `pg_depend`, no del texto de la politica: una
-- dependencia registrada por Postgres no se escapa por como este escrito el SQL.
select is(
  (select count(*)::int
     from (select distinct pol.oid as politica, ref.oid as citada
             from pg_policy pol
             join pg_depend d
               on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
             join pg_class ref
               on ref.oid = d.refobjid and d.refclassid = 'pg_class'::regclass
            where ref.oid <> pol.polrelid
              and ref.relkind in ('r','v','m','p')
              and not has_table_privilege('authenticated', ref.oid, 'SELECT')) sin_permiso),
  0,
  'ninguna politica cita una tabla sin SELECT para authenticated');

-- Control de que el detector NO es vacuo: si manana `pg_depend` deja de
-- registrar estas dependencias, la comprobacion de arriba pasaria siempre y no
-- estaria comprobando nada.
select cmp_ok(
  (select count(*)::int
     from (select distinct pol.oid, ref.oid
             from pg_policy pol
             join pg_depend d
               on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
             join pg_class ref
               on ref.oid = d.refobjid and d.refclassid = 'pg_class'::regclass
            where ref.oid <> pol.polrelid
              and ref.relkind in ('r','v','m','p')) citadas),
  '>', 0,
  'el detector ve dependencias de politica: no esta mirando un conjunto vacio');

-- =============================================================================
-- B. Control positivo: el alumno lee su propia fila de `profiles`
-- =============================================================================
-- Esto es literalmente el primer paso de `requireRole()`. Si esto no vive, el
-- alumno no entra, por correcto que sea su PIN.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');

select lives_ok(
  $$select 1 from public.profiles
     where id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$,
  'leer el propio perfil no levanta error de privilegios');

select is(
  (select count(*)::int from public.profiles
    where id = 'aaaaaaaa-0000-4000-8000-00000000003a'),
  1,
  'el alumno ve su propia fila de profiles');

select * from finish();
rollback;
