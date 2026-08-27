-- =============================================================================
-- 0003_tenancy.sql — colegios, perfiles, alumnos, clases
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §1 · AD-1, AD-3, AD-4
-- =============================================================================
-- Este fichero crea TABLAS y CONSTRAINTS, habilita RLS y NO crea ninguna
-- política. Es deliberado:
--
--   RLS habilitada + cero políticas = tabla inaccesible para `authenticated`.
--
-- Es decir, el estado intermedio entre esta migración y 0012_rls_policies.sql es
-- FAIL-CLOSED. Si una migración de políticas se olvidara o fallara a medias, el
-- resultado sería "nadie ve nada", no "todos ven todo". Ese es el único orden
-- aceptable para un sistema con datos de menores.
--
-- Todas las políticas viven juntas en 0012 para que la superficie de seguridad
-- completa se pueda auditar leyendo UN fichero.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- schools — la raíz del tenant (AD-1)
-- -----------------------------------------------------------------------------
create table public.schools (
  id                    uuid primary key default extensions.gen_random_uuid(),
  name                  text not null,
  -- El slug va en la URL de login (/login/<slug>): citext para que
  -- "St-Andrews" y "st-andrews" no puedan coexistir como colegios distintos.
  slug                  extensions.citext not null unique,
  country               text,                       -- ISO-3166 alpha-2
  -- Las ventanas de examen (opens_at/closes_at) se muestran en esta zona.
  -- Los timestamps siempre se ALMACENAN en UTC (timestamptz); esto es
  -- exclusivamente para presentación y para el corte de "día lectivo".
  timezone              text not null default 'UTC',
  default_locale        text not null default 'en',
  pin_length_primary    smallint not null default 4,   -- AD-4
  pin_length_secondary  smallint not null default 6,   -- AD-4
  settings              jsonb not null default '{}'::jsonb,
  status                public.school_status not null default 'active',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint schools_name_not_blank
    check (length(btrim(name)) > 0),
  -- Sin este check, un slug con '/' o mayúsculas rompería el enrutado del login.
  constraint schools_slug_format
    check (slug::text ~ '^[a-z0-9]([a-z0-9-]{1,60}[a-z0-9])$'),
  constraint schools_country_iso
    check (country is null or country ~ '^[A-Z]{2}$'),
  -- PIN de 4 a 8 dígitos: menos de 4 es trivialmente forzable incluso con
  -- lockout; más de 8 es inusable para un niño de primaria.
  constraint schools_pin_primary_range
    check (pin_length_primary between 4 and 8),
  constraint schools_pin_secondary_range
    check (pin_length_secondary between 4 and 8),
  constraint schools_locale_supported
    check (default_locale in ('es', 'en')),
  constraint schools_settings_is_object
    check (app.is_jsonb_object(settings))
);

comment on table public.schools is
  'Tenant raíz (AD-1). Toda tabla de negocio referencia un school_id directa o indirectamente.';
comment on column public.schools.timezone is
  'Solo presentación y corte de día lectivo. El almacenamiento es siempre UTC.';

create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function app.set_updated_at();

alter table public.schools enable row level security;
-- NOTA DELIBERADA — por qué NO se usa `force row level security` en NINGUNA tabla:
-- FORCE sujeta también al PROPIETARIO de la tabla (postgres) a las políticas.
-- Nuestros helpers de RLS son `security definer` propiedad de postgres y LEEN
-- public.profiles. Con FORCE, app.current_school_id() quedaría sujeta a las
-- políticas de profiles, que a su vez llaman a app.current_school_id():
-- recursión infinita — o peor, un helper que devuelve NULL en silencio y
-- convierte cada política en "no ves nada" (y cualquiera escrita con NOT, en
-- "lo ves todo").
-- El aislamiento real lo dan tres capas: RLS habilitada, GRANTs mínimos por
-- columna (0013) y políticas siempre con `to authenticated`. `postgres` y
-- `service_role` son roles de administración que ya pueden todo por definición;
-- FORCE no protegería de ellos, solo rompería los helpers. Ver supabase/REVIEW.md.


