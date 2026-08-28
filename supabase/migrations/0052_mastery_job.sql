-- =============================================================================
-- 0052_mastery_job.sql — job que rellena skill_mastery desde learning_events
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- skill_mastery (0010) es una CACHÉ reconstruible. Este job la escribe:
--   · recorre learning_events en orden de server_ts,
--   · aplica EWMA (alfa 0.3) por (student_id, skill_id),
--   · guarda una marca de agua para la siguiente pasada.
-- La fuente de verdad son los eventos; la tabla nunca se escribe a mano.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estado del job — una sola fila con la marca de agua
-- -----------------------------------------------------------------------------
create table app.skill_mastery_job_state (
  singleton boolean primary key default true,
  watermark timestamptz not null default '-infinity'::timestamptz,
  constraint skill_mastery_job_state_singleton check (singleton)
);

insert into app.skill_mastery_job_state (singleton, watermark)
values (true, '-infinity'::timestamptz)
on conflict (singleton) do nothing;

revoke all on table app.skill_mastery_job_state from public;

-- Función que expone la marca actual. El job la consulta al arrancar.
create or replace function app.skill_mastery_watermark()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select watermark from app.skill_mastery_job_state where singleton
$$;

revoke all on function app.skill_mastery_watermark() from public;
grant execute on function app.skill_mastery_watermark() to service_role;

