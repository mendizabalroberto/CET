-- =============================================================================
-- 0091_plan_de_estudio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- PLAN DE ESTUDIO A PARTIR DEL BOLETIN
--
-- Cuatro tablas convierten el boletin del trimestre en tareas diarias. El
-- bucket `boletines` guarda el PDF; `boletines.notas`, lo extraido.
--
-- school_id es NULLABLE: hay alumnos sin matricula (estudian en casa) y su
-- tutor genera planes igualmente. La RLS de boletines/planes/partes NO usa
-- app.puede_ver_alumno: el staff no debe leer esas tablas, solo el tutor.
-- =============================================================================

create type public.boletin_estado as enum ('extraido', 'confirmado');

create table public.boletines (
  id            uuid primary key default extensions.gen_random_uuid(),
  school_id     uuid references public.schools(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  subido_por    uuid not null references public.profiles(id) on delete restrict,
  gestion       integer not null check (gestion between 2020 and 2100),
  trimestre     smallint check (trimestre between 1 and 3),
  storage_path  text not null,
  checksum      text not null check (checksum ~ '^[0-9a-f]{64}$'),
  notas         jsonb not null default '[]'::jsonb,
  estado        public.boletin_estado not null default 'extraido',
  modelo        text,
  tokens_in     integer,
  tokens_out    integer,
  created_at    timestamptz not null default now(),
  confirmado_at timestamptz,
  constraint boletines_notas_es_lista check (jsonb_typeof(notas) = 'array'),
  constraint boletines_confirmado_coherente
    check ((estado = 'confirmado') = (confirmado_at is not null))
);

create unique index boletines_unicos on public.boletines (student_id, checksum);

create table public.planes_de_estudio (
  id               uuid primary key default extensions.gen_random_uuid(),
  school_id        uuid references public.schools(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  boletin_id       uuid not null references public.boletines(id) on delete cascade,
  desde            date not null,
  hasta            date not null,
  minutos_por_dia  smallint not null check (minutos_por_dia between 10 and 180),
  reparto          jsonb not null,
  recomendaciones  text[] not null default '{}',
  activo           boolean not null default true,
  modelo           text,
  tokens_in        integer,
  tokens_out       integer,
  creado_por       uuid not null references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),
  constraint planes_ventana check (hasta > desde),
  constraint planes_recomendaciones_acotadas
    check (array_length(recomendaciones, 1) is null
           or array_length(recomendaciones, 1) <= 6)
);

create unique index planes_uno_activo on public.planes_de_estudio (student_id) where activo;

create type public.tarea_tipo as enum ('leccion', 'practica');

create table public.plan_tareas (
  id          uuid primary key default extensions.gen_random_uuid(),
  plan_id     uuid not null references public.planes_de_estudio(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  fecha       date not null,
  ord         smallint not null check (ord >= 0),
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  tipo        public.tarea_tipo not null,
  lesson_id   uuid references public.lessons(id) on delete cascade,
  skill_id    uuid references public.skills(id) on delete cascade,
  minutos     smallint not null check (minutos between 5 and 90),
  constraint tarea_apunta_a_algo check (
    (tipo = 'leccion'  and lesson_id is not null and skill_id is null) or
    (tipo = 'practica' and skill_id  is not null and lesson_id is null))
);

create unique index plan_tareas_orden on public.plan_tareas (plan_id, fecha, ord);
create index plan_tareas_dia on public.plan_tareas (student_id, fecha);

create table public.plan_partes (
  id                 uuid primary key default extensions.gen_random_uuid(),
  plan_id            uuid not null references public.planes_de_estudio(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  fecha              date not null,
  minutos_previstos  smallint not null,
  minutos_medidos    numeric(6,1) not null,
  items_respondidos  integer not null default 0,
  aciertos           integer not null default 0,
  enviado_at         timestamptz,
  created_at         timestamptz not null default now()
);

create unique index plan_partes_un_parte_por_dia on public.plan_partes (plan_id, fecha);

comment on table public.boletines is
  'Boletin escolar subido por el tutor; de el se extrae el plan. El staff no lo lee: las politicas solo habilitan al tutor vinculado.';
comment on table public.planes_de_estudio is
  'Plan de tareas diarias generado a partir de un boletin. Un solo plan activo por alumno, garantizado por planes_uno_activo.';
comment on table public.plan_tareas is
  'Tarea de un dia dentro de un plan: una leccion o una practica de una skill.';
comment on table public.plan_partes is
  'Corte diario de lo ejecutado. Existe solo para que el cron no mande el mismo aviso dos veces: el indice unico (plan_id, fecha) es la garantia.';

alter table public.boletines enable row level security;
alter table public.planes_de_estudio enable row level security;
alter table public.plan_tareas enable row level security;
alter table public.plan_partes enable row level security;

revoke all on public.boletines from authenticated, anon;
revoke all on public.planes_de_estudio from authenticated, anon;
revoke all on public.plan_tareas from authenticated, anon;
revoke all on public.plan_partes from authenticated, anon;

grant select, insert on public.boletines to authenticated;
grant select, insert on public.planes_de_estudio to authenticated;
grant select on public.plan_tareas to authenticated;
grant select on public.plan_partes to authenticated;

create policy boletines_select_tutor on public.boletines
  for select to authenticated
  using (
    exists (select 1 from public.guardian_students gs
            where gs.guardian_id = (select auth.uid())
              and gs.student_id = boletines.student_id
              and gs.revoked_at is null)
  );

create policy boletines_insert_tutor on public.boletines
  for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and exists (select 1 from public.guardian_students gs
                where gs.guardian_id = (select auth.uid())
                  and gs.student_id = boletines.student_id
                  and gs.revoked_at is null)
  );

create policy planes_select_tutor on public.planes_de_estudio
  for select to authenticated
  using (
    exists (select 1 from public.guardian_students gs
            where gs.guardian_id = (select auth.uid())
              and gs.student_id = planes_de_estudio.student_id
              and gs.revoked_at is null)
  );

create policy planes_insert_tutor on public.planes_de_estudio
  for insert to authenticated
  with check (
    creado_por = (select auth.uid())
    and exists (select 1 from public.guardian_students gs
                where gs.guardian_id = (select auth.uid())
                  and gs.student_id = planes_de_estudio.student_id
                  and gs.revoked_at is null)
  );

create policy plan_partes_select_tutor on public.plan_partes
  for select to authenticated
  using (
    exists (select 1 from public.guardian_students gs
            where gs.guardian_id = (select auth.uid())
              and gs.student_id = plan_partes.student_id
              and gs.revoked_at is null)
  );

create policy plan_tareas_select_dueno_o_tutor on public.plan_tareas
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (select 1 from public.guardian_students gs
               where gs.guardian_id = (select auth.uid())
                 and gs.student_id = plan_tareas.student_id
                 and gs.revoked_at is null)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boletines', 'boletines', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];

drop policy if exists boletines_storage_select on storage.objects;
create policy boletines_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'boletines'
    and exists (select 1 from public.guardian_students gs
                where gs.guardian_id = (select auth.uid())
                  and gs.student_id = (storage.foldername(name))[1]::uuid
                  and gs.revoked_at is null)
  );

drop policy if exists boletines_storage_insert on storage.objects;
create policy boletines_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'boletines'
    and exists (select 1 from public.guardian_students gs
                where gs.guardian_id = (select auth.uid())
                  and gs.student_id = (storage.foldername(name))[1]::uuid
                  and gs.revoked_at is null)
  );

-- El factor 1,5 es una aproximacion elegida, no medida; se sustituira por la
-- mediana observada cuando haya historial.
update public.lessons l
set estimated_minutes = greatest(10, round(
      (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) * 1.5))
where estimated_minutes is null or estimated_minutes = 0;
