-- =============================================================================
-- informes_alumno.sql — pgTAP para las cinco funciones de 0053
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
begin;

select plan(19);

-- -----------------------------------------------------------------------------
-- Siembra
-- -----------------------------------------------------------------------------
-- No se usa `helpers/fixture.psql`: el fixture inserta materias GLOBALES y esta
-- base ya tiene el currículo real, así que choca con `subjects_global_code_uniq`
-- antes del primer assert. Todo lo de aquí cuelga de colegios propios, donde el
-- índice único que aplica es el de colegio y no el global.
insert into public.schools (id, name, slug) values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Colegio Informes A', 'informes-a'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Colegio Informes B', 'informes-b');

-- `profiles` lleva clave foránea contra `auth.users`, y `full_name` es NOT NULL.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011'::uuid, 'teacher.informes.a@cet.test'),
  ('00000000-0000-0000-0000-000000000012'::uuid, 's.INF1@informes-a.students.cet.invalid'),
  ('00000000-0000-0000-0000-000000000013'::uuid, 'teacher.informes.b@cet.test');

-- El personal lleva correo obligatorio (`profiles_staff_needs_email`) y el
-- alumno NO lo lleva: un nino de primaria no tiene cuenta de correo, y esa
-- asimetria es una decision del modelo, no un descuido.
insert into public.profiles (id, school_id, role, full_name, email, status) values
  ('00000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'teacher', 'Profe A', 'teacher.informes.a@cet.test', 'active'),
  ('00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'student', 'Alumno Informes', null, 'active'),
  ('00000000-0000-0000-0000-000000000013'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'teacher', 'Profe B', 'teacher.informes.b@cet.test', 'active');

-- `skills.course_id` es NOT NULL con clave foránea, y `name` es I18nText, no
-- texto suelto: hay que montar la cadena materia -> curso -> skill entera.
insert into public.subjects (id, school_id, code, name) values
  ('00000000-0000-0000-0000-000000000019'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid, 'informes_test',
   '{"en":"Informes test subject"}'::jsonb);

insert into public.courses (id, school_id, subject_id, name, year_level) values
  ('00000000-0000-0000-0000-000000000020'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000019'::uuid,
   '{"en":"Informes test course"}'::jsonb, 6);

insert into public.skills (id, school_id, course_id, code, name) values
  ('00000000-0000-0000-0000-000000000021'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000020'::uuid,
   'informes.reading', '{"en":"Reading"}'::jsonb),
  ('00000000-0000-0000-0000-000000000022'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000020'::uuid,
   'informes.listening', '{"en":"Listening"}'::jsonb);

insert into public.skill_mastery
  (student_id, skill_id, school_id, mastery, confidence, attempts_count, correct_count, ewma_correct, avg_time_ms, hints_used, last_practiced_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000021'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 0.200, 0.600, 5, 1, 0.200, 12000, 2, now(), now()),
  ('00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000022'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 0.800, 0.900, 10, 8, 0.800, 8000, 1, now(), now());

insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, question_id, payload, server_ts)
values
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 0, 'session_context', null,
   '{"viewportW":800,"viewportH":600,"dpr":1,"pointer":"fine","modality":"mouse","theme":"light","locale":"es-CL","timezone":"America/Santiago","reducedMotion":false,"connection":"4g"}'::jsonb,
   date_trunc('hour', now())),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 1, 'ui_interaction', null,
   '{"control":"practica.siguiente","surface":"practice","action":"click","ordinal":1,"sinceLastMs":1000,"modality":"mouse"}'::jsonb,
   date_trunc('hour', now()) + interval '2 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 2, 'ui_interaction', null,
   '{"control":"practica.pista","surface":"practice","action":"click","ordinal":2,"sinceLastMs":3000,"modality":"mouse"}'::jsonb,
   date_trunc('hour', now()) + interval '5 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 3, 'ui_interaction', null,
   '{"control":"practica.siguiente","surface":"practice","action":"click","ordinal":3,"sinceLastMs":3000,"modality":"mouse"}'::jsonb,
   date_trunc('hour', now()) + interval '10 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 4, 'nav_route_changed', null,
   '{"from":"/home","to":"/practica","dwellMs":5000}'::jsonb,
   date_trunc('hour', now()) + interval '8 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 5, 'answer_submitted', '00000000-0000-0000-0000-000000000041'::uuid,
   '{"timeOnItemMs":20000,"changeCount":1,"hintsUsed":0,"isCorrect":true}'::jsonb,
   date_trunc('hour', now()) + interval '30 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 6, 'hint_requested', '00000000-0000-0000-0000-000000000040'::uuid,
   '{"hintIndex":0,"timeBeforeHintMs":4000}'::jsonb,
   date_trunc('hour', now()) + interval '35 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 7, 'answer_submitted', '00000000-0000-0000-0000-000000000040'::uuid,
   '{"timeOnItemMs":15000,"changeCount":3,"hintsUsed":1,"isCorrect":false}'::jsonb,
   date_trunc('hour', now()) + interval '50 seconds'),
  ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000030'::uuid, 8, 'idle_end', null,
   '{"idleMs":60000}'::jsonb,
   date_trunc('hour', now()) + interval '120 seconds');

