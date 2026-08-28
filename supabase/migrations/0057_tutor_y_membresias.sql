-- =============================================================================
-- 0057_tutor_y_membresias.sql — tutor, membresías y enlaces de acceso
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
create extension if not exists btree_gist;

create type public.membership_status as enum
  ('solicitada', 'activa', 'rechazada', 'terminada');

-- -----------------------------------------------------------------------------
-- guardian_students — quien es hijo de quien
-- -----------------------------------------------------------------------------
create table public.guardian_students (
  guardian_id  uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  parentesco   text not null default 'tutor',
  es_principal boolean not null default true,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (guardian_id, student_id)
);
alter table public.guardian_students enable row level security;
create index guardian_students_student_idx on public.guardian_students (student_id);

-- -----------------------------------------------------------------------------
-- student_school_memberships — la matrícula, con fechas
-- -----------------------------------------------------------------------------
-- El EXCLUDE es la pieza que no se puede delegar a la aplicacion: dos matriculas
-- activas a la vez rompen la atribucion de CADA evento a un colegio, y ese dato
-- no se repara despues porque no hay forma de saber cual de las dos valia.
create table public.student_school_memberships (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  school_id    uuid not null references public.schools (id) on delete restrict,
  section_id   uuid references public.sections (id) on delete set null,
  starts_on    date not null,
  ends_on      date,
  status       public.membership_status not null default 'solicitada',
  requested_by uuid references public.profiles (id) on delete set null,
  approved_by  uuid references public.profiles (id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint membresia_fechas_coherentes check (ends_on is null or ends_on >= starts_on),
  constraint membresia_activa_sin_solape exclude using gist (
    student_id with =,
    daterange(starts_on, ends_on, '[)') with &&
  ) where (status = 'activa')
);
alter table public.student_school_memberships enable row level security;
create index membresias_colegio_idx
  on public.student_school_memberships (school_id, status, starts_on desc);

-- -----------------------------------------------------------------------------
-- student_access_links — el enlace que el tutor genera para su hijo
-- -----------------------------------------------------------------------------
-- El token se guarda HASHEADO. Se muestra una sola vez, en la respuesta de la
-- accion, igual que resetStudentPin (modules/admin §4). Un token en claro en la
-- base de datos es una credencial de un menor en reposo.
create table public.student_access_links (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.student_access_links enable row level security;
create index enlaces_alumno_idx on public.student_access_links (student_id);

-- =============================================================================
-- PERMISOS — sin esto, las politicas que citan estas tablas tumban a TODOS
-- =============================================================================
-- Postgres evalua la subconsulta de una politica con los privilegios de QUIEN
-- PREGUNTA. `profiles_select_school` cita `student_school_memberships`, asi que
-- sin este `grant` cualquier lectura de `profiles` por un usuario autenticado
-- muere con «permission denied for table student_school_memberships» — incluida
-- la de su propia fila, que otra politica si le concede.
--
-- Paso en produccion el 28 de agosto de 2026: el alumno metia su PIN, la sesion
-- se abria, y la aplicacion le devolvia a la pantalla de ingreso sin un mensaje,
-- porque `requireRole()` no distingue «fallo la consulta» de «no hay perfil».
--
-- El permiso NO abre ningun dato: las tres tablas tienen RLS activo y todavia
-- ninguna politica, y RLS sin politica no deja ver ni una fila. Lo que devuelve
-- es la capacidad de EVALUAR la politica, que es lo que Postgres exige.
-- Lo comprueba `supabase/tests/permisos_de_politica.sql`.
grant select on public.guardian_students          to authenticated;
grant select on public.student_school_memberships to authenticated;
grant select on public.student_access_links       to authenticated;
