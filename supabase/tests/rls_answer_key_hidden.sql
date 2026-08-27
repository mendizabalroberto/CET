-- =============================================================================
-- rls_answer_key_hidden.sql — la clave de respuesta no llega al cliente
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §9 ("La clave de respuesta")
-- =============================================================================
-- Se prueba la defensa en profundidad completa, capa por capa:
--   Capa 0 — el privilegio de COLUMNA no existe (has_column_privilege).
--   Capa 1 — la política de RLS no devuelve ni una fila de question_versions.
--   Capa 2 — la vista attempt_items_student ni siquiera tiene la columna.
--   Capa 3 — el único camino del staff a la clave comprueba rol Y tenant.
--
-- La capa 0 es la que hay que probar con has_column_privilege() y no con un
-- SELECT: DATA_MODEL propone `revoke select (answer_key) ... from authenticated`,
-- que en Postgres NO retira nada si el rol conserva el SELECT de tabla. Este
-- test es lo que impide que esa línea vuelva a colarse creyendo que protege.
-- =============================================================================
begin;
select plan(19);

\ir helpers/fixture.psql

-- =============================================================================
-- Capa 0 — privilegios de columna
-- =============================================================================
select ok(
  not has_column_privilege('authenticated', 'public.attempt_items', 'answer_key', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre attempt_items.answer_key');

select ok(
  not has_column_privilege('authenticated', 'public.attempt_items', 'item_seed', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre attempt_items.item_seed '
  '(con la semilla y el generador de @cet/engine se regenera la respuesta)');

select ok(
  not has_column_privilege('authenticated', 'public.question_versions', 'answer_spec', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre question_versions.answer_spec');

select ok(
  not has_column_privilege('authenticated', 'public.students', 'pin_hash', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre students.pin_hash');

select ok(
  not has_table_privilege('anon', 'public.attempt_items', 'SELECT'),
  'anon no tiene absolutamente ningún SELECT sobre attempt_items');


-- =============================================================================
-- Capa 2 — la vista que consulta el cliente no tiene las columnas
-- =============================================================================
select hasnt_column('public', 'attempt_items_student', 'answer_key',
  'attempt_items_student NO expone answer_key');

select hasnt_column('public', 'attempt_items_student', 'item_seed',
  'attempt_items_student NO expone item_seed');


-- =============================================================================
-- El ALUMNO
-- =============================================================================
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');

select throws_ok(
  $$select answer_key from public.attempt_items
    where id = 'a1a1a1a1-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'El alumno recibe insufficient_privilege al pedir answer_key explícitamente');

-- `select *` es el intento evidente: expande a todas las columnas, answer_key
-- incluida, así que debe fallar igual.
select throws_ok(
  $$select * from public.attempt_items
    where id = 'a1a1a1a1-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'El alumno recibe insufficient_privilege con un `select *` sobre attempt_items');

select is(
  (select count(*)::int from public.attempt_items_student
    where attempt_id = '33333333-0000-4000-8000-0000000000a1'),
  3,
  'El alumno SÍ ve sus 3 items a través de attempt_items_student');

select throws_ok(
  $$select answer_spec from public.question_versions
    where id = '88888888-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'El alumno recibe insufficient_privilege al pedir question_versions.answer_spec');

select is(pg_temp.visible_count($$select count(*)::int from public.question_versions$$),
  0, 'El alumno no ve NINGUNA fila de question_versions (capa RLS)');

select is(pg_temp.visible_count($$select count(*)::int from public.questions$$),
  0, 'El alumno no puede enumerar el banco de preguntas');

select is(pg_temp.visible_count($$select count(*)::int from public.exam_blueprints$$),
  0, 'El alumno no ve blueprints: le dirían qué skills van a caer y con qué peso');

select throws_ok(
  $$select app.attempt_item_answer_key('a1a1a1a1-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'El camino del staff a la clave rechaza al alumno');


-- =============================================================================
-- El PROFESOR — mismo rol de Postgres, mismos privilegios de columna
-- =============================================================================
select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');

select throws_ok(
  $$select answer_key from public.attempt_items
    where id = 'a1a1a1a1-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'El profesor tampoco lee answer_key por la tabla: los GRANT son por ROL, y '
  'alumno y profesor comparten el rol `authenticated`');

select is(
  app.attempt_item_answer_key('a1a1a1a1-0000-4000-8000-000000000001') ->> 'type',
  'choice',
  'El profesor SÍ obtiene la clave por app.attempt_item_answer_key()');

select is(
  app.question_version_answer_spec('88888888-0000-4000-8000-000000000002') ->> 'type',
  'choice',
  'El profesor SÍ obtiene answer_spec por app.question_version_answer_spec()');


-- =============================================================================
-- El profesor del OTRO colegio
-- =============================================================================
-- La función es `security definer`: sin la comprobación de tenant, cualquier
-- profesor del mundo obtendría la clave de cualquier examen con solo conocer un
-- uuid. Este es el test que lo impide.
select pg_temp.logout();
select pg_temp.login_as('bbbbbbbb-0000-4000-8000-00000000002b');

select throws_ok(
  $$select app.attempt_item_answer_key('a1a1a1a1-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'Un profesor de Beta no obtiene la clave de un item de Alfa');

select pg_temp.logout();
select * from finish();
rollback;
