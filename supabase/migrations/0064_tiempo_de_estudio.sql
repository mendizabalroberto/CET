-- =============================================================================
-- 0064_tiempo_de_estudio.sql — el tiempo de estudio deja de contar la pestaña
--                              olvidada como si fuera estudio
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL DEFECTO
-- -----------------------------------------------------------------------------
-- La fórmula de 0053 —reutilizada literalmente por 0062— mide una sesión como
-- «span entre el primer y el último evento, menos lo que el cliente DECLARÓ como
-- inactividad» (`idle_end.idleMs` + `focus_gained.awayMs`).
--
-- El agujero está en la palabra «declaró». Si el navegador muere sin llegar a
-- emitir `idle_end` —la pestaña que se cierra, la tableta que se apaga, el
-- portátil que se suspende— ese tiempo no se descuenta NUNCA, y el span sigue
-- creciendo hasta el último evento que sí llegó. Medido en producción el 29 de
-- agosto de 2026 sobre la ventana de 30 días:
--
--     minutos_estudio = 429,50   ·   28/08 = 405,83   (el 94 % en un solo día)
--
-- Casi siete horas seguidas «de estudio» en un niño de primaria. No lo eran.
--
-- -----------------------------------------------------------------------------
-- LA CORRECCIÓN: no confiar solo en lo declarado, mirar los huecos
-- -----------------------------------------------------------------------------
-- El tiempo de un tramo deja de ser `span - declarado` y pasa a ser
--
--     sum( least(hueco_entre_eventos_consecutivos, UMBRAL) ) - declarado
--
-- que es la MISMA cifra mientras todos los huecos sean menores que el umbral
-- —porque la suma de los huecos consecutivos ES el span— y solo se separa de
-- ella en los tramos donde hubo un silencio largo. Es decir: no reinterpreta el
-- estudio real, solo deja de pagar el silencio.
--
-- -----------------------------------------------------------------------------
-- EL UMBRAL: 30 MINUTOS, Y NO POR SER UNA CIFRA REDONDA
-- -----------------------------------------------------------------------------
-- Distribución REAL de los 716 huecos entre eventos consecutivos de una misma
-- sesión que hay hoy en `public.learning_events` (todo el histórico):
--
--     < 1 min .............. 698   97,49 %
--     1 – 5 min ............   9    1,26 %
--     5 – 10 min ...........   4    0,56 %
--     10 – 15 min ..........   2    0,28 %
--     15 – 20 min ..........   0
--     20 – 30 min ..........   1    0,14 %   (20,27 min)
--     30 – 60 min ..........   0
--     1 – 2 h ..............   1    0,14 %   (81,76 min)
--     > 2 h ................   1    0,14 %   (269,70 min)
--
--     p50 = 0 s · p90 = 10 s · p95 = 20 s · p99 = 449,9 s (7,5 min)
--
-- Los datos traen el umbral puesto: hay una FRANJA VACÍA entre 20,27 min y
-- 81,76 min. Por debajo están todas las pausas de un niño que sigue delante de
-- la pantalla (leer un enunciado, el baño, el recreo corto); por encima están
-- exactamente dos huecos, y esos dos son los que producen los 405 minutos del
-- informe. 30 minutos cae en mitad de esa franja: es el punto donde el corte no
-- toca NI UN SOLO hueco real de la base y sí corta los dos abandonos.
--
-- Efecto medido sobre la ventana de 30 días (misma consulta que dio 429,50):
--
--     sin tope .......... 429,50 min
--     tope 30 min ....... 138,04 min   <-- elegido
--     tope 20 min ....... 117,77 min
--     tope 10 min ........ 87,36 min
--
-- Por qué NO 10 minutos (que era la propuesta del intento anterior): 10 min
-- parte por la mitad el grupo de pausas reales —los huecos de 14,4 y 14,8 min
-- son estudio de verdad— y recorta 50 minutos que sí se estudiaron. Un número
-- inflado convertido en un número pequeño sigue siendo un número falso.
--
-- Por qué el umbral no puede bajar de 20 min aunque alguien quiera afinarlo:
-- `supabase/tests/informes_series.sql` siembra una sesión con un hueco de 15 min
-- y otra con uno de 20 min, y espera que midan 19 y 20 minutos. Un umbral por
-- debajo de 20 pondría ese fichero en rojo. Es una segunda opinión, escrita
-- antes y por otro motivo, sobre dónde está el límite de una pausa creíble.
--
-- -----------------------------------------------------------------------------
-- DÓNDE SE APLICA: EN UN SOLO SITIO, USADO POR LAS CUATRO
-- -----------------------------------------------------------------------------
-- Había dos implementaciones de la fórmula y NO compartían el punto que parecía
-- compartido: `app.ms_descontables` lo introdujo 0062 y `app.informe_alumno_
-- resumen` (0053) es anterior y no lo usa. Redefinir solo el helper mueve 0062 y
-- deja la cabecera del scorecard —justo la cifra del encargo— intacta.
--
-- Aquí se cierra de verdad: se crea `app.minutos_de_estudio(timestamptz[],
-- numeric)`, que contiene la aritmética ENTERA (los huecos, el tope, la resta de
-- lo declarado, la división a minutos) y es el único sitio del esquema donde
-- vive el umbral. Y se redefinen con `create or replace` las CUATRO funciones
-- que medían tiempo, para que las cuatro la llamen:
--
--     app.informe_alumno_resumen            (0053)
--     app.informe_alumno_metricas_bruto     (0062)
--     app.informe_alumno_serie_diaria       (0062)
--     app.informe_alumno_tiempo_por_leccion (0062)
--
-- Después de esta migración ninguna de las cuatro contiene aritmética de tiempo:
-- todas dicen `app.minutos_de_estudio(array_agg(...), sum(app.ms_descontables
-- (...)))`. Ya no hay dos definiciones que puedan divergir, hay una llamada
-- repetida cuatro veces. `ms_descontables` se queda EXACTAMENTE como estaba
-- —sigue siendo «qué declaró el cliente»— y esto se suma a ello.
--
-- 0053 y 0062 no se editan: están aplicadas y cambiar su texto haría saltar la
-- comprobación de huella de `db-apply`. Se redefinen desde aquí, que es la única
-- forma de que las dos se muevan a la vez.
--
-- Lo que esta migración NO arregla, para que nadie crea que sí:
--   · Una sesión de un solo evento sigue midiendo 0 minutos.
--   · El payload lo sigue escribiendo el cliente y sigue siendo manipulable.
--   · `informe_alumno_habitos.tasa_idle` sigue dividiendo por el span crudo: es
--     una proporción sobre tiempo en pantalla, no sobre tiempo de estudio, y
--     cambiarla aquí movería una métrica que este encargo no ha medido.
-- =============================================================================


