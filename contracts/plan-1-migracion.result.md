# Resultado - plan-1-migracion
- Contrato: `contracts/plan-1-migracion.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 3 de 5
- Rama: `deepseek/plan-1-migracion`
- Duracion: 472.5 s
## Diff

~~~diff
diff --git a/supabase/migrations/0091_plan_de_estudio.sql b/supabase/migrations/0091_plan_de_estudio.sql
new file mode 100644
index 0000000..3b7c9f8
--- /dev/null
+++ b/supabase/migrations/0091_plan_de_estudio.sql
@@ -0,0 +1,215 @@
+-- =============================================================================
+-- 0091_plan_de_estudio.sql
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+-- PLAN DE ESTUDIO A PARTIR DEL BOLETIN
+--
+-- Cuatro tablas convierten el boletin del trimestre en tareas diarias. El
+-- bucket `boletines` guarda el PDF; `boletines.notas`, lo extraido.
+--
+-- school_id es NULLABLE: hay alumnos sin matricula (estudian en casa) y su
+-- tutor genera planes igualmente. La RLS de boletines/planes/partes NO usa
+-- app.puede_ver_alumno: el staff no debe leer esas tablas, solo el tutor.
+-- =============================================================================
+
+create type public.boletin_estado as enum ('extraido', 'confirmado');
+
+create table public.boletines (
+  id            uuid primary key default extensions.gen_random_uuid(),
+  school_id     uuid references public.schools(id) on delete cascade,
+  student_id    uuid not null references public.profiles(id) on delete cascade,
+  subido_por    uuid not null references public.profiles(id) on delete restrict,
+  gestion       integer not null check (gestion between 2020 and 2100),
+  trimestre     smallint check (trimestre between 1 and 3),
+  storage_path  text not null,
+  checksum      text not null check (checksum ~ '^[0-9a-f]{64}$'),
+  notas         jsonb not null default '[]'::jsonb,
+  estado        public.boletin_estado not null default 'extraido',
+  modelo        text,
+  tokens_in     integer,
+  tokens_out    integer,
+  created_at    timestamptz not null default now(),
+  confirmado_at timestamptz,
+  constraint boletines_notas_es_lista check (jsonb_typeof(notas) = 'array'),
+  constraint boletines_confirmado_coherente
+    check ((estado = 'confirmado') = (confirmado_at is not null))
+);
+
+create unique index boletines_unicos on public.boletines (student_id, checksum);
+
+create table public.planes_de_estudio (
+  id               uuid primary key default extensions.gen_random_uuid(),
+  school_id        uuid references public.schools(id) on delete cascade,
+  student_id       uuid not null references public.profiles(id) on delete cascade,
+  boletin_id       uuid not null references public.boletines(id) on delete cascade,
+  desde            date not null,
+  hasta            date not null,
+  minutos_por_dia  smallint not null check (minutos_por_dia between 10 and 180),
+  reparto          jsonb not null,
+  recomendaciones  text[] not null default '{}',
+  activo           boolean not null default true,
+  modelo           text,
+  tokens_in        integer,
+  tokens_out       integer,
+  creado_por       uuid not null references public.profiles(id) on delete restrict,
+  created_at       timestamptz not null default now(),
+  constraint planes_ventana check (hasta > desde),
+  constraint planes_recomendaciones_acotadas
+    check (array_length(recomendaciones, 1) is null
+           or array_length(recomendaciones, 1) <= 6)
+);
+
+create unique index planes_uno_activo on public.planes_de_estudio (student_id) where activo;
+
+create type public.tarea_tipo as enum ('leccion', 'practica');
+
+create table public.plan_tareas (
+  id          uuid primary key default extensions.gen_random_uuid(),
+  plan_id     uuid not null references public.planes_de_estudio(id) on delete cascade,
+  student_id  uuid not null references public.profiles(id) on delete cascade,
+  fecha       date not null,
+  ord         smallint not null check (ord >= 0),
+  subject_id  uuid not null references public.subjects(id) on delete restrict,
+  tipo        public.tarea_tipo not null,
+  lesson_id   uuid references public.lessons(id) on delete cascade,
+  skill_id    uuid references public.skills(id) on delete cascade,
+  minutos     smallint not null check (minutos between 5 and 90),
+  constraint tarea_apunta_a_algo check (
+    (tipo = 'leccion'  and lesson_id is not null and skill_id is null) or
+    (tipo = 'practica' and skill_id  is not null and lesson_id is null))
+);
+
+create unique index plan_tareas_orden on public.plan_tareas (plan_id, fecha, ord);
+create index plan_tareas_dia on public.plan_tareas (student_id, fecha);
+
+create table public.plan_partes (
+  id                 uuid primary key default extensions.gen_random_uuid(),
+  plan_id            uuid not null references public.planes_de_estudio(id) on delete cascade,
+  student_id         uuid not null references public.profiles(id) on delete cascade,
+  fecha              date not null,
+  minutos_previstos  smallint not null,
+  minutos_medidos    numeric(6,1) not null,
+  items_respondidos  integer not null default 0,
+  aciertos           integer not null default 0,
+  enviado_at         timestamptz,
+  created_at         timestamptz not null default now()
+);
+
+create unique index plan_partes_un_parte_por_dia on public.plan_partes (plan_id, fecha);
+
+comment on table public.boletines is
+  'Boletin escolar subido por el tutor; de el se extrae el plan. El staff no lo lee: las politicas solo habilitan al tutor vinculado.';
+comment on table public.planes_de_estudio is
+  'Plan de tareas diarias generado a partir de un boletin. Un solo plan activo por alumno, garantizado por planes_uno_activo.';
+comment on table public.plan_tareas is
+  'Tarea de un dia dentro de un plan: una leccion o una practica de una skill.';
+comment on table public.plan_partes is
+  'Corte diario de lo ejecutado. Existe solo para que el cron no mande el mismo aviso dos veces: el indice unico (plan_id, fecha) es la garantia.';
+
+alter table public.boletines enable row level security;
+alter table public.planes_de_estudio enable row level security;
+alter table public.plan_tareas enable row level security;
+alter table public.plan_partes enable row level security;
+
+revoke all on public.boletines from authenticated, anon;
+revoke all on public.planes_de_estudio from authenticated, anon;
+revoke all on public.plan_tareas from authenticated, anon;
+revoke all on public.plan_partes from authenticated, anon;
+
+grant select, insert on public.boletines to authenticated;
+grant select, insert on public.planes_de_estudio to authenticated;
+grant select on public.plan_tareas to authenticated;
+grant select on public.plan_partes to authenticated;
+
+create policy boletines_select_tutor on public.boletines
+  for select to authenticated
+  using (
+    exists (select 1 from public.guardian_students gs
+            where gs.guardian_id = (select auth.uid())
+              and gs.student_id = boletines.student_id
+              and gs.revoked_at is null)
+  );
+
+create policy boletines_insert_tutor on public.boletines
+  for insert to authenticated
+  with check (
+    subido_por = (select auth.uid())
+    and exists (select 1 from public.guardian_students gs
+                where gs.guardian_id = (select auth.uid())
+                  and gs.student_id = boletines.student_id
+                  and gs.revoked_at is null)
+  );
+
+create policy planes_select_tutor on public.planes_de_estudio
+  for select to authenticated
+  using (
+    exists (select 1 from public.guardian_students gs
+            where gs.guardian_id = (select auth.uid())
+              and gs.student_id = planes_de_estudio.student_id
+              and gs.revoked_at is null)
+  );
+
+create policy planes_insert_tutor on public.planes_de_estudio
+  for insert to authenticated
+  with check (
+    creado_por = (select auth.uid())
+    and exists (select 1 from public.guardian_students gs
+                where gs.guardian_id = (select auth.uid())
+                  and gs.student_id = planes_de_estudio.student_id
+                  and gs.revoked_at is null)
+  );
+
+create policy plan_partes_select_tutor on public.plan_partes
+  for select to authenticated
+  using (
+    exists (select 1 from public.guardian_students gs
+            where gs.guardian_id = (select auth.uid())
+              and gs.student_id = plan_partes.student_id
+              and gs.revoked_at is null)
+  );
+
+create policy plan_tareas_select_dueno_o_tutor on public.plan_tareas
+  for select to authenticated
+  using (
+    student_id = (select auth.uid())
+    or exists (select 1 from public.guardian_students gs
+               where gs.guardian_id = (select auth.uid())
+                 and gs.student_id = plan_tareas.student_id
+                 and gs.revoked_at is null)
+  );
+
+insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
+values ('boletines', 'boletines', false, 10485760, array['application/pdf'])
+on conflict (id) do update
+  set public = false,
+      file_size_limit = 10485760,
+      allowed_mime_types = array['application/pdf'];
+
+drop policy if exists boletines_storage_select on storage.objects;
+create policy boletines_storage_select on storage.objects
+  for select to authenticated
+  using (
+    bucket_id = 'boletines'
+    and exists (select 1 from public.guardian_students gs
+                where gs.guardian_id = (select auth.uid())
+                  and gs.student_id = (storage.foldername(name))[1]::uuid
+                  and gs.revoked_at is null)
+  );
+
+drop policy if exists boletines_storage_insert on storage.objects;
+create policy boletines_storage_insert on storage.objects
+  for insert to authenticated
+  with check (
+    bucket_id = 'boletines'
+    and exists (select 1 from public.guardian_students gs
+                where gs.guardian_id = (select auth.uid())
+                  and gs.student_id = (storage.foldername(name))[1]::uuid
+                  and gs.revoked_at is null)
+  );
+
+-- El factor 1,5 es una aproximacion elegida, no medida; se sustituira por la
+-- mediana observada cuando haya historial.
+update public.lessons l
+set estimated_minutes = greatest(10, round(
+      (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) * 1.5))
+where estimated_minutes is null or estimated_minutes = 0;
diff --git a/supabase/tests/plan_de_estudio.sql b/supabase/tests/plan_de_estudio.sql
new file mode 100644
index 0000000..dac4bf8
--- /dev/null
+++ b/supabase/tests/plan_de_estudio.sql
@@ -0,0 +1,298 @@
+-- =============================================================================
+-- plan_de_estudio.sql — pgTAP de la migracion 0091
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+begin;
+select plan(22);
+
+\ir ../migrations/0091_plan_de_estudio.sql
+
+-- La migracion rellena estimated_minutes. En este punto el fixture no ha
+-- creado sus lecciones, asi que el cero solo puede venir de las 33 reales.
+select is(
+  (select count(*)::int from public.lessons
+    where status = 'published'
+      and (estimated_minutes is null or estimated_minutes = 0)),
+  0,
+  'la migracion deja minutos estimados en todas las lecciones publicadas');
+
+\ir helpers/fixture.psql
+
+-- Tutores: tutor_1 de s1a, tutor_2 de s2a
+insert into auth.users (id, email) values
+  ('99999999-0000-4000-8000-0000000000c1', 'tutor.plan.uno@cet.test'),
+  ('99999999-0000-4000-8000-0000000000c2', 'tutor.plan.dos@cet.test');
+
+insert into public.profiles (id, school_id, role, full_name, email, status)
+values
+  ('99999999-0000-4000-8000-0000000000c1', null, 'guardian', 'Tutor Plan Uno', 'tutor.plan.uno@cet.test', 'active'),
+  ('99999999-0000-4000-8000-0000000000c2', null, 'guardian', 'Tutor Plan Dos', 'tutor.plan.dos@cet.test', 'active');
+
+insert into public.guardian_students (guardian_id, student_id)
+values
+  ('99999999-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-00000000003a'),
+  ('99999999-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-00000000004a');
+
+-- Un boletin, un plan activo, dos tareas y un parte para s1a
+insert into public.boletines
+  (id, school_id, student_id, subido_por, gestion, trimestre,
+   storage_path, checksum, notas, estado)
+values
+  ('99999999-0000-4000-8000-0000000000d1',
+   '11111111-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000003a',
+   '99999999-0000-4000-8000-0000000000c1',
+   2026, 1,
+   's1a/boletin-2026-t1.pdf',
+   repeat('a', 64),
+   '[]'::jsonb,
+   'extraido');
+
+insert into public.planes_de_estudio
+  (id, school_id, student_id, boletin_id, desde, hasta, minutos_por_dia,
+   reparto, recomendaciones, activo, creado_por)
+values
+  ('99999999-0000-4000-8000-0000000000e1',
+   '11111111-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000003a',
+   '99999999-0000-4000-8000-0000000000d1',
+   current_date, current_date + 28, 30,
+   '[{"weekday":1,"minutos":30}]'::jsonb,
+   array['Repasar fracciones'],
+   true,
+   '99999999-0000-4000-8000-0000000000c1');
+
+insert into public.plan_tareas
+  (id, plan_id, student_id, fecha, ord, subject_id, tipo,
+   lesson_id, skill_id, minutos)
+values
+  ('99999999-0000-4000-8000-0000000000f1',
+   '99999999-0000-4000-8000-0000000000e1',
+   'aaaaaaaa-0000-4000-8000-00000000003a',
+   current_date, 0,
+   'cccccccc-0000-4000-8000-000000000001',
+   'leccion',
+   'ffffffff-0000-4000-8000-000000000001',
+   null,
+   20),
+  ('99999999-0000-4000-8000-0000000000f2',
+   '99999999-0000-4000-8000-0000000000e1',
+   'aaaaaaaa-0000-4000-8000-00000000003a',
+   current_date + 1, 0,
+   'cccccccc-0000-4000-8000-000000000001',
+   'practica',
+   null,
+   '99999999-0000-4000-8000-000000000001',
+   15);
+
+insert into public.plan_partes
+  (id, plan_id, student_id, fecha, minutos_previstos, minutos_medidos,
+   items_respondidos, aciertos)
+values
+  ('99999999-0000-4000-8000-0000000000a1',
+   '99999999-0000-4000-8000-0000000000e1',
+   'aaaaaaaa-0000-4000-8000-00000000003a',
+   current_date, 30, 22.5, 6, 4);
+
+-- Las lecciones del fixture nacen despues de la migracion; se rellenan con la
+-- misma formula para poder comprobar el valor esperado mas abajo.
+update public.lessons l
+   set estimated_minutes = greatest(10, round(
+         (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) * 1.5))
+ where l.id in (
+   'ffffffff-0000-4000-8000-000000000001',
+   'ffffffff-0000-4000-8000-00000000000b'
+ );
+
+-- 1-2: tutor_1 ve el boletin de s1a; tutor_2 no ve ninguno
+select pg_temp.login_as('99999999-0000-4000-8000-0000000000c1');
+select is(pg_temp.visible_count('select count(*) from public.boletines'), 1,
+          'el tutor vinculado ve el boletin de su alumno');
+select pg_temp.logout();
+
+select pg_temp.login_as('99999999-0000-4000-8000-0000000000c2');
+select is(pg_temp.visible_count('select count(*) from public.boletines'), 0,
+          'el tutor ajeno no ve boletines');
+select pg_temp.logout();
+
+-- 3-8: el staff del colegio no lee boletines, planes ni partes
+select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');
+select is(pg_temp.visible_count('select count(*) from public.boletines'), 0,
+          'teacher_a no ve boletines');
+select is(pg_temp.visible_count('select count(*) from public.planes_de_estudio'), 0,
+          'teacher_a no ve planes de estudio');
+select is(pg_temp.visible_count('select count(*) from public.plan_partes'), 0,
+          'teacher_a no ve partes');
+select pg_temp.logout();
+
+select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000001a');
+select is(pg_temp.visible_count('select count(*) from public.boletines'), 0,
+          'admin_a no ve boletines');
+select is(pg_temp.visible_count('select count(*) from public.planes_de_estudio'), 0,
+          'admin_a no ve planes de estudio');
+select is(pg_temp.visible_count('select count(*) from public.plan_partes'), 0,
+          'admin_a no ve partes');
+select pg_temp.logout();
+
+-- 9-10: el alumno ve sus tareas, el companero no
+select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');
+select is(pg_temp.visible_count('select count(*) from public.plan_tareas'), 2,
+          's1a ve sus dos tareas sin filtro de fecha');
+select pg_temp.logout();
+
+select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000004a');
+select is(pg_temp.visible_count('select count(*) from public.plan_tareas'), 0,
+          's2a no ve tareas ajenas');
+select pg_temp.logout();
+
+-- 11-12: el tutor inserta boletines solo para su alumno
+select pg_temp.login_as('99999999-0000-4000-8000-0000000000c1');
+select lives_ok($sql$
+  insert into public.boletines
+    (id, school_id, student_id, subido_por, gestion, trimestre,
+     storage_path, checksum, notas, estado)
+  values
+    ('99999999-0000-4000-8000-0000000000d2',
+     '11111111-1111-4111-8111-111111111111',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     '99999999-0000-4000-8000-0000000000c1',
+     2026, 2,
+     's1a/boletin-2026-t2.pdf',
+     repeat('b', 64),
+     '[]'::jsonb,
+     'extraido')
+$sql$, 'el tutor_1 puede insertar un boletin para s1a');
+
+select throws_ok($sql$
+  insert into public.boletines
+    (id, school_id, student_id, subido_por, gestion, trimestre,
+     storage_path, checksum, notas, estado)
+  values
+    ('99999999-0000-4000-8000-0000000000d3',
+     '11111111-1111-4111-8111-111111111111',
+     'aaaaaaaa-0000-4000-8000-00000000004a',
+     '99999999-0000-4000-8000-0000000000c1',
+     2026, 2,
+     's2a/boletin-2026-t2.pdf',
+     repeat('c', 64),
+     '[]'::jsonb,
+     'extraido')
+$sql$, '42501', null, 'el tutor_1 NO puede insertar un boletin para s2a');
+select pg_temp.logout();
+
+-- 13: el alumno no escribe en plan_tareas
+select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');
+select throws_ok($sql$
+  insert into public.plan_tareas
+    (id, plan_id, student_id, fecha, ord, subject_id, tipo, lesson_id, skill_id, minutos)
+  values
+    ('99999999-0000-4000-8000-0000000000f3',
+     '99999999-0000-4000-8000-0000000000e1',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     current_date, 1,
+     'cccccccc-0000-4000-8000-000000000001',
+     'leccion',
+     'ffffffff-0000-4000-8000-000000000001',
+     null, 20)
+$sql$, '42501', null, 's1a no puede insertar en plan_tareas');
+select pg_temp.logout();
+
+-- 14-16: un plan activo por alumno; los inactivos no cuentan
+select throws_ok($sql$
+  insert into public.planes_de_estudio
+    (id, school_id, student_id, boletin_id, desde, hasta, minutos_por_dia,
+     reparto, recomendaciones, activo, creado_por)
+  values
+    ('99999999-0000-4000-8000-0000000000e2',
+     '11111111-1111-4111-8111-111111111111',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     '99999999-0000-4000-8000-0000000000d1',
+     current_date, current_date + 28, 30,
+     '[{"weekday":1,"minutos":30}]'::jsonb,
+     array['Repasar fracciones'],
+     true,
+     '99999999-0000-4000-8000-0000000000c1')
+$sql$, '23505', null, 'un segundo plan activo para s1a choca con planes_uno_activo');
+
+select lives_ok($sql$
+  insert into public.planes_de_estudio
+    (id, school_id, student_id, boletin_id, desde, hasta, minutos_por_dia,
+     reparto, recomendaciones, activo, creado_por)
+  values
+    ('99999999-0000-4000-8000-0000000000e3',
+     '11111111-1111-4111-8111-111111111111',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     '99999999-0000-4000-8000-0000000000d1',
+     current_date, current_date + 28, 30,
+     '[{"weekday":2,"minutos":20}]'::jsonb,
+     array['Repasar fracciones'],
+     false,
+     '99999999-0000-4000-8000-0000000000c1')
+$sql$, 'un plan inactivo para el mismo alumno entra');
+
+-- 17: un parte por plan y dia
+select throws_ok($sql$
+  insert into public.plan_partes
+    (id, plan_id, student_id, fecha, minutos_previstos, minutos_medidos,
+     items_respondidos, aciertos)
+  values
+    ('99999999-0000-4000-8000-0000000000a2',
+     '99999999-0000-4000-8000-0000000000e1',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     current_date, 30, 25.0, 5, 3)
+$sql$, '23505', null, 'un segundo parte del mismo plan y dia choca con el indice unico');
+
+-- 18: una tarea de leccion sin lesson no tiene sentido
+select throws_ok($sql$
+  insert into public.plan_tareas
+    (id, plan_id, student_id, fecha, ord, subject_id, tipo, lesson_id, skill_id, minutos)
+  values
+    ('99999999-0000-4000-8000-0000000000f4',
+     '99999999-0000-4000-8000-0000000000e1',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     current_date, 2,
+     'cccccccc-0000-4000-8000-000000000001',
+     'leccion',
+     null, null, 20)
+$sql$, '23514', null, 'una tarea de leccion sin lesson_id viola tarea_apunta_a_algo');
+
+-- 19: un boletin confirmado necesita su confirmado_at
+select throws_ok($sql$
+  insert into public.boletines
+    (id, school_id, student_id, subido_por, gestion, trimestre,
+     storage_path, checksum, notas, estado, confirmado_at)
+  values
+    ('99999999-0000-4000-8000-0000000000d4',
+     '11111111-1111-4111-8111-111111111111',
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     '99999999-0000-4000-8000-0000000000c1',
+     2026, 1,
+     's1a/boletin-confirmado.pdf',
+     repeat('d', 64),
+     '[]'::jsonb,
+     'confirmado',
+     null)
+$sql$, '23514', null, 'un boletin confirmado sin confirmado_at viola la coherencia');
+
+-- 20: la leccion del fixture, rellenada con la misma formula, vale sus bloques
+select is(
+  (select estimated_minutes from public.lessons
+    where id = 'ffffffff-0000-4000-8000-000000000001'),
+  (select greatest(10, round(count(*) * 1.5))::smallint
+     from public.lesson_blocks b
+    where b.lesson_id = 'ffffffff-0000-4000-8000-000000000001'),
+  'la leccion del fixture tiene los minutos estimados segun sus bloques');
+
+-- 21-22: el bucket boletines es privado y con limite
+select is(
+  (select "public" from storage.buckets where id = 'boletines'),
+  false,
+  'el bucket boletines es privado');
+
+select is(
+  (select file_size_limit::int from storage.buckets where id = 'boletines'),
+  10485760,
+  'el bucket boletines limita a 10 MiB');
+
+select * from finish();
+rollback;

~~~

## Salida final de `node scripts/db-test.mjs plan_de_estudio`

~~~

Conectado (via CET_DB_URL (aws-0-us-east-1.pooler.supabase.com)).

  plan_de_estudio.sql ... ok (22)

1/1 ficheros en verde.


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.