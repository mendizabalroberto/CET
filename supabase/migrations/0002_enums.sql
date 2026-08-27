-- =============================================================================
-- 0002_enums.sql — enums del dominio
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: packages/shared/src/enums.ts y events.ts
-- =============================================================================
-- CADA enum de aquí debe coincidir MIEMBRO A MIEMBRO y EN ORDEN con su `z.enum`
-- de @cet/shared. Un desajuste no es un detalle estético: el orden de un enum de
-- Postgres es su orden de comparación (`order by status`), y un miembro ausente
-- rompe un insert en producción con `invalid input value for enum`.
--
-- Verificación automatizada: supabase/tests/constraints.sql compara los miembros
-- de cada tipo contra la lista literal esperada.
--
-- Los enums viven en `public` porque PostgREST necesita verlos para exponer los
-- tipos a los clientes generados.
-- =============================================================================

-- --- Identidad y tenancy (enums.ts) ------------------------------------------

-- Un superadmin NO pertenece a ningún colegio: ver el CHECK de `profiles`.
create type public.user_role as enum (
  'superadmin', 'school_admin', 'teacher', 'student'
);

create type public.profile_status as enum (
  'pending', 'active', 'suspended'
);

create type public.school_status as enum (
  'active', 'suspended'
);

-- Determina la longitud del PIN: primary -> pin_length_primary (4 por defecto),
-- secondary -> pin_length_secondary (6). AD-4.
create type public.school_stage as enum (
  'primary', 'secondary'
);

create type public.registration_status as enum (
  'pending', 'approved', 'rejected'
);

-- --- Currículo y contenido ---------------------------------------------------

-- NOTA DE CONTRATO: DATA_MODEL §2 describe el estado de `courses` como
-- draft/published/archived, mientras que @cet/shared define contentStatus como
-- draft/in_review/published/retired. Gana @cet/shared (es el contrato citado
-- como autoridad en el encargo) y se usa el MISMO tipo en cursos, lecciones,
-- preguntas y blueprints: `retired` cumple el papel de `archived`. Registrado
-- como ambigüedad en supabase/REVIEW.md para revisión humana.
create type public.content_status as enum (
  'draft', 'in_review', 'published', 'retired'
);

-- Traducción directa de las clases CSS de los trainers Y6A:
-- .rule -> rule, .eg -> example, .tip -> tip, .warn -> warning, .steps -> steps
create type public.block_kind as enum (
  'rule', 'example', 'tip', 'warning', 'steps',
  'table', 'text', 'image', 'video', 'interactive', 'formula'
);

-- --- Preguntas ---------------------------------------------------------------

create type public.question_kind as enum (
  'static', 'generated'
);

create type public.question_format as enum (
  'mcq_single', 'mcq_multi', 'true_false',
  'numeric', 'fraction',
  'short_text', 'long_text',
  'cloze', 'ordering', 'matching', 'drag_drop', 'hotspot'
);

create type public.grading_mode as enum (
  'auto', 'partial', 'manual'
);

-- --- Exámenes ----------------------------------------------------------------

create type public.feedback_mode as enum (
  'never', 'after_submit', 'immediate'
);

create type public.blueprint_section_source as enum (
  'bank', 'generated', 'mixed'
);

-- --- Intentos ----------------------------------------------------------------

create type public.attempt_status as enum (
  'in_progress', 'submitted', 'grading', 'graded', 'abandoned', 'voided'
);

-- Quién cerró el intento. `timer` = lo cerró el deadline del SERVIDOR, nunca el
-- reloj del cliente (DATA_MODEL §0).
create type public.submitted_by as enum (
  'student', 'timer', 'teacher', 'system'
);

create type public.response_source as enum (
  'typed', 'selected', 'autosave', 'restored'
);

-- NO existe en @cet/shared: DATA_MODEL §6 describe `attempt_gradings.graded_by`
-- como (`auto`/`manual`) sin nombrar el tipo. Se nombra `grading_actor` para no
-- colisionar con el nombre de la columna. Registrado en REVIEW.md.
create type public.grading_actor as enum (
  'auto', 'manual'
);

-- NO existe en @cet/shared: DATA_MODEL §1 menciona
-- `section_members(..., role_in_section)` sin enumerar los valores.
-- `assistant` cubre al profesor de apoyo, que necesita ver la clase pero no
-- calificar. Registrado en REVIEW.md.
create type public.section_role as enum (
  'student', 'teacher', 'assistant'
);

-- --- Telemetría (events.ts) --------------------------------------------------

-- Espejo EXACTO de `learningEventType` en packages/shared/src/events.ts,
-- en el mismo orden y con los mismos 31 miembros.
create type public.learning_event_type as enum (
  -- Ciclo de vida del intento
  'attempt_started',
  'attempt_resumed',
  'attempt_paused',
  'attempt_autosaved',
  'attempt_submitted',
  -- Interacción con la pregunta
  'question_shown',
  'question_skipped',
  'question_revisited',
  'answer_changed',
  'answer_submitted',
  'answer_cleared',
  -- Ayuda
  'hint_requested',
  'solution_viewed',
  -- Atención
  'idle_start',
  'idle_end',
  'focus_lost',
  'focus_gained',
  -- Contenido
  'lesson_opened',
  'lesson_block_viewed',
  'lesson_completed',
  'video_started',
  'video_progress',
  'video_completed',
  -- Práctica y juegos
  'practice_started',
  'practice_item_answered',
  'practice_streak',
  'game_started',
  'game_completed',
  -- Cuenta
  'login_success',
  'login_failed',
  'pin_changed'
);
