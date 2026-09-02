-- =============================================================================
-- 0095_examenes_del_alumno.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- LOS EXÁMENES DEL ALUMNO, PUESTOS POR SU TUTOR
--
-- El calendario escolar (0092) es del colegio: feriados, finales, hitos
-- Cambridge. Los exámenes de un niño concreto —«Math el 15 de octubre»— los
-- sabe su familia, y el plan de estudio los necesita para concentrar una
-- materia los días previos y soltarla después. Esta tabla los guarda por
-- alumno, escritos a mano por el tutor o extraídos del documento del colegio.
--
-- Misma regla que boletines/planes (0091): solo el tutor vinculado lee y
-- escribe; el staff no. `subject_id` NULL es un examen general (cuenta para
-- todas las materias). No se guarda el PDF: el documento es solo la fuente.
--
-- El índice único hace idempotente la extracción del documento: subir dos
-- veces el mismo calendario no duplica filas.
-- =============================================================================

create table public.examenes_del_alumno (
  id          uuid primary key default extensions.gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id  uuid references public.subjects(id) on delete set null,   -- NULL = general
  fecha       date not null,
  titulo      text not null check (length(btrim(titulo)) between 1 and 120),
  origen      text not null check (origen in ('tutor', 'documento')),
  creado_por  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index examenes_del_alumno_alumno_fecha
  on public.examenes_del_alumno (student_id, fecha);

create unique index examenes_del_alumno_unicos
  on public.examenes_del_alumno (
    student_id, fecha,
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(titulo)));

comment on table public.examenes_del_alumno is
  'Examenes de un alumno concreto, puestos por su tutor (a mano o extraidos del documento del colegio). subject_id NULL = examen general. Solo el tutor vinculado lee y escribe.';

alter table public.examenes_del_alumno enable row level security;
revoke all on public.examenes_del_alumno from authenticated, anon;
grant select, insert, delete on public.examenes_del_alumno to authenticated;

create policy examenes_select_tutor on public.examenes_del_alumno
  for select to authenticated
  using (
    exists (select 1 from public.guardian_students gs
            where gs.guardian_id = (select auth.uid())
              and gs.student_id = examenes_del_alumno.student_id
              and gs.revoked_at is null)
  );

create policy examenes_insert_tutor on public.examenes_del_alumno
  for insert to authenticated
  with check (
    creado_por = (select auth.uid())
    and exists (select 1 from public.guardian_students gs
                where gs.guardian_id = (select auth.uid())
                  and gs.student_id = examenes_del_alumno.student_id
                  and gs.revoked_at is null)
  );

create policy examenes_delete_tutor on public.examenes_del_alumno
  for delete to authenticated
  using (
    exists (select 1 from public.guardian_students gs
            where gs.guardian_id = (select auth.uid())
              and gs.student_id = examenes_del_alumno.student_id
              and gs.revoked_at is null)
  );