-- =============================================================================
-- minutos_de_estudio — la fórmula, entera y en un solo sitio
-- =============================================================================
-- Recibe las marcas de tiempo de los eventos de UN tramo (una sesión, un día de
-- una sesión, una visita a una lección: quien llama decide qué es un tramo con
-- su `group by`) y los milisegundos que el cliente declaró como inactividad en
-- ese mismo tramo, que es lo que `app.ms_descontables` ya sabía sumar.
--
-- Las marcas se ordenan AQUÍ, por valor y no por `seq`: se está midiendo tiempo
-- de reloj, y un `seq` que llegue desordenado (informes_alumno.sql siembra uno
-- así a propósito) no debe cambiar la cuenta. Por eso quien llama puede pasar el
-- array sin ordenar.
--
-- Devuelve minutos, nunca NULL y nunca negativo:
--   · un array vacío o NULL da 0 (no hay tramo que medir);
--   · un tramo de un solo evento da 0, igual que antes: no hay ningún hueco que
--     sumar. Es la limitación que 0062 ya documentaba y aquí no cambia;
--   · si lo declarado supera a lo medido —el cliente puede mentir— el
--     `greatest(..., 0)` lo deja en 0 en vez de en un tiempo negativo.
create or replace function app.minutos_de_estudio(
  p_marcas timestamptz[],
  p_ms_declarados numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with huecos as (
    select extract(epoch from (m.marca - lag(m.marca) over (order by m.marca)))::numeric
             as seg
    from pg_catalog.unnest(p_marcas) as m(marca)
  )
  select greatest(
           -- EL UMBRAL. 1800 s = 30 min. Vive AQUÍ y en ningún otro sitio del
           -- esquema; la cabecera de este fichero trae la distribución de huecos
           -- que lo justifica y `supabase/tests/tiempo_de_estudio.sql` lo fija a
           -- mano en varios asserts. Cambiarlo obliga a pasar por los dos.
           coalesce((select sum(least(h.seg, 1800.0))
                       from huecos h
                      where h.seg is not null), 0)
           - coalesce(p_ms_declarados, 0) / 1000.0,
           0) / 60.0;
$$;

comment on function app.minutos_de_estudio(timestamptz[], numeric) is
  'Minutos de estudio de un tramo: suma de huecos entre eventos topados a 30 min, menos los ms declarados como inactividad. Nunca NULL ni negativo.';

-- Aritmética pura: no lee ni una fila, así que conceder no expone ningún dato de
-- ningún menor. Aun así se revoca a public primero, como el resto del esquema.
revoke all on function app.minutos_de_estudio(timestamptz[], numeric) from public;
grant execute on function app.minutos_de_estudio(timestamptz[], numeric)
  to authenticated, service_role;


-- =============================================================================
-- 1 · informe_alumno_resumen (0053) — la cifra de la cabecera del scorecard
-- =============================================================================
-- Se redefine ENTERA porque `create or replace` no admite parches: es el mismo
-- cuerpo de 0053 salvo la subconsulta `x`, que ya no hace aritmética de tiempo.
-- Las ocho métricas restantes son idénticas carácter por carácter.
--
-- Los GRANT de 0053 sobreviven a un `create or replace` (el ACL va con el objeto
-- y el objeto no se suelta), así que no se reponen aquí: reponerlos daría la
-- falsa impresión de que soltar y recrear sería equivalente. No lo sería —
-- soltar `informe_alumno_resumen` dejaría al scorecard sin permisos hasta el
-- siguiente grant.
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
    -- Antes aquí vivía la fórmula escrita a mano (`max - min` menos los idleMs y
    -- los awayMs sumados a pelo, con el `/ 60.0` que 0053 documenta). Ahora la
    -- fórmula está en `app.minutos_de_estudio` y esta función solo dice qué es un
    -- tramo: una sesión. La división a minutos también se fue con ella.
    select app.minutos_de_estudio(
             array_agg(le.server_ts),
             sum(app.ms_descontables(le.event_type::text, le.payload))
           ) as min_estudio
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde and le.server_ts < p_hasta
    group by le.session_id
  ) x;
