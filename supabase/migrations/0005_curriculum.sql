-- =============================================================================
-- 0005_curriculum.sql — materias, cursos, módulos, lecciones, skills
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §2 · AD-2, AD-7
-- =============================================================================
-- Todas las tablas de este fichero siguen AD-2: `school_id` NULLABLE, donde
-- NULL = biblioteca global autorada por el superadmin.
--
-- El `school_id` se DENORMALIZA hacia abajo (course -> module -> lesson) aunque
-- sea derivable por join. Motivo: una política RLS que necesita subir tres
-- niveles de join para saber de qué colegio es una lección se ejecuta por cada
-- fila candidata de cada query. Un trigger mantiene la coherencia, así que la
-- denormalización no puede desincronizarse.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subjects
-- -----------------------------------------------------------------------------
create table public.subjects (
  id         uuid primary key default extensions.gen_random_uuid(),
  school_id  uuid references public.schools (id) on delete cascade,  -- NULL = global
  code       text not null,        -- math | science | english | spanish | socials | ict
  name       jsonb not null,       -- I18nText
  icon       text,
  color      text,
  ord        smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subjects_code_format check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint subjects_name_i18n   check (app.is_i18n_text(name)),
  constraint subjects_color_hex   check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
);

-- Dos índices únicos parciales en vez de uno sobre (school_id, code): en un
-- UNIQUE normal, NULL nunca colisiona con NULL, así que podrían existir cinco
-- materias globales con code='math'. Esto lo impide de verdad.
create unique index subjects_global_code_uniq
  on public.subjects (code) where school_id is null;
create unique index subjects_school_code_uniq
  on public.subjects (school_id, code) where school_id is not null;

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function app.set_updated_at();

alter table public.subjects enable row level security;


-- -----------------------------------------------------------------------------
-- courses
-- -----------------------------------------------------------------------------
create table public.courses (
  id         uuid primary key default extensions.gen_random_uuid(),
  school_id  uuid references public.schools (id) on delete cascade,  -- NULL = global
  -- restrict: no se borra una materia que tiene cursos colgando.
  subject_id uuid not null references public.subjects (id) on delete restrict,
  name       jsonb not null,       -- I18nText
  year_level smallint not null,
  locale     text not null default 'en',
  status     public.content_status not null default 'draft',
  version    integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint courses_name_i18n   check (app.is_i18n_text(name)),
  constraint courses_year_range  check (year_level between 1 and 13),
  constraint courses_locale_ok   check (locale in ('es', 'en')),
  constraint courses_version_pos check (version >= 1)
);

-- Query caliente: "los cursos publicados de Math para Y6 que puedo ver".
-- El orden de columnas sigue la selectividad real de esa query.
create index courses_lookup_idx
  on public.courses (subject_id, year_level, status);

