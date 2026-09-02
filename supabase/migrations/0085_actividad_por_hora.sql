-- =============================================================================
-- 0085_actividad_por_hora.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- «¿A QUE HORA ESTUDIA MI HIJO?» — LA PREGUNTA QUE NADIE PODIA RESPONDER
--
-- `informe_alumno_habitos` daba `hora_pico`: UN numero, la hora con mas
-- eventos. Con eso no se dibuja nada y ademas engana, porque una hora con
-- cuarenta `ui_interaction` de un niño trasteando gana a una hora de leccion
-- seguida. El tutor quiere ver la FORMA del dia: si su hijo estudia despues de
-- comer o a las once de la noche, y si son ratos largos o picotazos.
--
-- LOS MINUTOS SE ATRIBUYEN A SU HORA, Y ESO SOLO ES POSIBLE DESDE 0080
--
-- Aqui esta la parte que hace que esto sea medicion y no reparto a ojo.
--
-- `tiempo_en_pantalla` late cada 6 segundos con el acumulado de la visita. La
-- DIFERENCIA entre dos latidos consecutivos de la misma visita es el tiempo
-- activo transcurrido en ese intervalo, y ese intervalo cae ENTERO dentro de
-- una hora concreta (dura seis segundos). Asi que el minuto se puede atribuir a
-- la hora en la que de verdad ocurrio, en vez de repartir el total de una visita
-- entre las horas que toca, que es lo que habria que hacer sin latidos.
--
-- La resolucion de 6 s se bajo desde 60 s justo para «ver la forma de la sesion
-- y no solo su total». Esta funcion es la primera que cobra ese cambio.
--
-- POR QUE `greatest(delta, 0)`
--
-- El acumulado NO siempre crece entre latidos consecutivos. Desde que el
-- cronometro es remanente, una visita puede reanudarse desde `localStorage`
-- despues de una recarga, y el primer latido tras reanudar trae el acumulado
-- recuperado, que es MAYOR que el ultimo de la carga anterior — pero si el niño
-- COMPLETA la leccion, el contador se olvida y la siguiente visita a esa misma
-- leccion empieza de cero: ahi el delta sale negativo. Un negativo restaria
-- minutos de una hora en la que si estudio. Se topa en cero.
--
-- ZONA HORARIA: la del alumno, con `app.zona_horaria_alumno`, la misma que usa
-- la serie diaria. Una grafica de horas en UTC para un niño de Bolivia pondria
-- sus deberes de la tarde en la madrugada, y el tutor leeria que su hijo no
-- duerme.
--
-- LOS EVENTOS QUE SE CUENTAN SON LOS DE APRENDIZAJE
--
-- `app.es_evento_de_aprendizaje` (0084), la misma lista que decide si una sesion
-- fue estudio. Contar `ui_interaction` y `nav_route_changed` haria que la hora
-- de mas trasteo pareciera la de mas estudio, que es exactamente el defecto de
-- `hora_pico`.
-- =============================================================================

create or replace function app.informe_alumno_actividad_por_hora(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (hora integer, minutos numeric, eventos integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  perform app.puede_ver_informe(p_student_id);

  v_tz := app.zona_horaria_alumno(p_student_id, p_desde, p_hasta);

  return query
  with ev as (
    select le.session_id,
           le.seq,
           le.event_type,
           le.payload,
           extract(hour from (le.server_ts at time zone v_tz))::integer as h
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  -- El tiempo activo de CADA intervalo entre latidos, con su hora.
  deltas as (
    select t.h,
           greatest(
             t.acumulado - coalesce(
               lag(t.acumulado) over (
                 partition by t.session_id, t.pantalla, t.actividad
                 order by t.seq),
               0),
             0) as ms
    from (
      select ev.session_id,
             ev.seq,
             ev.h,
             ev.payload ->> 'pantalla' as pantalla,
             ev.payload ->> 'id'       as actividad,
             (ev.payload ->> 'msActivos')::numeric as acumulado
      from ev
      where ev.event_type::text = 'tiempo_en_pantalla'
        and (ev.payload ->> 'msActivos') ~ '^[0-9]+$'
    ) t
  ),
  por_hora as (
    select d.h, sum(d.ms) as ms
    from deltas d
    group by d.h
  ),
  eventos_por_hora as (
    select ev.h, count(*)::integer as n
    from ev
    where app.es_evento_de_aprendizaje(ev.event_type::text)
    group by ev.h
  ),
  -- LAS VEINTICUATRO HORAS SIEMPRE. Una grafica de horas con huecos donde no
  -- hubo actividad no se lee: el ojo no sabe si falta la barra o falta la hora.
  reloj as (
    select g::integer as h from pg_catalog.generate_series(0, 23) g
  )
  select r.h,
         round(coalesce(p.ms, 0) / 60000.0, 2)::numeric,
         coalesce(e.n, 0)::integer
  from reloj r
  left join por_hora p on p.h = r.h
  left join eventos_por_hora e on e.h = r.h
  order by r.h;
end;
$$;

comment on function app.informe_alumno_actividad_por_hora(uuid, timestamptz, timestamptz) is
  'La forma del dia: minutos de estudio y eventos de aprendizaje por hora, en la zona del alumno, con las 24 horas siempre presentes. Los minutos salen de la DIFERENCIA entre latidos consecutivos de tiempo_en_pantalla, que es lo que permite atribuirlos a su hora real. Ver 0085.';

revoke all on function app.informe_alumno_actividad_por_hora(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_actividad_por_hora(uuid, timestamptz, timestamptz)
  to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Envoltorio en `public` — PostgREST no expone `app`
-- -----------------------------------------------------------------------------
-- Cuarta vez que hace falta (0023, 0063, 0077). El guardian vive en la funcion
-- de `app`, que llama a `app.puede_ver_informe` como primera linea; repetirlo
-- aqui serian dos copias de la regla de acceso a datos de un menor.
create or replace function public.informe_alumno_actividad_por_hora(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (hora integer, minutos numeric, eventos integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.informe_alumno_actividad_por_hora(p_student_id, p_desde, p_hasta);
$$;

revoke all on function public.informe_alumno_actividad_por_hora(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.informe_alumno_actividad_por_hora(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
