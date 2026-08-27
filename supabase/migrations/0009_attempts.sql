-- =============================================================================
-- 0009_attempts.sql — el núcleo forense
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §6, §9, §10 · principio rector del MASTER_PLAN
-- =============================================================================
-- "Para cualquier examen terminado, el sistema debe poder reconstruir EXACTAMENTE
--  qué vio el estudiante, en qué orden, qué versión de cada pregunta, qué
--  respondió, cuándo, cuántas veces cambió de opinión y cómo se calificó — sin
--  depender de la honestidad del cliente."
--
-- Cómo lo cumple cada tabla:
--   exam_attempts     -> blueprint_snapshot + seed + reloj del SERVIDOR
--   attempt_items     -> rendered_body + option_order + question_version_id
--   attempt_responses -> una fila POR REVISIÓN, nunca un UPDATE
--   attempt_gradings  -> la nota, con su rúbrica congelada y su cadena de recalificación
-- =============================================================================

-- -----------------------------------------------------------------------------
-- exam_attempts
-- -----------------------------------------------------------------------------
create table public.exam_attempts (
  id                  uuid primary key default extensions.gen_random_uuid(),
  -- restrict: una asignación con intentos es historia académica. No se borra.
  assignment_id       uuid not null references public.exam_assignments (id) on delete restrict,
  student_id          uuid not null references public.students (profile_id) on delete cascade,
  -- Denormalizado para que la RLS no necesite joins (DATA_MODEL §6).
  school_id           uuid not null references public.schools (id) on delete cascade,
  attempt_number      smallint not null default 1,
  -- COPIA del blueprint tal cual estaba. Si mañana lo editan, este intento sigue
  -- siendo interpretable sin arqueología.
  blueprint_snapshot  jsonb not null,
  -- Semilla raíz. Toda la aleatoriedad del intento deriva de aquí
  -- (deriveItemSeed en @cet/engine). Un bigint reconstruye el examen entero.
  seed                bigint not null,
  status              public.attempt_status not null default 'in_progress',
  -- Reloj del SERVIDOR. El del cliente nunca puntúa (DATA_MODEL §0).
  started_at          timestamptz not null default now(),
  -- La ÚNICA fuente de verdad del tiempo. Si el alumno adelanta el reloj de su
  -- portátil, no gana ni un segundo.
  server_deadline_at  timestamptz not null,
  submitted_at        timestamptz,
  graded_at           timestamptz,
  submitted_by        public.submitted_by,
  score_raw           numeric(8,2),
  score_max           numeric(8,2),
  score_pct           numeric(5,2),
  passed              boolean,
  user_agent          text,
  -- sha256(ip + salt). Nunca la IP en claro (DATA_MODEL §6, minimización).
  ip_hash             text,
  last_heartbeat_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint exam_attempts_uniq unique (assignment_id, student_id, attempt_number),
  constraint exam_attempts_number_pos check (attempt_number >= 1),
  constraint exam_attempts_snapshot_object check (app.is_jsonb_object(blueprint_snapshot)),
  -- Semilla en el rango seguro de JS (2^53-1): @cet/shared la tipa como
  -- z.number().int().max(Number.MAX_SAFE_INTEGER). Un bigint mayor llegaría al
  -- cliente redondeado y el examen dejaría de ser reproducible.
  constraint exam_attempts_seed_js_safe check (seed >= 0 and seed <= 9007199254740991),
  -- Un intento con deadline anterior al inicio nace ya caducado.
  constraint exam_attempts_deadline_after_start check (server_deadline_at > started_at),

  -- --- La máquina de estados, expresada como constraints ---------------------
  -- Un intento en curso no puede tener hora de entrega.
  constraint exam_attempts_in_progress_not_submitted
    check (status <> 'in_progress' or (submitted_at is null and graded_at is null)),
  -- Y todo intento entregado/calificándose/calificado la tiene, junto con el
  -- responsable del cierre.
  constraint exam_attempts_submitted_has_timestamp
    check (status not in ('submitted', 'grading', 'graded')
           or (submitted_at is not null and submitted_by is not null)),
  -- Un intento "graded" sin nota es un estado que rompe cualquier informe.
  constraint exam_attempts_graded_has_score
    check (status <> 'graded'
           or (graded_at is not null
               and score_raw is not null
               and score_max is not null
               and score_pct is not null
               and passed is not null)),
  constraint exam_attempts_scores_sane
    check ((score_raw is null or score_raw >= 0)
           and (score_max is null or score_max > 0)
           and (score_raw is null or score_max is null or score_raw <= score_max)
           and (score_pct is null or (score_pct >= 0 and score_pct <= 100))),
  constraint exam_attempts_graded_after_submitted
    check (graded_at is null or submitted_at is null or graded_at >= submitted_at),
  constraint exam_attempts_ip_hash_sha256
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
);

