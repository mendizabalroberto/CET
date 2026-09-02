-- =============================================================================
-- 0083_el_informe_deja_de_estimar.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL INFORME DEL TUTOR MULTIPLICABA POR DOCE
--
-- Medido en produccion el 02/09/2026 sobre una tarde real de un alumno. Cuatro
-- cifras del MISMO rato:
--
--     informe_alumno_resumen . minutos_estudio     91,19 min
--     tiempo_en_pantalla . msBrutos (reloj pared)  19,0  min
--     informe_alumno_tiempo_por_leccion (suma)     16,0  min
--     tiempo_en_pantalla . msActivos (medido)       7,6  min
--
-- Doce veces el tiempo medido. Y lo que lo delata sin discusion: 91 SUPERA al
-- reloj de pared. El informe contaba minutos en los que no habia ninguna
-- pantalla del producto abierta.
--
-- NO ERA UN ERROR DE CALCULO, ERA UN ESTIMADOR SIN SENAL
--
-- `app.minutos_de_estudio` (0064) suma los huecos entre eventos topados a 30
-- min. Era lo mejor posible cuando la base solo tenia eventos sueltos: entre dos
-- clics de un nino que LEE hay silencios largos y legitimos, y descartarlos
-- habria dado casi cero. El umbral de 30 min se eligio mirando la distribucion
-- real de 716 huecos, y sigue siendo el correcto PARA ESE ESTIMADOR.
--
-- Lo que cambio es que desde el 01/09/2026 el navegador ya no obliga a deducir:
-- MIDE. `tiempo_en_pantalla` (0080) trae `msActivos` —con el reloj parado
-- cuando la pestana esta oculta, sin foco, o tras un minuto de inactividad— y
-- `msBrutos`. El informe seguia estimando teniendo el dato delante.
--
-- LA REGLA NUEVA: MEDIR SI SE PUEDE, ESTIMAR SI NO
--
-- Se decide POR SESION y no por ventana. Una sesion con eventos de
-- `tiempo_en_pantalla` usa lo medido; una que no los tenga —las de antes del
-- 01/09, y las de un nino que solo navego por el indice— sigue con el estimador
-- de 0064. Asi una ventana de 30 dias a caballo del cambio no pierde los dias
-- viejos, que es lo que pasaria decidiendolo para la ventana entera.
--
-- POR QUE `max` POR ACTIVIDAD Y NO `sum`
--
-- `tiempo_en_pantalla` se emite con LATIDOS cada 6 s y sus cifras son
-- ACUMULADAS, no incrementos: la ultima fila de una visita ya contiene todo el
-- rato. Sumarlas contaria la misma visita decenas de veces. Se agrupa por
-- `(pantalla, id)` dentro de la sesion y se toma el MAXIMO, que es el total de
-- esa visita, y se suman los maximos de actividades distintas.
--
-- TRES COPIAS DE LA MISMA REGLA
--
-- El calculo vivia escrito tres veces —`informe_alumno_resumen`,
-- `informe_alumno_metricas_bruto` y `informe_alumno_serie_diaria`—, cada una con
-- su propio `group by le.session_id`. Tres copias de una regla divergen: basta
-- que alguien arregle una. Aqui la eleccion medir/estimar se extrae a
-- `app.minutos_de_sesion` y las tres pasan a llamarla. Es el mismo movimiento
-- que hizo 0064 al sacar la formula a `app.minutos_de_estudio`.
--
-- LO QUE NO SE TOCA
--
-- El numero de SESIONES sigue siendo `count(distinct session_id)`, y sigue
-- estando mal: la cola emite un `session_id` por carga de pagina, asi que esa
-- tarde conto 37 «sesiones» de las que DOCE tenian un solo evento. Arreglarlo
-- exige redefinir que es una sesion —una racha de actividad, con su umbral— y
-- eso cambia fixtures de `informes_series.sql` que siembran huecos de 15 y 20
-- min a proposito. Es una decision aparte y va en su propia migracion.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- app.ms_medidos — el total que el navegador MIDIO en una sesion
-- -----------------------------------------------------------------------------
-- Recibe los payloads de `tiempo_en_pantalla` de una sesion y devuelve los
-- milisegundos activos, agrupando por actividad y quedandose con el maximo.
--
-- `immutable` y sin leer una fila: es aritmetica sobre lo que le pasan.
--
-- La guarda del regex NO es ceremonia. `payload` es jsonb y lo compone el
-- cliente; un `msActivos` que no fuera un entero haria fallar el cast, y como
-- estas funciones son `stable` y las llama el informe entero, una excepcion aqui
-- dejaria al tutor sin scorecard en vez de sin una cifra. Lo que no sea un
-- entero se descarta en silencio y el resto de la sesion se cuenta igual.
create or replace function app.ms_medidos(p_payloads jsonb[])
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(g.mx), 0)::numeric
  from (
    select max((t.p ->> 'msActivos')::numeric) as mx
    from pg_catalog.unnest(coalesce(p_payloads, '{}'::jsonb[])) as t(p)
    where t.p ? 'msActivos'
      and (t.p ->> 'msActivos') ~ '^[0-9]+$'
    group by t.p ->> 'pantalla', t.p ->> 'id'
  ) g;
