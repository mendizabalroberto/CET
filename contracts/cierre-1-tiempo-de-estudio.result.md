# Resultado - cierre-1-tiempo-de-estudio
- Contrato: `contracts/cierre-1-tiempo-de-estudio.md`
- Motor: kimi-code CLI
- Modelo: kimi-code/kimi-for-coding
- Desenlace: **verde**
- Rondas consumidas: 2 de 4
- Rama: `kimi/cierre-1-tiempo-de-estudio`
- Duracion: 1546.8 s
## Lo que dijo el agente

He vuelto a dejar los cambios escritos en el territorio permitido:

- `supabase/migrations/0064_tiempo_de_estudio.sql`
- `supabase/tests/tiempo_de_estudio.sql`

## Qué hace la solución

El arreglo va por **tope por hueco** sin tocar `0053` ni `0062`:

1. Un trigger `BEFORE INSERT` en `public.learning_events` calcula, para cada evento, el gap desde el evento anterior de la misma sesión y lo guarda en el payload como `_gapMs`.
2. `app.ms_descontables` se redefine para leer `_gapMs` y descontar el exceso sobre **10 minutos** (600000 ms). Los `idle_end`/`focus_gained` siguen usando los milisegundos declarados por el cliente.
3. `0053` e `0062` usan `app.ms_descontables` con su firma original, así que ambas implementaciones heredan el arreglo sin modificarlos.

## Verificación ejecutada

El comando de verificación del contrato pasa con código de salida **0**:

```bash
node scripts/deepseek/validar-sql.mjs supabase/migrations/0064_tiempo_de_estudio.sql supabase/tests/tiempo_de_estudio.sql app.ms_descontables
```

Salida:

```
  ok  supabase/migrations/0064_tiempo_de_estudio.sql: 1 funcion(es), forma correcta.
```

## Qué demuestra el test

El test `supabase/tests/tiempo_de_estudio.sql` cubre los cuatro puntos del encargo:

1. **Caso del hueco largo**: una sesión de 2 h sin `idle_end` mide 13 min, no 120.
2. **Caso continuo**: una sesión de 15 min con gaps pequeños sigue midiendo 15 min.
3. **Coherencia**: compara `informe_alumno_resumen` contra `informe_alumno_metricas_bruto` métrica a métrica, igual que `informes_series.sql`.
4. **Umbral fijado a mano**: asserts directos sobre `app.ms_descontables` con `_gapMs` de 60 min, 10 min y 10 min 1 s.

También incluye un `throws_ok` con `42501` para el aislamiento entre colegios.

No puedo ejecutar pgTAP localmente porque en este entorno no hay `psql`, `pg_prove`, Docker ni credenciales de base de datos; el validador ejecutable es el único criterio que puedo corroborar aquí.

## Diff

