-- =============================================================================
-- constraints.sql — los estados inválidos son IMPOSIBLES, no "no deseados"
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- MASTER_PLAN §7: "¿constraints que hagan imposible el estado inválido?".
-- Una regla que solo vive en el código de aplicación es una regla que un script
-- de migración, un job nocturno o un `psql` a las tres de la mañana se saltan.
--
-- Este fichero corre como el propietario de las tablas (sin RLS de por medio):
-- se prueban las CONSTRAINTS, que aplican a todos los roles por igual.
-- =============================================================================
begin;
-- El plan cuadra con los asserts REALES del fichero, contados. Decia 48 con 45
-- escritos, y un plan que no cuadra es un fallo que pgTAP reporta como
-- "planned 48 but ran 45" al final del todo, despues de que los 45 salgan
-- verdes: es facil leerlo como ruido y seguir. Los tres que faltaban nunca se
-- escribieron. Ahora son 46 (los 45 de siempre mas el orden de los miembros de
-- interfaz del enum, en §8).
select plan(46);

\ir helpers/fixture.psql

-- Usuarios de autenticación de repuesto, para los perfiles que estos tests
-- INTENTAN crear. Se insertan aquí, fuera de los throws_ok, porque cada
-- aserción debe fallar por LA constraint que se está probando y no por una
-- dependencia que faltaba.
insert into auth.users (id, email) values
  ('0f0f0f0f-0000-4000-8000-000000000001', 'bad.super@cet.test'),
  ('0f0f0f0f-0000-4000-8000-000000000002', 'orphan@cet.test'),
  ('0f0f0f0f-0000-4000-8000-000000000003', 'noemail@cet.test'),
  ('0f0f0f0f-0000-4000-8000-000000000004', 's.X@alfa.students.cet.invalid'),
  ('0f0f0f0f-0000-4000-8000-000000000005', 's.dup@alfa.students.cet.invalid'),
  ('0f0f0f0f-0000-4000-8000-000000000006', 's.S1A@beta.students.cet.invalid');

-- =============================================================================
-- 1. profiles — la constraint que sostiene el modelo de tenancy
-- =============================================================================
select throws_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, status)
      values ('0f0f0f0f-0000-4000-8000-000000000001',
              '11111111-1111-4111-8111-111111111111',
              'superadmin', 'Superadmin con colegio', 'bad.super@cet.test', 'active')$$,
  '23514', null,
  'Un superadmin CON school_id es imposible');

select throws_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, status)
      values ('0f0f0f0f-0000-4000-8000-000000000002', null,
              'teacher', 'Profesor huérfano', 'orphan@cet.test', 'active')$$,
  '23514', null,
  'Un profesor SIN school_id es imposible (sus políticas RLS compararían contra NULL)');

select throws_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, status)
      values ('0f0f0f0f-0000-4000-8000-000000000003',
              '11111111-1111-4111-8111-111111111111',
              'teacher', 'Profesor sin email', null, 'active')$$,
  '23514', null,
  'Un miembro del staff sin email no puede existir: sin email no hay login (AD-3)');


-- =============================================================================
-- 2. schools — longitud de PIN (AD-4)
-- =============================================================================
select throws_ok(
  $$insert into public.schools (name, slug, pin_length_primary)
    values ('PIN corto', 'pin-corto', 3)$$,
  '23514', null,
  'Un PIN de 3 dígitos es imposible: 1.000 combinaciones se fuerzan a mano');

select throws_ok(
  $$insert into public.schools (name, slug, pin_length_secondary)
    values ('PIN largo', 'pin-largo', 9)$$,
  '23514', null,
  'Un PIN de 9 dígitos es imposible: inusable para un niño');

select throws_ok(
  $$insert into public.schools (name, slug) values ('Slug feo', 'Slug/Con Barra')$$,
  '23514', null,
  'Un slug con mayúsculas o barras rompería la URL de login: prohibido');


