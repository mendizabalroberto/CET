-- =============================================================================
-- informe_por_materia.sql — pgTAP para 0093_informe_por_materia.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- La migración 0093 ya está aplicada en la base: incluirla aquí con `\ir`
-- rompería con «function ... already exists» (ver la cabecera de
-- `plan_de_estudio.sql`, mismo motivo). Se prueba lo desplegado.
begin;

select plan(16);

\ir helpers/fixture.psql

-- -----------------------------------------------------------------------------
-- Una segunda materia para Alfa, propia de este fichero
-- -----------------------------------------------------------------------------
-- El fixture solo trae UNA materia con lección y destreza (math_fixture,
-- global). Para probar el REPARTO hace falta una segunda, con su propio curso,
-- módulo, lección y destreza — igual de privada a Alfa que el resto de datos
-- de este colegio, para no chocar con `subjects_global_code_uniq`.
insert into public.subjects (id, school_id, code, name, ord)
values
  ('cccccccc-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
   'science_fixture', '{"en":"Science","es":"Ciencias"}'::jsonb, 3);

insert into public.courses (id, school_id, subject_id, name, year_level, locale, status)
values
  ('dddddddd-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
   'cccccccc-0000-4000-8000-000000000101',
   '{"en":"Alfa science course"}'::jsonb, 6, 'en', 'published');

insert into public.course_modules (id, course_id, ord, title)
values
  ('eeeeeeee-0000-4000-8000-000000000101', 'dddddddd-0000-4000-8000-000000000101',
   1, '{"en":"Alfa science module"}'::jsonb);

insert into public.lessons (id, module_id, ord, title, status)
values
  ('ffffffff-0000-4000-8000-000000000101', 'eeeeeeee-0000-4000-8000-000000000101',
   1, '{"en":"Alfa science lesson"}'::jsonb, 'published');

insert into public.skills (id, school_id, course_id, code, name)
values
  ('99999999-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
   'dddddddd-0000-4000-8000-000000000101', 'science.alfa_skill',
   '{"en":"Alfa science skill"}'::jsonb);


-- -----------------------------------------------------------------------------
-- Se retira la telemetría que trae el fixture, igual que informes_series.sql
-- -----------------------------------------------------------------------------
create or replace function pg_temp.limpiar_telemetria()
returns integer language plpgsql as $fn$
declare n integer;
begin
  delete from public.learning_events
  where student_id in ('aaaaaaaa-0000-4000-8000-00000000003a',
                       'aaaaaaaa-0000-4000-8000-00000000004a');
  get diagnostics n = row_count;
  return n;
end $fn$;

select is(pg_temp.limpiar_telemetria(), 1,
  'el fixture traia un evento de telemetria para s1a y se ha retirado');


-- -----------------------------------------------------------------------------
-- Telemetría de s1a: dos materias, con minutos, items y lecciones distintos
-- -----------------------------------------------------------------------------
-- Materia 1 · math_fixture (la del fixture): sesión de 10 min, dos items, un
-- acierto, y la lección se termina.
insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, lesson_id, skill_id, payload, server_ts)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '1a1a1a1a-0000-4000-8000-000000000001', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', null, '{}'::jsonb, now() - interval '100 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '1a1a1a1a-0000-4000-8000-000000000001', 1, 'answer_submitted',
   null, '99999999-0000-4000-8000-000000000001',
   '{"isCorrect":true}'::jsonb, now() - interval '95 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '1a1a1a1a-0000-4000-8000-000000000001', 2, 'answer_submitted',
   null, '99999999-0000-4000-8000-000000000001',
   '{"isCorrect":false}'::jsonb, now() - interval '93 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '1a1a1a1a-0000-4000-8000-000000000001', 3, 'lesson_completed',
   'ffffffff-0000-4000-8000-000000000001', null, '{}'::jsonb, now() - interval '90 minutes'),

  -- Materia 2 · science_fixture (la de este fichero): sesión de 5 min, un item,
  -- un acierto, sin lección completada.
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '1b1b1b1b-0000-4000-8000-000000000001', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000101', null, '{}'::jsonb, now() - interval '80 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '1b1b1b1b-0000-4000-8000-000000000001', 1, 'answer_submitted',
   null, '99999999-0000-4000-8000-000000000101',
   '{"isCorrect":true}'::jsonb, now() - interval '75 minutes');


