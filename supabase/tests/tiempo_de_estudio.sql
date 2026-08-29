-- =============================================================================
-- tiempo_de_estudio.sql — pgTAP para 0064_tiempo_de_estudio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Demuestra las cuatro cosas que el encargo pide, en este orden:
--
--   1. Una sesión con un hueco largo y SIN `idle_end` deja de medir el span
--      entero — es el caso que produjo los 405 minutos de un solo día.
--   2. Una sesión de estudio continuo NO pierde ni un minuto. Es el caso que se
--      rompe al arreglar el primero: un tope demasiado agresivo convierte una
--      cifra inflada en una cifra pequeña, y es igual de mentira.
--   3. Las dos implementaciones de la fórmula —`informe_alumno_resumen` (0053) y
--      `informe_alumno_metricas_bruto` (0062)— siguen coincidiendo métrica a
--      métrica, con la técnica de comparación de `informes_series.sql`.
--   4. El umbral está fijado A MANO aquí, en varios asserts, y no derivado de la
--      constante de la migración: si alguien lo cambia, tiene que venir a leer
--      por qué son 30 minutos (la distribución real de huecos está en la
--      cabecera de `0064_tiempo_de_estudio.sql`).
--
-- La migración se aplica AQUÍ DENTRO, en la misma transacción que el `rollback`
-- final deshace. La base de producción no se toca: `db-apply` no interviene.
-- =============================================================================
begin;

select plan(18);

-- La migración bajo prueba. `\ir` es relativo al fichero que incluye.
\ir ../migrations/0064_tiempo_de_estudio.sql

-- El mundo compartido: colegios Alfa y Beta, profesores y alumnos.
\ir helpers/fixture.psql


-- -----------------------------------------------------------------------------
-- Anclas temporales
-- -----------------------------------------------------------------------------
-- `pg_temp.t(n)` = las 08:00 de HOY en Santiago más n minutos, como timestamptz. Todo
-- cuelga de `now()` para no depender de qué particiones mensuales existan, y
-- todo cae dentro del MISMO día local: así la serie diaria tiene un solo día y
-- su suma se puede comparar con el resumen sin que el reparto de una sesión que
-- cruza la medianoche enturbie la comparación (eso ya lo cubre informes_series).
create or replace function pg_temp.t(p_min numeric)
returns timestamptz language sql stable as $fn$
  select (date_trunc('day', now() at time zone 'America/Santiago')
          + interval '8 hours'
          + (p_min || ' minutes')::interval)
         at time zone 'America/Santiago';
$fn$;


-- -----------------------------------------------------------------------------
-- Se retira la telemetría que trae el fixture
-- -----------------------------------------------------------------------------
-- El fixture siembra un `attempt_started` suelto para s1a y otro para s1b. Si se
-- quedan, contaminan cada suma de este fichero con una sesión de más. El DELETE
-- va DENTRO de un assert por el mismo motivo que en `informes_series.sql`: un
-- borrado que no borra nada seguiría adelante en silencio y todas las cifras de
-- abajo saldrían desplazadas.
create or replace function pg_temp.limpiar_telemetria()
returns integer language plpgsql as $fn$
declare n integer;
begin
  delete from public.learning_events
  where student_id in ('aaaaaaaa-0000-4000-8000-00000000003a',
                       'aaaaaaaa-0000-4000-8000-00000000004a',
                       'bbbbbbbb-0000-4000-8000-00000000003b');
  get diagnostics n = row_count;
  return n;
end $fn$;

select is(
  pg_temp.limpiar_telemetria(),
  2,
  'el fixture traia exactamente 2 eventos de telemetria y se han retirado'
);


