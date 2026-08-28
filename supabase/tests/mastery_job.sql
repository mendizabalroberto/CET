-- mastery_job.sql — pgTAP del job que rellena skill_mastery
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(14);
insert into public.schools (id, name, slug) values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'Colegio A', 'mastery-a'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'Colegio B', 'mastery-b');
insert into public.profiles (id, school_id, role, full_name, status) values
  ('aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-1111-4111-8111-111111111111', 'student', 'Alumno A', 'active'),
  ('bbbbbbbb-0000-4000-8000-00000000bb01',
   'bbbbbbbb-2222-4222-8222-222222222222', 'student', 'Alumno B', 'active');
insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash) values
  ('aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-1111-4111-8111-111111111111', 'MAA1', 6, 'primary',
   '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'),
  ('bbbbbbbb-0000-4000-8000-00000000bb01',
   'bbbbbbbb-2222-4222-8222-222222222222', 'MBB1', 6, 'primary',
   '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');
update public.skills set code = 'SKILL_MASTERY_TEST'
 where id = '99999999-0000-4000-8000-000000000001';
insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, skill_id, payload, server_ts)
values
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 1, 'answer_submitted', null,
   '{"timeOnItemMs":5000,"changeCount":1,"hintsUsed":1,"isCorrect":true,"skillCode":"SKILL_MASTERY_TEST"}'::jsonb,
   now() - interval '10 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 2, 'answer_submitted',
   '99999999-0000-4000-8000-000000000001',
   '{"timeOnItemMs":3000,"changeCount":0,"hintsUsed":0,"isCorrect":false}'::jsonb,
   now() - interval '9 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 3, 'hint_requested',
   '99999999-0000-4000-8000-000000000001',
   '{"hintIndex":0,"timeBeforeHintMs":2000}'::jsonb,
   now() - interval '8 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 4, 'answer_submitted',
   '99999999-0000-4000-8000-000000000001',
   '{"timeOnItemMs":4000,"changeCount":2,"hintsUsed":2}'::jsonb,
   now() - interval '7 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 5, 'practice_item_answered',
   '99999999-0000-4000-8000-000000000001',
   '{"timeOnItemMs":2500,"hintsUsed":0,"isCorrect":true}'::jsonb,
   now() - interval '5 minutes'),
  ('bbbbbbbb-2222-4222-8222-222222222222',
   'bbbbbbbb-0000-4000-8000-00000000bb01',
   'bbbbbbbb-0000-4000-8000-00000000bb99', 1, 'answer_submitted',
   '99999999-0000-4000-8000-000000000001',
   '{"timeOnItemMs":6000,"changeCount":0,"hintsUsed":0,"isCorrect":true}'::jsonb,
   now() - interval '6 minutes');
select app.rebuild_skill_mastery();
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  3,
  'A: sin isCorrect no cuenta como intento'
);
select is(
  (select correct_count from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  2,
  'A: correct_count'
);
select is(
  (select hints_used from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  1,
  'A: hints_used'
);
select is(
  (select mastery between 0 and 1 from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  true,
  'A: mastery en rango'
);
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  1,
  'B: attempts_count'
);
select is(
  (select correct_count from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  1,
  'B: correct_count'
);
select is(
  (select mastery between 0 and 1 from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  true,
  'B: mastery en rango'
);
select is(
  app.skill_mastery_watermark() = now() - interval '5 minutes',
  true,
  'la marca de agua avanza'
);
select app.rebuild_skill_mastery();
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  3,
  'idempotencia: attempts_count A'
);
select is(
  (select mastery from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  0.447,
  'idempotencia: mastery A'
);
select app.rebuild_skill_mastery('-infinity');
select is(
  (select mastery from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  0.447,
  'reconstruccion: mastery A'
);
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000001'),
  1,
  'reconstruccion: attempts_count B'
);
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-4000-8000-00000000bb02', 'teacher.mastery.b@cet.test');
insert into public.profiles (id, school_id, role, full_name, email, status) values
  ('bbbbbbbb-0000-4000-8000-00000000bb02',
   'bbbbbbbb-2222-4222-8222-222222222222', 'teacher', 'Prof B',
   'teacher.mastery.b@cet.test', 'active');
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000bb02', true);
select set_config('request.jwt.claim.school_id', 'bbbbbbbb-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', json_build_object(
  'sub', 'bbbbbbbb-0000-4000-8000-00000000bb02',
  'role', 'authenticated',
  'school_id', 'bbbbbbbb-2222-4222-8222-222222222222'
)::text, true);
select is(
  (select count(*) from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'),
  0,
  'un profesor de otro colegio no ve nada'
);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000bb01', true);
select set_config('request.jwt.claim.school_id', 'bbbbbbbb-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', json_build_object(
  'sub', 'bbbbbbbb-0000-4000-8000-00000000bb01',
  'role', 'authenticated',
  'school_id', 'bbbbbbbb-2222-4222-8222-222222222222'
)::text, true);
select is(
  (select count(*) from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'),
  1,
  'el alumno del colegio B ve su propia mastery'
);
reset role;
select * from finish();
rollback;