-- =============================================================================
-- 3. students — el PIN y su unicidad
-- =============================================================================
insert into public.profiles (id, school_id, role, full_name, status) values
  ('0f0f0f0f-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', 'student', 'Alumno X', 'active'),
  ('0f0f0f0f-0000-4000-8000-000000000005',
   '11111111-1111-4111-8111-111111111111', 'student', 'Duplicado', 'active'),
  ('0f0f0f0f-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', 'student', 'S1A de Beta', 'active');

select throws_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level,
                                 stage, pin_hash)
      values ('0f0f0f0f-0000-4000-8000-000000000004',
              '11111111-1111-4111-8111-111111111111', 'X001', 6, 'primary', '1234')$$,
  '23514', null,
  'Guardar un PIN en claro (o con otro algoritmo) es imposible: el CHECK exige el prefijo argon2id');

select throws_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level,
                                 stage, pin_hash)
      values ('0f0f0f0f-0000-4000-8000-000000000005',
              '11111111-1111-4111-8111-111111111111', 'S1A', 6, 'primary',
              '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')$$,
  '23505', null,
  'Dos alumnos con el mismo código EN EL MISMO colegio: imposible');

-- ...pero el mismo código en OTRO colegio sí, porque la unicidad es por tenant.
select lives_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level,
                                 stage, pin_hash)
      values ('0f0f0f0f-0000-4000-8000-000000000006',
              '22222222-2222-4222-8222-222222222222', 'S1A', 6, 'primary',
              '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')$$,
  'El código "S1A" SÍ puede repetirse en otro colegio: la unicidad es por tenant');


-- =============================================================================
-- 4. exam_assignments — la ventana temporal (DATA_MODEL §5)
-- =============================================================================
select throws_ok(
  $$insert into public.exam_assignments
      (blueprint_id, blueprint_version, school_id, section_id, opens_at, closes_at)
    values ('66666666-0000-4000-8000-000000000001', 1,
            '11111111-1111-4111-8111-111111111111',
            '11111111-0000-4000-8000-0000000000a1',
            now(), now() - interval '1 hour')$$,
  '23514', null,
  'closes_at <= opens_at es imposible: sería un examen inabrible');

select throws_ok(
  $$insert into public.exam_assignments
      (blueprint_id, blueprint_version, school_id, section_id, opens_at, closes_at)
    values ('66666666-0000-4000-8000-000000000001', 1,
            '11111111-1111-4111-8111-111111111111',
            '22222222-0000-4000-8000-0000000000b1',    -- clase de OTRO colegio
            now(), now() + interval '1 hour')$$,
  '23514', null,
  'Asignar un examen a una clase de otro colegio es imposible (fuga de tenant por escritura)');


-- =============================================================================
-- 5. exam_attempts — la máquina de estados
-- =============================================================================
select throws_ok(
  $$insert into public.exam_attempts
      (assignment_id, student_id, school_id, attempt_number, blueprint_snapshot,
       seed, status, started_at, server_deadline_at, submitted_at, submitted_by)
    values ('44444444-0000-4000-8000-00000000000a',
            'aaaaaaaa-0000-4000-8000-00000000003a',
            '11111111-1111-4111-8111-111111111111', 9, '{}'::jsonb,
            1, 'graded', now(), now() + interval '30 minutes',
            now(), 'student')$$,
  '23514', null,
  'Un intento `graded` sin nota es imposible');

select throws_ok(
  $$insert into public.exam_attempts
      (assignment_id, student_id, school_id, attempt_number, blueprint_snapshot,
       seed, status, started_at, server_deadline_at)
    values ('44444444-0000-4000-8000-00000000000a',
            'aaaaaaaa-0000-4000-8000-00000000003a',
            '11111111-1111-4111-8111-111111111111', 8, '{}'::jsonb,
            1, 'in_progress', now(), now() - interval '1 minute')$$,
  '23514', null,
  'Un intento que nace ya caducado (deadline < inicio) es imposible');