-- Query caliente: el filtro AD-2 `school_id is null or school_id = X` aparece en
-- casi toda lectura de contenido.
create index courses_school_idx on public.courses (school_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function app.set_updated_at();

alter table public.courses enable row level security;


-- -----------------------------------------------------------------------------
-- school_courses — activación (no visibilidad) de un curso en un colegio
-- -----------------------------------------------------------------------------
-- DATA_MODEL §2: un curso global es VISIBLE para todos, pero solo APARECE al
-- alumno si su colegio lo activó aquí. Separar visibilidad de activación evita
-- que un colegio nuevo vea 200 cursos irrelevantes el primer día.
create table public.school_courses (
  school_id    uuid not null references public.schools (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  is_active    boolean not null default true,
  activated_at timestamptz not null default now(),
  activated_by uuid references public.profiles (id) on delete set null,

  primary key (school_id, course_id)
);

-- Query caliente e inversa a la PK: "¿qué colegios usan este curso global?"
-- (el superadmin necesita saberlo antes de retirar un curso).
create index school_courses_course_idx on public.school_courses (course_id);

alter table public.school_courses enable row level security;


-- -----------------------------------------------------------------------------
-- course_modules
-- -----------------------------------------------------------------------------
create table public.course_modules (
  id          uuid primary key default extensions.gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  -- Denormalizado desde courses por el trigger de más abajo.
  school_id   uuid references public.schools (id) on delete cascade,
  ord         integer not null,
  title       jsonb not null,      -- I18nText
  description jsonb,               -- I18nText
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint course_modules_ord_uniq unique (course_id, ord),
  constraint course_modules_ord_pos  check (ord >= 1),
  constraint course_modules_title_i18n check (app.is_i18n_text(title)),
  constraint course_modules_desc_i18n  check (app.is_i18n_text_or_null(description))
);

create trigger course_modules_set_updated_at
  before update on public.course_modules
  for each row execute function app.set_updated_at();

alter table public.course_modules enable row level security;


-- -----------------------------------------------------------------------------
-- lessons
-- -----------------------------------------------------------------------------
create table public.lessons (
  id                uuid primary key default extensions.gen_random_uuid(),
  module_id         uuid not null references public.course_modules (id) on delete cascade,
  -- Denormalizado dos niveles hacia abajo. Sin esto, la política RLS de lessons
  -- haría lessons -> course_modules -> courses en cada fila.
  school_id         uuid references public.schools (id) on delete cascade,
  ord               integer not null,
  title             jsonb not null,   -- I18nText
  estimated_minutes smallint,
  status            public.content_status not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint lessons_ord_uniq  unique (module_id, ord),
  constraint lessons_ord_pos   check (ord >= 1),
  constraint lessons_title_i18n check (app.is_i18n_text(title)),
  constraint lessons_minutes_sane
    check (estimated_minutes is null or estimated_minutes between 1 and 600)
);

-- Query caliente: "las lecciones publicadas de este módulo, en orden".
create index lessons_module_ord_idx on public.lessons (module_id, ord)
  where status = 'published';

create index lessons_school_idx on public.lessons (school_id);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function app.set_updated_at();

alter table public.lessons enable row level security;


-- -----------------------------------------------------------------------------
-- skills — la taxonomía de mastery (DATA_MODEL §2)
-- -----------------------------------------------------------------------------
-- El eje de todo el aprendizaje adaptativo: cada pregunta apunta a una skill y
-- cada skill acumula mastery por alumno.
create table public.skills (
  id              uuid primary key default extensions.gen_random_uuid(),
  school_id       uuid references public.schools (id) on delete cascade, -- NULL = global
  course_id       uuid not null references public.courses (id) on delete cascade,
  -- Jerarquía: math.fractions -> math.fractions.simplify.
  -- set null y no cascade: perder una skill padre no debe borrar el historial de
  -- mastery de sus hijas; se quedan huérfanas y visibles, que es lo depurable.
  parent_skill_id uuid references public.skills (id) on delete set null,
  code            text not null,   -- 'math.fractions.simplify'
  name            jsonb not null,  -- I18nText
  description     jsonb,           -- I18nText
  ord             smallint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint skills_code_uniq unique (course_id, code),
  -- Código con puntos, en minúsculas: es una clave que también viaja al motor
  -- (`GeneratedItem.skillCode` en @cet/shared).
  constraint skills_code_format
    check (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  constraint skills_name_i18n check (app.is_i18n_text(name)),
  constraint skills_desc_i18n check (app.is_i18n_text_or_null(description)),
  -- Una skill no puede ser su propia madre. (No detecta ciclos de longitud > 1;
  -- eso lo cubre el trigger de más abajo.)
  constraint skills_no_self_parent check (parent_skill_id is null or parent_skill_id <> id)
);

-- Query caliente: recorrer el árbol de skills de un curso para el dashboard de
-- mastery.
create index skills_course_parent_idx on public.skills (course_id, parent_skill_id, ord);
create index skills_school_idx on public.skills (school_id);

create trigger skills_set_updated_at
  before update on public.skills
  for each row execute function app.set_updated_at();

alter table public.skills enable row level security;


-- Un ciclo en la jerarquía (A madre de B, B madre de A) hace que cualquier
-- recorrido recursivo del dashboard de mastery cuelgue el servidor. La DB lo
-- impide, no el frontend.
create or replace function app.skills_reject_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ancestor uuid := new.parent_skill_id;
  hops     integer := 0;
begin
  while ancestor is not null loop
    if ancestor = new.id then
      raise exception 'Ciclo en la jerarquía de skills: % ya es descendiente de %',
        new.parent_skill_id, new.id
        using errcode = 'check_violation';
    end if;
    hops := hops + 1;
    if hops > 32 then
      raise exception 'Jerarquía de skills demasiado profunda (>32) o con ciclo preexistente'
        using errcode = 'check_violation';
    end if;
    select s.parent_skill_id into ancestor from public.skills s where s.id = ancestor;
  end loop;
  return new;
end;
$$;

create trigger skills_reject_cycle
  before insert or update of parent_skill_id on public.skills
  for each row when (new.parent_skill_id is not null)
  execute function app.skills_reject_cycle();


-- -----------------------------------------------------------------------------
-- lesson_skills — qué enseña cada lección
-- -----------------------------------------------------------------------------
create table public.lesson_skills (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  skill_id  uuid not null references public.skills (id) on delete cascade,
  weight    numeric(4,3) not null default 1.000,

  primary key (lesson_id, skill_id),
  constraint lesson_skills_weight_range check (weight > 0 and weight <= 1)
);

-- Query caliente inversa: "¿qué lecciones repasar para esta skill floja?" — el
-- núcleo de la recomendación adaptativa (Hito 5).
create index lesson_skills_skill_idx on public.lesson_skills (skill_id);

alter table public.lesson_skills enable row level security;


-- -----------------------------------------------------------------------------
-- Coherencia de la denormalización de school_id
-- -----------------------------------------------------------------------------
-- Denormalizar es rápido y es un riesgo: si module.school_id y course.school_id
-- divergen, la RLS enseña contenido del colegio equivocado. No se confía en que
-- la aplicación lo mantenga — lo mantiene la base de datos.
create or replace function app.sync_module_school_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select c.school_id into new.school_id
  from public.courses c where c.id = new.course_id;
  return new;
end;
$$;

create trigger course_modules_sync_school
  before insert or update of course_id on public.course_modules
  for each row execute function app.sync_module_school_id();

create or replace function app.sync_lesson_school_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select m.school_id into new.school_id
  from public.course_modules m where m.id = new.module_id;
  return new;
end;
$$;

create trigger lessons_sync_school
  before insert or update of module_id on public.lessons
  for each row execute function app.sync_lesson_school_id();

-- Y si alguien mueve un CURSO de colegio (o de global a propio), la cascada
-- hacia abajo tiene que ocurrir en la misma transacción.
create or replace function app.cascade_course_school_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id then
    update public.course_modules m
       set school_id = new.school_id
     where m.course_id = new.id
       and m.school_id is distinct from new.school_id;

    update public.lessons l
       set school_id = new.school_id
      from public.course_modules m
     where l.module_id = m.id
       and m.course_id = new.id
       and l.school_id is distinct from new.school_id;
  end if;
  return new;
end;
$$;

create trigger courses_cascade_school
  after update of school_id on public.courses
  for each row execute function app.cascade_course_school_id();
