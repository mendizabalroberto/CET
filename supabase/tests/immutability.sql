-- =============================================================================
-- immutability.sql — lo que es historia no se reescribe
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §4 (question_versions), §6 (attempt_responses), §8
-- =============================================================================
-- "La inmutabilidad se garantiza en la DB, no por convención."
--
-- La prueba clave es que estos tests corren como el PROPIETARIO de las tablas.
-- Un bloqueo por RLS o por GRANT protegería del cliente y dejaría al backend
-- capaz de reescribir un examen ya calificado. Los triggers de inmutabilidad
-- bloquean a TODOS los roles, service_role y postgres incluidos, y eso es
-- exactamente lo que se comprueba aquí.
-- =============================================================================
begin;
select plan(19);

\ir helpers/fixture.psql

-- =============================================================================
-- question_versions — el snapshot inmutable (DATA_MODEL §4)
-- =============================================================================
select has_trigger('public', 'question_versions', 'question_versions_immutable',
  'question_versions tiene el trigger de inmutabilidad');

select throws_ok(
  $$update public.question_versions
       set body = '{"stem":"Enunciado reescrito"}'::jsonb
     where id = '88888888-0000-4000-8000-000000000001'$$,
  '23001', null,
  'UPDATE sobre question_versions falla — incluso siendo el propietario de la tabla');

-- El caso que se cuela si el trigger se escribe "solo para las columnas
-- importantes": corregir una errata de la pista parece inocuo, pero cambiaría
-- lo que se le enseñó al alumno en un examen ya calificado.
select throws_ok(
  $$update public.question_versions
       set hint = '{"en":"Una pista distinta"}'::jsonb
     where id = '88888888-0000-4000-8000-000000000001'$$,
  '23001', null,
  'Ni siquiera un UPDATE "inocuo" de la pista pasa: la versión entera es inmutable');

-- Para authenticated hay además una segunda barrera: ni GRANT de UPDATE ni
-- política. Cae antes de llegar al trigger.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');
select isnt(pg_temp.errcode_of(
  $$update public.question_versions set difficulty = 1
     where id = '88888888-0000-4000-8000-000000000002'$$),
  null,
  'Un profesor tampoco puede hacer UPDATE de una versión (ni GRANT ni política)');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'question_versions'
      and cmd = 'UPDATE'),
  0,
  'No existe NINGUNA política de UPDATE sobre question_versions');
select pg_temp.logout();

-- El DELETE sí está permitido... pero solo si nadie lo usó nunca.
select throws_ok(
  $$delete from public.question_versions
     where id = '88888888-0000-4000-8000-000000000001'$$,
  '23503', null,
  'No se puede borrar una versión que un intento usó: `on delete restrict` en '
  'attempt_items.question_version_id (DATA_MODEL §6)');

insert into public.question_versions
  (id, question_id, version, format, body, answer_spec, difficulty, grading_mode)
values
  ('88888888-0000-4000-8000-0000000000ff', '77777777-0000-4000-8000-000000000001',
   99, 'numeric', '{"stem":"Borrador que nadie usó"}'::jsonb,
   '{"type":"numeric","value":1}'::jsonb, 3, 'auto');

select lives_ok(
  $$delete from public.question_versions
     where id = '88888888-0000-4000-8000-0000000000ff'$$,
  'Una versión que nunca se usó en un examen SÍ se puede borrar: es basura, no historia');


-- =============================================================================
-- attempt_responses — append-only con una excepción tasada (DATA_MODEL §6)
-- =============================================================================
select throws_ok(
  $$update public.attempt_responses
       set response = '{"type":"choice","selectedIds":["a"]}'::jsonb
     where id = 'c1c1c1c1-0000-4000-8000-000000000005'$$,
  '23001', null,
  'Reescribir una respuesta ya guardada es imposible: borraría la prueba de que cambió de opinión');

select throws_ok(
  $$update public.attempt_responses set server_ts = now() - interval '10 days'
     where id = 'c1c1c1c1-0000-4000-8000-000000000006'$$,
  '23001', null,
  'Retrasar el server_ts de una respuesta es imposible');

-- La única mutación permitida: marcar cuál es la final al entregar.
select lives_ok(
  $$update public.attempt_responses set is_final = false
     where id = 'c1c1c1c1-0000-4000-8000-000000000006'$$,
  '`is_final` SÍ puede cambiar: es la marca que pone el servidor al entregar');

select throws_ok(
  $$delete from public.attempt_responses
     where id = 'c1c1c1c1-0000-4000-8000-000000000001'$$,
  '23001', null,
  'Borrar una revisión suelta es imposible');

-- Pero el borrado legítimo del intento entero (RGPD, borrado de un alumno) tiene
-- que funcionar: si la cascada quedara bloqueada, no se podría cumplir un
-- derecho de supresión sin desactivar el trigger.
select lives_ok(
  $$delete from public.exam_attempts where id = '33333333-0000-4000-8000-0000000000a2'$$,
  'El borrado en CASCADA desde exam_attempts sí funciona: el guard distingue la '
  'cascada legítima del DELETE suelto');


-- =============================================================================
-- Auditoría y telemetría — append-only puro
-- =============================================================================
select throws_ok(
  $$update public.audit_log set action = 'nada.que.ver' where id = (
      select min(id) from public.audit_log)$$,
  '23001', null,
  'Editar el audit_log es imposible: un log editable no prueba nada');

-- El DELETE sobre audit_log NO lo bloquea un trigger (haría imposible la purga
-- por retención y la supresión de datos de un menor). Lo bloquea la ausencia de
-- privilegio: desde el cliente no existe.
select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'),
  'authenticated no tiene DELETE sobre audit_log');

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'),
  'authenticated tampoco tiene INSERT: el audit_log se escribe por app.audit()');

select throws_ok(
  $$update public.auth_attempts set success = true
     where id = (select min(id) from public.auth_attempts)$$,
  '23001', null,
  'Editar auth_attempts es imposible: sería borrar el rastro de un ataque de fuerza bruta');

select throws_ok(
  $$update public.learning_events set payload = '{"tampered":true}'::jsonb
     where id = (select min(id) from public.learning_events)$$,
  '23001', null,
  'Editar un learning_event es imposible: es un hecho histórico');

select ok(
  not has_table_privilege('authenticated', 'public.learning_events', 'DELETE'),
  'authenticated no tiene DELETE sobre learning_events (la retención se hace con '
  'DROP de partición; el borrado por RGPD lo hace service_role)');

-- Y la comprobación que garantiza que el derecho de supresión es ejecutable:
-- borrar al alumno tiene que llevarse su telemetría por cascada. Si el trigger
-- append-only bloqueara el DELETE, un alumno sería imborrable.
select lives_ok(
  $$delete from public.profiles where id = 'bbbbbbbb-0000-4000-8000-00000000003b'$$,
  'Borrar un perfil de alumno arrastra su telemetría por CASCADE: el derecho de '
  'supresión es ejecutable (MASTER_PLAN §9)');

select * from finish();
rollback;
