-- rls_tutor.sql — pgTAP de la constraint de alcance por rol
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(6);

-- auth.users es quien autentica; profiles es el espejo. Sembramos lo justo.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'tutor.uno@cet.test'),
  ('22222222-2222-2222-2222-222222222222', 'nino.uno@students.cet.test');

-- Un tutor sin colegio tiene que poder EXISTIR. Hoy la constraint lo prohibe.
-- Los tutores NO son alumnos, así que necesitan email (profiles_staff_needs_email).
select lives_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, status)
    values ('11111111-1111-1111-1111-111111111111', null, 'guardian', 'Tutor Uno', 'tutor.uno@cet.test', 'active')$$,
  'un tutor existe sin colegio');

-- Un alumno tambien: es el niño que estudia en casa.
select lives_ok(
  $$insert into public.profiles (id, school_id, role, full_name, status)
    values ('22222222-2222-2222-2222-222222222222', null, 'student', 'Nino Uno', 'active')$$,
  'un alumno existe sin colegio');

-- El personal NO. Un profesor sin colegio no significa nada.
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'profe.sin.casa@cet.test');
select throws_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, status)
    values ('33333333-3333-3333-3333-333333333333', null, 'teacher', 'Profe Sin Casa', 'profe.sin.casa@cet.test', 'active')$$,
  '23514',
  null,
  'un profesor sin colegio sigue siendo imposible');

-- app.puede_ver_alumno: el tutor ve a su hijo, no a otros, y nunca devuelve NULL.
insert into public.schools (id, name, slug, timezone)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo', 'demo-test', 'UTC');

insert into public.guardian_students (guardian_id, student_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select ok(app.puede_ver_alumno('22222222-2222-2222-2222-222222222222'),
          'el tutor ve a su hijo');
select ok(not app.puede_ver_alumno('44444444-4444-4444-4444-444444444444'),
          'el tutor NO ve a un nino ajeno');
select isnt(app.puede_ver_alumno('44444444-4444-4444-4444-444444444444'), null,
            'devuelve false, no NULL: un NULL en una politica no deja pasar y no se ve por que');

reset role;

select * from finish();
rollback;
