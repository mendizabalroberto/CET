-- =============================================================================
-- 0062_informes_series.sql — series y comparativa para el scorecard del profesor
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Tres funciones nuevas encima de lo que ya dejó 0053:
--   · app.informe_alumno_serie_diaria        — minutos por día, CON CEROS
--   · app.informe_alumno_tiempo_por_leccion  — dónde se atasca
--   · app.informe_alumno_cohorte             — el alumno frente a SU clase
--
-- Y dos auxiliares que existen para que las tres midan lo mismo que 0053:
--   · app.ms_descontables            — qué se descuenta del tiempo en pantalla
--   · app.informe_alumno_metricas_bruto — las 9 métricas del resumen, SIN guardián
--   · app.zona_horaria_alumno        — la zona horaria, como la resuelve habitos
--
-- -----------------------------------------------------------------------------
-- CÓMO SE MIDE EL TIEMPO (y por qué así)
-- -----------------------------------------------------------------------------
-- La definición NO es nueva: sale tal cual de `app.informe_alumno_resumen`
-- (0053, columna `minutos_estudio`) y aquí se reutiliza carácter por carácter:
--
--     greatest(
--       extract(epoch from (max(server_ts) - min(server_ts)))
--       - (idleMs de idle_end + awayMs de focus_gained) / 1000.0,
--       0) / 60.0
--
-- Es decir: el hueco entre el primer y el último evento de una sesión, menos lo
-- que el propio cliente declaró como inactividad, en minutos. Se agrupa por
-- sesión y se suma.
--
-- Lo único que se ha factorizado es el «qué se descuenta», a `ms_descontables`,
-- para que las cuatro funciones que lo necesitan no lleven cuatro copias de la
-- misma lista de event_types. La aritmética que las envuelve es idéntica a la de
-- 0053, y `supabase/tests/informes_series.sql` lo ancla con un assert que compara
-- las nueve métricas de `informe_alumno_metricas_bruto` una a una contra
-- `informe_alumno_resumen`: si alguien toca una de las dos, el test se pone rojo.
-- Es la única defensa real contra la divergencia, porque 0053 no se puede editar.
--
-- Esta definición NO es perfecta y conviene saberlo antes de fiarse del número:
--   · Una sesión de un solo evento mide 0 minutos, aunque el niño estuviera
--     leyendo diez minutos antes de cerrar la pestaña.
--   · Si el cliente no emite `idle_end`/`focus_gained` (pestaña matada, batería),
--     el tiempo se sobreestima: cuenta como estudio todo lo que queda hasta el
--     último evento que sí llegó.
--   · Depende de payload declarado por el cliente, que es manipulable.
-- No se cambia aquí a propósito: dos definiciones distintas en el mismo
-- scorecard es peor que una definición discutible pero única.

-- -----------------------------------------------------------------------------
-- Se sueltan antes de recrear, por el mismo motivo que 0053 lo documenta:
-- `create or replace` no puede cambiar el tipo de retorno, y con funciones
-- `returns table (...)` eso incluye añadir o retipar UNA columna. Sin los drops
-- la migración solo se aplicaría en una base virgen.
-- -----------------------------------------------------------------------------
drop function if exists app.informe_alumno_serie_diaria(uuid, timestamptz, timestamptz);
drop function if exists app.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz);
drop function if exists app.informe_alumno_cohorte(uuid, timestamptz, timestamptz);
drop function if exists app.informe_alumno_metricas_bruto(uuid, timestamptz, timestamptz);
drop function if exists app.zona_horaria_alumno(uuid, timestamptz, timestamptz);
drop function if exists app.ms_descontables(text, jsonb);