select throws_ok(
  $$insert into public.exam_attempts
      (assignment_id, student_id, school_id, attempt_number, blueprint_snapshot,
       seed, status, started_at, server_deadline_at)
    values ('44444444-0000-4000-8000-00000000000a',
            'aaaaaaaa-0000-4000-8000-00000000003a',
            '11111111-1111-4111-8111-111111111111', 7, '{}'::jsonb,
            9007199254740992, 'in_progress', now(), now() + interval '30 minutes')$$,
  '23514', null,
  'Una semilla fuera del rango seguro de JS es imposible: llegaría redondeada al cliente '
  'y el intento dejaría de ser reproducible');

select throws_ok(
  $$insert into public.exam_attempts
      (assignment_id, student_id, school_id, attempt_number, blueprint_snapshot,
       seed, status, started_at, server_deadline_at, submitted_at, submitted_by,
       graded_at, score_raw, score_max, score_pct, passed)
    values ('44444444-0000-4000-8000-00000000000a',
            'aaaaaaaa-0000-4000-8000-00000000003a',
            '11111111-1111-4111-8111-111111111111', 6, '{}'::jsonb,
            1, 'graded', now(), now() + interval '30 minutes',
            now(), 'student', now(), 5, 3, 100, true)$$,
  '23514', null,
  'Sacar más puntos que el máximo del examen es imposible');


-- =============================================================================
-- 6. attempt_items / attempt_responses / attempt_gradings
-- =============================================================================
select throws_ok(
  $$insert into public.attempt_items
      (attempt_id, ord, question_id, question_version_id, item_seed,
       rendered_body, option_order, answer_key)
    values ('33333333-0000-4000-8000-0000000000a1', 90,
            '77777777-0000-4000-8000-000000000001',
            '88888888-0000-4000-8000-000000000002', 1,
            '{"stem":"x"}'::jsonb, array[0, 0, 1], '{"type":"choice"}'::jsonb)$$,
  '23514', null,
  'Un option_order con índices repetidos es imposible: "eligió la B" dejaría de ser reconstruible');

select throws_ok(
  $$insert into public.attempt_items
      (attempt_id, ord, question_id, question_version_id, item_seed,
       rendered_body, answer_key)
    values ('33333333-0000-4000-8000-0000000000a1', 91,
            '77777777-0000-4000-8000-000000000001',
            '88888888-0000-4000-8000-000000000002', 1,
            '{"stem":"   "}'::jsonb, '{"type":"choice"}'::jsonb)$$,
  '23514', null,
  'Un item con el enunciado vacío es imposible: se puntuaría algo que el alumno vio en blanco');

select throws_ok(
  $$insert into public.attempt_responses
      (attempt_id, attempt_item_id, revision, response, is_final)
    values ('33333333-0000-4000-8000-0000000000a1',
            'a1a1a1a1-0000-4000-8000-000000000001', 50,
            '{"type":"choice","selectedIds":["b"]}'::jsonb, true)$$,
  '23505', null,
  'DOS respuestas finales para el mismo item son imposibles: la nota dependería del plan de ejecución');

select throws_ok(
  $$insert into public.attempt_responses
      (attempt_id, attempt_item_id, revision, response)
    values ('33333333-0000-4000-8000-0000000000a2',      -- intento de s2a...
            'a1a1a1a1-0000-4000-8000-000000000001', 51,  -- ...item de s1a
            '{"type":"choice","selectedIds":["b"]}'::jsonb)$$,
  '23514', null,
  'Colgar una respuesta del item de OTRO intento es imposible');

select throws_ok(
  $$insert into public.attempt_gradings
      (attempt_id, attempt_item_id, points_awarded, max_points, graded_by)
    values ('33333333-0000-4000-8000-0000000000a1',
            'a1a1a1a1-0000-4000-8000-000000000001', 5, 1, 'auto')$$,
  '23514', null,
  'Dar más puntos que el máximo del item es imposible');

