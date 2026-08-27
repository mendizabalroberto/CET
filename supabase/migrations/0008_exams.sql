-- =============================================================================
-- 0008_exams.sql — blueprints, secciones y asignaciones
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §5
-- =============================================================================

-- -----------------------------------------------------------------------------
-- exam_blueprints — la definición del examen (no el examen de un alumno)
-- -----------------------------------------------------------------------------
create table public.exam_blueprints (
  id                uuid primary key default extensions.gen_random_uuid(),
  school_id         uuid references public.schools (id) on delete cascade, -- NULL = global (AD-2)
  course_id         uuid not null references public.courses (id) on delete restrict,
  title             jsonb not null,   -- I18nText
  description       jsonb,            -- I18nText
  duration_seconds  integer not null,
  shuffle_questions boolean not null default true,
  shuffle_options   boolean not null default true,
  -- false = examen lineal, sin volver atrás. Cambia radicalmente la UX del
  -- motor, por eso es del blueprint y no una preferencia de cliente.
  allow_back        boolean not null default true,
  feedback_mode     public.feedback_mode not null default 'after_submit',
  pass_threshold    numeric(5,2) not null default 50,   -- porcentaje
  max_attempts      smallint not null default 1,
  status            public.content_status not null default 'draft',
  version           integer not null default 1,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint exam_blueprints_title_i18n check (app.is_i18n_text(title)),
  constraint exam_blueprints_desc_i18n  check (app.is_i18n_text_or_null(description)),
  -- Un examen de 0 segundos se entrega solo antes de que el alumno lea la
  -- primera pregunta. Mínimo 1 minuto, máximo 8 horas.
  constraint exam_blueprints_duration_range
    check (duration_seconds between 60 and 28800),
  constraint exam_blueprints_threshold_range
    check (pass_threshold >= 0 and pass_threshold <= 100),
  constraint exam_blueprints_attempts_pos check (max_attempts >= 1),
  constraint exam_blueprints_version_pos  check (version >= 1),
  -- `immediate` con vuelta atrás permite al alumno probar opciones hasta acertar
  -- y volver: no es feedback, es la respuesta regalada. Estado inválido.
  constraint exam_blueprints_immediate_feedback_is_linear
    check (feedback_mode <> 'immediate' or allow_back = false)
);

create index exam_blueprints_course_idx on public.exam_blueprints (course_id, status);
create index exam_blueprints_school_idx on public.exam_blueprints (school_id);

create trigger exam_blueprints_set_updated_at
  before update on public.exam_blueprints
  for each row execute function app.set_updated_at();

alter table public.exam_blueprints enable row level security;


-- -----------------------------------------------------------------------------
-- exam_blueprint_sections — el equivalente de MPARTS / MOCK_PLAN de Y6A
-- -----------------------------------------------------------------------------
create table public.exam_blueprint_sections (
  id              uuid primary key default extensions.gen_random_uuid(),
  blueprint_id    uuid not null references public.exam_blueprints (id) on delete cascade,
  ord             integer not null,
  title           jsonb not null,   -- I18nText
  item_count      integer not null,
  -- { skill_ids: [], difficulty: {min,max}, question_kind, tags: [] }
  selection       jsonb not null default '{}'::jsonb,
  source          public.blueprint_section_source not null default 'mixed',
  points_per_item numeric(6,2) not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint exam_blueprint_sections_ord_uniq unique (blueprint_id, ord),
  constraint exam_blueprint_sections_ord_pos  check (ord >= 1),
  constraint exam_blueprint_sections_title_i18n check (app.is_i18n_text(title)),
  -- Una sección de 0 items no aporta nada y rompe la materialización.
  constraint exam_blueprint_sections_count_range check (item_count between 1 and 200),
  constraint exam_blueprint_sections_points_pos check (points_per_item > 0),
  constraint exam_blueprint_sections_selection_object
    check (app.is_jsonb_object(selection)),
  -- Rango de dificultad coherente: sin esto, {min:5,max:1} selecciona 0
  -- preguntas y el examen sale con menos items de los prometidos.
  constraint exam_blueprint_sections_difficulty_range
    check (
      not (selection ? 'difficulty')
      or (
        jsonb_typeof(selection -> 'difficulty') = 'object'
        -- Ambas claves presentes: sin esto, un ->> ausente da NULL, la
        -- comparación da NULL y el CHECK pasa. Un rango a medias colaría.
        and (selection -> 'difficulty') ? 'min'
        and (selection -> 'difficulty') ? 'max'
        and ((selection -> 'difficulty' ->> 'min')::int between 1 and 5)
        and ((selection -> 'difficulty' ->> 'max')::int between 1 and 5)
        and ((selection -> 'difficulty' ->> 'min')::int
             <= (selection -> 'difficulty' ->> 'max')::int)
      )
    ),
  constraint exam_blueprint_sections_skill_ids_array
    check (not (selection ? 'skill_ids') or jsonb_typeof(selection -> 'skill_ids') = 'array')
);