-- -----------------------------------------------------------------------------
-- profiles — espejo 1:1 de auth.users. `id` = `auth.users.id` (AD-3)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key
                 references auth.users (id) on delete cascade,
  -- on delete restrict: borrar un colegio con perfiles vivos debe fallar en
  -- ruidoso, no llevarse por delante a sus alumnos en cascada silenciosa.
  school_id    uuid references public.schools (id) on delete restrict,
  role         public.user_role not null,
  full_name    text not null,
  -- NULL en alumnos con identidad sintética (AD-3): no se pide email a un menor.
  email        extensions.citext,
  locale       text not null default 'en',
  status       public.profile_status not null default 'pending',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- LA constraint que hace imposible el estado inválido (DATA_MODEL §1):
  -- superadmin  <=> school_id IS NULL.
  -- Impide a la vez el superadmin "de un colegio" (que rompería el aislamiento
  -- de tenants) y el profesor huérfano (cuyas políticas RLS comparan contra NULL
  -- y por tanto no casan con nada, dejando un usuario roto e indepurable).
  constraint profiles_superadmin_has_no_school
    check ((role = 'superadmin') = (school_id is null)),
  constraint profiles_full_name_not_blank
    check (length(btrim(full_name)) > 0),
  constraint profiles_locale_supported
    check (locale in ('es', 'en')),
  -- Todo el staff se autentica con email+password (AD-3): sin email no hay login.
  constraint profiles_staff_needs_email
    check (role = 'student' or email is not null),
  constraint profiles_email_shape
    check (email is null or email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.profiles is
  'Espejo de auth.users. auth.uid() = profiles.id es el eje de TODAS las políticas RLS (AD-3).';
comment on constraint profiles_superadmin_has_no_school on public.profiles is
  'superadmin <=> school_id IS NULL. Hace imposible tanto el superadmin con tenant como el staff huérfano.';

-- Email único por colegio, no globalmente: la misma persona puede ser tutora en
-- un colegio y profesora en otro. Índice parcial porque los alumnos no tienen email.
create unique index profiles_school_email_uniq
  on public.profiles (school_id, email)
  where email is not null and school_id is not null;

-- Índice del superadmin (school_id IS NULL) — el parcial de arriba lo excluye.
create unique index profiles_superadmin_email_uniq
  on public.profiles (email)
  where school_id is null and email is not null;

-- Query caliente: el panel del colegio lista "profesores de mi colegio",
-- "alumnos pendientes de aprobación". Cubre school_id -> role -> status.
create index profiles_school_role_status_idx
  on public.profiles (school_id, role, status);

-- Búsqueda por nombre en el panel admin ("busca a García"). pg_trgm hace que
-- ILIKE '%garcia%' use índice en vez de seq scan sobre todo el colegio.
create index profiles_full_name_trgm_idx
  on public.profiles using gin (full_name extensions.gin_trgm_ops);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

alter table public.profiles enable row level security;


-- -----------------------------------------------------------------------------
-- students — ficha del alumno e identidad sintética (AD-3, AD-4)
-- -----------------------------------------------------------------------------
create table public.students (
  profile_id          uuid primary key
                        references public.profiles (id) on delete cascade,
  -- Denormalizado A PROPÓSITO (DATA_MODEL §1): sin esta columna, cada política
  -- RLS de alumno haría un join a profiles. Con ella, la comparación de tenant
  -- es un filtro sobre una columna indexada de la propia fila.
  school_id           uuid not null
                        references public.schools (id) on delete restrict,
  -- El código solo es único DENTRO del colegio: dos colegios pueden tener ambos
  -- un alumno "A001". citext porque el niño teclea "a001" y debe funcionar.
  student_code        extensions.citext not null,
  year_level          smallint not null,
  stage               public.school_stage not null,
  section             text,                          -- "Y6A"
  -- Argon2id. NUNCA sale de la base de datos: 0013_grants.sql retira SELECT de
  -- esta columna a `authenticated` y a `anon` mediante GRANT por columna, no
  -- solo por política. Únicamente la Edge Function (service_role) la lee.
  pin_hash            text not null,
  pin_must_change     boolean not null default true, -- AD-4: cambio en 1er login
  pin_updated_at      timestamptz,
  failed_pin_attempts smallint not null default 0,
  locked_until        timestamptz,
  -- Minimización de datos (MASTER_PLAN §9): es el ÚNICO dato de contacto que se
  -- guarda de un menor.
  guardian_email      extensions.citext,
  enrolled_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint students_code_uniq unique (school_id, student_code),
  constraint students_year_level_range
    check (year_level between 1 and 13),
  -- El código va en un formulario que rellena un niño: sin espacios ni símbolos.
  constraint students_code_format
    check (student_code::text ~ '^[A-Za-z0-9._-]{2,32}$'),
  constraint students_pin_hash_is_argon2id
    -- Defensa contra el bug catastrófico "alguien guardó el PIN en claro" o
    -- "alguien usó bcrypt/md5". Si no empieza por $argon2id$, no entra.
    check (pin_hash ~ '^\$argon2id\$'),
  constraint students_failed_attempts_sane
    check (failed_pin_attempts between 0 and 1000),
  constraint students_guardian_email_shape
    check (guardian_email is null
           or guardian_email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.students is
  'Ficha del alumno. pin_hash está fuera del alcance de todo rol salvo service_role (ver 0013_grants.sql).';
comment on column public.students.school_id is
  'Denormalizado a propósito: evita un join a profiles en CADA política RLS de datos de alumno.';

-- Query caliente: "los alumnos de Y6A de mi colegio" en el panel del profesor.
create index students_school_section_idx
  on public.students (school_id, section, year_level);

-- Query caliente: barrido periódico de cuentas bloqueadas para el panel de
-- seguridad ("¿a quién hay que desbloquear?"). Parcial: en régimen normal casi
-- ninguna fila la cumple, así que el índice es diminuto.
create index students_locked_idx
  on public.students (school_id, locked_until)
  where locked_until is not null;

create trigger students_set_updated_at
  before update on public.students
  for each row execute function app.set_updated_at();

alter table public.students enable row level security;


-- -----------------------------------------------------------------------------
-- registration_requests — alta de alumno con aprobación de admin (M03)
-- -----------------------------------------------------------------------------
create table public.registration_requests (
  id                   uuid primary key default extensions.gen_random_uuid(),
  school_id            uuid not null
                         references public.schools (id) on delete cascade,
  full_name            text not null,
  requested_year_level smallint not null,
  guardian_email       extensions.citext,
  note                 text,
  status               public.registration_status not null default 'pending',
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint registration_requests_year_range
    check (requested_year_level between 1 and 13),
  constraint registration_requests_name_not_blank
    check (length(btrim(full_name)) > 0),
  -- Una solicitud pendiente no puede tener revisión, y una revisada debe tenerla.
  constraint registration_requests_review_consistent
    check ((status = 'pending') = (reviewed_at is null)),
  -- Rechazar sin motivo deja al tutor sin nada que hacer. Prohibido.
  constraint registration_requests_rejection_has_reason
    check ((status = 'rejected') = (rejection_reason is not null
                                    and length(btrim(rejection_reason)) > 0))
);

-- Query caliente: la bandeja "solicitudes pendientes" del school_admin.
-- Parcial: solo indexa lo que se consulta a diario.
create index registration_requests_pending_idx
  on public.registration_requests (school_id, created_at desc)
  where status = 'pending';

create trigger registration_requests_set_updated_at
  before update on public.registration_requests
  for each row execute function app.set_updated_at();

alter table public.registration_requests enable row level security;


-- -----------------------------------------------------------------------------
-- sections / section_members — clases
-- -----------------------------------------------------------------------------
create table public.sections (
  id            uuid primary key default extensions.gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  name          text not null,                  -- "Y6A"
  year_level    smallint not null,
  academic_year text not null,                  -- "2026-2027"
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Dos clases "Y6A" del mismo curso académico en el mismo colegio son un error
  -- de datos, no dos clases.
  constraint sections_uniq unique (school_id, academic_year, name),
  constraint sections_year_range check (year_level between 1 and 13),
  constraint sections_name_not_blank check (length(btrim(name)) > 0),
  constraint sections_academic_year_format check (academic_year ~ '^[0-9]{4}-[0-9]{4}$')
);

create trigger sections_set_updated_at
  before update on public.sections
  for each row execute function app.set_updated_at();

alter table public.sections enable row level security;

create table public.section_members (
  section_id       uuid not null references public.sections (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  role_in_section  public.section_role not null,
  -- Denormalizado igual que en students: la política RLS no debe necesitar un
  -- join a sections para saber de qué colegio es esta fila.
  school_id        uuid not null references public.schools (id) on delete cascade,
  added_at         timestamptz not null default now(),

  primary key (section_id, profile_id)
);

-- Query caliente e inversa a la PK: "¿en qué clases está este perfil?"
-- (la pantalla de inicio del alumno y la del profesor).
create index section_members_profile_idx
  on public.section_members (profile_id);

-- Query caliente: "dame los alumnos de esta clase" para asignar un examen.
create index section_members_section_role_idx
  on public.section_members (section_id, role_in_section);

alter table public.section_members enable row level security;