comment on column public.exam_attempts.server_deadline_at is
  'La única fuente de verdad del tiempo. El reloj del cliente no cuenta para nada que puntúe.';
comment on column public.exam_attempts.seed is
  'Semilla raíz. Con ella y el blueprint_snapshot se regenera el examen completo, item a item.';

-- Query caliente #1: "mis intentos" en la pantalla del alumno.
create index exam_attempts_student_idx
  on public.exam_attempts (student_id, started_at desc);

-- Query caliente #2: el panel del profesor — "cómo va esta asignación".
create index exam_attempts_assignment_status_idx
  on public.exam_attempts (assignment_id, status);

-- Query caliente #3: el job que cierra por timeout los intentos abandonados.
-- Parcial: solo hay unas decenas de filas 'in_progress' en cualquier instante,
-- frente a millones de intentos históricos. Un índice completo sobre
-- (status, server_deadline_at) sería 10.000× más grande para la misma respuesta.
create index exam_attempts_open_deadline_idx
  on public.exam_attempts (server_deadline_at)
  where status = 'in_progress';

create index exam_attempts_school_idx on public.exam_attempts (school_id, started_at desc);

create trigger exam_attempts_set_updated_at
  before update on public.exam_attempts
  for each row execute function app.set_updated_at();

alter table public.exam_attempts enable row level security;


-- -----------------------------------------------------------------------------
-- attempt_items — qué vio EXACTAMENTE el alumno
-- -----------------------------------------------------------------------------
-- Se escribe ENTERA al arrancar el intento (materialización, AD-5). A partir de
-- ahí el examen ya no depende ni del banco de preguntas ni del generador: aunque
-- se retire la pregunta a mitad del examen, el alumno sigue viendo lo mismo.
create table public.attempt_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  attempt_id          uuid not null references public.exam_attempts (id) on delete cascade,
  -- El orden REAL en que se le presentó, ya barajado.
  ord                 integer not null,
  section_ord         integer,
  question_id         uuid not null references public.questions (id) on delete restrict,
  -- QUÉ VERSIÓN EXACTA. `on delete restrict` deliberado (DATA_MODEL §6): nunca
  -- se puede borrar una versión que algún intento usó. La integridad histórica
  -- gana sobre la comodidad de limpiar el banco.
  question_version_id uuid not null references public.question_versions (id) on delete restrict,
  -- Derivada de attempt.seed + ord (deriveItemSeed).
  item_seed           bigint not null,
  -- EL ENUNCIADO LITERAL que se mostró, ya resuelto el generador.
  rendered_body       jsonb not null,
  -- La permutación aplicada a las opciones. Sin esto, "eligió la B" no
  -- significa nada seis meses después.
  option_order        integer[],
  -- Clave congelada. SELECT retirado a authenticated/anon por GRANT de columna
  -- en 0013_grants.sql, y además hay una vista sin ella (más abajo).
  answer_key          jsonb not null,
  skill_id            uuid references public.skills (id) on delete set null,
  difficulty          smallint,
  max_points          numeric(6,2) not null default 1,
  created_at          timestamptz not null default now(),

  constraint attempt_items_ord_uniq unique (attempt_id, ord),
  constraint attempt_items_ord_pos check (ord >= 1),
  constraint attempt_items_seed_js_safe
    check (item_seed >= 0 and item_seed <= 9007199254740991),
  constraint attempt_items_points_pos check (max_points > 0),
  constraint attempt_items_difficulty_range
    check (difficulty is null or difficulty between 1 and 5),
  constraint attempt_items_rendered_object check (app.is_jsonb_object(rendered_body)),
  constraint attempt_items_answer_object check (app.is_jsonb_object(answer_key)),
  -- El enunciado no puede estar vacío: sería un item que el alumno ve en blanco
  -- y por el que aun así se le puntúa.
  constraint attempt_items_rendered_has_stem
    check (rendered_body ? 'stem'
           and jsonb_typeof(rendered_body -> 'stem') = 'string'
           and length(btrim(rendered_body ->> 'stem')) > 0),
  constraint attempt_items_answer_has_type
    check (answer_key ? 'type'),
  -- Una permutación con repetidos, huecos o índices negativos no es una
  -- permutación: reconstruir el orden en que vio las opciones sería imposible.
  -- (Va por función porque un CHECK no admite subconsultas, y comprobar
  --  "sin repetidos" sin subconsulta no se puede escribir inline.)
  constraint attempt_items_option_order_valid
    check (app.is_permutation(option_order))
);

