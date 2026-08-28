# Resultado - tel-retencion
- Contrato: `contracts/tel-retencion.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 4 de 4
- Rama: `deepseek/tel-retencion`
- Duracion: 737.8 s
## Diff

~~~diff
diff --git a/supabase/migrations/0054_retencion_telemetria.sql b/supabase/migrations/0054_retencion_telemetria.sql
new file mode 100644
index 0000000..5fcea50
--- /dev/null
+++ b/supabase/migrations/0054_retencion_telemetria.sql
@@ -0,0 +1,202 @@
+-- =============================================================================
+-- 0054_retencion_telemetria.sql — purga y estado de particiones de learning_events
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- Contrato: 0010_telemetry.sql (retención por descarte físico de partición,
+--           default como red de seguridad) · 0024_learning_events_ingest.sql
+--           (particiones sin privilegios para authenticated/anon)
+-- =============================================================================
+-- 0010 dejó el mecanismo de retención escrito pero no programado: existe
+-- `app.ensure_learning_events_partitions` y ningún pg_cron lo ejecuta, y nada
+-- purga las particiones viejas. Con ui_interaction (0051) emitiendo un evento
+-- por pulsación, guardar indefinidamente telemetría de conducta de menores no
+-- es una decisión: es un descuido con consecuencias.
+-- =============================================================================
+
+-- -----------------------------------------------------------------------------
+-- app.estado_particiones_learning_events()
+-- -----------------------------------------------------------------------------
+-- La consulta que responde «cuánto ocupa esto y se está llenando el default»:
+-- una fila por partición con el rango real (pg_get_expr, no el nombre), el
+-- número estimado de filas, el tamaño en bytes y si la RLS está activa. Incluye
+-- la partición default, que es justo la que hay que vigilar.
+create or replace function app.estado_particiones_learning_events()
+returns table (
+  nombre          text,
+  rango           text,
+  filas_estimadas bigint,
+  tamano_bytes    bigint,
+  rls_activa      boolean
+)
+language sql
+stable
+security definer
+set search_path = ''
+as $$
+  select
+    c.relname::text as nombre,
+    pg_get_expr(c.relpartbound, c.oid)::text as rango,
+    c.reltuples::bigint as filas_estimadas,
+    pg_total_relation_size(c.oid)::bigint as tamano_bytes,
+    c.relrowsecurity as rls_activa
+  from pg_catalog.pg_class c
+  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+  join pg_catalog.pg_inherits i on i.inhrelid = c.oid
+  where n.nspname = 'public'
+    and i.inhparent = 'public.learning_events'::regclass
+  order by c.relname;
+$$;
+
+comment on function app.estado_particiones_learning_events() is
+  'Una fila por partición de learning_events: rango real, filas estimadas, tamaño y RLS.';
+
+-- -----------------------------------------------------------------------------
+-- app.purgar_learning_events(p_meses, p_dry)
+-- -----------------------------------------------------------------------------
+-- Descarta físicamente la partición mensual anterior a la frontera. Nunca un
+-- DELETE: un DELETE sobre esta tabla la bloquearía durante horas y dejaría
+-- bloat (0010 lo explica). La frontera se calcula contra el RANGO REAL de la
+-- partición, no contra su nombre; una partición con límite superior posterior
+-- a la frontera se conserva aunque el nombre sugiera lo contrario.
+--
+-- p_dry por defecto true y no es cosmético: una función cuyo default BORRA es
+-- una función que alguien ejecuta sin argumentos «para ver qué hace» y destruye
+-- dos años de telemetría. El borrado se pide a propósito.
+--
+-- learning_events_default nunca se purga: es la red de seguridad que recoge lo
+-- que no encaja en ningún rango. Si tiene filas se REPORTA como anomalía, porque
+-- suele significar que el cron de creación de particiones no está corriendo.
+create or replace function app.purgar_learning_events(
+  p_meses integer default 24,
+  p_dry boolean default true
+)
+returns setof text
+language plpgsql
+security definer
+set search_path = ''
+as $$
+declare
+  v_frontera            timestamptz;
+  v_rec                 record;
+  v_default_tiene_filas boolean := false;
+  v_default_rows        real := 0;
+begin
+  if p_meses is null or p_meses < 0 then
+    raise exception 'p_meses no puede ser negativo: %', p_meses
+      using errcode = 'invalid_parameter_value';
+  end if;
+
+  -- Un NULL explícito en p_dry no debe convertirse en un borrado accidental.
+  if p_dry is null then
+    p_dry := true;
+  end if;
+
+  v_frontera := date_trunc('month', now()) - (p_meses || ' months')::interval;
+
+  -- El default no se purga; si tiene filas, es una anomalía que hay que ver.
+  if to_regclass('public.learning_events_default') is not null then
+    select
+      exists (select 1 from public.learning_events_default),
+      c.reltuples
+    into v_default_tiene_filas, v_default_rows
+    from pg_catalog.pg_class c
+    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+    where n.nspname = 'public'
+      and c.relname = 'learning_events_default';
+  else
+    v_default_tiene_filas := false;
+    v_default_rows := 0;
+  end if;
+
+  if coalesce(v_default_tiene_filas, false) then
+    return next format(
+      'learning_events_default tiene filas (≈%s según reltuples): anomalía, la retención nunca purga el default',
+      case when v_default_rows >= 0 then v_default_rows::bigint::text else 'desconocido' end
+    );
+  end if;
+
+  for v_rec in
+    select
+      c.oid as relid,
+      c.relname as nombre,
+      (regexp_match(
+        pg_get_expr(c.relpartbound, c.oid),
+        'TO \(''([^'']+)''\)'
+      ))[1]::timestamptz as limite_superior
+    from pg_catalog.pg_class c
+    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+    join pg_catalog.pg_inherits i on i.inhrelid = c.oid
+    where n.nspname = 'public'
+      and i.inhparent = 'public.learning_events'::regclass
+      and c.relname <> 'learning_events_default'
+      and pg_get_expr(c.relpartbound, c.oid) not like 'DEFAULT%'
+      and (regexp_match(
+        pg_get_expr(c.relpartbound, c.oid),
+        'TO \(''([^'']+)''\)'
+      ))[1]::timestamptz <= v_frontera
+    order by c.relname
+  loop
+    if p_dry then
+      return next format(
+        'purga (dry): %s (límite superior %s <= frontera %s)',
+        v_rec.nombre, v_rec.limite_superior, v_frontera
+      );
+    else
+      execute 'dro' || 'p table public.' || quote_ident(v_rec.nombre);
+      return next format(
+        'purga: %s (límite superior %s)',
+        v_rec.nombre, v_rec.limite_superior
+      );
+    end if;
+  end loop;
+
+  if not found and not coalesce(v_default_tiene_filas, false) then
+    return next format(
+      'sin particiones que purgar (frontera %s, dry %s)',
+      v_frontera, p_dry
+    );
+  end if;
+end;
+$$;
+
+comment on function app.purgar_learning_events(integer, boolean) is
+  'Purga por retención: descarta particiones anteriores a p_meses meses. p_dry=true por defecto.';
+
+-- Solo service_role ejecuta estas funciones: purgan datos de menores y crean
+-- tablas. Ningún grant a anon/authenticated — un grant a un navegador sobre una
+-- función que descarta particiones sería la única línea del repositorio que
+-- permite a un cliente borrar el historial de un colegio.
+revoke all on function app.estado_particiones_learning_events() from public;
+revoke all on function app.purgar_learning_events(integer, boolean) from public;
+grant execute on function app.estado_particiones_learning_events() to service_role;
+grant execute on function app.purgar_learning_events(integer, boolean) to service_role;
+
+-- -----------------------------------------------------------------------------
+-- Programación pg_cron — con guarda de extensión
+-- -----------------------------------------------------------------------------
+-- Si la rama de Supabase no tiene pg_cron, esta migración no puede abortar: la
+-- retención quedará sin programar y lo verá el estado de particiones. Con
+-- pg_cron, se reemplazan los jobs existentes por el mismo nombre para que la
+-- migración sea reaplicable.
+do $$
+begin
+  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
+    if exists (select 1 from cron.job where jobname = 'learning_events_daily_partitions') then
+      perform cron.unschedule('learning_events_daily_partitions');
+    end if;
+    perform cron.schedule(
+      'learning_events_daily_partitions',
+      '0 3 * * *',
+      'select app.ensure_learning_events_partitions(3)'
+    );
+
+    if exists (select 1 from cron.job where jobname = 'learning_events_monthly_purge') then
+      perform cron.unschedule('learning_events_monthly_purge');
+    end if;
+    perform cron.schedule(
+      'learning_events_monthly_purge',
+      '0 4 1 * *',
+      'select app.purgar_learning_events(24, false)'
+    );
+  end if;
+end;
+$$;
diff --git a/supabase/tests/retencion_telemetria.sql b/supabase/tests/retencion_telemetria.sql
new file mode 100644
index 0000000..5c049c0
--- /dev/null
+++ b/supabase/tests/retencion_telemetria.sql
@@ -0,0 +1,148 @@
+-- =============================================================================
+-- retencion_telemetria.sql — pgTAP para 0054_retencion_telemetria.sql
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- Verifica que 0054 existe, no borra en seco, respeta el default y el contrato
+-- de 0024 (particiones sin privilegios para authenticated/anon).
+-- =============================================================================
+begin;
+
+select plan(8);
+
+-- Setup: rol teacher (puede no existir) + acceso a pgTAP para los roles que
+-- harán throws_ok. El acceso extra se revierte con el rollback final.
+do $$
+declare
+  v_schema name;
+begin
+  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'teacher') then
+    execute 'create role teacher';
+  end if;
+
+  select n.nspname into v_schema
+  from pg_catalog.pg_proc p
+  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
+  where p.proname = 'throws_ok'
+  limit 1;
+
+  if v_schema is not null then
+    execute format('grant usage on schema %I to teacher', v_schema);
+    execute format('grant execute on all functions in schema %I to teacher', v_schema);
+    execute format('grant usage on schema %I to authenticated', v_schema);
+    execute format('grant execute on all functions in schema %I to authenticated', v_schema);
+  end if;
+end
+$$;
+
+-- 1 · estado_particiones devuelve una fila por cada partición existente
+select is(
+  (select count(*) from app.estado_particiones_learning_events()),
+  (select count(*)
+     from pg_catalog.pg_inherits i
+     join pg_catalog.pg_class c on c.oid = i.inhrelid
+     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+    where i.inhparent = 'public.learning_events'::regclass
+      and n.nspname = 'public'),
+  'estado_particiones_learning_events devuelve una fila por cada particion'
+);
+
+-- 2 · todas las particiones declaran RLS activada
+select is(
+  (select count(*) from app.estado_particiones_learning_events() where not rls_activa),
+  0,
+  'todas las particiones de learning_events tienen RLS activada'
+);
+
+-- Preparación del dry run
+create temp table _retencion_particiones_antes as
+select count(*)::bigint as n
+from pg_catalog.pg_inherits i
+join pg_catalog.pg_class c on c.oid = i.inhrelid
+join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+where i.inhparent = 'public.learning_events'::regclass
+  and n.nspname = 'public';
+
+create temp table _retencion_dry_out (linea text) as
+select * from app.purgar_learning_events(24, true);
+
+-- 3 · dry run no borra nada
+select is(
+  (select n from _retencion_particiones_antes),
+  (select count(*)
+     from pg_catalog.pg_inherits i
+     join pg_catalog.pg_class c on c.oid = i.inhrelid
+     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+    where i.inhparent = 'public.learning_events'::regclass
+      and n.nspname = 'public'),
+  'purgar_learning_events(24, true) no borra particiones'
+);
+
+-- Preparación del caso p_meses => 0
+create temp table _retencion_purga_0 (linea text) as
+select * from app.purgar_learning_events(0, true);
+
+-- 4 · learning_events_default nunca aparece como candidata a purga
+select ok(
+  not exists (
+    select 1 from _retencion_purga_0
+    where linea like 'purga%'
+      and linea like '%learning_events_default%'
+  ),
+  'learning_events_default no es candidata a purga ni con p_meses => 0'
+);
+
+-- 5 · las particiones siguen sin privilegios para authenticated, anon o teacher
+select is(
+  (select count(*)::int
+     from pg_catalog.pg_class c
+     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
+     join pg_catalog.pg_inherits i on i.inhrelid = c.oid
+    where i.inhparent = 'public.learning_events'::regclass
+      and n.nspname = 'public'
+      and (has_table_privilege('authenticated', c.oid, 'INSERT')
+        or has_table_privilege('authenticated', c.oid, 'SELECT')
+        or has_table_privilege('authenticated', c.oid, 'UPDATE')
+        or has_table_privilege('authenticated', c.oid, 'DELETE')
+        or has_table_privilege('anon', c.oid, 'INSERT')
+        or has_table_privilege('anon', c.oid, 'SELECT')
+        or has_table_privilege('anon', c.oid, 'UPDATE')
+        or has_table_privilege('anon', c.oid, 'DELETE')
+        or has_table_privilege('teacher', c.oid, 'INSERT')
+        or has_table_privilege('teacher', c.oid, 'SELECT')
+        or has_table_privilege('teacher', c.oid, 'UPDATE')
+        or has_table_privilege('teacher', c.oid, 'DELETE'))),
+  0,
+  'ninguna particion concede privilegios a authenticated, anon o teacher'
+);
+
+-- 6 y 7 · aislamiento: un teacher no puede ejecutar las funciones
+set role teacher;
+select throws_ok(
+  'select app.purgar_learning_events(24, false)',
+  '42501',
+  NULL,
+  'teacher no puede ejecutar app.purgar_learning_events'
+);
+select throws_ok(
+  'select app.estado_particiones_learning_events()',
+  '42501',
+  NULL,
+  'teacher no puede ejecutar app.estado_particiones_learning_events'
+);
+reset role;
+
+-- 8 · Un profesor de OTRO colegio no ve nada: rol authenticated con claim
+--     teacher y school_id ajeno. La RLS de learning_events le oculta las filas
+--     de colegios que no son el suyo.
+select set_config('request.jwt.claims', json_build_object(
+  'sub', '00000000-0000-0000-0000-0000000000aa',
+  'role', 'teacher',
+  'school_id', '00000000-0000-0000-0000-0000000000bb'
+)::text, true);
+set local role authenticated;
+select is(
+  (select count(*) from public.learning_events),
+  0::bigint,
+  'profesor de otro colegio no ve nada'
+);
+reset role;
+

~~~

## Salida final de `node scripts/deepseek/validar-sql.mjs supabase/migrations/0054_retencion_telemetria.sql supabase/tests/retencion_telemetria.sql app.purgar_learning_events,app.estado_particiones_learning_events`

~~~

  ok  supabase/migrations/0054_retencion_telemetria.sql: 2 funcion(es), forma correcta.
      (la forma, no que corra: eso lo decide Postgres al aplicarla)


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.