-- =============================================================================
-- alumno_ve_su_examen.sql — /exam no puede decir «no tienes examenes» a quien si
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- QUE FAMILIA CAZA ESTE FICHERO
--
-- La lista de examenes del alumno lee `exam_assignments` con el blueprint
-- INCRUSTADO, y `_lib/assignments.ts` descarta la tarjeta entera si el blueprint
-- no llega. Una RLS que deje ver la asignacion pero NO el examen al que apunta
-- no produce un error: produce una pantalla vacia que miente.
--
-- Encontrado el 28 de agosto de 2026 abriendo /exam con la sesion de un alumno
-- de verdad. En produccion habia dos asignaciones abiertas y en plazo, de una
-- clase suya, y la pantalla decia «Ahora mismo no tienes examenes». Medido:
-- `exam_assignments: 2 || exam_blueprints: 0 || secciones: 0`.
--
-- No era una regresion: desde 0012 las unicas politicas de SELECT sobre esas dos
-- tablas eran `*_select_staff`. No se veia porque las pruebas del recorrido de
-- examen escriben con `service_role`, que se salta la RLS entera.
--
-- Por eso este fichero comprueba lo que el alumno VE, no lo que el motor puede
-- escribir. Son dos preguntas distintas y solo una la sufre el alumno.
-- =============================================================================
begin;
select plan(4);

\ir helpers/fixture.psql

-- El alumno S1A pertenece a la clase Y6A del colegio Alfa, y a esa clase se le
-- ha asignado el blueprint 6666...001.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');

select is(
  (select count(*)::int from public.exam_assignments
    where id = '44444444-0000-4000-8000-00000000000a'),
  1, 'el alumno ve la asignacion que le han puesto');

select is(
  (select count(*)::int from public.exam_blueprints
    where id = '66666666-0000-4000-8000-000000000001'),
  1, 'y ve el EXAMEN al que esa asignacion apunta (sin esto, la tarjeta se cae)');

select is(
  (select count(*)::int from public.exam_blueprint_sections
    where blueprint_id = '66666666-0000-4000-8000-000000000001'),
  1, 'y sus secciones, de donde sale el numero de preguntas de la tarjeta');

-- CONTROL: ver el examen que te ponen no es ver todos los examenes. El de Beta
-- esta asignado a una clase que no es la suya, y ademas es de otro colegio.
-- Sin este caso, una politica «todo alumno ve todos los blueprints» pasaria los
-- tres asserts de arriba con sobresaliente.
select is(
  (select count(*)::int from public.exam_blueprints
    where id = '66666666-0000-4000-8000-00000000000b'),
  0, 'NO ve el examen privado de otro colegio, que no le han puesto');

select * from finish();
rollback;