select throws_ok(
  $$insert into public.attempt_gradings
      (attempt_id, attempt_item_id, points_awarded, max_points, graded_by, grader_id)
    values ('33333333-0000-4000-8000-0000000000a1',
            'a1a1a1a1-0000-4000-8000-000000000001', 1, 1, 'manual', null)$$,
  '23514', null,
  'Una corrección manual sin corrector es imposible: nadie firmaría la nota');

select throws_ok(
  $$insert into public.attempt_gradings
      (attempt_id, attempt_item_id, points_awarded, max_points, graded_by)
    values ('33333333-0000-4000-8000-0000000000a1',
            'a1a1a1a1-0000-4000-8000-000000000001', 1, 1, 'auto')$$,
  '23505', null,
  'DOS calificaciones vigentes (sin supersedes_id) para el mismo item son imposibles');


-- =============================================================================
-- 7. Contenido y currículo
-- =============================================================================
select throws_ok(
  $$insert into public.lessons (module_id, ord, title)
    values ('eeeeeeee-0000-4000-8000-000000000001', 90, '{}'::jsonb)$$,
  '23514', null,
  'Un I18nText vacío es dato corrupto, no un texto opcional');

select throws_ok(
  $$insert into public.lessons (module_id, ord, title)
    values ('eeeeeeee-0000-4000-8000-000000000001', 91,
            '{"fr":"Bonjour"}'::jsonb)$$,
  '23514', null,
  'Un I18nText con un idioma fuera del contrato ({es,en}) es imposible');

select throws_ok(
  $$insert into public.media_assets
      (school_id, storage_path, mime, bytes, alt_text, checksum)
    values ('11111111-1111-4111-8111-111111111111', 'a/b.png', 'image/png', 10,
            null, repeat('9', 64))$$,
  '23502', null,
  'Una imagen sin alt_text es imposible: la accesibilidad no es opcional');

select throws_ok(
  $$insert into public.lesson_blocks (lesson_id, ord, kind, content)
    values ('ffffffff-0000-4000-8000-000000000001', 90, 'table',
            '{"headers":["a","b"],"rows":[["1"]]}'::jsonb)$$,
  '23514', null,
  'Una tabla con filas más cortas que la cabecera es imposible: se renderizaría rota');

select throws_ok(
  $$insert into public.question_versions
      (question_id, version, format, body, answer_spec, difficulty, grading_mode)
    values ('77777777-0000-4000-8000-000000000001', 90, 'numeric',
            '{"stem":"x"}'::jsonb, '{"type":"numeric","value":1}'::jsonb, 9, 'auto')$$,
  '23514', null,
  'Una dificultad fuera de 1..5 es imposible');

select throws_ok(
  $$insert into public.question_versions
      (question_id, version, format, body, answer_spec, difficulty, grading_mode)
    values ('77777777-0000-4000-8000-000000000001', 91, 'long_text',
            '{"stem":"Explica"}'::jsonb,
            '{"type":"manual","rubric":{"en":"..."}}'::jsonb, 3, 'auto')$$,
  '23514', null,
  'Una clave de tipo `manual` con grading_mode `auto` es imposible: nadie podría corregirla');

select throws_ok(
  $$insert into public.exam_blueprint_sections
      (blueprint_id, ord, title, item_count, selection)
    values ('66666666-0000-4000-8000-000000000001', 90,
            '{"en":"Bad"}'::jsonb, 5,
            '{"difficulty":{"min":5,"max":1}}'::jsonb)$$,
  '23514', null,
  'Un rango de dificultad invertido es imposible: seleccionaría 0 preguntas en silencio');

select throws_ok(
  $$update public.skills set parent_skill_id = id
     where id = '99999999-0000-4000-8000-000000000001'$$,
  '23514', null,
  'Una skill que es su propia madre es imposible: colgaría cualquier recorrido recursivo');