comment on table public.attempt_items is
  'La tabla que hace posible la reconstrucción forense. Se escribe entera al arrancar el intento.';
comment on column public.attempt_items.answer_key is
  'Clave congelada. SELECT retirado a authenticated/anon (0013). El cliente consulta attempt_items_student.';

-- La query de reconstrucción (§10) recorre los items de un intento en orden:
-- el UNIQUE (attempt_id, ord) la sirve entera. No hace falta otro índice.

-- Query caliente de analítica: "rendimiento por skill en este colegio".
create index attempt_items_skill_idx on public.attempt_items (skill_id)
  where skill_id is not null;

-- Query caliente del autor de contenido: "¿esta versión se ha usado en algún
-- examen?" — es lo que hay que comprobar antes de intentar borrarla.
create index attempt_items_version_idx on public.attempt_items (question_version_id);

alter table public.attempt_items enable row level security;


-- -----------------------------------------------------------------------------
-- attempt_responses — TODAS las revisiones
-- -----------------------------------------------------------------------------
-- No se sobrescribe nunca. Cada cambio de respuesta es una fila nueva. Así se
-- responde "¿cuántas veces cambió de opinión?" y "¿en qué momento exacto?".
create table public.attempt_responses (
  id              uuid primary key default extensions.gen_random_uuid(),
  -- Denormalizado desde attempt_item: la RLS del alumno y el borrado en cascada
  -- por intento no deben requerir un join.
  attempt_id      uuid not null references public.exam_attempts (id) on delete cascade,
  attempt_item_id uuid not null references public.attempt_items (id) on delete cascade,
  revision        integer not null,
  response        jsonb,
  is_final        boolean not null default false,
  -- Lo que dijo el cliente. Se guarda APARTE del server_ts y no puntúa jamás.
  client_ts       timestamptz,
  -- La verdad.
  server_ts       timestamptz not null default now(),
  time_on_item_ms integer,
  source          public.response_source not null default 'typed',

  constraint attempt_responses_revision_uniq unique (attempt_item_id, revision),
  constraint attempt_responses_revision_nonneg check (revision >= 0),
  constraint attempt_responses_time_sane
    check (time_on_item_ms is null or (time_on_item_ms >= 0 and time_on_item_ms <= 86400000)),
  -- Igual que en answer_key: toda respuesta es una unión discriminada por `type`
  -- (StudentResponse en @cet/shared). NULL = "aún no respondió", que sí es válido.
  constraint attempt_responses_shape
    check (response is null
           or (jsonb_typeof(response) = 'object' and response ? 'type'))
);

-- DATA_MODEL §6: "índice parcial where is_final para la corrección".
-- La corrección recorre exactamente una respuesta por item; sin el parcial,
-- recorrería las 8 revisiones que un alumno indeciso deja por pregunta.
create unique index attempt_responses_final_uniq
  on public.attempt_responses (attempt_item_id)
  where is_final;
-- Y además es UNIQUE: dos respuestas marcadas como finales para el mismo item
-- harían que la nota dependiera del plan de ejecución. Aquí eso es imposible.

-- Query caliente: reconstruir un intento entero (la query de §10) y el autosave,
-- que necesita "la última revisión de este intento".
create index attempt_responses_attempt_idx
  on public.attempt_responses (attempt_id, server_ts desc);

comment on index public.attempt_responses_final_uniq is
  'Parcial + UNIQUE: una y solo una respuesta final por item. La nota no puede depender del plan.';

alter table public.attempt_responses enable row level security;

-- Append-only con una excepción tasada: marcar `is_final` al entregar.
-- Cualquier otro UPDATE reescribiría lo que el alumno hizo, que es justo lo que
-- el principio rector prohíbe.
create or replace function app.attempt_responses_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.attempt_id is distinct from old.attempt_id
     or new.attempt_item_id is distinct from old.attempt_item_id
     or new.revision is distinct from old.revision
     or new.response is distinct from old.response
     or new.client_ts is distinct from old.client_ts
     or new.server_ts is distinct from old.server_ts
     or new.time_on_item_ms is distinct from old.time_on_item_ms
     or new.source is distinct from old.source then
    raise exception
      'attempt_responses es append-only: solo `is_final` puede cambiar tras el insert (DATA_MODEL §6)'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger attempt_responses_guard_update
  before update on public.attempt_responses
  for each row execute function app.attempt_responses_guard_update();

