# Resultado - tel-mastery-job
- Contrato: `contracts/tel-mastery-job.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 4 de 4
- Rama: `deepseek/tel-mastery-job`
- Duracion: 719.9 s
## Diff

~~~diff
diff --git a/supabase/migrations/0052_mastery_job.sql b/supabase/migrations/0052_mastery_job.sql
new file mode 100644
index 0000000..c2303d8
--- /dev/null
+++ b/supabase/migrations/0052_mastery_job.sql
@@ -0,0 +1,278 @@
+-- =============================================================================
+-- 0052_mastery_job.sql — job que rellena skill_mastery desde learning_events
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+-- skill_mastery (0010) es una CACHÉ reconstruible. Este job la escribe:
+--   · recorre learning_events en orden de server_ts,
+--   · aplica EWMA (alfa 0.3) por (student_id, skill_id),
+--   · guarda una marca de agua para la siguiente pasada.
+-- La fuente de verdad son los eventos; la tabla nunca se escribe a mano.
+-- =============================================================================
+
+-- -----------------------------------------------------------------------------
+-- Estado del job — una sola fila con la marca de agua
+-- -----------------------------------------------------------------------------
+create table app.skill_mastery_job_state (
+  singleton boolean primary key default true,
+  watermark timestamptz not null default '-infinity'::timestamptz,
+  constraint skill_mastery_job_state_singleton check (singleton)
+);
+
+insert into app.skill_mastery_job_state (singleton, watermark)
+values (true, '-infinity'::timestamptz)
+on conflict (singleton) do nothing;
+
+revoke all on table app.skill_mastery_job_state from public;
+
+-- Función que expone la marca actual. El job la consulta al arrancar.
+create or replace function app.skill_mastery_watermark()
+returns timestamptz
+language sql
+security definer
+set search_path = ''
+as $$
+  select watermark from app.skill_mastery_job_state where singleton
+$$;
+
+revoke all on function app.skill_mastery_watermark() from public;
+grant execute on function app.skill_mastery_watermark() to service_role;
+
+-- -----------------------------------------------------------------------------
+-- app.rebuild_skill_mastery
+-- -----------------------------------------------------------------------------
+create or replace function app.rebuild_skill_mastery(p_desde timestamptz default null)
+returns bigint
+language plpgsql
+security definer
+set search_path = ''
+as $$
+declare
+  v_desde      timestamptz;
+  v_max_ts     timestamptz;
+  v_rebuild    boolean := false;
+  v_count      bigint := 0;
+  v_row        record;
+  v_existing   public.skill_mastery%rowtype;
+  v_es_intento boolean;
+  v_correcto   boolean;
+  v_ewma       numeric(4,3);
+  v_time_ms    integer;
+  v_rows       bigint;
+begin
+  -- Punto de partida: el parámetro, o la marca de agua en ejecución incremental.
+  if p_desde is not null then
+    v_desde := p_desde;
+  else
+    v_desde := app.skill_mastery_watermark();
+    if v_desde is null then
+      v_desde := '-infinity'::timestamptz;
+    end if;
+  end if;
+
+  -- '-infinity' significa reconstrucción total: se recalcula desde cero.
+  v_rebuild := (v_desde = '-infinity'::timestamptz);
+  if v_rebuild then
+    delete from public.skill_mastery;
+  end if;
+
+  -- Recorrido en orden ascendente: cada evento se pliega sobre el estado
+  -- anterior, así la EWMA pondera lo reciente en el orden real de llegada.
+  for v_row in
+    select le.student_id,
+           le.school_id,
+           coalesce(le.skill_id, s.id) as skill_id,
+           le.server_ts,
+           le.event_type,
+           le.payload
+    from public.learning_events le
+    left join public.skills s
+      on s.code = le.payload ->> 'skillCode'
+    where le.server_ts > v_desde
+      and le.event_type in ('answer_submitted', 'practice_item_answered', 'hint_requested')
+      and coalesce(le.skill_id, s.id) is not null
+    order by le.student_id,
+             coalesce(le.skill_id, s.id),
+             le.server_ts,
+             le.id
+  loop
+    if v_row.event_type = 'hint_requested' then
+      select * into v_existing
+      from public.skill_mastery
+      where student_id = v_row.student_id
+        and skill_id = v_row.skill_id;
+
+      if not found then
+        v_existing.student_id := v_row.student_id;
+        v_existing.skill_id := v_row.skill_id;
+        v_existing.school_id := v_row.school_id;
+        v_existing.mastery := 0;
+        v_existing.confidence := 0;
+        v_existing.attempts_count := 0;
+        v_existing.correct_count := 0;
+        v_existing.ewma_correct := 0;
+        v_existing.avg_time_ms := null;
+        v_existing.hints_used := 0;
+        v_existing.last_practiced_at := null;
+      end if;
+
+      v_existing.hints_used := v_existing.hints_used + 1;
+
+      insert into public.skill_mastery as sm
+        (student_id, skill_id, school_id, mastery, confidence,
+         attempts_count, correct_count, ewma_correct, avg_time_ms,
+         hints_used, last_practiced_at, updated_at)
+      values
+        (v_existing.student_id, v_existing.skill_id, v_existing.school_id,
+         v_existing.mastery, v_existing.confidence,
+         v_existing.attempts_count, v_existing.correct_count,
+         v_existing.ewma_correct, v_existing.avg_time_ms,
+         v_existing.hints_used, v_existing.last_practiced_at, now())
+      on conflict (student_id, skill_id) do update set
+        school_id = excluded.school_id,
+        mastery = excluded.mastery,
+        confidence = excluded.confidence,
+        attempts_count = excluded.attempts_count,
+        correct_count = excluded.correct_count,
+        ewma_correct = excluded.ewma_correct,
+        avg_time_ms = excluded.avg_time_ms,
+        hints_used = excluded.hints_used,
+        last_practiced_at = excluded.last_practiced_at,
+        updated_at = excluded.updated_at;
+
+      get diagnostics v_rows = row_count;
+      v_count := v_count + v_rows;
+
+    else
+      -- answer_submitted / practice_item_answered: solo cuentan los
+      -- clasificables (isCorrect booleano). Un evento sin isCorrect es un
+      -- examen o una respuesta sin calificar: no es un fallo ni un acierto.
+      v_es_intento := false;
+      if v_row.payload ? 'isCorrect'
+         and jsonb_typeof(v_row.payload -> 'isCorrect') = 'boolean' then
+        v_es_intento := true;
+        v_correcto := (v_row.payload ->> 'isCorrect')::boolean;
+      end if;
+
+      if not v_es_intento then
+        continue;
+      end if;
+
+      select * into v_existing
+      from public.skill_mastery
+      where student_id = v_row.student_id
+        and skill_id = v_row.skill_id;
+
+      if not found then
+        v_existing.student_id := v_row.student_id;
+        v_existing.skill_id := v_row.skill_id;
+        v_existing.school_id := v_row.school_id;
+        v_existing.mastery := 0;
+        v_existing.confidence := 0;
+        v_existing.attempts_count := 0;
+        v_existing.correct_count := 0;
+        v_existing.ewma_correct := 0;
+        v_existing.avg_time_ms := null;
+        v_existing.hints_used := 0;
+        v_existing.last_practiced_at := null;
+      end if;
+
+      v_existing.attempts_count := v_existing.attempts_count + 1;
+      if v_correcto then
+        v_existing.correct_count := v_existing.correct_count + 1;
+      end if;
+
+      -- EWMA alfa 0.3: mastery es la propia EWMA de aciertos.
+      v_ewma := round((0.3 * (case when v_correcto then 1 else 0 end)
+                       + 0.7 * v_existing.ewma_correct)::numeric, 3);
+      if v_ewma > 1 then v_ewma := 1; end if;
+      if v_ewma < 0 then v_ewma := 0; end if;
+      v_existing.ewma_correct := v_ewma;
+      v_existing.mastery := v_ewma;
+
+      -- Tiempo medio por ítem (media simple acumulada).
+      if v_row.payload ? 'timeOnItemMs'
+         and jsonb_typeof(v_row.payload -> 'timeOnItemMs') = 'number' then
+        v_time_ms := (v_row.payload ->> 'timeOnItemMs')::integer;
+        if v_time_ms is not null and v_time_ms >= 0 then
+          v_existing.avg_time_ms := round(
+            (coalesce(v_existing.avg_time_ms, 0) * (v_existing.attempts_count - 1)
+             + v_time_ms)::numeric / v_existing.attempts_count
+          )::integer;
+        end if;
+      end if;
+
+      v_existing.last_practiced_at := v_row.server_ts;
+      v_existing.school_id := v_row.school_id;
+
+      -- Confianza: crece con la práctica y satura en 1.
+      v_existing.confidence := round(
+        (1 - exp(-v_existing.attempts_count / 10.0))::numeric, 3);
+      if v_existing.confidence > 1 then v_existing.confidence := 1; end if;
+      if v_existing.confidence < 0 then v_existing.confidence := 0; end if;
+
+      insert into public.skill_mastery as sm
+        (student_id, skill_id, school_id, mastery, confidence,
+         attempts_count, correct_count, ewma_correct, avg_time_ms,
+         hints_used, last_practiced_at, updated_at)
+      values
+        (v_existing.student_id, v_existing.skill_id, v_existing.school_id,
+         v_existing.mastery, v_existing.confidence,
+         v_existing.attempts_count, v_existing.correct_count,
+         v_existing.ewma_correct, v_existing.avg_time_ms,
+         v_existing.hints_used, v_existing.last_practiced_at, now())
+      on conflict (student_id, skill_id) do update set
+        school_id = excluded.school_id,
+        mastery = excluded.mastery,
+        confidence = excluded.confidence,
+        attempts_count = excluded.attempts_count,
+        correct_count = excluded.correct_count,
+        ewma_correct = excluded.ewma_correct,
+        avg_time_ms = excluded.avg_time_ms,
+        hints_used = excluded.hints_used,
+        last_practiced_at = excluded.last_practiced_at,
+        updated_at = excluded.updated_at;
+
+      get diagnostics v_rows = row_count;
+      v_count := v_count + v_rows;
+    end if;
+  end loop;
+
+  -- En ejecución incremental (sin parámetro) se avanza la marca de agua hasta
+  -- el último evento relevante visto, aunque no fuera clasificable.
+  if p_desde is null then
+    select max(server_ts) into v_max_ts
+    from public.learning_events
+    where server_ts > v_desde
+      and event_type in ('answer_submitted', 'practice_item_answered', 'hint_requested');
+
+    if v_max_ts is not null then
+      insert into app.skill_mastery_job_state (singleton, watermark)
+      values (true, v_max_ts)
+      on conflict (singleton) do update set watermark = excluded.watermark;
+    end if;
+  end if;
+
+  return v_count;
+end;
+$$;
+
+revoke all on function app.rebuild_skill_mastery(timestamptz) from public;
+grant execute on function app.rebuild_skill_mastery(timestamptz) to service_role;
+
+-- -----------------------------------------------------------------------------
+-- Programación en pg_cron — cada 10 minutos. No aborta si falta la extensión.
+-- -----------------------------------------------------------------------------
+do $$
+begin
+  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
+    if exists (select 1 from cron.job where jobname = 'skill_mastery_job') then
+      perform cron.unschedule('skill_mastery_job');
+    end if;
+    perform cron.schedule(
+      'skill_mastery_job',
+      '*/10 * * * *',
+      $$select app.rebuild_skill_mastery();$$
+    );
+  end if;
+end;
+$$;
diff --git a/supabase/tests/mastery_job.sql b/supabase/tests/mastery_job.sql
new file mode 100644
index 0000000..1eabf2c
--- /dev/null
+++ b/supabase/tests/mastery_job.sql
@@ -0,0 +1,180 @@
+-- mastery_job.sql — pgTAP del job que rellena skill_mastery
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+begin;
+select plan(14);
+insert into public.schools (id, name, slug) values
+  ('aaaaaaaa-1111-4111-8111-111111111111', 'Colegio A', 'mastery-a'),
+  ('bbbbbbbb-2222-4222-8222-222222222222', 'Colegio B', 'mastery-b');
+insert into public.profiles (id, school_id, role, full_name, status) values
+  ('aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-1111-4111-8111-111111111111', 'student', 'Alumno A', 'active'),
+  ('bbbbbbbb-0000-4000-8000-00000000bb01',
+   'bbbbbbbb-2222-4222-8222-222222222222', 'student', 'Alumno B', 'active');
+insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash) values
+  ('aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-1111-4111-8111-111111111111', 'MAA1', 6, 'primary',
+   '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'),
+  ('bbbbbbbb-0000-4000-8000-00000000bb01',
+   'bbbbbbbb-2222-4222-8222-222222222222', 'MBB1', 6, 'primary',
+   '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');
+update public.skills set code = 'SKILL_MASTERY_TEST'
+ where id = '99999999-0000-4000-8000-000000000001';
+insert into public.learning_events
+  (school_id, student_id, session_id, seq, event_type, skill_id, payload, server_ts)
+values
+  ('aaaaaaaa-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-0000-4000-8000-00000000aa99', 1, 'answer_submitted', null,
+   '{"timeOnItemMs":5000,"changeCount":1,"hintsUsed":1,"isCorrect":true,"skillCode":"SKILL_MASTERY_TEST"}'::jsonb,
+   now() - interval '10 minutes'),
+  ('aaaaaaaa-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-0000-4000-8000-00000000aa99', 2, 'answer_submitted',
+   '99999999-0000-4000-8000-000000000001',
+   '{"timeOnItemMs":3000,"changeCount":0,"hintsUsed":0,"isCorrect":false}'::jsonb,
+   now() - interval '9 minutes'),
+  ('aaaaaaaa-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-0000-4000-8000-00000000aa99', 3, 'hint_requested',
+   '99999999-0000-4000-8000-000000000001',
+   '{"hintIndex":0,"timeBeforeHintMs":2000}'::jsonb,
+   now() - interval '8 minutes'),
+  ('aaaaaaaa-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-0000-4000-8000-00000000aa99', 4, 'answer_submitted',
+   '99999999-0000-4000-8000-000000000001',
+   '{"timeOnItemMs":4000,"changeCount":2,"hintsUsed":2}'::jsonb,
+   now() - interval '7 minutes'),
+  ('aaaaaaaa-1111-4111-8111-111111111111',
+   'aaaaaaaa-0000-4000-8000-00000000aa01',
+   'aaaaaaaa-0000-4000-8000-00000000aa99', 5, 'practice_item_answered',
+   '99999999-0000-4000-8000-000000000001',
+   '{"timeOnItemMs":2500,"hintsUsed":0,"isCorrect":true}'::jsonb,
+   now() - interval '5 minutes'),
+  ('bbbbbbbb-2222-4222-8222-222222222222',
+   'bbbbbbbb-0000-4000-8000-00000000bb01',
+   'bbbbbbbb-0000-4000-8000-00000000bb99', 1, 'answer_submitted',
+   '99999999-0000-4000-8000-000000000001',
+   '{"timeOnItemMs":6000,"changeCount":0,"hintsUsed":0,"isCorrect":true}'::jsonb,
+   now() - interval '6 minutes');
+select app.rebuild_skill_mastery();
+select is(
+  (select attempts_count from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  3,
+  'A: sin isCorrect no cuenta como intento'
+);
+select is(
+  (select correct_count from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  2,
+  'A: correct_count'
+);
+select is(
+  (select hints_used from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  1,
+  'A: hints_used'
+);
+select is(
+  (select mastery between 0 and 1 from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  true,
+  'A: mastery en rango'
+);
+select is(
+  (select attempts_count from public.skill_mastery
+    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  1,
+  'B: attempts_count'
+);
+select is(
+  (select correct_count from public.skill_mastery
+    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  1,
+  'B: correct_count'
+);
+select is(
+  (select mastery between 0 and 1 from public.skill_mastery
+    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  true,
+  'B: mastery en rango'
+);
+select is(
+  app.skill_mastery_watermark() = now() - interval '5 minutes',
+  true,
+  'la marca de agua avanza'
+);
+select app.rebuild_skill_mastery();
+select is(
+  (select attempts_count from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  3,
+  'idempotencia: attempts_count A'
+);
+select is(
+  (select mastery from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  0.447,
+  'idempotencia: mastery A'
+);
+select app.rebuild_skill_mastery('-infinity');
+select is(
+  (select mastery from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  0.447,
+  'reconstruccion: mastery A'
+);
+select is(
+  (select attempts_count from public.skill_mastery
+    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'
+      and skill_id = '99999999-0000-4000-8000-000000000001'),
+  1,
+  'reconstruccion: attempts_count B'
+);
+insert into auth.users (id, email) values
+  ('bbbbbbbb-0000-4000-8000-00000000bb02', 'teacher.mastery.b@cet.test');
+insert into public.profiles (id, school_id, role, full_name, email, status) values
+  ('bbbbbbbb-0000-4000-8000-00000000bb02',
+   'bbbbbbbb-2222-4222-8222-222222222222', 'teacher', 'Prof B',
+   'teacher.mastery.b@cet.test', 'active');
+set role authenticated;
+select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000bb02', true);
+select set_config('request.jwt.claim.school_id', 'bbbbbbbb-2222-4222-8222-222222222222', true);
+select set_config('request.jwt.claims', json_build_object(
+  'sub', 'bbbbbbbb-0000-4000-8000-00000000bb02',
+  'role', 'authenticated',
+  'school_id', 'bbbbbbbb-2222-4222-8222-222222222222'
+)::text, true);
+select is(
+  (select count(*) from public.skill_mastery
+    where student_id = 'aaaaaaaa-0000-4000-8000-00000000aa01'),
+  0,
+  'un profesor de otro colegio no ve nada'
+);
+select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000bb01', true);
+select set_config('request.jwt.claim.school_id', 'bbbbbbbb-2222-4222-8222-222222222222', true);
+select set_config('request.jwt.claims', json_build_object(
+  'sub', 'bbbbbbbb-0000-4000-8000-00000000bb01',
+  'role', 'authenticated',
+  'school_id', 'bbbbbbbb-2222-4222-8222-222222222222'
+)::text, true);
+select is(
+  (select count(*) from public.skill_mastery
+    where student_id = 'bbbbbbbb-0000-4000-8000-00000000bb01'),
+  1,
+  'el alumno del colegio B ve su propia mastery'
+);
+reset role;
+select * from finish();
+rollback;

~~~

## Salida final de `node scripts/deepseek/validar-sql.mjs supabase/migrations/0052_mastery_job.sql supabase/tests/mastery_job.sql app.rebuild_skill_mastery,app.skill_mastery_watermark`

~~~

  ok  supabase/migrations/0052_mastery_job.sql: 2 funcion(es), forma correcta.
      (la forma, no que corra: eso lo decide Postgres al aplicarla)


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.