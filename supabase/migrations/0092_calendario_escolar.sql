-- =============================================================================
-- 0092_calendario_escolar.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- CALENDARIO ESCOLAR, Y POR QUE ES GLOBAL POR DEFECTO
--
-- El plan de estudio necesita saber qué días no hay clase, cuándo son los
-- exámenes finales y cuál es el hito más cercano. Hoy el calendario escolar no
-- existe en la base.
--
-- Solo existe un colegio en la base (`demo`) y el alumno real no pertenece a
-- ninguno. Por eso `school_id` es NULLABLE y NULL significa global, la misma
-- convención que `subjects.school_id` y `courses.school_id` (AD-2). El seed de
-- 2026 entra global.
--
-- `year_levels` es NULL cuando el evento aplica a todos los niveles, y un
-- array cuando solo aplica a algunos (p. ej. un examen Cambridge de Y7).
--
-- IDEMPOTENCIA DEL SEED
--
-- El índice único sobre `(coalesce(school_id, cero), gestion, desde, tipo,
-- titulo)` permite que el seed use `on conflict do nothing` y pueda correrse
-- más de una vez sin duplicar filas.
--
-- QUIEN VE QUE
--
-- Un usuario autenticado ve las filas globales y las de su colegio. Nadie
-- escribe con sesión: el seed y el futuro panel escriben con `service_role`.
-- =============================================================================

create type public.evento_escolar as enum (
  'feriado', 'sin_clases', 'examenes_finales', 'vacaciones',
  'fin_trimestre', 'hito_cambridge');

create table public.calendario_eventos (
  id           uuid primary key default extensions.gen_random_uuid(),
  school_id    uuid references public.schools(id) on delete cascade,  -- NULL = global
  gestion      integer not null check (gestion between 2020 and 2100),
  desde        date not null,
  hasta        date not null,
  tipo         public.evento_escolar not null,
  titulo       text not null check (length(btrim(titulo)) > 0),
  year_levels  smallint[],          -- NULL = aplica a todos
  constraint calendario_rango check (hasta >= desde)
);

create index calendario_eventos_ventana
  on public.calendario_eventos (gestion, desde, hasta);

-- Idempotencia del seed: `on conflict do nothing` necesita un único.
create unique index calendario_eventos_seed_unico
  on public.calendario_eventos (
    coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    gestion, desde, tipo, titulo);

comment on table public.calendario_eventos is
  'Calendario escolar. school_id NULL = global (misma convencion que subjects y courses). year_levels NULL = aplica a todos los niveles.';
comment on column public.calendario_eventos.school_id is
  'Colegio al que pertenece el evento. NULL = global.';
comment on column public.calendario_eventos.year_levels is
  'Niveles a los que aplica el evento. NULL = todos.';

alter table public.calendario_eventos enable row level security;

-- -----------------------------------------------------------------------------
-- Acceso: lectura global o del propio colegio; escritura solo con service_role
-- -----------------------------------------------------------------------------
revoke all on public.calendario_eventos from authenticated, anon;

grant select on public.calendario_eventos to authenticated;

create policy calendario_select_visible on public.calendario_eventos
  for select to authenticated
  using (
    school_id is null
    or school_id = (select app.current_school_id())
  );

comment on policy calendario_select_visible on public.calendario_eventos is
  'Un usuario autenticado ve los eventos globales y los de su colegio.';

