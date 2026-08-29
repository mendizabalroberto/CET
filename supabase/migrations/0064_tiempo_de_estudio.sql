-- =============================================================================
-- 0064_tiempo_de_estudio.sql — descuenta huecos de inactividad no declarados
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- El problema: si el cliente muere sin emitir `idle_end`, el span de la sesión
-- sigue creciendo hasta el último evento. Una pestaña abierta de fondo puede
-- convertir 10 minutos de estudio en 400.
--
-- La solución: tope por hueco. Entre dos eventos consecutivos de una sesión,
-- solo cuentan como estudio los primeros 10 minutos. El exceso se descuenta
-- igual que si hubiera llegado un `idle_end`.
--
-- Por qué 10 minutos: es el umbral que separa una pausa dentro de una sesión
-- de estudio (ir al baño, leer un enunciado largo) de una pestaña abandonada.
-- Se ha fijado a mano en este fichero y en el test; la consulta para ajustarlo
-- con datos reales es:
--
--   select percentile_cont(0.95) within group (order by gap_ms)
--   from (
--     select extract(epoch from (server_ts - lag(server_ts) over
--       (partition by session_id order by seq))) * 1000 as gap_ms
--     from public.learning_events
--   ) g
--   where gap_ms is not null;
--
-- Implementación:
--   · Un trigger BEFORE INSERT calcula el gap desde el evento anterior de la
--     misma sesión y lo guarda en el payload como `_gapMs`.
--   · app.ms_descontables lee `_gapMs` y descuenta el exceso sobre el umbral.
--   · No se tocan 0053 ni 0062: ambos usan app.ms_descontables y heredan el
--     arreglo automáticamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger: enriquecer el payload con el gap desde el evento anterior
-- -----------------------------------------------------------------------------
-- La función NO es security definer: debe ejecutarse con los privilegios del
-- invocador para que la RLS limite la lectura a los eventos propios de la
-- sesión. El search_path vacío evita que un esquema malicioso del llamante
-- reemplace tablas del sistema.
create or replace function app.learning_events_calc_gap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prev_ts timestamptz;
begin
  -- El gap solo tiene sentido dentro de la misma sesión y en orden de seq.
  select le.server_ts into v_prev_ts
    from public.learning_events le
   where le.session_id = NEW.session_id
     and le.seq < NEW.seq
   order by le.seq desc
   limit 1;

  if v_prev_ts is not null then
    NEW.payload := jsonb_set(
      NEW.payload,
      '{_gapMs}',
      to_jsonb(extract(epoch from (NEW.server_ts - v_prev_ts)) * 1000.0)
    );
  end if;

  return NEW;
end;
$$;

comment on function app.learning_events_calc_gap() is
  'Trigger que añade _gapMs al payload: ms desde el evento anterior de la misma sesión.';

revoke all on function app.learning_events_calc_gap() from public;
grant execute on function app.learning_events_calc_gap() to service_role;

-- Soltamos el trigger si existe para que la migración sea reaplicable.
drop trigger if exists learning_events_calc_gap on public.learning_events;

create trigger learning_events_calc_gap
  before insert on public.learning_events
  for each row
  execute function app.learning_events_calc_gap();


-- -----------------------------------------------------------------------------
-- ms_descontables — descuento de un evento, ahora con tope por hueco
-- -----------------------------------------------------------------------------
-- Devuelve los milisegundos que NO cuentan como estudio para este evento:
--   · idle_end.idleMs y focus_gained.awayMs, cuando el cliente los declaró.
--   · El exceso de _gapMs sobre el umbral de 10 minutos.
--   · 0 en cualquier otro caso.
--
-- Nunca NULL: un NULL en la suma haría que greatest(NULL, 0) devolviera 0 y
-- toda sesión sin idle mediría cero minutos.
drop function if exists app.ms_descontables(text, jsonb);

create or replace function app.ms_descontables(
  p_event_type text,
  p_payload jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    -- El cliente declaró inactividad: usamos su medida.
    when p_event_type = 'idle_end' then
      coalesce((p_payload->>'idleMs')::numeric, 0)
    when p_event_type = 'focus_gained' then
      coalesce((p_payload->>'awayMs')::numeric, 0)
    -- Hueco no declarado: solo contamos hasta el umbral de 10 minutos.
    when p_payload ? '_gapMs' then
      greatest(
        coalesce((p_payload->>'_gapMs')::numeric, 0) - 600000.0,
        0
      )
    else 0
  end;
$$;

comment on function app.ms_descontables(text, jsonb) is
  'ms que se descuentan del tiempo en pantalla: declarados + exceso de hueco sobre 10 minutos.';

revoke all on function app.ms_descontables(text, jsonb) from public;
grant execute on function app.ms_descontables(text, jsonb) to authenticated, service_role;
