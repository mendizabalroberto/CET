-- =============================================================================
-- 0051_interaccion_de_interfaz.sql — la secuencia literal de lo que el alumno
-- toca deja de perderse
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
-- Contrato: packages/shared/src/events.ts · DATA_MODEL §7
-- =============================================================================
-- LO QUE FALTABA
-- -----------------------------------------------------------------------------
-- `learning_event_type` tenía 31 miembros y los 31 eran SEMÁNTICOS:
-- `answer_submitted`, `lesson_opened`, `hint_requested`. Describen lo que el
-- alumno CONSIGUIÓ, nunca lo que hizo para conseguirlo.
--
-- Con eso se puede decir «acertó el 60 % de los ítems». No se puede decir si
-- llegó a ese 60 % pulsando «Siguiente» a los 400 ms sin leer, o si volvió tres
-- veces sobre la misma pregunta, cambió de opinión dos veces y pidió la pista
-- justo antes de fijar. Esas dos conductas producen la MISMA fila de resultado y
-- exigen intervenciones opuestas del profesor.
--
-- Los tres miembros que se añaden aquí cierran ese hueco:
--
--   · `session_context`   — las condiciones: aparato, dedo o teclado, tema,
--                           viewport, zona horaria. Se emite una vez por sesión.
--   · `ui_interaction`    — cada acto sobre un control identificado, con su
--                           ordinal y los milisegundos desde el anterior.
--   · `nav_route_changed` — la secuencia de pantallas y cuánto duró cada una.
--
-- SE AÑADEN AL FINAL, Y NO ES ESTÉTICO. El orden de un enum de Postgres es su
-- orden de comparación: insertar un miembro en medio cambiaría el significado
-- de cualquier `order by event_type` y de cualquier `between` ya escrito, sin
-- que nada falle ni avise. El mismo orden que `events.ts`, miembro a miembro
-- (0002 lo exige y `supabase/tests/constraints.sql` lo cuenta).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Los tres miembros nuevos
-- -----------------------------------------------------------------------------
-- `if not exists` para que la migración se pueda reaplicar sobre una base que ya
-- la tenga: `db-apply.mjs` corre el directorio entero y sin esto la segunda
-- pasada aborta la transacción del fichero.
alter type public.learning_event_type add value if not exists 'session_context';
alter type public.learning_event_type add value if not exists 'ui_interaction';
alter type public.learning_event_type add value if not exists 'nav_route_changed';


-- -----------------------------------------------------------------------------
-- 2. El índice que hace consultable «qué botones aprieta este alumno»
-- -----------------------------------------------------------------------------
-- Sin él, «los diez controles más pulsados del colegio este mes» es un scan de
-- la partición entera: decenas de millones de filas para contar sobre las que
-- llevan `payload->>'control'`.
--
-- EL PREDICADO ES `payload ? 'control'` Y NO `event_type = 'ui_interaction'`,
-- por un motivo que no se ve y que rompe la migración si se ignora: Postgres
-- PROHÍBE usar un valor de enum recién añadido en la MISMA transacción que lo
-- añadió («unsafe use of new value of enum type»), y `db-apply.mjs` aplica cada
-- fichero dentro de una sola transacción. Un predicado con el literal fallaría
-- aquí y funcionaría al reaplicar, que es la peor clase de fallo: intermitente
-- y dependiente del orden.
--
-- El predicado por presencia de clave no es un apaño: selecciona exactamente las
-- mismas filas. `payload.control` solo lo escribe `ui_interaction` — es campo
-- obligatorio de su esquema Zod y no aparece en ningún otro payload del
-- contrato.
create index if not exists learning_events_ui_control_idx
  on public.learning_events ((payload ->> 'control'))
  where payload ? 'control';

comment on index public.learning_events_ui_control_idx is
  'Cuenta de pulsaciones por control. Predicado por clave, no por enum: el literal no se puede usar en la transacción que lo crea.';


-- #############################################################################
-- Verificación en tiempo de migración
-- #############################################################################
-- Se comprueba contra `pg_enum` por TEXTO. Escribir `'ui_interaction'::public
-- .learning_event_type` aquí abortaría la migración por la misma regla del §2.
do $$
declare
  v_faltan text;
begin
  select string_agg(v, ', ') into v_faltan
  from unnest(array['session_context', 'ui_interaction', 'nav_route_changed']) as v
  where not exists (
    select 1 from pg_catalog.pg_enum e
    join pg_catalog.pg_type t on t.oid = e.enumtypid
    where t.typname = 'learning_event_type' and e.enumlabel = v
  );
  if v_faltan is not null then
    raise exception 'learning_event_type no recibió los miembros de interfaz: %', v_faltan;
  end if;
end;
$$;

-- El contrato dice 34, y `events.ts` tiene 34. Si alguien añade un miembro en
-- uno de los dos lados y no en el otro, el fallo aparece en el primer insert de
-- producción con «invalid input value for enum». Aquí aparece al migrar.
do $$
declare v_n integer;
begin
  select count(*) into v_n
  from pg_catalog.pg_enum e
  join pg_catalog.pg_type t on t.oid = e.enumtypid
  where t.typname = 'learning_event_type';
  if v_n <> 34 then
    raise exception 'learning_event_type tiene % miembros; events.ts declara 34', v_n;
  end if;
end;
$$;

-- El índice no sirve de nada si no está sobre la tabla PADRE: creado sobre una
-- partición suelta, las particiones del mes que viene nacerían sin él.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'learning_events_ui_control_idx'
  ) then
    raise exception 'Falta learning_events_ui_control_idx sobre public.learning_events';
  end if;
end;
$$;
