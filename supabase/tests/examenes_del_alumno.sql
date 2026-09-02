-- =============================================================================
-- examenes_del_alumno.sql — pgTAP de la migracion 0095
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- La migracion ya esta aplicada en la base (misma regla que plan_de_estudio.sql):
-- se prueba lo desplegado. Solo el tutor vinculado lee, escribe y borra los
-- examenes de su hijo; otro tutor y el personal del colegio, nada.
begin;
select plan(10);

\ir helpers/fixture.psql

insert into auth.users (id, email) values
  ('99999999-0000-4000-8000-0000000000a1', 'tutor.examen.uno@cet.test'),
  ('99999999-0000-4000-8000-0000000000a2', 'tutor.examen.dos@cet.test');

insert into public.profiles (id, school_id, role, full_name, email, status)
values
  ('99999999-0000-4000-8000-0000000000a1', null, 'guardian', 'Tutor Examen Uno', 'tutor.examen.uno@cet.test', 'active'),
  ('99999999-0000-4000-8000-0000000000a2', null, 'guardian', 'Tutor Examen Dos', 'tutor.examen.dos@cet.test', 'active');

-- tutor_1 → s1a; tutor_2 → s2a
insert into public.guardian_students (guardian_id, student_id)
values
  ('99999999-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000003a'),
  ('99999999-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000004a');

-- -----------------------------------------------------------------------------
-- El tutor escribe los examenes de su hijo
-- -----------------------------------------------------------------------------
select pg_temp.login_as('99999999-0000-4000-8000-0000000000a1');

select lives_ok(
  $$insert into public.examenes_del_alumno (student_id, subject_id, fecha, titulo, origen, creado_por)
    values ('aaaaaaaa-0000-4000-8000-00000000003a', null, current_date + 10, 'Examen general', 'tutor',
            '99999999-0000-4000-8000-0000000000a1')$$,
  'el tutor registra un examen general de su hijo');

select lives_ok(
  $$insert into public.examenes_del_alumno (student_id, subject_id, fecha, titulo, origen, creado_por)
    values ('aaaaaaaa-0000-4000-8000-00000000003a', null, current_date + 20, 'Math', 'documento',
            '99999999-0000-4000-8000-0000000000a1')$$,
  'y uno extraido del documento');

select throws_ok(
  $$insert into public.examenes_del_alumno (student_id, subject_id, fecha, titulo, origen, creado_por)
    values ('aaaaaaaa-0000-4000-8000-00000000003a', null, current_date + 10, ' examen GENERAL ', 'tutor',
            '99999999-0000-4000-8000-0000000000a1')$$,
  '23505',
  null,
  'el mismo examen (fecha, materia, titulo salvo mayusculas y espacios) no se duplica');

select throws_ok(
  $$insert into public.examenes_del_alumno (student_id, subject_id, fecha, titulo, origen, creado_por)
    values ('aaaaaaaa-0000-4000-8000-00000000004a', null, current_date + 5, 'Ajeno', 'tutor',
            '99999999-0000-4000-8000-0000000000a1')$$,
  '42501',
  null,
  'no puede registrar examenes de un nino que no es suyo');

select throws_ok(
  $$insert into public.examenes_del_alumno (student_id, subject_id, fecha, titulo, origen, creado_por)
    values ('aaaaaaaa-0000-4000-8000-00000000003a', null, current_date + 5, 'Suplantado', 'tutor',
            '99999999-0000-4000-8000-0000000000a2')$$,
  '42501',
  null,
  'creado_por tiene que ser quien firma la sesion');

select is(
  (select count(*)::int from public.examenes_del_alumno
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'),
  2,
  'el tutor ve los dos examenes de su hijo');

-- -----------------------------------------------------------------------------
-- Otro tutor no ve ni toca nada
-- -----------------------------------------------------------------------------
select pg_temp.login_as('99999999-0000-4000-8000-0000000000a2');

select is(
  pg_temp.visible_count(
    $$select count(*)::int from public.examenes_del_alumno
       where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$),
  0,
  'otro tutor no ve los examenes de un nino ajeno');

select lives_ok(
  $$delete from public.examenes_del_alumno
     where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'$$,
  'el delete ajeno no revienta…');

select pg_temp.logout();
select is(
  (select count(*)::int from public.examenes_del_alumno
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'),
  2,
  '…pero no borra nada');

-- -----------------------------------------------------------------------------
-- El personal del colegio tampoco (0091: estas tablas son solo del tutor)
-- -----------------------------------------------------------------------------
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000001a');
select is(
  pg_temp.visible_count(
    $$select count(*)::int from public.examenes_del_alumno$$),
  0,
  'el personal del colegio no lee los examenes del alumno');
select pg_temp.logout();

select * from finish();
rollback;
