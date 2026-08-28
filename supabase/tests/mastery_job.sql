-- mastery_job.sql — pgTAP del job que rellena skill_mastery
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(14);
-- -----------------------------------------------------------------------------
-- Siembra propia, y por un motivo que costó dos intentos descubrir
-- -----------------------------------------------------------------------------
-- `helpers/fixture.psql` NO se puede usar aquí. El fixture inserta materias
-- GLOBALES (`school_id` nulo) y esta base ya tiene el currículo real sembrado,
-- así que choca con `subjects_global_code_uniq` antes de llegar al primer
-- assert. No es un problema de este fichero: es que ninguna prueba pgTAP que
-- incluya el fixture puede correr contra una base con currículo, y eso incluye
-- a las once que lo hacen.
--
-- La salida es colgar TODO de un colegio propio. Los índices únicos de
-- `subjects` están partidos en dos —uno para las globales y otro por colegio—,
-- así que una materia con `school_id` no compite con las reales.
--
-- Y la cadena hay que montarla entera: `skills.course_id` es NOT NULL con clave
-- foránea, y `courses.subject_id` también. La primera versión de este fichero se
-- saltó los tres niveles y «creaba» la skill con un `update` sobre un id que no
-- existía: no tocaba ninguna fila y `skill_mastery` se quedaba sin la clave
-- foránea que necesita para insertar.
insert into public.schools (id, name, slug) values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'Colegio A (mastery)', 'mastery-a'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'Colegio B (mastery)', 'mastery-b');

-- `profiles` lleva clave foránea contra `auth.users`. Estas filas no se
-- autentican nunca —los tests suplantan por GUC, no con un JWT firmado—, así que
-- basta con el id y el correo.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000aa01', 's.MAA1@mastery-a.students.cet.invalid'),
  ('bbbbbbbb-0000-4000-8000-00000000bb01', 's.MBB1@mastery-b.students.cet.invalid'),
  ('bbbbbbbb-0000-4000-8000-00000000bb02', 'teacher.mastery.b@cet.test');

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

insert into public.subjects (id, school_id, code, name) values
  ('77777777-0000-4000-8000-000000000001',
   'aaaaaaaa-1111-4111-8111-111111111111', 'mastery_test',
   '{"en":"Mastery test subject"}'::jsonb);

insert into public.courses (id, school_id, subject_id, name, year_level) values
  ('88888888-0000-4000-8000-000000000001',
   'aaaaaaaa-1111-4111-8111-111111111111',
   '77777777-0000-4000-8000-000000000001',
   '{"en":"Mastery test course"}'::jsonb, 6);

-- El código va en minúsculas y con puntos: lo exige `skills_code_format`.
insert into public.skills (id, school_id, course_id, code, name) values
  ('99999999-0000-4000-8000-000000000a01',
   'aaaaaaaa-1111-4111-8111-111111111111',
   '88888888-0000-4000-8000-000000000001',
   'mastery.test.skill', '{"en":"Mastery test skill"}'::jsonb);

insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, skill_id, payload, server_ts)
values
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 1, 'answer_submitted', null,
   '{"timeOnItemMs":5000,"changeCount":1,"hintsUsed":1,"isCorrect":true,"skillCode":"mastery.test.skill"}'::jsonb,
   now() - interval '10 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 2, 'answer_submitted',
   '99999999-0000-4000-8000-000000000a01',
   '{"timeOnItemMs":3000,"changeCount":0,"hintsUsed":0,"isCorrect":false}'::jsonb,
   now() - interval '9 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 3, 'hint_requested',
   '99999999-0000-4000-8000-000000000a01',
   '{"hintIndex":0,"timeBeforeHintMs":2000}'::jsonb,
   now() - interval '8 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 4, 'answer_submitted',
   '99999999-0000-4000-8000-000000000a01',
   '{"timeOnItemMs":4000,"changeCount":2,"hintsUsed":2}'::jsonb,
   now() - interval '7 minutes'),
  ('aaaaaaaa-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000aa01',
   'aaaaaaaa-0000-4000-8000-00000000aa99', 5, 'practice_item_answered',
   '99999999-0000-4000-8000-000000000a01',
   '{"timeOnItemMs":2500,"hintsUsed":0,"isCorrect":true}'::jsonb,
   now() - interval '5 minutes'),
  ('bbbbbbbb-2222-4222-8222-222222222222',
   'bbbbbbbb-0000-4000-8000-00000000bb01',
   'bbbbbbbb-0000-4000-8000-00000000bb99', 1, 'answer_submitted',
   '99999999-0000-4000-8000-000000000a01',
   '{"timeOnItemMs":6000,"changeCount":0,"hintsUsed":0,"isCorrect":true}'::jsonb,
   now() - interval '6 minutes');
select app.rebuild_skill_mastery();
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  3,
  'A: sin isCorrect no cuenta como intento'
);
select is(
  (select correct_count from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  2,
  'A: correct_count'
);
select is(
  (select hints_used from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  1,
  'A: hints_used'
);
select is(
  (select mastery between 0 and 1 from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  true,
  'A: mastery en rango'
);
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  1,
  'B: attempts_count'
);
select is(
  (select correct_count from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  1,
  'B: correct_count'
);
select is(
  (select mastery between 0 and 1 from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
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
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  3,
  'idempotencia: attempts_count A'
);
select is(
  (select mastery from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  0.447,
  'idempotencia: mastery A'
);
select app.rebuild_skill_mastery('-infinity');
select is(
  (select mastery from public.skill_mastery
    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  0.447,
  'reconstruccion: mastery A'
);
select is(
  (select attempts_count from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
      and skill_id = '99999999-0000-4000-8000-000000000a01'),
  1,
  'reconstruccion: attempts_count B'
);
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
  (select count(*)::int from public.skill_mastery
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
  (select count(*)::int from public.skill_mastery
    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'),
  1,
  'el alumno del colegio B ve su propia mastery'
);
reset role;
select * from finish();
rollback;