create trigger exam_blueprint_sections_set_updated_at
  before update on public.exam_blueprint_sections
  for each row execute function app.set_updated_at();

alter table public.exam_blueprint_sections enable row level security;


-- -----------------------------------------------------------------------------
-- exam_assignments — este examen, a esta clase, en esta ventana
-- -----------------------------------------------------------------------------
create table public.exam_assignments (
  id                          uuid primary key default extensions.gen_random_uuid(),
  -- restrict: un blueprint con exámenes asignados no se borra. Los intentos
  -- guardan su propio blueprint_snapshot, pero la asignación es el vínculo
  -- administrativo (quién lo puso, a quién, cuándo) y también es historia.
  blueprint_id                uuid not null references public.exam_blueprints (id) on delete restrict,
  -- Versión del blueprint EN EL MOMENTO de asignar. Si mañana la editan, se
  -- sigue sabiendo qué se asignó.
  blueprint_version           integer not null,
  -- NOT NULL: una asignación es siempre de un colegio concreto, aunque el
  -- blueprint sea global. Es lo que ancla la RLS.
  school_id                   uuid not null references public.schools (id) on delete cascade,
  section_id                  uuid references public.sections (id) on delete cascade,
  opens_at                    timestamptz not null,
  closes_at                   timestamptz not null,
  max_attempts                smallint not null default 1,
  time_limit_override_seconds integer,
  assigned_by                 uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- DATA_MODEL §5: la ventana debe existir. Una ventana invertida deja un examen
  -- que nunca se puede abrir y nadie entiende por qué.
  constraint exam_assignments_window check (closes_at > opens_at),
  constraint exam_assignments_attempts_pos check (max_attempts >= 1),
  constraint exam_assignments_override_range
    check (time_limit_override_seconds is null
           or time_limit_override_seconds between 60 and 28800),
  constraint exam_assignments_version_pos check (blueprint_version >= 1)
);

comment on constraint exam_assignments_window on public.exam_assignments is
  'closes_at > opens_at. Ventana invertida = examen inabrible (DATA_MODEL §5).';

-- Query caliente: la pantalla de inicio del alumno — "¿qué exámenes tengo
-- abiertos ahora?". Filtra por sección y por ventana temporal.
create index exam_assignments_open_window_idx
  on public.exam_assignments (school_id, section_id, opens_at, closes_at);

-- Query caliente del profesor: "¿dónde he asignado este blueprint?"
create index exam_assignments_blueprint_idx
  on public.exam_assignments (blueprint_id);

create trigger exam_assignments_set_updated_at
  before update on public.exam_assignments
  for each row execute function app.set_updated_at();

alter table public.exam_assignments enable row level security;


-- -----------------------------------------------------------------------------
-- La sección asignada tiene que ser del mismo colegio que la asignación
-- -----------------------------------------------------------------------------
-- Una FK no puede expresar "y además del mismo tenant". Sin esta comprobación,
-- un school_admin podría asignar un examen a una clase de OTRO colegio: fuga
-- de tenant por escritura, que ninguna política de lectura detectaría.
create or replace function app.validate_assignment_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sec_school uuid;
begin
  if new.section_id is null then
    return new;
  end if;

  select s.school_id into sec_school
  from public.sections s where s.id = new.section_id;

  if sec_school is distinct from new.school_id then
    raise exception
      'exam_assignments: la sección pertenece al colegio % pero la asignación es del colegio %',
      sec_school, new.school_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger exam_assignments_validate_tenant
  before insert or update of section_id, school_id on public.exam_assignments
  for each row execute function app.validate_assignment_tenant();


-- -----------------------------------------------------------------------------
-- El curso de un blueprint tiene que ser suyo o global
-- -----------------------------------------------------------------------------
-- HALLAZGO DE LA PASADA 2, gemelo del de `questions`: la política de INSERT solo
-- mira el `school_id` de la propia fila, así que un profesor del colegio A podía
-- crear un blueprint suyo apuntando al curso PRIVADO del colegio B. La FK
-- garantiza que el curso existe, no que sea suyo.
create or replace function app.validate_blueprint_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_course_school uuid;
begin
  select c.school_id into v_course_school
  from public.courses c where c.id = new.course_id;

  if v_course_school is not null and v_course_school is distinct from new.school_id then
    raise exception
      'exam_blueprints: el curso pertenece al colegio % y el blueprint al colegio %',
      v_course_school, new.school_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger exam_blueprints_validate_tenant
  before insert or update of course_id, school_id on public.exam_blueprints
  for each row execute function app.validate_blueprint_tenant();
