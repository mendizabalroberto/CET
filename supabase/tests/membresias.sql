-- membresias.sql — pgTAP de tutor, membresías y enlaces de acceso
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(4);

select has_table('public', 'guardian_students', 'existe el vinculo tutor-hijo');
select has_table('public', 'student_school_memberships', 'existe la matricula con fechas');

-- Sembrado minimo: un colegio, un alumno (sin colegio en profiles) y una escuela.
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'nino.uno@cet.test');
insert into public.profiles (id, school_id, role, full_name, status)
values ('22222222-2222-2222-2222-222222222222', null, 'student', 'Nino Uno', 'active');

insert into public.schools (id, name, slug, timezone)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo', 'demo-test', 'UTC');

select lives_ok(
  $$insert into public.student_school_memberships
      (student_id, school_id, starts_on, status)
    values ('22222222-2222-2222-2222-222222222222',
            'aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 'activa')$$,
  'una matricula activa entra');

-- La segunda, solapada, NO. Y lo impide la base de datos, no la aplicacion.
select throws_ok(
  $$insert into public.student_school_memberships
      (student_id, school_id, starts_on, status)
    values ('22222222-2222-2222-2222-222222222222',
            'aaaaaaaa-0000-0000-0000-000000000001', '2026-03-01', 'activa')$$,
  '23P01',
  null,
  'dos matriculas activas solapadas son imposibles');

select * from finish();
rollback;