-- -----------------------------------------------------------------------------
-- Telemetría del alumno del informe (s1a, colegio Alfa): tres sesiones
-- -----------------------------------------------------------------------------
--   P · ESTUDIO CONTINUO, sin ningún idle_end
--     08:00, 08:00, 08:05, 08:12, 08:20  →  huecos de 0, 5, 7 y 8 min
--     Todos por debajo del umbral, así que la suma de huecos ES el span: 20 min.
--     Este es el caso que un tope agresivo estropearía.
--
--   Q · PESTAÑA ABANDONADA, sin ningún idle_end — el caso del encargo
--     09:00, 09:05, 09:10, 13:10  →  huecos de 5, 5 y 240 min
--     El span es de 250 minutos y hoy el informe los cuenta ENTEROS, porque el
--     cliente murió sin declarar nada. Con el tope: 5 + 5 + 30 = 40 min.
--
--   R · UNA PAUSA CORTA Y DECLARADA
--     14:40, 14:55 con `idle_end` de 60 s  →  hueco de 15 min, por debajo del
--     umbral, menos el minuto declarado: 14 min. Comprueba que el arreglo se
--     SUMA a lo que ya había en vez de sustituirlo.
--
--   Total esperado: 20 + 40 + 14 = 74 minutos. Antes del arreglo: 284.
--
-- Las tres sesiones abren la misma lección para que el desglose por lección sea
-- comparable con el total. `lesson_id` viaja solo en los eventos de contenido,
-- que es como llega de verdad.
insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, lesson_id, payload, server_ts)
values
  -- --- P · estudio continuo ---------------------------------------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a1', 0, 'session_context', null,
   '{"viewportW":800,"viewportH":600,"dpr":1,"pointer":"fine","modality":"mouse","theme":"light","locale":"es-CL","timezone":"America/Santiago","reducedMotion":false,"connection":"4g"}'::jsonb,
   pg_temp.t(0)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a1', 1, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.t(0)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a1', 2, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.t(5)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a1', 3, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.t(12)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a1', 4, 'lesson_completed',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.t(20)),

  -- --- Q · pestaña abandonada -------------------------------------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a2', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.t(60)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a2', 1, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.t(65)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a2', 2, 'answer_submitted', null,
   '{"isCorrect":false}'::jsonb, pg_temp.t(70)),
  -- Cuatro horas después llega un último evento. Entre medias no hay NADA: ni
  -- idle_end ni focus_gained, porque el cliente ya no estaba vivo para emitirlos.
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a2', 3, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.t(310)),

  -- --- R · pausa corta y declarada --------------------------------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a3', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.t(400)),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0aaa0000-0000-4000-8000-0000000000a3', 1, 'idle_end', null,
   '{"idleMs":60000}'::jsonb, pg_temp.t(415));


-- =============================================================================
-- El profesor de Alfa consulta. `true` = local a la transacción, se revierte.
-- =============================================================================
select set_config('request.jwt.claims',
                  '{"sub":"aaaaaaaa-0000-4000-8000-00000000002a"}', true);


-- -----------------------------------------------------------------------------
-- 1 · EL CASO QUE MOTIVÓ EL ENCARGO
-- -----------------------------------------------------------------------------
-- Antes de 0064 esta misma llamada devolvía 284.00: los 250 minutos enteros de
-- la sesión abandonada, más los 20 y los 14 de las otras dos.
select is(
  (select r.minutos_estudio from app.informe_alumno_resumen(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.t(-60), pg_temp.t(600)) r),
  74.00,
  'el resumen mide 74 min (20 + 40 + 14) y no los 284 del span crudo'
);

-- El span sigue siendo de 250 minutos: los datos son los que son y este assert
-- lo ancla. Si alguien "arreglara" el número cambiando la siembra en vez de la
-- fórmula, este assert se pondría rojo y el de arriba seguiría verde.
select is(
  (select round(extract(epoch from (max(le.server_ts) - min(le.server_ts)))::numeric / 60.0, 2)
     from public.learning_events le
    where le.session_id = '0aaa0000-0000-4000-8000-0000000000a2'),
  250.00,
  'la sesion abandonada abarca 250 minutos de reloj, hueco de 4 h incluido'
);

select is(
  (select app.minutos_de_estudio(
            array_agg(le.server_ts),
            sum(app.ms_descontables(le.event_type::text, le.payload)))
     from public.learning_events le
    where le.session_id = '0aaa0000-0000-4000-8000-0000000000a2'),
  40.00,
  'de esos 250 minutos solo 40 son estudio: 5 + 5 + el tope de 30 del hueco'
);