$$;

comment on function app.ms_medidos(jsonb[]) is
  'Milisegundos ACTIVOS que el navegador midio en una sesion: maximo por (pantalla, id) sumado entre actividades. Los latidos de tiempo_en_pantalla son acumulados, por eso maximo y no suma.';

revoke all on function app.ms_medidos(jsonb[]) from public;
grant execute on function app.ms_medidos(jsonb[]) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- app.minutos_de_sesion — medir si se puede, estimar si no
-- -----------------------------------------------------------------------------
-- El unico sitio donde vive la eleccion. Las tres funciones de informe la
-- llaman y ninguna vuelve a decidir por su cuenta.
create or replace function app.minutos_de_sesion(
  p_marcas          timestamptz[],
  p_ms_declarados   numeric,
  p_payloads_tiempo jsonb[]
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with medido as (select app.ms_medidos(p_payloads_tiempo) as ms)
  select case
           when m.ms > 0 then m.ms / 60000.0
           else app.minutos_de_estudio(p_marcas, p_ms_declarados)
         end
  from medido m;
$$;

comment on function app.minutos_de_sesion(timestamptz[], numeric, jsonb[]) is
  'Minutos de estudio de una sesion. Usa el tiempo MEDIDO por el navegador (tiempo_en_pantalla, 0080) cuando existe; si no, cae al estimador por huecos de 0064. Ver la cabecera de 0083: el estimador daba 91 min donde el reloj de pared daba 19.';

revoke all on function app.minutos_de_sesion(timestamptz[], numeric, jsonb[]) from public;
grant execute on function app.minutos_de_sesion(timestamptz[], numeric, jsonb[])
  to authenticated, service_role;


-- =============================================================================
-- 1 · informe_alumno_resumen — la cifra de cabecera del scorecard
-- =============================================================================
-- Se redefine ENTERA porque `create or replace` no admite parches. Es el cuerpo
-- de 0064 salvo la subconsulta `x`, que ahora llama a `app.minutos_de_sesion` y
-- le pasa los payloads de tiempo de la sesion. Las ocho metricas restantes son
-- identicas caracter por caracter, incluido el `count(distinct session_id)` que
-- sigue mal a sabiendas (ver cabecera).
--
-- Los GRANT sobreviven a un `create or replace` —el ACL va con el objeto— asi
-- que no se reponen: reponerlos dejaria creer que soltar y recrear seria
-- equivalente, y no lo es.
create or replace function app.informe_alumno_resumen(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (
  minutos_estudio       numeric,
  sesiones              integer,
  lecciones_abiertas    integer,
  lecciones_completadas integer,
  items_respondidos     integer,
  porcentaje_acierto    numeric,
  examenes_entregados   integer,
  pistas_pedidas        integer,
  racha_maxima          integer
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
                     100.0
                     * count(*) filter (where le.event_type::text = 'answer_submitted'
                                          and le.payload ->> 'isCorrect' = 'true')
                     / count(*) filter (where le.event_type::text = 'answer_submitted'),
                     1)
            end
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
    (select coalesce(max((le.payload ->> 'streak')::integer), 0)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'practice_streak'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer
  from (
    select app.minutos_de_sesion(
             array_agg(le.server_ts),
             sum(app.ms_descontables(le.event_type::text, le.payload)),
             coalesce(
               array_agg(le.payload) filter (
                 where le.event_type::text = 'tiempo_en_pantalla'),
               '{}'::jsonb[])
           ) as min_estudio
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde and le.server_ts < p_hasta
    group by le.session_id
  ) x;
end;
$$;


-- =============================================================================
-- 2 · informe_alumno_metricas_bruto — la fuente de la comparativa de clase
-- =============================================================================
create or replace function app.informe_alumno_metricas_bruto(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (ord integer, metrica text, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select le.session_id, le.server_ts, le.event_type, le.payload
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  sesiones as (
    select app.minutos_de_sesion(
             array_agg(ev.server_ts),
             sum(app.ms_descontables(ev.event_type::text, ev.payload)),
             coalesce(
               array_agg(ev.payload) filter (
                 where ev.event_type::text = 'tiempo_en_pantalla'),
               '{}'::jsonb[])
           ) as min_estudio
    from ev
    group by ev.session_id
  ),
  resp as (
    select count(*) as n,
           count(*) filter (where ev.payload ->> 'isCorrect' = 'true') as aciertos
    from ev
    where ev.event_type::text = 'answer_submitted'
  )
  select 1::integer, 'minutos_estudio'::text,
         coalesce(round((select sum(s.min_estudio) from sesiones s), 2), 0)::numeric
  union all
  select 2, 'sesiones',
         (select count(distinct ev.session_id) from ev)::numeric
  union all
  select 3, 'lecciones_abiertas',
         (select count(*) from ev where ev.event_type::text = 'lesson_opened')::numeric
  union all
  select 4, 'lecciones_completadas',
         (select count(*) from ev where ev.event_type::text = 'lesson_completed')::numeric
  union all
  select 5, 'items_respondidos',
         (select r.n from resp r)::numeric
  union all
  select 6, 'porcentaje_acierto',
         (select case when r.n = 0 then 0
                      else round(100.0 * r.aciertos / r.n, 1) end
            from resp r)::numeric
  union all
  select 7, 'examenes_entregados',
         (select count(*) from ev where ev.event_type::text = 'attempt_submitted')::numeric
  union all
  select 8, 'pistas_pedidas',
         (select count(*) from ev where ev.event_type::text = 'hint_requested')::numeric
  union all
  select 9, 'racha_maxima',
         (select coalesce(max((ev.payload ->> 'streak')::integer), 0)
            from ev where ev.event_type::text = 'practice_streak')::numeric;
$$;


-- =============================================================================
-- 3 · informe_alumno_serie_diaria — la grafica de esfuerzo por dia
-- =============================================================================
-- Agrupa por `(dia local, sesion)`, asi que la eleccion medir/estimar se toma
-- por tramo igual que en las otras dos. El calendario, la zona horaria y el
-- relleno de dias sin actividad quedan intactos.
create or replace function app.informe_alumno_serie_diaria(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (fecha date, minutos_estudio numeric, sesiones integer)
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
           le.server_ts,
           le.event_type,
           le.payload,
           (le.server_ts at time zone v_tz)::date as d_local
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  tramos as (
    select ev.d_local,
           app.minutos_de_sesion(
             array_agg(ev.server_ts),
             sum(app.ms_descontables(ev.event_type::text, ev.payload)),
             coalesce(
               array_agg(ev.payload) filter (
                 where ev.event_type::text = 'tiempo_en_pantalla'),
               '{}'::jsonb[])
           ) as min_estudio
    from ev
    group by ev.d_local, ev.session_id
  ),
  por_dia as (
    select t.d_local,
           round(sum(t.min_estudio), 2) as minutos,
           count(*)::integer as n_sesiones
    from tramos t
    group by t.d_local
  ),
  calendario as (
    select g::date as d_local
    from pg_catalog.generate_series(
           (p_desde at time zone v_tz)::date,
           ((p_hasta - interval '1 microsecond') at time zone v_tz)::date,
           interval '1 day') g
  )
  select c.d_local,
         coalesce(p.minutos, 0)::numeric,
         coalesce(p.n_sesiones, 0)::integer
  from calendario c
  left join por_dia p on p.d_local = c.d_local
  order by c.d_local;
end;
$$;
