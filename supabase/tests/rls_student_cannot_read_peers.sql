-- =============================================================================
-- rls_student_cannot_read_peers.sql — un alumno no ve a sus compañeros
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §9, patrón `student_reads_own`
-- =============================================================================
-- El aislamiento entre colegios (AD-1) no basta. Dentro de un mismo colegio, un
-- alumno de 11 años con la consola del navegador abierta no debe poder leer el
-- examen, las respuestas ni las notas de quien tiene al lado — y mucho menos
-- ESCRIBIR en su propio intento.
--
-- s1a y s2a son compañeros de Y6A: mismo colegio, misma clase, misma asignación
-- de examen. Es el caso que la RLS de tenant NO cubre.
-- =============================================================================
begin;
select plan(24);

\ir helpers/fixture.psql

select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');   -- s1a

-- =============================================================================
-- Lectura del intento del compañero
-- =============================================================================
select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts
    where id = '33333333-0000-4000-8000-0000000000a2'$$),
  0, 's1a no ve el intento de s2a (mismo colegio, misma clase)');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_items
    where attempt_id = '33333333-0000-4000-8000-0000000000a2'$$),
  0, 's1a no ve los items del intento de s2a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_items_student
    where attempt_id = '33333333-0000-4000-8000-0000000000a2'$$),
  0, 's1a tampoco los ve por la vista attempt_items_student '
     '(security_invoker: la vista NO salta la RLS)');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_responses
    where attempt_id = '33333333-0000-4000-8000-0000000000a2'$$),
  0, 's1a no ve las respuestas de s2a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_gradings
    where attempt_id = '33333333-0000-4000-8000-0000000000a2'$$),
  0, 's1a no ve la nota de s2a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.students
    where profile_id = 'aaaaaaaa-0000-4000-8000-00000000004a'$$),
  0, 's1a no ve la ficha de alumno de s2a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles
    where id = 'aaaaaaaa-0000-4000-8000-00000000004a'$$),
  0, 's1a no ve el perfil de s2a');

select is(pg_temp.visible_count($$select count(*)::int from public.skill_mastery$$),
  1, 's1a ve exactamente UNA fila de skill_mastery: la suya');


-- =============================================================================
-- CONTROL POSITIVO — s1a sí ve lo suyo, entero
-- =============================================================================
select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts
    where id = '33333333-0000-4000-8000-0000000000a1'$$),
  1, 'CONTROL: s1a ve su propio intento');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_items_student
    where attempt_id = '33333333-0000-4000-8000-0000000000a1'$$),
  3, 'CONTROL: s1a ve sus 3 items');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_responses
    where attempt_id = '33333333-0000-4000-8000-0000000000a1'$$),
  6, 'CONTROL: s1a ve sus 6 revisiones de respuesta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_gradings
    where attempt_id = '33333333-0000-4000-8000-0000000000a1'$$),
  3, 'CONTROL: s1a ve sus 3 calificaciones (su intento está `graded`)');


-- =============================================================================
-- ESCRITURA — el alumno no escribe NADA del motor de examen (AD-5)
-- =============================================================================
-- Si pudiera hacer UPDATE sobre su intento, se regalaría `server_deadline_at`.
select is(pg_temp.affected(
  $$update public.exam_attempts
       set server_deadline_at = now() + interval '10 years'
     where id = '33333333-0000-4000-8000-0000000000a1'$$),
  0, 's1a no consigue alargar el deadline de SU PROPIO intento (0 filas)');

-- Si pudiera insertar respuestas, fabricaría `server_ts` y "respondería"
-- después de la campana.
select is(pg_temp.affected(
  $$insert into public.attempt_responses
      (attempt_id, attempt_item_id, revision, response, is_final)
    values ('33333333-0000-4000-8000-0000000000a1',
            'a1a1a1a1-0000-4000-8000-000000000002', 99,
            '{"type":"choice","selectedIds":["a"]}'::jsonb, true)$$),
  -1, 's1a no tiene ni el GRANT de INSERT sobre attempt_responses');

-- Si pudiera insertar eventos, escribiría telemetría en nombre de otro alumno.
select is(pg_temp.affected(
  $$insert into public.learning_events
      (school_id, student_id, session_id, seq, event_type)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-00000000004a',
            '0e0e0e0e-0000-4000-8000-0000000000ff', 0, 'practice_streak')$$),
  -1, 's1a no tiene GRANT de INSERT sobre learning_events '
      '(la ingesta va por Route Handler con service_role)');