-- -----------------------------------------------------------------------------
-- El profesor de Alfa consulta
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  '{"sub":"aaaaaaaa-0000-4000-8000-00000000002a"}', true);

select is(
  (select count(*)::integer from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now())),
  2,
  'dos materias con actividad en la ventana'
);

select is(
  (select m.minutos_estudio from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'math_fixture'),
  10.00,
  'math_fixture: 10 minutos (100 -> 90 min antes de ahora), sin idle que descontar'
);

select is(
  (select m.items_respondidos from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'math_fixture'),
  2,
  'math_fixture: dos items respondidos'
);

select is(
  (select m.aciertos from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'math_fixture'),
  1,
  'math_fixture: un acierto de los dos'
);

select is(
  (select m.porcentaje_acierto from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'math_fixture'),
  50.0,
  'math_fixture: 1 de 2 = 50,0 %'
);

select is(
  (select m.lecciones_completadas from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'math_fixture'),
  1,
  'math_fixture: una leccion completada'
);

select is(
  (select m.minutos_estudio from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'science_fixture'),
  5.00,
  'science_fixture: 5 minutos (80 -> 75 min antes de ahora)'
);

select is(
  (select m.porcentaje_acierto from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'science_fixture'),
  100.0,
  'science_fixture: 1 de 1 = 100,0 %'
);

select is(
  (select m.lecciones_completadas from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now()) m
   where m.subject_code = 'science_fixture'),
  0,
  'science_fixture: ninguna leccion completada, ninguna inventada'
);

-- El cero que no es cero: sin ningun item respondido en una materia,
-- porcentaje_acierto es NULL, no 0. s2a no tiene telemetria en la ventana, asi
-- que no aparece ninguna fila para el -y es justo lo que hay que comprobar: no
-- se inventa una materia a cero para un alumno que no toco nada.
select is(
  (select count(*)::integer from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000004a', now() - interval '5 hours', now())),
  0,
  'un alumno sin telemetria en la ventana no trae ninguna materia'
);


-- -----------------------------------------------------------------------------
-- El guardián. Un tutor de OTRO niño no ve nada de s1a
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('99999999-0000-4000-8000-000000009901', 'tutor.materia.otro@cet.test');

insert into public.profiles (id, school_id, role, full_name, email, status)
values
  ('99999999-0000-4000-8000-000000009901', null, 'guardian', 'Tutor de Otro Nino',
   'tutor.materia.otro@cet.test', 'active');

-- Tutor de s2a, NO de s1a.
insert into public.guardian_students (guardian_id, student_id)
values
  ('99999999-0000-4000-8000-000000009901', 'aaaaaaaa-0000-4000-8000-00000000004a');

select set_config('request.jwt.claims',
                  '{"sub":"99999999-0000-4000-8000-000000009901"}', true);

select throws_ok(
  $$select public.informe_alumno_resumen_por_materia('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now())$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'el tutor de s2a no puede pedir el reparto por materia de s1a'
);

-- El mismo tutor SÍ ve el reparto de su propio hijo (aunque venga vacío: s2a
-- no tiene telemetria en la ventana).
select is(
  (select count(*)::integer from public.informe_alumno_resumen_por_materia(
     'aaaaaaaa-0000-4000-8000-00000000004a', now() - interval '5 hours', now())),
  0,
  'el tutor de s2a SI puede pedir el reparto de su propio hijo, aunque venga vacio'
);


-- -----------------------------------------------------------------------------
-- Un alumno no puede llamar por otro
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  '{"sub":"aaaaaaaa-0000-4000-8000-00000000004a"}', true);

select throws_ok(
  $$select public.informe_alumno_resumen_por_materia('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 hours', now())$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  's2a no puede pedir el reparto por materia de s1a'
);


-- -----------------------------------------------------------------------------
-- Permisos: ni PUBLIC ni anon la ejecutan, authenticated si
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::integer
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public')
      and p.proname = 'informe_alumno_resumen_por_materia'
      and (p.proacl is null
           or exists (select 1 from unnest(p.proacl) a where a::text like '=%'))),
  0,
  'ni la de app ni la de public dejan EXECUTE a PUBLIC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.informe_alumno_resumen_por_materia(uuid,timestamptz,timestamptz)'::regprocedure,
    'execute'),
  'la envoltorio de public es ejecutable por authenticated'
);

select finish();
rollback;