-- El DELETE también se bloquea: borrar una revisión es borrar la prueba de que
-- el alumno cambió de opinión. El borrado legítimo llega por CASCADE desde
-- exam_attempts, y una cascada NO dispara este trigger de fila... así que se
-- comprueba explícitamente si el intento sigue existiendo.
create or replace function app.attempt_responses_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.exam_attempts a where a.id = old.attempt_id) then
    raise exception
      'attempt_responses no admite DELETE: el historial de revisiones es la prueba forense'
      using errcode = 'restrict_violation';
  end if;
  -- El intento ya no existe: esto es la cascada legítima. Se deja pasar.
  return old;
end;
$$;

create trigger attempt_responses_guard_delete
  before delete on public.attempt_responses
  for each row execute function app.attempt_responses_guard_delete();


-- -----------------------------------------------------------------------------
-- attempt_gradings
-- -----------------------------------------------------------------------------
create table public.attempt_gradings (
  id              uuid primary key default extensions.gen_random_uuid(),
  attempt_id      uuid not null references public.exam_attempts (id) on delete cascade,
  attempt_item_id uuid not null references public.attempt_items (id) on delete cascade,
  points_awarded  numeric(6,2) not null,
  max_points      numeric(6,2) not null,
  is_correct      boolean,
  partial_ratio   numeric(4,3),
  graded_by       public.grading_actor not null default 'auto',
  grader_id       uuid references public.profiles (id) on delete set null,
  rationale       text,
  -- La rúbrica CONGELADA con la que se calificó. Si el profesor la cambia
  -- después, esta nota sigue siendo explicable.
  rubric_snapshot jsonb,
  graded_at       timestamptz not null default now(),
  -- Recalificación encadenada: la fila nueva apunta a la que sustituye. La
  -- anterior no se borra ni se edita — se conserva la cadena completa.
  supersedes_id   uuid references public.attempt_gradings (id) on delete restrict,

  constraint attempt_gradings_points_range
    check (points_awarded >= 0 and points_awarded <= max_points),
  constraint attempt_gradings_max_points_pos check (max_points > 0),
  constraint attempt_gradings_ratio_range
    check (partial_ratio is null or (partial_ratio >= 0 and partial_ratio <= 1)),
  -- Una corrección manual sin corrector es una nota que nadie firma; una
  -- automática con corrector es una manual disfrazada. Ninguna de las dos vale.
  constraint attempt_gradings_grader_coherent
    check ((graded_by = 'manual') = (grader_id is not null)),
  constraint attempt_gradings_no_self_supersede
    check (supersedes_id is null or supersedes_id <> id),
  constraint attempt_gradings_rubric_object
    check (rubric_snapshot is null or app.is_jsonb_object(rubric_snapshot))
);

-- Solo UNA calificación vigente por item: la que no ha sido sustituida por otra.
-- Sin esto, "la nota de la pregunta 7" sería ambigua tras dos recalificaciones.
create unique index attempt_gradings_current_uniq
  on public.attempt_gradings (attempt_item_id)
  where supersedes_id is null;

-- Query caliente: sumar la nota del intento (§10 y el recálculo de score_raw).
create index attempt_gradings_attempt_idx on public.attempt_gradings (attempt_id);

-- Query caliente de auditoría: "todas las recalificaciones manuales de este
-- profesor" (control de fraude en la corrección).
create index attempt_gradings_manual_idx
  on public.attempt_gradings (grader_id, graded_at desc)
  where graded_by = 'manual';

alter table public.attempt_gradings enable row level security;

-- La calificación referencia un item; el item pertenece a un intento. Que ambos
-- coincidan no lo garantiza ninguna FK. Sin esta comprobación se podría colgar
-- la nota de un alumno del item de otro.
create or replace function app.validate_grading_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_attempt uuid;
begin
  select ai.attempt_id into item_attempt
  from public.attempt_items ai where ai.id = new.attempt_item_id;

  if item_attempt is distinct from new.attempt_id then
    raise exception
      'attempt_gradings: el item pertenece al intento % pero la calificación dice %',
      item_attempt, new.attempt_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attempt_gradings_validate_item
  before insert or update of attempt_item_id, attempt_id on public.attempt_gradings
  for each row execute function app.validate_grading_item();

-- La misma comprobación para attempt_responses.
create or replace function app.validate_response_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_attempt uuid;
begin
  select ai.attempt_id into item_attempt
  from public.attempt_items ai where ai.id = new.attempt_item_id;

  if item_attempt is distinct from new.attempt_id then
    raise exception
      'attempt_responses: el item pertenece al intento % pero la respuesta dice %',
      item_attempt, new.attempt_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attempt_responses_validate_item
  before insert on public.attempt_responses
  for each row execute function app.validate_response_item();