end;
$$;

comment on function app.informe_alumno_resumen(uuid, timestamptz, timestamptz) is
  'Las 9 metricas del scorecard. El tiempo lo mide app.minutos_de_estudio (0064): los huecos sin actividad no cuentan.';


-- =============================================================================
-- 2 · informe_alumno_metricas_bruto (0062) — la segunda implementación
-- =============================================================================
-- Misma sustitución, mismo tramo (la sesión). Es la función que
-- `informes_series.sql` compara métrica a métrica contra la de arriba: las dos
-- tienen que moverse en la misma migración o el fichero se pone rojo, que es
-- justo para lo que se escribió ese assert.
create or replace function app.informe_alumno_metricas_bruto(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  ord integer,
  metrica text,
  valor numeric
)
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
    -- La definición de 0053, que ahora es una llamada. Ver la cabecera de 0064.
    select app.minutos_de_estudio(
             array_agg(ev.server_ts),
             sum(app.ms_descontables(ev.event_type::text, ev.payload))
           ) as min_estudio
    from ev
    group by ev.session_id
  ),
  resp as (
    select count(*) as n,
           count(*) filter (where ev.payload->>'isCorrect' = 'true') as aciertos
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
         (select coalesce(max((ev.payload->>'streak')::integer), 0)
            from ev where ev.event_type::text = 'practice_streak')::numeric;
$$;

comment on function app.informe_alumno_metricas_bruto(uuid, timestamptz, timestamptz) is
  'Las 9 metricas de informe_alumno_resumen en formato largo. SIN GUARDIAN: uso interno, no conceder a authenticated.';


-- =============================================================================
-- 3 · informe_alumno_serie_diaria (0062) — la gráfica
-- =============================================================================
-- El tramo aquí es (día local, sesión), y sigue siéndolo: lo único que cambia es
-- quién hace la aritmética. Si la serie no se moviera con el resumen, la gráfica
-- y la tarjeta de arriba dirían cifras distintas —y hay un assert en
-- `informes_series.sql` que compara la suma de la serie con el resumen.
create or replace function app.informe_alumno_serie_diaria(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  fecha date,
  minutos_estudio numeric,
  sesiones integer
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
           app.minutos_de_estudio(
             array_agg(ev.server_ts),
             sum(app.ms_descontables(ev.event_type::text, ev.payload))
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

comment on function app.informe_alumno_serie_diaria(uuid, timestamptz, timestamptz) is
  'Minutos de estudio por dia local del alumno, con los dias sin actividad incluidos como 0.';


-- =============================================================================
-- 4 · informe_alumno_tiempo_por_leccion (0062) — dónde se atasca
-- =============================================================================
-- El tramo es la VISITA (sesión + isla de lección), y el arrastre de contexto,
-- las visitas y las aperturas se quedan exactamente como estaban. Se mueve con
-- las otras tres por una razón concreta: si el total se topara y el desglose no,
-- una sola lección podría mostrar más minutos que el total de estudio del que
-- forma parte. El desglose sigue sumando MENOS o igual que el total, que es el
-- contrato que 0062 documenta y que `informes_series.sql` congela.
create or replace function app.informe_alumno_tiempo_por_leccion(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  leccion_id uuid,
  minutos numeric,
  visitas integer,
  aperturas integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(p_student_id);

  return query
  with ev as (
    select le.session_id, le.seq, le.server_ts, le.event_type, le.payload, le.lesson_id
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  bloques as (
    select ev.*,
           count(ev.lesson_id) over (
             partition by ev.session_id order by ev.seq
             rows between unbounded preceding and current row) as bloque
    from ev
  ),
  arrastrado as (
    select b.*,
           first_value(b.lesson_id) over (
             partition by b.session_id, b.bloque order by b.seq
             rows between unbounded preceding and unbounded following) as leccion
    from bloques b
  ),
  cambios as (
    select a.*,
           case
             when a.leccion is distinct from
                  lag(a.leccion) over (partition by a.session_id order by a.seq)
             then 1 else 0 end as abre_isla
    from arrastrado a
  ),
  marcado as (
    select c.*,
           sum(c.abre_isla) over (
             partition by c.session_id order by c.seq
             rows between unbounded preceding and current row) as isla
    from cambios c
  ),
  islas as (
    select m.leccion,
           app.minutos_de_estudio(
             array_agg(m.server_ts),
             sum(app.ms_descontables(m.event_type::text, m.payload))
           ) as min_estudio
    from marcado m
    where m.leccion is not null
    group by m.session_id, m.isla, m.leccion
  ),
  por_leccion as (
    select i.leccion,
           round(sum(i.min_estudio), 2) as minutos,
           count(*)::integer as visitas
    from islas i
    group by i.leccion
  ),
  abiertas as (
    select ev.lesson_id as leccion, count(*)::integer as aperturas
    from ev
    where ev.event_type::text = 'lesson_opened'
      and ev.lesson_id is not null
    group by ev.lesson_id
  )
  select ab.leccion,
         coalesce(pl.minutos, 0)::numeric,
         coalesce(pl.visitas, 0)::integer,
         ab.aperturas
  from abiertas ab
  left join por_leccion pl on pl.leccion = ab.leccion
  order by 2 desc, 1;
end;
$$;

comment on function app.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz) is
  'Minutos atribuibles y numero de visitas por leccion abierta en la ventana. La suma es <= minutos_estudio.';