-- -----------------------------------------------------------------------------
-- 2 · EL CASO CONTRARIO, que es el que se rompe al arreglar el primero
-- -----------------------------------------------------------------------------
-- Ni un minuto de menos. Un tope de 10 minutos, por ejemplo, no tocaría esta
-- sesión, pero sí partiría por la mitad las pausas de 14 minutos que hay en los
-- datos reales de producción: la cabecera de 0064 lo documenta con la
-- distribución entera.
select is(
  (select app.minutos_de_estudio(
            array_agg(le.server_ts),
            sum(app.ms_descontables(le.event_type::text, le.payload)))
     from public.learning_events le
    where le.session_id = '0aaa0000-0000-4000-8000-0000000000a1'),
  20.00,
  'la sesion de estudio continuo mide sus 20 minutos exactos, sin descuentos fantasma'
);

select is(
  (select app.minutos_de_estudio(
            array_agg(le.server_ts),
            sum(app.ms_descontables(le.event_type::text, le.payload)))
     from public.learning_events le
    where le.session_id = '0aaa0000-0000-4000-8000-0000000000a3'),
  14.00,
  'una pausa DECLARADA se sigue descontando: 15 min de hueco menos 1 min de idle_end'
);


-- -----------------------------------------------------------------------------
-- 3 · LAS DOS IMPLEMENTACIONES SIGUEN COINCIDIENDO
-- -----------------------------------------------------------------------------
-- Misma técnica que `informes_series.sql`: las nueve métricas comparadas una a
-- una, con el formato de texto incluido. Si 0064 hubiera movido solo el helper
-- de 0062 —el error del intento anterior—, `metricas_bruto` diría 74 y
-- `informe_alumno_resumen` seguiría diciendo 284, y este assert lo cantaría.
select is(
  (select string_agg(m.metrica || '=' || m.valor::text, ' ' order by m.ord)
     from app.informe_alumno_metricas_bruto(
       'aaaaaaaa-0000-4000-8000-00000000003a',
       pg_temp.t(-60), pg_temp.t(600)) m),
  (select 'minutos_estudio='       || r.minutos_estudio::text
       || ' sesiones='             || r.sesiones::text
       || ' lecciones_abiertas='   || r.lecciones_abiertas::text
       || ' lecciones_completadas='|| r.lecciones_completadas::text
       || ' items_respondidos='    || r.items_respondidos::text
       || ' porcentaje_acierto='   || r.porcentaje_acierto::text
       || ' examenes_entregados='  || r.examenes_entregados::text
       || ' pistas_pedidas='       || r.pistas_pedidas::text
       || ' racha_maxima='         || r.racha_maxima::text
     from app.informe_alumno_resumen(
       'aaaaaaaa-0000-4000-8000-00000000003a',
       pg_temp.t(-60), pg_temp.t(600)) r),
  'metricas_bruto coincide metrica a metrica con informe_alumno_resumen tras el arreglo'
);

-- La gráfica tampoco puede quedarse atrás: las tres sesiones caen en el mismo
-- día local, así que la serie tiene que sumar exactamente lo mismo que la
-- tarjeta de arriba.
select is(
  (select sum(s.minutos_estudio) from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.t(-60), pg_temp.t(600)) s),
  (select r.minutos_estudio from app.informe_alumno_resumen(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.t(-60), pg_temp.t(600)) r),
  'la suma de la serie diaria sigue siendo el minutos_estudio del resumen'
);

-- Y el desglose por lección: las tres visitas son a la misma lección y no hay
-- tránsito entre lecciones, así que aquí la suma coincide con el total. Lo que
-- este assert vigila es que el desglose NO se quede sin topar: sin 0064 diría
-- 284 minutos atribuidos a una lección dentro de un total de 74.
select is(
  (select sum(l.minutos) from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.t(-60), pg_temp.t(600)) l),
  74.00,
  'el desglose por leccion tambien mide 74: el tope llega hasta el ultimo informe'
);