-- El agujero que la RLS SOLA no puede tapar: una política decide QUÉ FILAS, no
-- QUÉ COLUMNAS. `profiles_update_own` aprueba este UPDATE porque la fila
-- resultante sigue siendo suya. Lo que lo impide es el trigger
-- `profiles_guard_escalation`.
select is(pg_temp.errcode_of(
  $$update public.profiles set role = 'superadmin', school_id = null
     where id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  '42501',
  's1a no puede autoconcederse el rol de superadmin editando su propio perfil');

select is(pg_temp.errcode_of(
  $$update public.profiles set school_id = '22222222-2222-4222-8222-222222222222'
     where id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  '42501',
  's1a no puede mudarse al colegio Beta editando su propio perfil');

-- Regresión de 0022. ESTE es el caso que se explotó de verdad contra producción:
-- `status` no lo protege ninguna constraint, así que cuando el guard estaba
-- inerte el UPDATE pasaba limpio — 1 fila, sin error. Un alumno podía marcarse
-- `suspended`; y con la misma llave, `active` cualquiera a quien hubieran
-- suspendido.
select is(pg_temp.errcode_of(
  $$update public.profiles set status = 'suspended'
     where id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  '42501',
  's1a no puede cambiarse su propio estado de cuenta (el guard NO es decorativo)');

-- El mismo fallo vivía en students_guard_update. Al ALUMNO, sin embargo, lo para
-- una capa anterior: no tiene privilegio sobre `students` y la RLS no le deja
-- ninguna fila. Se comprueba con `affected()` y no con `errcode_of()` porque la
-- distinción importa —0 filas es "la RLS filtró", -1 sería "no hay GRANT"— y
-- porque afirmar un 42501 aquí sería atribuirle el mérito al trigger, que en
-- este camino ni siquiera llega a ejecutarse.
select is(pg_temp.affected(
  $$update public.students set failed_pin_attempts = 0, locked_until = null
     where profile_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  0, 's1a no se desbloquea solo: la RLS no le da ni una fila de students');

-- Y en app.audit(), donde la condición va al revés: authenticated tiene EXECUTE,
-- así que con el guard inerte cualquier alumno escribía en el audit_log. Un log
-- en el que cualquiera puede escribir no prueba nada.
select is(pg_temp.errcode_of(
  $$select app.audit('exam.tampered', 'exam_attempts', null, null, '{"nota":10}'::jsonb)$$),
  '42501',
  's1a no puede escribir entradas en el audit_log');


-- =============================================================================
-- Simetría
-- =============================================================================
-- =============================================================================
-- students_guard_update, ejercido por quien SÍ llega hasta él
-- =============================================================================
-- Al alumno lo para la RLS antes del trigger, así que probarlo con él no dice
-- nada del guard. El school_admin sí tiene UPDATE sobre las fichas de su
-- colegio: es su camino el que el trigger tiene que cortar. Con el guard inerte
-- (antes de 0022), estas dos escrituras pasaban.
select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000001a');   -- admin_a

select is(pg_temp.errcode_of(
  $$update public.students
       set pin_hash = '$argon2id$v=19$m=19456,t=2,p=1$b3RyYXNhbA$b3Ryb2hhc2g'
     where profile_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  '42501',
  'Ni el school_admin reescribe un pin_hash: solo lo escribe la Edge Function');

select is(pg_temp.errcode_of(
  $$update public.students set failed_pin_attempts = failed_pin_attempts + 5
     where profile_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  '42501',
  'Ni el school_admin sube el contador de intentos fallidos a mano');

-- Bajarlo SÍ puede: es exactamente lo que hace "Desbloquear" en el panel.
select is(pg_temp.errcode_of(
  $$update public.students set failed_pin_attempts = 0, locked_until = null
     where profile_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  null,
  'El school_admin SÍ desbloquea a su alumno: el guard corta, no tapia');


-- =============================================================================
-- Simetría
-- =============================================================================
select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000004a');   -- s2a

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_responses
    where attempt_id = '33333333-0000-4000-8000-0000000000a1'$$),
  0, 's2a tampoco ve las respuestas de s1a: el aislamiento es bidireccional');

select pg_temp.logout();
select * from finish();
rollback;