select throws_ok(
  $$insert into public.skill_mastery
      (student_id, skill_id, school_id, attempts_count, correct_count)
    values ('aaaaaaaa-0000-4000-8000-00000000004a',
            '99999999-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 2, 5)$$,
  '23514', null,
  'Acertar más veces de las que se ha intentado es imposible');

select throws_ok(
  $$update public.registration_requests
       set status = 'rejected', reviewed_at = now()
     where full_name = 'Solicitud Alfa'$$,
  '23514', null,
  'Rechazar una solicitud sin motivo es imposible: el tutor se quedaría sin saber qué hacer');


-- =============================================================================
-- 7 bis. Coherencia de tenant que una FK NO puede expresar (pasada 2)
-- =============================================================================
-- Una FK garantiza que la fila referenciada EXISTE, nunca que sea del mismo
-- colegio. Sin estos triggers, un profesor de Alfa creaba contenido propio
-- colgado del currículo privado de Beta.
select throws_ok(
  $$insert into public.questions (school_id, course_id, skill_id, kind, status)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-0000-4000-8000-00000000000b',   -- curso privado de BETA
            '99999999-0000-4000-8000-00000000000b',
            'static', 'draft')$$,
  '23514', null,
  'Una pregunta de Alfa colgada del curso privado de Beta es imposible');

select throws_ok(
  $$insert into public.questions (school_id, course_id, skill_id, kind, status)
    values (null,
            'dddddddd-0000-4000-8000-000000000001',   -- curso global de Math
            '99999999-0000-4000-8000-00000000000b',   -- skill de OTRO curso
            'static', 'draft')$$,
  '23514', null,
  'Una pregunta etiquetada con una skill de otro curso es imposible: el modelo de mastery mentiría');

select throws_ok(
  $$insert into public.exam_blueprints
      (school_id, course_id, title, duration_seconds)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-0000-4000-8000-00000000000b',   -- curso privado de BETA
            '{"en":"Robado"}'::jsonb, 600)$$,
  '23514', null,
  'Un blueprint de Alfa sobre el curso privado de Beta es imposible');

select ok(
  not has_column_privilege('authenticated', 'public.schools', 'status', 'UPDATE'),
  'authenticated no puede escribir schools.status: un school_admin no revierte su propia suspensión');

select ok(
  not has_column_privilege('authenticated', 'public.schools', 'slug', 'UPDATE'),
  'authenticated no puede escribir schools.slug: no se secuestra la URL de login de otro colegio');

select ok(
  not has_table_privilege('authenticated', 'public.students', 'INSERT'),
  'authenticated no tiene INSERT sobre students: el alta pasa por service_role, '
  'que es quien genera el PIN y lo hashea');


-- =============================================================================
-- 8. Los enums coinciden con @cet/shared
-- =============================================================================
-- Un miembro de más o de menos aquí es un `invalid input value for enum` en
-- producción, con el insert ya perdido.
select enum_has_labels('public', 'user_role',
  array['superadmin', 'school_admin', 'teacher', 'student'],
  'public.user_role coincide con userRole de @cet/shared');

select enum_has_labels('public', 'attempt_status',
  array['in_progress', 'submitted', 'grading', 'graded', 'abandoned', 'voided'],
  'public.attempt_status coincide con attemptStatus de @cet/shared');

select enum_has_labels('public', 'question_format',
  array['mcq_single', 'mcq_multi', 'true_false', 'numeric', 'fraction',
        'short_text', 'long_text', 'cloze', 'ordering', 'matching',
        'drag_drop', 'hotspot'],
  'public.question_format coincide con questionFormat de @cet/shared');

select is(
  (select count(*)::int from pg_enum e
   join pg_type t on t.oid = e.enumtypid where t.typname = 'learning_event_type'),
  34,
  'public.learning_event_type tiene los 34 miembros de learningEventType (events.ts)');

