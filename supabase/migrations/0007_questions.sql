-- =============================================================================
-- 0007_questions.sql — banco de preguntas con versionado INMUTABLE
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §4 · principio rector del MASTER_PLAN
-- =============================================================================
-- Aquí vive el principio rector. La identidad de la pregunta y su contenido son
-- tablas distintas:
--
--   questions          -> un id estable, para siempre. Es lo que referencian los
--                         informes, la taxonomía de skills y las estadísticas.
--   question_versions  -> un snapshot inmutable. Editar una pregunta NO la
--                         modifica: crea una versión nueva.
--
-- Sin esta separación, corregir una errata en una pregunta reescribiría
-- retroactivamente exámenes ya calificados, y "el alumno falló la pregunta 7"
-- dejaría de significar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- questions — identidad estable
-- -----------------------------------------------------------------------------
create table public.questions (
  id                 uuid primary key default extensions.gen_random_uuid(),
  school_id          uuid references public.schools (id) on delete cascade, -- NULL = global (AD-2)
  course_id          uuid not null references public.courses (id) on delete restrict,
  -- restrict: la skill es lo que da sentido a la pregunta en el modelo de
  -- mastery; borrarla dejaría preguntas sin eje de análisis.
  skill_id           uuid not null references public.skills (id) on delete restrict,
  kind               public.question_kind not null,
  -- FK añadida más abajo (dependencia circular con question_versions).
  current_version_id uuid,
  status             public.content_status not null default 'draft',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Query caliente #1: la selección de items del blueprint —
-- "preguntas publicadas de estas skills, dentro de este rango de dificultad".
-- La dificultad vive en la versión, así que aquí se indexa hasta donde se puede
-- y el resto lo filtra el join con question_versions (ver su índice).
create index questions_selection_idx
  on public.questions (skill_id, status, kind)
  where status = 'published';

create index questions_course_idx on public.questions (course_id, status);
create index questions_school_idx on public.questions (school_id);

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function app.set_updated_at();

alter table public.questions enable row level security;


-- -----------------------------------------------------------------------------
-- question_versions — snapshot inmutable
-- -----------------------------------------------------------------------------
create table public.question_versions (
  id            uuid primary key default extensions.gen_random_uuid(),
  question_id   uuid not null references public.questions (id) on delete cascade,
  version       integer not null,
  format        public.question_format not null,
  -- static:    { stem, options[], ... }   (forma RenderedBody de @cet/shared)
  -- generated: { engine_key, param_spec } (apunta a un generador de @cet/engine)
  body          jsonb not null,
  -- LA CLAVE DE CORRECCIÓN. Nunca se envía al cliente: 0013_grants.sql retira
  -- SELECT sobre esta columna a `authenticated` y a `anon` con GRANT por
  -- columna, además de las políticas. Ver DATA_MODEL §9.
  answer_spec   jsonb not null,
  hint          jsonb,             -- I18nText
  solution      jsonb,             -- I18nText — el `sol:` de los generadores Y6A
  difficulty    smallint not null default 3,
  max_points    numeric(6,2) not null default 1,
  grading_mode  public.grading_mode not null default 'auto',
  locale        text not null default 'en',
  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint question_versions_uniq unique (question_id, version),
  constraint question_versions_version_pos check (version >= 1),
  constraint question_versions_difficulty_range check (difficulty between 1 and 5),
  constraint question_versions_points_pos check (max_points > 0),
  constraint question_versions_locale_ok check (locale in ('es', 'en')),
  constraint question_versions_body_object check (app.is_jsonb_object(body)),
  constraint question_versions_answer_object check (app.is_jsonb_object(answer_spec)),
  constraint question_versions_hint_i18n check (app.is_i18n_text_or_null(hint)),
  constraint question_versions_solution_i18n check (app.is_i18n_text_or_null(solution)),
  -- Toda answer_spec es una unión discriminada por `type` (AnswerKey en
  -- @cet/shared). Sin discriminante, el corrector no sabe ni cómo comparar.
  constraint question_versions_answer_has_type
    check (answer_spec ? 'type'
           and answer_spec ->> 'type' in
               ('choice','numeric','fraction','text','ordering','matching','manual')),
  -- Coherencia entre el modo de corrección y la clave: `manual` exige rúbrica y
  -- una clave de tipo `manual` no se puede corregir automáticamente.
  constraint question_versions_manual_coherent
    check ((answer_spec ->> 'type' = 'manual') = (grading_mode = 'manual'))
);

comment on table public.question_versions is
  'Snapshot INMUTABLE. Nunca se hace UPDATE: editar una pregunta crea una versión nueva (DATA_MODEL §4).';
comment on column public.question_versions.answer_spec is
  'Clave de corrección. SELECT retirado a authenticated/anon por GRANT de columna en 0013_grants.sql.';

-- Query caliente #2: "dame la versión N de esta pregunta" y "dame la última".
-- El UNIQUE (question_id, version) sirve ambas (la última con ORDER BY DESC
-- LIMIT 1 sobre el mismo índice). No se añade ningún índice más sobre eso.

-- Query caliente #3: selección de items por dificultad dentro del banco
-- publicado. Parcial sobre las versiones ya publicadas, que son la minoría en un
-- banco vivo lleno de borradores.
create index question_versions_published_difficulty_idx
  on public.question_versions (difficulty, format)
  where published_at is not null;

-- FK circular: questions.current_version_id -> question_versions.id.
-- Se añade ahora que la tabla destino existe. `on delete set null`: si alguien
-- borra la versión publicada (solo posible si ningún intento la usó, ver
-- attempt_items), la pregunta se queda sin versión vigente en vez de arrastrar
-- una referencia colgante.
alter table public.questions
  add constraint questions_current_version_fk
  foreign key (current_version_id)
  references public.question_versions (id) on delete set null;

alter table public.question_versions enable row level security;


-- -----------------------------------------------------------------------------
-- INMUTABILIDAD — el trigger (DATA_MODEL §4)
-- -----------------------------------------------------------------------------
-- "La inmutabilidad se garantiza en la DB, no por convención."
-- Bloquea UPDATE para TODOS los roles, service_role incluido: un bug del backend
-- no debe poder reescribir la historia. Si de verdad hace falta corregir una
-- versión, el procedimiento es crear la versión siguiente.
create trigger question_versions_immutable
  before update on public.question_versions
  for each row execute function app.block_mutation();

-- El DELETE no se bloquea aquí: una versión que nunca se usó en un examen es
-- basura legítimamente borrable. Lo que impide borrar historia real es el
-- `on delete restrict` de attempt_items.question_version_id (0009), que hace
-- fallar el DELETE en cuanto un intento la haya utilizado.
comment on trigger question_versions_immutable on public.question_versions is
  'BEFORE UPDATE -> RAISE EXCEPTION. Editar una pregunta = crear versión nueva.';


-- -----------------------------------------------------------------------------
-- Coherencia de `body` según `kind` (DATA_MODEL §4)
-- -----------------------------------------------------------------------------
-- Para kind='generated', body.engine_key debe apuntar a un generador de
-- @cet/engine con la forma `materia.familia` (regex idéntica a `engineKey` en
-- packages/shared/src/engine-contract.ts). Un engine_key inválido produce un
-- examen con un hueco en blanco a mitad de la prueba.
create or replace function app.validate_question_version_body()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  q_kind public.question_kind;
begin
  select q.kind into q_kind from public.questions q where q.id = new.question_id;

  if q_kind = 'generated' then
    if not (new.body ? 'engine_key'
            and jsonb_typeof(new.body -> 'engine_key') = 'string'
            and (new.body ->> 'engine_key') ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$') then
      raise exception
        'question_versions.body de una pregunta generated requiere engine_key con forma `materia.familia`'
        using errcode = 'check_violation';
    end if;
    if new.body ? 'param_spec' and jsonb_typeof(new.body -> 'param_spec') <> 'object' then
      raise exception 'question_versions.body.param_spec debe ser un objeto'
        using errcode = 'check_violation';
    end if;
  else
    -- static: el enunciado debe existir. Un `stem` vacío es una pregunta que el
    -- alumno ve en blanco y no puede responder.
    if not (new.body ? 'stem'
            and jsonb_typeof(new.body -> 'stem') = 'string'
            and length(btrim(new.body ->> 'stem')) > 0) then
      raise exception 'question_versions.body de una pregunta static requiere un `stem` no vacío'
        using errcode = 'check_violation';
    end if;
    -- Los formatos de opción múltiple necesitan opciones, y con id único: sin id
    -- estable, `option_order` y `answer_key.correctIds` no significan nada.
    if new.format in ('mcq_single', 'mcq_multi', 'true_false') then
      if not (new.body ? 'options'
              and jsonb_typeof(new.body -> 'options') = 'array'
              and jsonb_array_length(new.body -> 'options') >= 2) then
        raise exception 'question_versions.body de formato % requiere al menos 2 `options`', new.format
          using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from jsonb_array_elements(new.body -> 'options') o
        where not (o.value ? 'id' and jsonb_typeof(o.value -> 'id') = 'string')
      ) then
        raise exception 'question_versions.body.options: cada opción necesita un `id` string'
          using errcode = 'check_violation';
      end if;
      if (select count(distinct o.value ->> 'id')
          from jsonb_array_elements(new.body -> 'options') o)
         <> jsonb_array_length(new.body -> 'options') then
        raise exception 'question_versions.body.options: los `id` deben ser únicos dentro de la pregunta'
          using errcode = 'check_violation';
      end if;
      -- mcq_single admite exactamente una correcta; mcq_multi, una o más.
      if new.format in ('mcq_single', 'true_false')
         and jsonb_array_length(coalesce(new.answer_spec -> 'correctIds', '[]'::jsonb)) <> 1 then
        raise exception 'question_versions de formato % requiere answer_spec.correctIds con exactamente 1 elemento',
          new.format
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger question_versions_validate_body
  before insert on public.question_versions
  for each row execute function app.validate_question_version_body();
-- Solo BEFORE INSERT: el UPDATE ya está prohibido por completo.


-- -----------------------------------------------------------------------------
-- current_version_id debe apuntar a una versión DE ESTA pregunta
-- -----------------------------------------------------------------------------
-- Una FK garantiza que la versión existe, no que sea suya. Sin esta comprobación,
-- questions.current_version_id podría apuntar a la versión de OTRA pregunta —
-- incluso de otro colegio — y el examen mostraría el enunciado equivocado.
create or replace function app.validate_current_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if new.current_version_id is null then
    return new;
  end if;

  select qv.question_id into owner_id
  from public.question_versions qv
  where qv.id = new.current_version_id;

  if owner_id is distinct from new.id then
    raise exception
      'questions.current_version_id apunta a una versión de otra pregunta (% != %)',
      owner_id, new.id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger questions_validate_current_version
  before insert or update of current_version_id on public.questions
  for each row execute function app.validate_current_version();


-- -----------------------------------------------------------------------------
-- El curso y la skill de una pregunta tienen que ser suyos o globales
-- -----------------------------------------------------------------------------
-- HALLAZGO DE LA PASADA 2. `questions_insert` solo comprueba
-- `app.can_write_content(school_id)`, es decir, el tenant de la PROPIA fila. Un
-- profesor del colegio A podía insertar una pregunta con `school_id = A` (que
-- pasa la política) pero con `course_id` y `skill_id` apuntando al curso privado
-- del colegio B. No le daba acceso de lectura a nada de B, pero contaminaba su
-- taxonomía: las estadísticas de mastery de una skill de B empezarían a incluir
-- preguntas ajenas, y el banco de B mostraría recuentos que no le corresponden.
--
-- Una FK garantiza que el curso EXISTE, nunca que sea suyo. Esto lo cierra.
create or replace function app.validate_question_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_course_school uuid;
  v_skill_school  uuid;
  v_skill_course  uuid;
begin
  select c.school_id into v_course_school
  from public.courses c where c.id = new.course_id;

  select s.school_id, s.course_id into v_skill_school, v_skill_course
  from public.skills s where s.id = new.skill_id;

  -- El curso debe ser global o del mismo colegio que la pregunta.
  if v_course_school is not null and v_course_school is distinct from new.school_id then
    raise exception
      'questions: el curso pertenece al colegio % y la pregunta al colegio %',
      v_course_school, new.school_id
      using errcode = 'check_violation';
  end if;

  if v_skill_school is not null and v_skill_school is distinct from new.school_id then
    raise exception
      'questions: la skill pertenece al colegio % y la pregunta al colegio %',
      v_skill_school, new.school_id
      using errcode = 'check_violation';
  end if;

  -- Y la skill tiene que ser del mismo curso: una pregunta de Math etiquetada
  -- con una skill de Science hace que el modelo de mastery mienta.
  if v_skill_course is distinct from new.course_id then
    raise exception
      'questions: la skill pertenece al curso % y la pregunta al curso %',
      v_skill_course, new.course_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger questions_validate_tenant
  before insert or update of course_id, skill_id, school_id on public.questions
  for each row execute function app.validate_question_tenant();
