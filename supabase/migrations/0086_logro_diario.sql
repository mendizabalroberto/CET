-- =============================================================================
-- 0086_logro_diario.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- «¿LE CUNDE EL TIEMPO QUE ECHA?» — LA PREGUNTA QUE NO ES «¿CUANTO ECHA?»
--
-- `informe_alumno_serie_diaria` (0062) responde cuanto tiempo estudia cada dia,
-- y con eso se dibuja la constancia. Pero no dice si ese tiempo produce algo.
-- Dos niños con los mismos 40 minutos diarios pueden estar uno terminando dos
-- lecciones y el otro atascado en la misma pantalla, y para el tutor esas son
-- dos conversaciones opuestas — exactamente el mismo argumento con el que 0062
-- justifico separar la serie del total.
--
-- Para cruzar esfuerzo con resultado hace falta el LOGRO POR DIA, y no existia:
-- `informe_alumno_resumen` agrega la ventana entera en una fila, y de una suma
-- de siete dias no se recupera ningun dia. De ahi esta funcion.
--
-- POR QUE ES UNA FUNCION NUEVA Y NO TRES COLUMNAS MAS EN LA SERIE DIARIA
--
-- La serie diaria la consumen ya la grafica de constancia y sus pruebas, y su
-- contrato («minutos por dia local, con los ceros dentro») es de los que se
-- citan por escrito en tres ficheros. Ampliarla obligaria a tocar a todos sus
-- llamantes para una pregunta que solo hace uno. Aditivo y aparte: el que
-- quiere minutos sigue pidiendo minutos.
--
-- EL DIA ES EL DIA LOCAL DEL ALUMNO, Y LOS DOS CALENDARIOS TIENEN QUE CUADRAR
--
-- Misma `app.zona_horaria_alumno` y mismo `generate_series` con el microsegundo
-- de menos que 0062. No es cortesia: la dispersion CRUZA las dos series por la
-- fecha, y si un calendario empezara un dia antes que el otro, el punto del
-- lunes llevaria los minutos del lunes y las lecciones del domingo. Seria un
-- grafico entero de relaciones falsas, y no fallaria nada.
--
-- LAS DEFINICIONES DE «RESPONDIDA» Y «ACERTADA» SON LAS DE 0064, LITERALES
--
-- `answer_submitted` y `payload->>'isCorrect' = 'true'`. Contar aqui de otra
-- manera haria que la suma de los dias no diera el total del resumen, y el
-- tutor tiene las dos cifras en la MISMA pantalla: una baldosa que dice tres
-- preguntas encima de una dispersion que suma cuatro es un producto roto.
--
-- LOS DIAS SIN NADA VIENEN A CERO, COMO EN 0062
--
-- Y aqui el cero SI es un cero: «ese dia no termino ninguna leccion» es una
-- medida, no una inicializacion. Quien decide si un punto se pinta es la capa
-- de arriba, que sabe si ese dia hubo minutos.
-- =============================================================================

create or replace function app.informe_alumno_logro_diario(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (
  -- `fecha` y no `dia` por lo mismo que 0062: dentro de plpgsql los parametros
  -- OUT compiten con los nombres de columna de los CTE.
  fecha                 date,
  lecciones_completadas integer,
  items_respondidos     integer,
  aciertos              integer
)
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
    select le.event_type,
           le.payload,
           (le.server_ts at time zone v_tz)::date as d_local
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  por_dia as (
    select ev.d_local,
           count(*) filter (
             where ev.event_type::text = 'lesson_completed')::integer as terminadas,
           count(*) filter (
             where ev.event_type::text = 'answer_submitted')::integer as respondidas,
           count(*) filter (
             where ev.event_type::text = 'answer_submitted'
               and ev.payload ->> 'isCorrect' = 'true')::integer      as acertadas
    from ev
    group by ev.d_local
  ),
  calendario as (
    -- El microsegundo de menos, igual que 0062: un `hasta` que cayera justo en
    -- la medianoche local añadiria un dia de relleno fuera de la ventana.
    select g::date as d_local
    from pg_catalog.generate_series(
           (p_desde at time zone v_tz)::date,
           ((p_hasta - interval '1 microsecond') at time zone v_tz)::date,
           interval '1 day') g
  )
  select c.d_local,
         coalesce(p.terminadas, 0)::integer,
         coalesce(p.respondidas, 0)::integer,
         coalesce(p.acertadas, 0)::integer
  from calendario c
  left join por_dia p on p.d_local = c.d_local
  order by c.d_local;
end;
$$;

comment on function app.informe_alumno_logro_diario(uuid, timestamptz, timestamptz) is
  'Lo que sale de cada dia: lecciones terminadas, preguntas contestadas y acertadas, por dia local del alumno y con los dias vacios a cero. Se cruza con informe_alumno_serie_diaria por la fecha, asi que los dos calendarios se generan igual. Ver 0086.';

revoke all on function app.informe_alumno_logro_diario(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_logro_diario(uuid, timestamptz, timestamptz)
  to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Envoltorio en `public` — PostgREST no expone `app`
-- -----------------------------------------------------------------------------
-- Quinta vez que hace falta (0023, 0063, 0077, 0085). El guardian vive en la
-- funcion de `app`, que llama a `app.puede_ver_informe` en su primera linea;
-- repetirlo aqui serian dos copias de la regla de acceso a datos de un menor.
create or replace function public.informe_alumno_logro_diario(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (
  fecha                 date,
  lecciones_completadas integer,
  items_respondidos     integer,
  aciertos              integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.informe_alumno_logro_diario(p_student_id, p_desde, p_hasta);
$$;

revoke all on function public.informe_alumno_logro_diario(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.informe_alumno_logro_diario(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
