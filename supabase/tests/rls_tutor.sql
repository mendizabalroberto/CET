-- rls_tutor.sql — pgTAP de la constraint de alcance por rol
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(3);

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

select * from finish();
rollback;