-- =============================================================================
-- ms_descontables — los milisegundos que NO cuentan como estudio
-- =============================================================================
-- Devuelve 0, nunca NULL, y esto no es una manía de estilo: si devolviera NULL
-- para los eventos que no descuentan nada, `sum()` sobre una sesión sin ningún
-- idle daría NULL, la resta daría NULL, y `greatest(NULL, 0)` en Postgres NO es
-- NULL sino 0 — greatest ignora los nulos. Resultado: toda sesión sin idle
-- mediría CERO minutos, y el informe lo diría sin pestañear. Es exactamente la
-- clase de fallo que un test de «devuelve un número» no ve.
create or replace function app.ms_descontables(p_event_type text, p_payload jsonb)
returns numeric
language sql
immutable
as $$
  select case p_event_type
           when 'idle_end'     then coalesce((p_payload->>'idleMs')::numeric, 0)
           when 'focus_gained' then coalesce((p_payload->>'awayMs')::numeric, 0)
           else 0
         end;
$$;

comment on function app.ms_descontables(text, jsonb) is
  'ms que se descuentan del tiempo en pantalla (idle_end.idleMs + focus_gained.awayMs). Nunca NULL.';

revoke all on function app.ms_descontables(text, jsonb) from public;
grant execute on function app.ms_descontables(text, jsonb) to authenticated, service_role;


-- =============================================================================
-- zona_horaria_alumno — la misma resolución que usa informe_alumno_habitos
-- =============================================================================
-- habitos (0053) coge el `timezone` del último `session_context` de la ventana y
-- cae a 'UTC' si no hay ninguno. Aquí se hace igual, con UNA defensa de más: se
-- comprueba contra pg_timezone_names antes de devolverlo. El payload lo escribe
-- el navegador; un `timezone` basura hace que `at time zone` reviente con «time
-- zone not recognized», y un informe que explota es peor que un informe en UTC.
-- Es endurecer, no debilitar: cuando la zona es válida —el caso real— el
-- resultado es idéntico al de habitos.
create or replace function app.zona_horaria_alumno(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select le.payload->>'timezone'
    from public.learning_events le
    where le.student_id = p_student_id
      and le.event_type::text = 'session_context'
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
      and exists (
        select 1 from pg_catalog.pg_timezone_names z
        where z.name = le.payload->>'timezone')
    order by le.server_ts desc, le.seq desc
    limit 1
  ), 'UTC');
$$;

comment on function app.zona_horaria_alumno(uuid, timestamptz, timestamptz) is
  'Zona horaria del alumno segun el ultimo session_context valido de la ventana; UTC si no hay.';

-- Sin guardián propio: solo devuelve una cadena tipo 'Europe/Madrid', no datos
-- del menor. Aun así se revoca a public y se concede explícitamente.
revoke all on function app.zona_horaria_alumno(uuid, timestamptz, timestamptz) from public;
grant execute on function app.zona_horaria_alumno(uuid, timestamptz, timestamptz) to authenticated, service_role;


-- =============================================================================
-- informe_alumno_metricas_bruto — las 9 métricas del resumen, en formato largo
-- =============================================================================
-- Existe por una razón concreta: `informe_alumno_cohorte` necesita las métricas
-- de VARIOS alumnos (los compañeros de clase) y no puede llamar a
-- `app.informe_alumno_resumen` para cada uno, porque esa función invoca
-- `puede_ver_informe(compañero)` y reventaría — el profesor está autorizado
-- sobre el alumno del informe, no necesariamente sobre cada compañero uno a uno.
--
-- Por eso esta función NO lleva guardián. Y por eso NO se concede a
-- `authenticated`: quien la ejecutase leería las métricas de cualquier menor sin
-- comprobación ninguna. Solo la llaman las funciones de este fichero, que sí son
-- `security definer` y sí llaman al guardián en su primera línea; al correr como
-- propietario no necesitan GRANT.
--
-- El formato largo (una fila por métrica) no es capricho: convierte el pivote de
-- la comparativa con la cohorte en un `group by` trivial y evita repetir nueve
-- veces la misma media.
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
    -- La definición de 0053, literal. Ver la cabecera del fichero.
    select greatest(
             extract(epoch from (max(ev.server_ts) - min(ev.server_ts)))
             - coalesce(sum(app.ms_descontables(ev.event_type::text, ev.payload)), 0) / 1000.0,
             0) / 60.0 as min_estudio
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