~~~diff
diff --git a/supabase/migrations/0064_tiempo_de_estudio.sql b/supabase/migrations/0064_tiempo_de_estudio.sql
new file mode 100644
index 0000000..7fbf586
--- /dev/null
+++ b/supabase/migrations/0064_tiempo_de_estudio.sql
@@ -0,0 +1,125 @@
+-- =============================================================================
+-- 0064_tiempo_de_estudio.sql — descuenta huecos de inactividad no declarados
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+-- El problema: si el cliente muere sin emitir `idle_end`, el span de la sesión
+-- sigue creciendo hasta el último evento. Una pestaña abierta de fondo puede
+-- convertir 10 minutos de estudio en 400.
+--
+-- La solución: tope por hueco. Entre dos eventos consecutivos de una sesión,
+-- solo cuentan como estudio los primeros 10 minutos. El exceso se descuenta
+-- igual que si hubiera llegado un `idle_end`.
+--
+-- Por qué 10 minutos: es el umbral que separa una pausa dentro de una sesión
+-- de estudio (ir al baño, leer un enunciado largo) de una pestaña abandonada.
+-- Se ha fijado a mano en este fichero y en el test; la consulta para ajustarlo
+-- con datos reales es:
+--
+--   select percentile_cont(0.95) within group (order by gap_ms)
+--   from (
+--     select extract(epoch from (server_ts - lag(server_ts) over
+--       (partition by session_id order by seq))) * 1000 as gap_ms
+--     from public.learning_events
+--   ) g
+--   where gap_ms is not null;
+--
+-- Implementación:
+--   · Un trigger BEFORE INSERT calcula el gap desde el evento anterior de la
+--     misma sesión y lo guarda en el payload como `_gapMs`.
+--   · app.ms_descontables lee `_gapMs` y descuenta el exceso sobre el umbral.
+--   · No se tocan 0053 ni 0062: ambos usan app.ms_descontables y heredan el
+--     arreglo automáticamente.
+-- =============================================================================
+
+-- -----------------------------------------------------------------------------
+-- Trigger: enriquecer el payload con el gap desde el evento anterior
+-- -----------------------------------------------------------------------------
+-- La función NO es security definer: debe ejecutarse con los privilegios del
+-- invocador para que la RLS limite la lectura a los eventos propios de la
+-- sesión. El search_path vacío evita que un esquema malicioso del llamante
+-- reemplace tablas del sistema.
+create or replace function app.learning_events_calc_gap()
+returns trigger
+language plpgsql
+set search_path = ''
+as $$
+declare
+  v_prev_ts timestamptz;
+begin
+  -- El gap solo tiene sentido dentro de la misma sesión y en orden de seq.
+  select le.server_ts into v_prev_ts
+    from public.learning_events le
+   where le.session_id = NEW.session_id
+     and le.seq < NEW.seq
+   order by le.seq desc
+   limit 1;
+
+  if v_prev_ts is not null then
+    NEW.payload := jsonb_set(
+      NEW.payload,
+      '{_gapMs}',
+      to_jsonb(extract(epoch from (NEW.server_ts - v_prev_ts)) * 1000.0)
+    );
+  end if;
+
+  return NEW;
+end;
+$$;
+
+comment on function app.learning_events_calc_gap() is
+  'Trigger que añade _gapMs al payload: ms desde el evento anterior de la misma sesión.';
+
+revoke all on function app.learning_events_calc_gap() from public;
+grant execute on function app.learning_events_calc_gap() to service_role;
+
+-- Soltamos el trigger si existe para que la migración sea reaplicable.
+drop trigger if exists learning_events_calc_gap on public.learning_events;
+
+create trigger learning_events_calc_gap
+  before insert on public.learning_events
+  for each row
+  execute function app.learning_events_calc_gap();
+
+
+-- -----------------------------------------------------------------------------
+-- ms_descontables — descuento de un evento, ahora con tope por hueco
+-- -----------------------------------------------------------------------------
+-- Devuelve los milisegundos que NO cuentan como estudio para este evento:
+--   · idle_end.idleMs y focus_gained.awayMs, cuando el cliente los declaró.
+--   · El exceso de _gapMs sobre el umbral de 10 minutos.
+--   · 0 en cualquier otro caso.
+--
+-- Nunca NULL: un NULL en la suma haría que greatest(NULL, 0) devolviera 0 y
+-- toda sesión sin idle mediría cero minutos.
+drop function if exists app.ms_descontables(text, jsonb);
+
+create or replace function app.ms_descontables(
+  p_event_type text,
+  p_payload jsonb
+)
+returns numeric
+language sql
+immutable
+set search_path = ''
+as $$
+  select case
+    -- El cliente declaró inactividad: usamos su medida.
+    when p_event_type = 'idle_end' then
+      coalesce((p_payload->>'idleMs')::numeric, 0)
+    when p_event_type = 'focus_gained' then
+      coalesce((p_payload->>'awayMs')::numeric, 0)
+    -- Hueco no declarado: solo contamos hasta el umbral de 10 minutos.
+    when p_payload ? '_gapMs' then
+      greatest(
+        coalesce((p_payload->>'_gapMs')::numeric, 0) - 600000.0,
+        0
+      )
+    else 0
+  end;
+$$;
+
+comment on function app.ms_descontables(text, jsonb) is
+  'ms que se descuentan del tiempo en pantalla: declarados + exceso de hueco sobre 10 minutos.';
+
+revoke all on function app.ms_descontables(text, jsonb) from public;
+grant execute on function app.ms_descontables(text, jsonb) to authenticated, service_role;
diff --git a/supabase/tests/tiempo_de_estudio.sql b/supabase/tests/tiempo_de_estudio.sql
new file mode 100644
index 0000000..91e3fc0
--- /dev/null
+++ b/supabase/tests/tiempo_de_estudio.sql
@@ -0,0 +1,193 @@
+-- =============================================================================
+-- tiempo_de_estudio.sql — pgTAP para 0064_tiempo_de_estudio.sql
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+-- Demuestra que un hueco largo sin idle_end no infla el tiempo de estudio,
+-- que una sesión continua no pierde minutos, y que las dos implementaciones
+-- del scorecard siguen devolviendo lo mismo.
+-- =============================================================================
+begin;
+
+select plan(9);
+
+-- La migración bajo prueba.
+\ir ../migrations/0064_tiempo_de_estudio.sql
+
+-- El mundo compartido: colegios Alfa y Beta, profesores y alumnos.
+\ir helpers/fixture.psql
+
+
+-- -----------------------------------------------------------------------------
+-- Limpieza de telemetría que trae el fixture
+-- -----------------------------------------------------------------------------
+create or replace function pg_temp.limpiar_telemetria()
+returns integer language plpgsql as $fn$
+declare n integer;
+begin
+  delete from public.learning_events
+  where student_id in ('aaaaaaaa-0000-4000-8000-00000000003a',
+                       'aaaaaaaa-0000-4000-8000-00000000004a',
+                       'bbbbbbbb-0000-4000-8000-00000000003b');
+  get diagnostics n = row_count;
+  return n;
+end $fn$;
+
+select is(
+  pg_temp.limpiar_telemetria(),
+  2,
+  'el fixture traia exactamente 2 eventos de telemetria y se han retirado'
+);
+
+
+-- -----------------------------------------------------------------------------
+-- Telemetría del alumno del informe (s1a, colegio Alfa)
+-- -----------------------------------------------------------------------------
+-- Dos sesiones:
+--   · Sesión continua: 4 eventos en 15 minutos, sin idle_end. Debe medir 15 min.
+--   · Sesión con hueco: 4 eventos en 2 horas, sin idle_end. El último gap es
+--     de 117 minutos; con el umbral de 10 minutos solo quedan 10, así que el
+--     tiempo debe ser 120 - 107 = 13 min.
+-- Total: 28 minutos.
+--
+-- El trigger de 0064 añade _gapMs al payload en cada insert.
+insert into public.learning_events
+  (school_id, student_id, session_id, seq, event_type, lesson_id, payload, server_ts)
+values
+  -- sesión continua ----------------------------------------------------------
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f0f0f0f0-0000-4000-8000-000000000000', 0, 'session_context', null,
+   '{"timezone":"Europe/Madrid"}'::jsonb, now() - interval '5 hours'),
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f0f0f0f0-0000-4000-8000-000000000000', 1, 'lesson_opened',
+   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '4 hours 55 minutes'),
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f0f0f0f0-0000-4000-8000-000000000000', 2, 'answer_submitted', null,
+   '{"isCorrect":true}'::jsonb, now() - interval '4 hours 50 minutes'),
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f0f0f0f0-0000-4000-8000-000000000000', 3, 'lesson_completed',
+   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '4 hours 45 minutes'),
+
+  -- sesión con hueco largo ---------------------------------------------------
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f1f1f1f1-0000-4000-8000-000000000001', 0, 'session_context', null,
+   '{"timezone":"Europe/Madrid"}'::jsonb, now() - interval '3 hours'),
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f1f1f1f1-0000-4000-8000-000000000001', 1, 'lesson_opened',
+   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '2 hours 58 minutes'),
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f1f1f1f1-0000-4000-8000-000000000001', 2, 'answer_submitted', null,
+   '{"isCorrect":false}'::jsonb, now() - interval '2 hours 57 minutes'),
+  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
+   'f1f1f1f1-0000-4000-8000-000000000001', 3, 'answer_submitted', null,
+   '{"isCorrect":true}'::jsonb, now() - interval '1 hour');
+
+
+-- -----------------------------------------------------------------------------
+-- El profesor de Alfa consulta.
+-- -----------------------------------------------------------------------------
+select set_config('request.jwt.claims',
+                  '{"sub":"aaaaaaaa-0000-4000-8000-00000000002a"}', true);
+
+
+-- -----------------------------------------------------------------------------
+-- 1 · Caso que motivó el encargo: hueco largo sin idle_end
+-- -----------------------------------------------------------------------------
+select is(
+  (select r.minutos_estudio from app.informe_alumno_resumen(
+     'aaaaaaaa-0000-4000-8000-00000000003a',
+     now() - interval '6 hours', now()) r),
+  28.00,
+  'una sesión con un hueco de casi 2 horas no mide el span entero (15 + 13 = 28 min)'
+);
+
+
+-- -----------------------------------------------------------------------------
+-- 2 · Caso contrario: sesión continua sin idle_end no pierde minutos
+-- -----------------------------------------------------------------------------
+select is(
+  (select count(*)::integer from (
+     select session_id,
+            round(greatest(
+              extract(epoch from (max(server_ts) - min(server_ts)))
+              - coalesce(sum(app.ms_descontables(event_type::text, payload)), 0) / 1000.0,
+              0) / 60.0, 2) as minutos
+     from public.learning_events
+     where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'
+       and session_id = 'f0f0f0f0-0000-4000-8000-000000000000'
+     group by session_id
+   ) s where s.minutos = 15.00),
+  1,
+  'la sesión continua de 15 min mide exactamente 15 min, sin descuentos fantasmas'
+);
+
+
+-- -----------------------------------------------------------------------------
+-- 3 · Coherencia: las dos implementaciones devuelven lo mismo
+-- -----------------------------------------------------------------------------
+select is(
+  (select string_agg(m.metrica || '=' || m.valor::text, ' ' order by m.ord)
+     from app.informe_alumno_metricas_bruto(
+       'aaaaaaaa-0000-4000-8000-00000000003a',
+       now() - interval '6 hours', now()) m),
+  (select 'minutos_estudio='       || r.minutos_estudio::text
+       || ' sesiones='             || r.sesiones::text
+       || ' lecciones_abiertas='   || r.lecciones_abiertas::text
+       || ' lecciones_completadas='|| r.lecciones_completadas::text
+       || ' items_respondidos='    || r.items_respondidos::text
+       || ' porcentaje_acierto='   || r.porcentaje_acierto::text
+       || ' examenes_entregados='  || r.examenes_entregados::text
+       || ' pistas_pedidas='       || r.pistas_pedidas::text
+       || ' racha_maxima='         || r.racha_maxima::text
+     from app.informe_alumno_resumen(
+       'aaaaaaaa-0000-4000-8000-00000000003a',
+       now() - interval '6 hours', now()) r),
+  'metricas_bruto coincide metrica a metrica con informe_alumno_resumen tras el arreglo'
+);
+
+
+-- -----------------------------------------------------------------------------
+-- 4 · El umbral está fijado a mano: 10 minutos (600000 ms)
+-- -----------------------------------------------------------------------------
+-- El valor 600000 vive en la migración; aquí se comprueba el comportamiento
+-- esperado para que cambiarlo sea una decisión consciente.
+select is(
+  app.ms_descontables('answer_submitted', '{"_gapMs":3600000}'::jsonb),
+  3000000.0,
+  'un hueco de 60 min descuenta 50 min: el umbral fijado a mano es 10 min'
+);
+
+select is(
+  app.ms_descontables('answer_submitted', '{"_gapMs":600000}'::jsonb),
+  0.0,
+  'un hueco de exactamente 10 min no descuenta'
+);
+
+select is(
+  app.ms_descontables('answer_submitted', '{"_gapMs":601000}'::jsonb),
+  1000.0,
+  'un hueco de 10 min y 1 s descuenta solo 1 s'
+);
+
+select is(
+  app.ms_descontables('idle_end', '{"idleMs":60000,"_gapMs":3600000}'::jsonb),
+  60000.0,
+  'un idle_end declarado sigue usando idleMs, sin tocar el hueco'
+);
+
+
+-- -----------------------------------------------------------------------------
+-- 5 · Aislamiento entre colegios
+-- -----------------------------------------------------------------------------
+select set_config('request.jwt.claims',
+                  '{"sub":"bbbbbbbb-0000-4000-8000-00000000002b"}', true);
+
+select throws_ok(
+  $$select app.informe_alumno_resumen('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '6 hours', now())$$,
+  '42501',
+  'No tienes permiso para ver el informe de este alumno',
+  'el profesor de Beta no puede ver el informe de un alumno de Alfa'
+);
+
+
+select finish();
+rollback;

~~~

## Salida final de `node scripts/deepseek/validar-sql.mjs supabase/migrations/0064_tiempo_de_estudio.sql supabase/tests/tiempo_de_estudio.sql app.ms_descontables`

~~~

  ok  supabase/migrations/0064_tiempo_de_estudio.sql: 1 funcion(es), forma correcta.
      (la forma, no que corra: eso lo decide Postgres al aplicarla)


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.