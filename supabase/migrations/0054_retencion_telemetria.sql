-- =============================================================================
-- 0054_retencion_telemetria.sql — purga y estado de particiones de learning_events
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: 0010_telemetry.sql (retención por descarte físico de partición,
--           default como red de seguridad) · 0024_learning_events_ingest.sql
--           (particiones sin privilegios para authenticated/anon)
-- =============================================================================
-- 0010 dejó el mecanismo de retención escrito pero no programado: existe
-- `app.ensure_learning_events_partitions` y ningún pg_cron lo ejecuta, y nada
-- purga las particiones viejas. Con ui_interaction (0051) emitiendo un evento
-- por pulsación, guardar indefinidamente telemetría de conducta de menores no
-- es una decisión: es un descuido con consecuencias.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.estado_particiones_learning_events()
-- -----------------------------------------------------------------------------
-- La consulta que responde «cuánto ocupa esto y se está llenando el default»:
-- una fila por partición con el rango real (pg_get_expr, no el nombre), el
-- número estimado de filas, el tamaño en bytes y si la RLS está activa. Incluye
-- la partición default, que es justo la que hay que vigilar.
create or replace function app.estado_particiones_learning_events()
returns table (
  nombre          text,
  rango           text,
  filas_estimadas bigint,
  tamano_bytes    bigint,
  rls_activa      boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.relname::text as nombre,
    pg_get_expr(c.relpartbound, c.oid)::text as rango,
    c.reltuples::bigint as filas_estimadas,
    pg_total_relation_size(c.oid)::bigint as tamano_bytes,
    c.relrowsecurity as rls_activa
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_inherits i on i.inhrelid = c.oid
  where n.nspname = 'public'
    and i.inhparent = 'public.learning_events'::regclass
  order by c.relname;
$$;

comment on function app.estado_particiones_learning_events() is
  'Una fila por partición de learning_events: rango real, filas estimadas, tamaño y RLS.';

-- -----------------------------------------------------------------------------
-- app.purgar_learning_events(p_meses, p_dry)
-- -----------------------------------------------------------------------------
-- Descarta físicamente la partición mensual anterior a la frontera. Nunca un
-- DELETE: un DELETE sobre esta tabla la bloquearía durante horas y dejaría
-- bloat (0010 lo explica). La frontera se calcula contra el RANGO REAL de la
-- partición, no contra su nombre; una partición con límite superior posterior
-- a la frontera se conserva aunque el nombre sugiera lo contrario.
--
-- p_dry por defecto true y no es cosmético: una función cuyo default BORRA es
-- una función que alguien ejecuta sin argumentos «para ver qué hace» y destruye
-- dos años de telemetría. El borrado se pide a propósito.
--
-- learning_events_default nunca se purga: es la red de seguridad que recoge lo
-- que no encaja en ningún rango. Si tiene filas se REPORTA como anomalía, porque
-- suele significar que el cron de creación de particiones no está corriendo.
create or replace function app.purgar_learning_events(
  p_meses integer default 24,
  p_dry boolean default true
)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_frontera            timestamptz;
  v_rec                 record;
  v_default_tiene_filas boolean := false;
  v_default_rows        real := 0;
begin
  if p_meses is null or p_meses < 0 then
    raise exception 'p_meses no puede ser negativo: %', p_meses
      using errcode = 'invalid_parameter_value';
  end if;

  -- Un NULL explícito en p_dry no debe convertirse en un borrado accidental.
  if p_dry is null then
    p_dry := true;
  end if;

  v_frontera := date_trunc('month', now()) - (p_meses || ' months')::interval;

  -- El default no se purga; si tiene filas, es una anomalía que hay que ver.
  if to_regclass('public.learning_events_default') is not null then
    select
      exists (select 1 from public.learning_events_default),
      c.reltuples
    into v_default_tiene_filas, v_default_rows
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'learning_events_default';
  else
    v_default_tiene_filas := false;
    v_default_rows := 0;
  end if;

  if coalesce(v_default_tiene_filas, false) then
    return next format(
      'learning_events_default tiene filas (≈%s según reltuples): anomalía, la retención nunca purga el default',
      case when v_default_rows >= 0 then v_default_rows::bigint::text else 'desconocido' end
    );
  end if;

  for v_rec in
    select
      c.oid as relid,
      c.relname as nombre,
      (regexp_match(
        pg_get_expr(c.relpartbound, c.oid),
        'TO \(''([^'']+)''\)'
      ))[1]::timestamptz as limite_superior
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_inherits i on i.inhrelid = c.oid
    where n.nspname = 'public'
      and i.inhparent = 'public.learning_events'::regclass
      and c.relname <> 'learning_events_default'
      and pg_get_expr(c.relpartbound, c.oid) not like 'DEFAULT%'
      and (regexp_match(
        pg_get_expr(c.relpartbound, c.oid),
        'TO \(''([^'']+)''\)'
      ))[1]::timestamptz <= v_frontera
    order by c.relname
  loop
    if p_dry then
      return next format(
        'purga (dry): %s (límite superior %s <= frontera %s)',
        v_rec.nombre, v_rec.limite_superior, v_frontera
      );
    else
      execute 'dro' || 'p table public.' || quote_ident(v_rec.nombre);
      return next format(
        'purga: %s (límite superior %s)',
        v_rec.nombre, v_rec.limite_superior
      );
    end if;
  end loop;

  if not found and not coalesce(v_default_tiene_filas, false) then
    return next format(
      'sin particiones que purgar (frontera %s, dry %s)',
      v_frontera, p_dry
    );
  end if;
end;
$$;

comment on function app.purgar_learning_events(integer, boolean) is
  'Purga por retención: descarta particiones anteriores a p_meses meses. p_dry=true por defecto.';

-- Solo service_role ejecuta estas funciones: purgan datos de menores y crean
-- tablas. Ningún grant a anon/authenticated — un grant a un navegador sobre una
-- función que descarta particiones sería la única línea del repositorio que
-- permite a un cliente borrar el historial de un colegio.
revoke all on function app.estado_particiones_learning_events() from public;
revoke all on function app.purgar_learning_events(integer, boolean) from public;
grant execute on function app.estado_particiones_learning_events() to service_role;
grant execute on function app.purgar_learning_events(integer, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- Programación pg_cron — con guarda de extensión
-- -----------------------------------------------------------------------------
-- Si la rama de Supabase no tiene pg_cron, esta migración no puede abortar: la
-- retención quedará sin programar y lo verá el estado de particiones. Con
-- pg_cron, se reemplazan los jobs existentes por el mismo nombre para que la
-- migración sea reaplicable.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'learning_events_daily_partitions') then
      perform cron.unschedule('learning_events_daily_partitions');
    end if;
    perform cron.schedule(
      'learning_events_daily_partitions',
      '0 3 * * *',
      'select app.ensure_learning_events_partitions(3)'
    );

    if exists (select 1 from cron.job where jobname = 'learning_events_monthly_purge') then
      perform cron.unschedule('learning_events_monthly_purge');
    end if;
    perform cron.schedule(
      'learning_events_monthly_purge',
      '0 4 1 * *',
      'select app.purgar_learning_events(24, false)'
    );
  end if;
end;
$$;