-- El profesor A (staff del colegio A) consulta los informes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011"}', false);

select is(
  (select minutos_estudio from app.informe_alumno_resumen('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  1.0,
  'minutos de estudio descontando idle'
);
select is(
  (select sesiones from app.informe_alumno_resumen('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  1,
  'una sesión distinta'
);
select is(
  (select items_respondidos from app.informe_alumno_resumen('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  2,
  'dos items respondidos'
);
select is(
  (select porcentaje_acierto from app.informe_alumno_resumen('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  -- `50.0` y no `50`: la columna es numeric y `is()` es polimorfica, asi que un
  -- literal entero no encuentra la funcion. El error («function is(numeric,
  -- integer, unknown) does not exist») suena a que falta pgTAP y es un tipo.
  50.0,
  'porcentaje de acierto 50%'
);
select is(
  (select pistas_pedidas from app.informe_alumno_resumen('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  1,
  'una pista pedida'
);

select is(
  (select count(*)::int from app.informe_alumno_skills('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  2,
  'dos skills'
);
select is(
  (select nombre_skill from app.informe_alumno_skills('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day') limit 1)::jsonb,
  '{"en": "Reading"}'::jsonb,
  'la skill más floja primero'
);

select is(
  (select count(*)::int from app.informe_alumno_secuencia('00000000-0000-0000-0000-000000000030')),
  9,
  'nueve eventos en la sesión'
);
select is(
  (select event_type::text from app.informe_alumno_secuencia('00000000-0000-0000-0000-000000000030') where seq = 0),
  'session_context',
  'el primer evento de la secuencia es session_context'
);
select is(
  (select string_agg(seq::text, ',' order by rn) from (
     select seq, row_number() over () as rn from app.informe_alumno_secuencia('00000000-0000-0000-0000-000000000030')
   ) t),
  '0,1,2,3,4,5,6,7,8',
  'la secuencia se ordena por seq y no por server_ts'
);

select is(
  (select hora_pico from app.informe_alumno_habitos('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  (select extract(hour from date_trunc('hour', now()) at time zone 'America/Santiago')::int),
  'hora pico en la zona horaria del alumno'
);
select is(
  (select dia_pico from app.informe_alumno_habitos('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  (select extract(dow from date_trunc('hour', now()) at time zone 'America/Santiago')::int),
  'dia pico en la zona horaria del alumno'
);
select is(
  (select tiempo_medio_item_ms from app.informe_alumno_habitos('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  17500.0,
  'tiempo medio por item'
);
select is(
  (select tasa_idle from app.informe_alumno_habitos('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  0.5,
  'tasa de idle'
);
select is(
  (select media_change_count from app.informe_alumno_habitos('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')),
  2.0,
  'media de changeCount'
);

select is(
  (select clave from app.informe_alumno_botones('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day') where tipo = 'control' order by cuenta desc, clave limit 1),
  'practica.siguiente',
  'control más pulsado'
);
select is(
  (select cuenta from app.informe_alumno_botones('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day') where tipo = 'control' and clave = 'practica.siguiente'),
  2,
  'cuenta del control más pulsado'
);
select is(
  (select clave from app.informe_alumno_botones('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day') where tipo = 'transicion' limit 1),
  '/home -> /practica',
  'transición más frecuente'
);

-- Aislamiento: un teacher del colegio B no puede ver al alumno del colegio A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013"}', false);
select throws_ok(
  $$select app.informe_alumno_resumen('00000000-0000-0000-0000-000000000012', now() - interval '1 day', now() + interval '1 day')$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'teacher del colegio B recibe insufficient_privilege'
);

select finish();
rollback;