-- `authenticated` queda FUERA a propósito (ver el bloque de arriba).
revoke all on function app.informe_alumno_metricas_bruto(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_metricas_bruto(uuid, timestamptz, timestamptz) to service_role;


-- =============================================================================
-- 1 · informe_alumno_serie_diaria — minutos por día, con los ceros dentro
-- =============================================================================
-- Un día sin estudiar es un DATO. Si la fila no viene, la gráfica une el punto
-- del lunes con el del jueves y dibuja una constancia que no existió. Por eso el
-- calendario se genera con `generate_series` y los días sin eventos salen con
-- `minutos_estudio = 0`, no ausentes.
--
-- El día es el día LOCAL del alumno, resuelto igual que en habitos: una sesión de
-- las 23:40 en Santiago es del martes aunque en UTC sea ya miércoles, y agrupar
-- en UTC movería de día justo las sesiones nocturnas —las que más dicen sobre
-- los hábitos de estudio.
--
-- El tiempo se mide por (día, sesión) y no por sesión a secas: una sesión que
-- cruza la medianoche local reparte sus minutos entre los dos días en vez de
-- cargárselos enteros a uno. Cuando ninguna sesión cruza —el caso normal— la
-- suma de la serie es exactamente el `minutos_estudio` del resumen, y el test lo
-- comprueba.
create or replace function app.informe_alumno_serie_diaria(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  -- `fecha` y no `dia`: dentro de plpgsql los parámetros OUT compiten con los
  -- nombres de columna de la propia consulta, y `dia` aparece en los CTE.
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
           greatest(
             extract(epoch from (max(ev.server_ts) - min(ev.server_ts)))
             - coalesce(sum(app.ms_descontables(ev.event_type::text, ev.payload)), 0) / 1000.0,
             0) / 60.0 as min_estudio
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
    -- La ventana es semiabierta [desde, hasta), así que el último día es el de
    -- `hasta` menos un instante. Sin ese microsegundo, un `hasta` que cae justo
    -- en la medianoche local añadiría un día de relleno que no está en la
    -- ventana — una barra de cero permanente al borde de toda gráfica.
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

revoke all on function app.informe_alumno_serie_diaria(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_serie_diaria(uuid, timestamptz, timestamptz) to authenticated, service_role;


-- =============================================================================
-- 2 · informe_alumno_tiempo_por_leccion — dónde se atasca
-- =============================================================================
-- CÓMO SE ATRIBUYE EL TIEMPO A UNA LECCIÓN
-- `learning_events.lesson_id` viene relleno en los eventos de contenido
-- (`lesson_opened`, `lesson_block_viewed`, `lesson_completed`) y VACÍO en los que
-- ocurren mientras tanto (`idle_end`, `focus_gained`, `ui_interaction`...). Si se
-- contaran solo los eventos con lesson_id, el tiempo de una lección sería la
-- distancia entre sus dos o tres marcas y el idle nunca se descontaría.
--
-- Así que se arrastra el contexto: dentro de una sesión, y por orden de `seq`,
-- cada evento hereda el último `lesson_id` no nulo que se vio antes. Los eventos
-- anteriores a la primera lección (el `session_context`, el menú) heredan NULL y
-- quedan fuera. Una VISITA es un tramo consecutivo con la misma lección; volver a
-- una lección tras pasar por otra abre una visita nueva, y `visitas` las cuenta.
--
-- El tiempo de cada visita se mide con la MISMA fórmula de 0053 (span menos
-- inactividad declarada), aplicada al tramo en vez de a la sesión entera.
--
-- CONSECUENCIA QUE HAY QUE SABER LEER: la suma de `minutos` de todas las
-- lecciones es MENOR O IGUAL que el `minutos_estudio` del resumen. El hueco entre
-- el último evento de una lección y el primero de la siguiente no se le carga a
-- ninguna de las dos. Es deliberado: repartir ese hueco sería inventarse a cuál
-- de las dos pertenece. Un scorecard que presente estos minutos como un desglose
-- exhaustivo del total estaría mintiendo; son «minutos atribuibles».
create or replace function app.informe_alumno_tiempo_por_leccion(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  -- `leccion_id` y no `lesson_id`: el OUT de plpgsql chocaría con la columna
  -- homónima de learning_events dentro de la propia consulta.
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
    -- `count(lesson_id)` acumulado ignora los NULL, así que el contador solo sube
    -- en los eventos que SÍ traen lección: todos los eventos posteriores comparten
    -- número de bloque con el que la fijó. Es la forma de hacer un
    -- `last_value(... ignore nulls)`, que Postgres no tiene.
    select ev.*,
           count(ev.lesson_id) over (
             partition by ev.session_id order by ev.seq
             rows between unbounded preceding and current row) as bloque
    from ev
  ),
  arrastrado as (
    -- La fila que fijó el bloque es, por construcción, la PRIMERA de su bloque:
    -- el contador sube justo en ella. Así que `first_value` recupera la lección
    -- del bloque. (`max()` sería lo natural aquí y no compila: Postgres no tiene
    -- un agregado max() para uuid.)
    select b.*,
           first_value(b.lesson_id) over (
             partition by b.session_id, b.bloque order by b.seq
             rows between unbounded preceding and unbounded following) as leccion
    from bloques b
  ),
  -- Dos pasos y no uno: `sum(... lag(...) ...) over ()` es una función de
  -- ventana dentro de otra, y Postgres lo rechaza con «window function calls
  -- cannot be nested». Hay que materializar el lag antes de acumularlo.
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
           greatest(
             extract(epoch from (max(m.server_ts) - min(m.server_ts)))
             - coalesce(sum(app.ms_descontables(m.event_type::text, m.payload)), 0) / 1000.0,
             0) / 60.0 as min_estudio
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
    -- El encargo dice «cada lección ABIERTA en la ventana»: la lista la manda
    -- `lesson_opened`. Una lección con eventos arrastrados pero sin apertura
    -- dentro de la ventana (se abrió antes) no aparece.
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
  -- Por POSICIÓN: dentro de plpgsql `order by minutos` sería ambiguo entre la
  -- columna de salida y el parámetro OUT que se llama igual (0053 documenta el
  -- mismo tropiezo en informe_alumno_botones).
  order by 2 desc, 1;
end;
$$;

comment on function app.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz) is
  'Minutos atribuibles y numero de visitas por leccion abierta en la ventana. La suma es <= minutos_estudio.';

revoke all on function app.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz) to authenticated, service_role;


-- =============================================================================
-- 3 · informe_alumno_cohorte — el alumno frente a la media de SU clase
-- =============================================================================
-- La cohorte son los perfiles con `role_in_section = 'student'` que comparten
-- alguna `section` con él (`section_members`), Y ÉL INCLUIDO: lo que un profesor
-- lee como «la media de la clase» incluye a todos los de la clase. Si el alumno
-- no está en ninguna clase, la cohorte es vacía (`tamano_cohorte = 0`).
--
-- Los compañeros sin ningún evento cuentan como 0 y NO se excluyen de la media.
-- Son la mitad del sentido de la métrica: una media de esfuerzo calculada solo
-- sobre los que estudiaron no es la media de la clase, es la media de los
-- aplicados, y hace que el alumno del informe parezca peor de lo que está.
--
-- -----------------------------------------------------------------------------
-- COHORTE PEQUEÑA: el tamaño se devuelve SIEMPRE; la media, no
-- -----------------------------------------------------------------------------
-- `tamano_cohorte` sale en todas las filas y sin condiciones, para que quien
-- pinte esto pueda decidir no enseñar la media. Pero por debajo de 3 la media no
-- se devuelve (NULL), y el motivo no es estadístico sino de protección de datos:
--   · con 1, la «media de la clase» ES el propio alumno — una cifra que finge ser
--     una comparación y no lo es;
--   · con 2, la media y el valor del alumno bastan para DESPEJAR el valor exacto
--     del único compañero: media*2 - valor_alumno. Esta función se la puede
--     llamar el propio alumno o su tutor (`puede_ver_alumno` les abre la puerta),
--     así que devolver esa media sería entregarles los minutos de estudio, el
--     porcentaje de acierto y las pistas pedidas de otro menor, con nombre y
--     apellidos deducibles: en una clase de dos, el otro solo puede ser uno.
-- Dejar la decisión al cliente no valdría: el dato ya habría salido de la base.
-- No se calcula percentil ni desviación por el mismo motivo por el que no se
-- calcula con cuatro datos — no significarían nada y parecerían rigurosos.
create or replace function app.informe_alumno_cohorte(
  p_student_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  metrica text,
  valor_alumno numeric,
  media_cohorte numeric,
  tamano_cohorte integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- EL UMBRAL DE COHORTE. Vive aquí y se copia en `MIN_COHORTE`
  -- (`packages/ui/src/reports/scorecard-data.ts`); los dos los ata
  -- `packages/ui/__tests__/umbral-de-cohorte.test.ts`, que lee ESTE fichero.
  --
  -- Cinco, y por DOS motivos que apuntan al mismo número:
  --
  --  1. Privacidad. Con 2 alumnos, `media * 2 - valor_del_alumno` despeja el
  --     valor exacto del único compañero, y esta función la puede llamar el
  --     propio alumno o su tutor. Con 5 ya no se despeja a nadie.
  --  2. Estadística. Con menos de 5, un solo compañero mueve la media más de un
  --     20 %: es la regla de supresión de celdas pequeñas que se usa en
  --     estadística educativa, y existe para que nadie concluya nada sobre un
  --     niño a partir de tres datos.
  --
  -- El primer motivo se decidió aquí y el segundo en la pantalla, cada uno por
  -- su lado y con números distintos (3 y 5). Se unifican en el mayor: cubre los
  -- dos, y un umbral por capa es la forma en que dos mitades de la misma
  -- decisión se separan sin que nadie lo vea.
  c_min_cohorte constant integer := 5;
  v_cohorte uuid[];
  v_n integer;
begin
  perform app.puede_ver_informe(p_student_id);

  select coalesce(array_agg(distinct companero.profile_id), '{}'::uuid[])
    into v_cohorte
  from public.section_members yo
  join public.section_members companero on companero.section_id = yo.section_id
  where yo.profile_id = p_student_id
    and yo.role_in_section = 'student'::public.section_role
    and companero.role_in_section = 'student'::public.section_role;

  v_n := coalesce(array_length(v_cohorte, 1), 0);

  return query
  with alumno as (
    select m.ord, m.metrica, m.valor
    from app.informe_alumno_metricas_bruto(p_student_id, p_desde, p_hasta) m
  ),
  cohorte as (
    select c.metrica, c.valor
    from pg_catalog.unnest(v_cohorte) as miembro(id)
    cross join lateral app.informe_alumno_metricas_bruto(miembro.id, p_desde, p_hasta) c
  )
  select a.metrica,
         a.valor,
         case when v_n >= c_min_cohorte
              then (select round(avg(k.valor), 2)
                      from cohorte k where k.metrica = a.metrica)
         end::numeric,
         v_n
  from alumno a
  order by a.ord;
end;
$$;

comment on function app.informe_alumno_cohorte(uuid, timestamptz, timestamptz) is
  'Valor del alumno vs media de su clase para las 9 metricas del resumen. tamano_cohorte siempre; media NULL si el tamano < 3.';

revoke all on function app.informe_alumno_cohorte(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_cohorte(uuid, timestamptz, timestamptz) to authenticated, service_role;