-- -----------------------------------------------------------------------------
-- El intento debe ser del mismo colegio que el alumno
-- -----------------------------------------------------------------------------
-- exam_attempts.school_id está denormalizado y es lo que compara TODA la RLS de
-- intentos. Si divergiera del colegio del alumno, un intento quedaría visible
-- para el colegio equivocado. La DB no deja que diverja.
create or replace function app.sync_attempt_school_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st_school uuid;
begin
  select s.school_id into st_school
  from public.students s where s.profile_id = new.student_id;

  if st_school is null then
    raise exception 'exam_attempts: el alumno % no existe', new.student_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Se impone, no se comprueba: así ni un backend con un bug puede escribir un
  -- school_id ajeno.
  new.school_id := st_school;
  return new;
end;
$$;

create trigger exam_attempts_sync_school
  before insert or update of student_id, school_id on public.exam_attempts
  for each row execute function app.sync_attempt_school_id();


-- -----------------------------------------------------------------------------
-- La identidad de un intento no se reescribe
-- -----------------------------------------------------------------------------
-- HALLAZGO DE LA PASADA 2. `exam_attempts_update_staff` deja al profesor tocar
-- los intentos de su colegio — legítimo: anular uno, cerrarlo a mano, ampliar el
-- tiempo a un alumno con adaptación curricular. Pero como una política decide
-- QUÉ FILAS y no QUÉ COLUMNAS, ese mismo UPDATE le permitía reasignar el intento
-- a OTRO alumno de su colegio, o cambiar la semilla y el blueprint_snapshot —
-- que es exactamente destruir la reconstrucción forense y hacerlo pasar por una
-- corrección administrativa.
--
-- Se congela la identidad del intento. Lo que sigue siendo modificable es lo
-- administrativo: status, submitted_*, graded_*, las notas y el deadline.
create or replace function app.exam_attempts_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;   -- el motor de examen (service_role) sí materializa y corrige
  end if;

  if new.id             is distinct from old.id
     or new.assignment_id  is distinct from old.assignment_id
     or new.student_id     is distinct from old.student_id
     or new.school_id      is distinct from old.school_id
     or new.attempt_number is distinct from old.attempt_number
     or new.seed           is distinct from old.seed
     or new.blueprint_snapshot is distinct from old.blueprint_snapshot
     or new.started_at     is distinct from old.started_at then
    raise exception
      'La identidad de un intento es inmutable: alumno, asignación, semilla, '
      'blueprint_snapshot e inicio no se pueden reescribir desde el cliente'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger exam_attempts_guard_update
  before update on public.exam_attempts
  for each row execute function app.exam_attempts_guard_update();


-- =============================================================================
-- LA CLAVE DE RESPUESTA — defensa en profundidad (DATA_MODEL §9)
-- =============================================================================
-- Capa 1: GRANT por columna (0013_grants.sql) — `authenticated` no tiene SELECT
--         sobre attempt_items.answer_key ni sobre question_versions.answer_spec.
-- Capa 2: esta vista, que es lo ÚNICO que el cliente consulta.
--
-- `security_invoker = true` es OBLIGATORIO y es el detalle que casi siempre se
-- olvida: sin él, la vista se ejecuta con los privilegios de SU PROPIETARIO, que
-- salta la RLS de attempt_items — y un alumno vería los items de todos los
-- exámenes del sistema a través de la vista. Con invoker, se aplican las
-- políticas del alumno que consulta.
--
-- `security_barrier = true` impide que el planificador empuje una función del
-- usuario (p. ej. una que filtre por `answer_key`) por debajo de los filtros de
-- la vista para inferir el contenido de las columnas ocultas.
create view public.attempt_items_student
with (security_invoker = true, security_barrier = true)
as
select
  ai.id,
  ai.attempt_id,
  ai.ord,
  ai.section_ord,
  ai.question_id,
  ai.question_version_id,
  ai.rendered_body,
  ai.option_order,
  ai.skill_id,
  ai.difficulty,
  ai.max_points,
  ai.created_at
  -- DELIBERADAMENTE AUSENTES: answer_key, item_seed.
  -- `item_seed` tampoco sale: con la semilla y el generador de @cet/engine
  -- (que es código de cliente, público) el alumno regeneraría el item COMPLETO
  -- incluyendo su respuesta correcta. Ocultar answer_key y publicar la semilla
  -- sería teatro de seguridad.
from public.attempt_items ai;

comment on view public.attempt_items_student is
  'Vista sin answer_key ni item_seed. security_invoker=true: aplica la RLS del alumno, no la del owner.';