-- -----------------------------------------------------------------------------
-- 4 · EL UMBRAL, FIJADO A MANO: 30 MINUTOS
-- -----------------------------------------------------------------------------
-- Estos cuatro asserts NO leen la constante de la migración: escriben el número
-- otra vez. Si alguien cambia el umbral, tiene que pasar por aquí y leer por qué
-- son 30 minutos.
--
-- El porqué, en corto (la cabecera de 0064 trae la distribución completa de los
-- 716 huecos de producción): entre 20,27 min y 81,76 min NO HAY NI UN HUECO en
-- toda la base. Por debajo, pausas de niños que siguen delante de la pantalla;
-- por encima, exactamente dos abandonos, que son los que inflaban el informe.
-- 30 minutos cae en mitad de esa franja vacía: no recorta ningún estudio real y
-- corta los dos abandonos. Bajarlo de 20 pondría además en rojo
-- `informes_series.sql`, que espera 19 y 20 minutos de sesiones con huecos de 15
-- y 20 minutos.
select is(
  app.minutos_de_estudio(
    array['2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:29:00+00'::timestamptz],
    0),
  29.00,
  'un hueco de 29 minutos cuenta ENTERO: por debajo del umbral no se toca nada'
);

select is(
  app.minutos_de_estudio(
    array['2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:30:00+00'::timestamptz],
    0),
  30.00,
  'un hueco de 30 minutos EXACTOS cuenta entero: el umbral esta a mano en 30 min'
);

select is(
  app.minutos_de_estudio(
    array['2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:31:00+00'::timestamptz],
    0),
  30.00,
  'un hueco de 31 minutos ya se topa: cuenta 30 y se pierde el minuto de mas'
);

select is(
  app.minutos_de_estudio(
    array['2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 14:00:00+00'::timestamptz],
    0),
  30.00,
  'un hueco de 4 horas cuenta 30 minutos, no 240: es el caso de la pestana olvidada'
);


-- -----------------------------------------------------------------------------
-- Los bordes de la fórmula, que son los que se rompen sin avisar
-- -----------------------------------------------------------------------------
select is(
  app.minutos_de_estudio(
    array['2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:10:00+00'::timestamptz],
    60000),
  9.00,
  'lo declarado por el cliente se sigue restando: 10 min de hueco menos 1 min de idle'
);

-- Si lo declarado supera a lo medido —el payload lo escribe el navegador y se
-- puede manipular— el resultado es 0, no un tiempo negativo que luego se sumaria
-- a las demas sesiones y les restaria minutos reales.
select is(
  app.minutos_de_estudio(
    array['2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:10:00+00'::timestamptz],
    999999999),
  0.00,
  'un idleMs mayor que el tramo entero deja el tiempo en 0, nunca en negativo'
);

-- Un tramo de un solo evento mide 0 y no NULL. Un NULL aqui se propagaria a la
-- suma de la sesion y la dejaria en NULL, que el resumen mostraria como 0 para
-- TODO el alumno: la limitacion conocida se queda en una sesion, no se come el
-- informe. (0062 documenta este mismo riesgo en `ms_descontables`.)
select is(
  app.minutos_de_estudio(array['2026-01-01 10:00:00+00'::timestamptz], 0),
  0.00,
  'un tramo de un solo evento mide 0 minutos, no NULL'
);

select is(
  app.minutos_de_estudio(null, null),
  0.00,
  'sin marcas y sin declarado el resultado es 0, no NULL'
);


-- -----------------------------------------------------------------------------
-- El guardián sigue en pie: redefinir la función no lo ha soltado
-- -----------------------------------------------------------------------------
-- `create or replace` conserva los permisos, pero el guardián es una línea
-- DENTRO del cuerpo y el cuerpo se ha reescrito entero. Esta es la comprobación
-- de que no se ha caído por el camino.
select set_config('request.jwt.claims',
                  '{"sub":"bbbbbbbb-0000-4000-8000-00000000002b"}', true);

select throws_ok(
  $$select app.informe_alumno_resumen('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '1 day', now() + interval '1 day')$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'el profesor de Beta sigue sin poder ver el informe de un alumno de Alfa'
);

select finish();
rollback;