-- Los tres de interfaz (0051) van AL FINAL y en este orden. No se comprueba solo
-- que estén: se comprueba su POSICIÓN. El orden de un enum de Postgres es su
-- orden de comparación, así que reordenarlos cambiaría en silencio el resultado
-- de cualquier `order by event_type` de los informes de conducta.
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'learning_event_type' and e.enumsortorder > (
     select max(e2.enumsortorder) - 3
     from pg_enum e2 join pg_type t2 on t2.oid = e2.enumtypid
     where t2.typname = 'learning_event_type')),
  array['session_context', 'ui_interaction', 'nav_route_changed'],
  'los tres miembros de interfaz cierran el enum, en el orden de events.ts');


-- =============================================================================
-- 9. Invariantes globales del esquema
-- =============================================================================
select is(
  (select count(*)::int
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0,
  'NINGUNA tabla de public se queda sin row level security (DATA_MODEL §0)');

select is(
  (select count(*)::int
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                     where cfg like 'search_path=%')),
  0,
  'NINGUNA función security definer se queda sin search_path fijado (DATA_MODEL §9)');

-- -----------------------------------------------------------------------------
-- Regex con bounds imposibles (regresión de 0021)
-- -----------------------------------------------------------------------------
-- `media_assets_storage_path_shape` pedía `{0,511}`. El motor de regex de
-- Postgres limita las repeticiones a 255, así que el patrón NO COMPILA. La
-- constraint se creó sin protestar —ADD CHECK sobre una tabla vacía no evalúa
-- nada— y habría reventado en el primer insert de un recurso multimedia, con un
-- "invalid regular expression" que manda a depurar el sitio equivocado.
--
-- Este test es la prueba viva de que la constraint se EVALÚA, no solo de que
-- existe. Antes de 0021 falla; después, pasa.
select lives_ok(
  $$insert into public.media_assets
      (school_id, storage_path, mime, bytes, alt_text, checksum)
    values ('11111111-1111-4111-8111-111111111111',
            'alfa/carpeta/con/varios/niveles/diagrama.png',
            'image/png', 4096, '{"en":"Deep path"}'::jsonb, repeat('3', 64))$$,
  'Un storage_path válido entra: la CHECK compila de verdad, no solo existe');

select throws_ok(
  $$insert into public.media_assets
      (school_id, storage_path, mime, bytes, alt_text, checksum)
    values ('11111111-1111-4111-8111-111111111111', 'alfa/../beta/robado.png',
            'image/png', 4096, '{"en":"Traversal"}'::jsonb, repeat('4', 64))$$,
  '23514',
  null,
  'La travesía de directorios sigue rechazada tras reescribir la constraint');

-- El invariante que cierra la familia entera. Una constraint con un bound por
-- encima de 255 es una bomba de relojería: pasa la revisión, pasa el despliegue,
-- y estalla el día que alguien inserta la primera fila.
select is(
  (select count(*)::int
   from pg_catalog.pg_constraint c
   join pg_catalog.pg_namespace n on n.oid = c.connamespace
   where c.contype = 'c'
     and n.nspname in ('public', 'app')
     and exists (
       select 1
       from regexp_matches(pg_catalog.pg_get_constraintdef(c.oid), '\{\d*,?(\d+)\}', 'g') m
       where (m[1])::int > 255
     )),
  0,
  'NINGUNA CHECK usa un bound de regex por encima de 255: no compilaría al evaluarse');

-- La trampa de 0022, cerrada para toda la familia. Dentro de una función
-- SECURITY DEFINER, `current_user` es el PROPIETARIO, nunca quien llama. Cuatro
-- guards se apoyaban en eso y estaban inertes: el de escalada de privilegios,
-- el del PIN, el de la identidad forense del intento y el del audit_log. Se leen
-- perfectamente y no hacían nada.
--
-- Quien necesite saber si la petición viene de la app tiene `app.is_app_user()`.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and p.prosecdef
     and pg_catalog.pg_get_functiondef(p.oid) ~ '\mcurrent_user\M'),
  '',
  'NINGUNA función security definer decide con current_user: ahí dentro siempre es el propietario');

select * from finish();
rollback;