-- -----------------------------------------------------------------------------
-- app.rebuild_skill_mastery
-- -----------------------------------------------------------------------------
create or replace function app.rebuild_skill_mastery(p_desde timestamptz default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desde      timestamptz;
  v_max_ts     timestamptz;
  v_rebuild    boolean := false;
  v_count      bigint := 0;
  v_row        record;
  v_existing   public.skill_mastery%rowtype;
  v_es_intento boolean;
  v_correcto   boolean;
  v_ewma       numeric(4,3);
  v_time_ms    integer;
  v_rows       bigint;
begin
  -- Punto de partida: el parámetro, o la marca de agua en ejecución incremental.
  if p_desde is not null then
    v_desde := p_desde;
  else
    v_desde := app.skill_mastery_watermark();
    if v_desde is null then
      v_desde := '-infinity'::timestamptz;
    end if;
  end if;

  -- '-infinity' significa reconstrucción total: se recalcula desde cero.
  v_rebuild := (v_desde = '-infinity'::timestamptz);
  if v_rebuild then
    delete from public.skill_mastery;
  end if;

  -- Recorrido en orden ascendente: cada evento se pliega sobre el estado
  -- anterior, así la EWMA pondera lo reciente en el orden real de llegada.
  for v_row in
    select le.student_id,
           le.school_id,
           coalesce(le.skill_id, s.id) as skill_id,
           le.server_ts,
           le.event_type,
           le.payload
    from public.learning_events le
    left join public.skills s
      on s.code = le.payload ->> 'skillCode'
    where le.server_ts > v_desde
      and le.event_type in ('answer_submitted', 'practice_item_answered', 'hint_requested')
      and coalesce(le.skill_id, s.id) is not null
    order by le.student_id,
             coalesce(le.skill_id, s.id),
             le.server_ts,
             le.id
  loop
    if v_row.event_type = 'hint_requested' then
      select * into v_existing
      from public.skill_mastery
      where student_id = v_row.student_id
        and skill_id = v_row.skill_id;

      if not found then
        v_existing.student_id := v_row.student_id;
        v_existing.skill_id := v_row.skill_id;
        v_existing.school_id := v_row.school_id;
        v_existing.mastery := 0;
        v_existing.confidence := 0;
        v_existing.attempts_count := 0;
        v_existing.correct_count := 0;
        v_existing.ewma_correct := 0;
        v_existing.avg_time_ms := null;
        v_existing.hints_used := 0;
        v_existing.last_practiced_at := null;
      end if;

      v_existing.hints_used := v_existing.hints_used + 1;

      insert into public.skill_mastery as sm
        (student_id, skill_id, school_id, mastery, confidence,
         attempts_count, correct_count, ewma_correct, avg_time_ms,
         hints_used, last_practiced_at, updated_at)
      values
        (v_existing.student_id, v_existing.skill_id, v_existing.school_id,
         v_existing.mastery, v_existing.confidence,
         v_existing.attempts_count, v_existing.correct_count,
         v_existing.ewma_correct, v_existing.avg_time_ms,
         v_existing.hints_used, v_existing.last_practiced_at, now())
      on conflict (student_id, skill_id) do update set
        school_id = excluded.school_id,
        mastery = excluded.mastery,
        confidence = excluded.confidence,
        attempts_count = excluded.attempts_count,
        correct_count = excluded.correct_count,
        ewma_correct = excluded.ewma_correct,
        avg_time_ms = excluded.avg_time_ms,
        hints_used = excluded.hints_used,
        last_practiced_at = excluded.last_practiced_at,
        updated_at = excluded.updated_at;

      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;

    else
      -- answer_submitted / practice_item_answered: solo cuentan los
      -- clasificables (isCorrect booleano). Un evento sin isCorrect es un
      -- examen o una respuesta sin calificar: no es un fallo ni un acierto.
      v_es_intento := false;
      if v_row.payload ? 'isCorrect'
         and jsonb_typeof(v_row.payload -> 'isCorrect') = 'boolean' then
        v_es_intento := true;
        v_correcto := (v_row.payload ->> 'isCorrect')::boolean;
      end if;

      if not v_es_intento then
        continue;
      end if;

      select * into v_existing
      from public.skill_mastery
      where student_id = v_row.student_id
        and skill_id = v_row.skill_id;

      if not found then
        v_existing.student_id := v_row.student_id;
        v_existing.skill_id := v_row.skill_id;
        v_existing.school_id := v_row.school_id;
        v_existing.mastery := 0;
        v_existing.confidence := 0;
        v_existing.attempts_count := 0;
        v_existing.correct_count := 0;
        v_existing.ewma_correct := 0;
        v_existing.avg_time_ms := null;
        v_existing.hints_used := 0;
        v_existing.last_practiced_at := null;
      end if;

      v_existing.attempts_count := v_existing.attempts_count + 1;
      if v_correcto then
        v_existing.correct_count := v_existing.correct_count + 1;
      end if;

      -- EWMA alfa 0.3: mastery es la propia EWMA de aciertos.
      v_ewma := round((0.3 * (case when v_correcto then 1 else 0 end)
                       + 0.7 * v_existing.ewma_correct)::numeric, 3);
      if v_ewma > 1 then v_ewma := 1; end if;
      if v_ewma < 0 then v_ewma := 0; end if;
      v_existing.ewma_correct := v_ewma;
      v_existing.mastery := v_ewma;

      -- Tiempo medio por ítem (media simple acumulada).
      if v_row.payload ? 'timeOnItemMs'
         and jsonb_typeof(v_row.payload -> 'timeOnItemMs') = 'number' then
        v_time_ms := (v_row.payload ->> 'timeOnItemMs')::integer;
        if v_time_ms is not null and v_time_ms >= 0 then
          v_existing.avg_time_ms := round(
            (coalesce(v_existing.avg_time_ms, 0) * (v_existing.attempts_count - 1)
             + v_time_ms)::numeric / v_existing.attempts_count
          )::integer;
        end if;
      end if;

      v_existing.last_practiced_at := v_row.server_ts;
      v_existing.school_id := v_row.school_id;

      -- Confianza: crece con la práctica y satura en 1.
      v_existing.confidence := round(
        (1 - exp(-v_existing.attempts_count / 10.0))::numeric, 3);
      if v_existing.confidence > 1 then v_existing.confidence := 1; end if;
      if v_existing.confidence < 0 then v_existing.confidence := 0; end if;

      insert into public.skill_mastery as sm
        (student_id, skill_id, school_id, mastery, confidence,
         attempts_count, correct_count, ewma_correct, avg_time_ms,
         hints_used, last_practiced_at, updated_at)
      values
        (v_existing.student_id, v_existing.skill_id, v_existing.school_id,
         v_existing.mastery, v_existing.confidence,
         v_existing.attempts_count, v_existing.correct_count,
         v_existing.ewma_correct, v_existing.avg_time_ms,
         v_existing.hints_used, v_existing.last_practiced_at, now())
      on conflict (student_id, skill_id) do update set
        school_id = excluded.school_id,
        mastery = excluded.mastery,
        confidence = excluded.confidence,
        attempts_count = excluded.attempts_count,
        correct_count = excluded.correct_count,
        ewma_correct = excluded.ewma_correct,
        avg_time_ms = excluded.avg_time_ms,
        hints_used = excluded.hints_used,
        last_practiced_at = excluded.last_practiced_at,
        updated_at = excluded.updated_at;

      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end if;
  end loop;

  -- En ejecución incremental (sin parámetro) se avanza la marca de agua hasta
  -- el último evento relevante visto, aunque no fuera clasificable.
  if p_desde is null then
    select max(server_ts) into v_max_ts
    from public.learning_events
    where server_ts > v_desde
      and event_type in ('answer_submitted', 'practice_item_answered', 'hint_requested');

    if v_max_ts is not null then
      insert into app.skill_mastery_job_state (singleton, watermark)
      values (true, v_max_ts)
      on conflict (singleton) do update set watermark = excluded.watermark;
    end if;
  end if;

  return v_count;
end;
$$;

revoke all on function app.rebuild_skill_mastery(timestamptz) from public;
grant execute on function app.rebuild_skill_mastery(timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- Programación en pg_cron — cada 10 minutos. No aborta si falta la extensión.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'skill_mastery_job') then
      perform cron.unschedule('skill_mastery_job');
    end if;
    perform cron.schedule(
      'skill_mastery_job',
      '*/10 * * * *',
      $$select app.rebuild_skill_mastery();$$
    );
  end if;
end;
$$;
