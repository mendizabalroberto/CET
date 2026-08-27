-- =============================================================================
-- rls_tenant_isolation.sql — un usuario del colegio A no lee NADA del colegio B
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- AD-1 en una frase: el aislamiento entre colegios no es una feature, es la
-- condición de existencia del producto. Este fichero lo prueba TABLA POR TABLA,
-- no con un par de casos representativos.
--
-- La parte D (control positivo) es tan importante como las A/B/C: sin ella, una
-- RLS rota que bloqueara absolutamente todo pasaría el test con sobresaliente.
-- =============================================================================
begin;
select plan(46);

\ir helpers/fixture.psql

-- =============================================================================
-- A. El PROFESOR del colegio Alfa frente a todo lo del colegio Beta
-- =============================================================================
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.schools
    where id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve el colegio Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve NINGÚN perfil de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.students
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve fichas de alumno de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.sections
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve las clases de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.section_members
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve las matrículas de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.registration_requests
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve las solicitudes de registro de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.subjects where code = 'beta_only'$$),
  0, 'teacher_a no ve la materia privada de Beta (AD-2)');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.courses
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve el curso privado de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.school_courses
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve qué cursos ha activado Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.course_modules
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve los módulos privados de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.lessons
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve las lecciones privadas de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.skills where code = 'beta.secret_skill'$$),
  0, 'teacher_a no ve la taxonomía de skills privada de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.lesson_skills
    where lesson_id = 'ffffffff-0000-4000-8000-00000000000b'$$),
  0, 'teacher_a no ve el mapa lección-skill de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.media_assets
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve los media de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.lesson_blocks
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve el contenido de las lecciones de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.questions
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve el banco de preguntas de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.question_versions
    where question_id = '77777777-0000-4000-8000-00000000000b'$$),
  0, 'teacher_a no ve las versiones de las preguntas de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_blueprints
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve los blueprints privados de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_assignments
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve las asignaciones de examen de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve los intentos de examen de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_items
    where attempt_id = '33333333-0000-4000-8000-0000000000b1'$$),
  0, 'teacher_a no ve los items del intento de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_responses
    where attempt_id = '33333333-0000-4000-8000-0000000000b1'$$),
  0, 'teacher_a no ve las respuestas del intento de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_gradings
    where attempt_id = '33333333-0000-4000-8000-0000000000b1'$$),
  0, 'teacher_a no ve las calificaciones del intento de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.learning_events
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve la telemetría de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.skill_mastery
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve el mastery de los alumnos de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.audit_log
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve el audit_log de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.auth_attempts
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 'teacher_a no ve los intentos de login de Beta');


-- =============================================================================
-- B. El ALUMNO del colegio Alfa frente al colegio Beta
-- =============================================================================
select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 's1a no ve perfiles de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.students
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 's1a no ve alumnos de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 's1a no ve intentos de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_items
    where attempt_id = '33333333-0000-4000-8000-0000000000b1'$$),
  0, 's1a no ve items de un intento de Beta');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.learning_events
    where school_id = '22222222-2222-4222-8222-222222222222'$$),
  0, 's1a no ve telemetría de Beta');

select is(pg_temp.visible_count($$select count(*)::int from public.audit_log$$),
  0, 's1a no ve NINGUNA fila de audit_log, ni siquiera de su colegio');


-- =============================================================================
-- C. Simetría: el admin de Beta tampoco ve nada de Alfa
-- =============================================================================
-- El aislamiento tiene que ser bidireccional. Una política escrita "al revés"
-- (comparando contra el school_id de la FILA en vez del del USUARIO) pasaría la
-- parte A y fallaría aquí.
select pg_temp.logout();
select pg_temp.login_as('bbbbbbbb-0000-4000-8000-00000000001b');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'admin_b no ve perfiles de Alfa');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.students
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'admin_b no ve alumnos de Alfa');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'admin_b no ve intentos de Alfa');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.audit_log
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'admin_b no ve el audit_log de Alfa');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.auth_attempts
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'admin_b no ve los intentos de login de Alfa');


-- =============================================================================
-- D. CONTROL POSITIVO — sin esto el test no vale nada
-- =============================================================================
-- Si una migración rompiera la RLS dejándola en "nadie ve nada", las 37
-- aserciones anteriores seguirían en verde y el sistema estaría inutilizable.
-- Estas cinco comprueban que el profesor SÍ ve lo suyo.
select pg_temp.logout();
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');

-- Cuenta EXACTA, no `>= 5`. La fixture crea cuatro perfiles en Alfa —admin_a,
-- teacher_a, s1a y s2a— y el superadmin no cuenta: no pertenece a ningún
-- colegio. El `>= 5` original era un error de aritmética, y además un umbral
-- flojo: con `>=`, una RLS que dejara ver DE MÁS pasaría el control tan
-- contenta. La cifra exacta comprueba las dos direcciones a la vez.
select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  4, 'CONTROL: teacher_a ve los 4 perfiles de su colegio, ni uno más ni uno menos');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.students
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  2, 'CONTROL: teacher_a SÍ ve a sus 2 alumnos');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  2, 'CONTROL: teacher_a SÍ ve los 2 intentos de su colegio');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.attempt_items
    where attempt_id = '33333333-0000-4000-8000-0000000000a1'$$),
  3, 'CONTROL: teacher_a SÍ ve los 3 items del intento de su alumno');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.learning_events
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  1, 'CONTROL: teacher_a SÍ ve la telemetría de su colegio');


-- =============================================================================
-- E. Suspender un COLEGIO corta el acceso de todo su personal (pasada 2)
-- =============================================================================
-- Hallazgo de la revisión: `schools.status` existía pero no hacía nada. Los
-- helpers solo miraban `profiles.status`, así que el personal de un colegio
-- suspendido conservaba acceso completo. Ahora los helpers exigen que el colegio
-- también esté `active`, y esto lo prueba.
select pg_temp.logout();
update public.schools set status = 'suspended'
 where id = '11111111-1111-4111-8111-111111111111';

select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.students
    where school_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'Con el colegio SUSPENDIDO, teacher_a deja de ver a sus propios alumnos');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.exam_attempts$$),
  0, 'Con el colegio SUSPENDIDO, teacher_a deja de ver ningún intento');

select ok(
  (select not app.is_staff()),
  'app.is_staff() devuelve false cuando el colegio está suspendido');

select pg_temp.logout();
select * from finish();
rollback;
