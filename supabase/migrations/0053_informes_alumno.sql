-- =============================================================================
-- 0053_informes_alumno.sql — informes para el panel del administrador
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================

create or replace function app.puede_ver_informe(p_student_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_caller_school uuid;
  v_student_school uuid;
begin
  select p.role::text, p.school_id into v_caller_role, v_caller_school
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and (p.school_id is null or exists (
          select 1 from public.schools s
          where s.id = p.school_id and s.status = 'active'));

  select school_id into v_student_school
  from public.profiles
  where id = p_student_id;

  if v_caller_role = 'superadmin' then
    return;
  end if;

  if v_caller_role in ('school_admin', 'teacher')
     and v_caller_school is not null
     and v_caller_school = v_student_school then
    return;
  end if;

  raise exception 'No tienes permiso para ver el informe de este alumno'
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function app.puede_ver_informe(uuid) from public;
grant execute on function app.puede_ver_informe(uuid) to authenticated, service_role;

create or replace function app.informe_alumno_resumen(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  minutos_estudio numeric,
  sesiones integer,
  lecciones_abiertas integer,
  lecciones_completadas integer,
  items_respondidos integer,
  porcentaje_acierto numeric,
  examenes_entregados integer,
  pistas_pedidas integer,
  racha_maxima integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(p_student_id);

  return query
  select
    coalesce(round(sum(x.min_estudio), 2), 0)::numeric,
    (select count(distinct le.session_id)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'lesson_opened'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'lesson_completed'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'answer_submitted'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select case
              when count(*) filter (where le.event_type::text = 'answer_submitted') = 0 then 0
              else round(
                100.0 * count(*) filter (where le.event_type::text = 'answer_submitted'
                                          and le.payload->>'isCorrect' = 'true')
                / count(*) filter (where le.event_type::text = 'answer_submitted'), 1)
            end::numeric
       from public.learning_events le
      where le.student_id = p_student_id
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::numeric,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'attempt_submitted'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'hint_requested'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select coalesce(max((le.payload->>'streak')::integer), 0)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'practice_streak'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer
  from (
    select greatest(
             extract(epoch from (max(server_ts) - min(server_ts)))
             - (coalesce(sum(case when event_type::text = 'idle_end' then (payload->>'idleMs')::numeric end), 0)
                + coalesce(sum(case when event_type::text = 'focus_gained' then (payload->>'awayMs')::numeric end), 0)) / 1000.0,
             0) as min_estudio
    from public.learning_events
    where student_id = p_student_id
      and server_ts >= p_desde and server_ts < p_hasta
    group by session_id
  ) x;
end;
$$;

revoke all on function app.informe_alumno_resumen(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_resumen(uuid, timestamptz, timestamptz) to authenticated, service_role;

create or replace function app.informe_alumno_skills(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  skill_id uuid,
  nombre_skill text,
  mastery numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(p_student_id);
  return query
  select sm.skill_id, s.name::text, sm.mastery::numeric
  from public.skill_mastery sm
  join public.skills s on s.id = sm.skill_id
  where sm.student_id = p_student_id
  order by sm.mastery asc, sm.skill_id asc;
end;
$$;

revoke all on function app.informe_alumno_skills(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_skills(uuid, timestamptz, timestamptz) to authenticated, service_role;

create or replace function app.informe_alumno_secuencia(p_session_id uuid)
returns table (
  seq integer,
  event_type public.learning_event_type,
  payload jsonb,
  server_ts timestamptz,
  ms_desde_anterior bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(
    (select student_id from public.learning_events where session_id = p_session_id limit 1)
  );
  return query
  select le.seq,
         le.event_type,
         le.payload,
         le.server_ts,
         (extract(epoch from (le.server_ts - lag(le.server_ts) over (order by le.seq))) * 1000)::bigint
  from public.learning_events le
  where le.session_id = p_session_id
  order by le.seq;
end;
$$;

revoke all on function app.informe_alumno_secuencia(uuid) from public;
grant execute on function app.informe_alumno_secuencia(uuid) to authenticated, service_role;

create or replace function app.informe_alumno_habitos(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  hora_pico integer,
  dia_pico integer,
  eventos_hora_pico integer,
  eventos_dia_pico integer,
  tiempo_medio_item_ms numeric,
  tasa_idle numeric,
  tasa_focus_lost_por_hora numeric,
  media_change_count numeric,
  proporcion_items_con_pista numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_hora_pico int;
  v_dia_pico int;
  v_eventos_hora int;
  v_eventos_dia int;
begin
  perform app.puede_ver_informe(p_student_id);

  v_tz := coalesce((
    select payload->>'timezone'
    from public.learning_events
    where student_id = p_student_id
      and event_type::text = 'session_context'
      and server_ts >= p_desde and server_ts < p_hasta
    order by server_ts desc, seq desc
    limit 1
  ), 'UTC');

  select h.hora, h.eventos into v_hora_pico, v_eventos_hora
  from (
    select extract(hour from server_ts at time zone v_tz)::int as hora,
           count(*)::int as eventos
    from public.learning_events
    where student_id = p_student_id
      and server_ts >= p_desde and server_ts < p_hasta
    group by extract(hour from server_ts at time zone v_tz)
  ) h
  order by h.eventos desc, h.hora asc
  limit 1;

  select d.dia, d.eventos into v_dia_pico, v_eventos_dia
  from (
    select extract(dow from server_ts at time zone v_tz)::int as dia,
           count(*)::int as eventos
    from public.learning_events
    where student_id = p_student_id
      and server_ts >= p_desde and server_ts < p_hasta
    group by extract(dow from server_ts at time zone v_tz)
  ) d
  order by d.eventos desc, d.dia asc
  limit 1;

  return query
  select
    coalesce(v_hora_pico, 0)::integer,
    coalesce(v_dia_pico, 0)::integer,
    coalesce(v_eventos_hora, 0)::integer,
    coalesce(v_eventos_dia, 0)::integer,
    coalesce((
      select avg((payload->>'timeOnItemMs')::numeric)
      from public.learning_events
      where student_id = p_student_id
        and event_type::text = 'answer_submitted'
        and server_ts >= p_desde and server_ts < p_hasta
    ), 0)::numeric,
    coalesce((
      select sum((payload->>'idleMs')::numeric)
             / nullif((select sum(extract(epoch from (max(server_ts) - min(server_ts))) * 1000)
                       from public.learning_events
                       where student_id = p_student_id
                         and server_ts >= p_desde and server_ts < p_hasta
                       group by session_id), 0)
      from public.learning_events
      where student_id = p_student_id
        and event_type::text = 'idle_end'
        and server_ts >= p_desde and server_ts < p_hasta
    ), 0)::numeric,
    coalesce((
      select count(*)::numeric
             / nullif((select sum(extract(epoch from (max(server_ts) - min(server_ts))) * 1000)
                       from public.learning_events
                       where student_id = p_student_id
                         and server_ts >= p_desde and server_ts < p_hasta
                       group by session_id) / 3600000.0, 0)
      from public.learning_events
      where student_id = p_student_id
        and event_type::text = 'focus_lost'
        and server_ts >= p_desde and server_ts < p_hasta
    ), 0)::numeric,
    coalesce((
      select avg((payload->>'changeCount')::numeric)
      from public.learning_events
      where student_id = p_student_id
        and event_type::text = 'answer_submitted'
        and server_ts >= p_desde and server_ts < p_hasta
    ), 0)::numeric,
    coalesce((
      select (count(*) filter (where exists (
               select 1
               from public.learning_events h
               where h.student_id = le.student_id
                 and h.session_id = le.session_id
                 and h.event_type::text = 'hint_requested'
                 and h.question_id = le.question_id
                 and h.seq < le.seq
             )))::numeric
             / nullif(count(*) filter (where le.event_type::text = 'answer_submitted'), 0)
      from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'answer_submitted'
        and le.server_ts >= p_desde and le.server_ts < p_hasta
    ), 0)::numeric;
end;
$$;

revoke all on function app.informe_alumno_habitos(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_habitos(uuid, timestamptz, timestamptz) to authenticated, service_role;

create or replace function app.informe_alumno_botones(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  tipo text,
  clave text,
  cuenta integer,
  mediana_ms numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(p_student_id);
  return query
  select 'control'::text,
         le.payload->>'control',
         count(*)::integer,
         percentile_cont(0.5) within group (order by (le.payload->>'sinceLastMs')::numeric)::numeric
  from public.learning_events le
  where le.student_id = p_student_id
    and le.event_type::text = 'ui_interaction'
    and le.server_ts >= p_desde and le.server_ts < p_hasta
  group by le.payload->>'control'
  union all
  select 'transicion'::text,
         (le.payload->>'from') || ' -> ' || (le.payload->>'to'),
         count(*)::integer,
         percentile_cont(0.5) within group (order by (le.payload->>'dwellMs')::numeric)::numeric
  from public.learning_events le
  where le.student_id = p_student_id
    and le.event_type::text = 'nav_route_changed'
    and le.server_ts >= p_desde and le.server_ts < p_hasta
  group by le.payload->>'from', le.payload->>'to'
  order by tipo, cuenta desc, clave;
end;
$$;

revoke all on function app.informe_alumno_botones(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_botones(uuid, timestamptz, timestamptz) to authenticated, service_role;
