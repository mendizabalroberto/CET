-- =============================================================================
-- retencion_telemetria.sql — pgTAP para 0054_retencion_telemetria.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Verifica que 0054 existe, no borra en seco, respeta el default y el contrato
-- de 0024 (particiones sin privilegios para authenticated/anon).
-- =============================================================================
begin;

select plan(8);

-- Setup: rol teacher (puede no existir) + acceso a pgTAP para los roles que
-- harán throws_ok. El acceso extra se revierte con el rollback final.
do $$
declare
  v_schema name;
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'teacher') then
    execute 'create role teacher';
  end if;

  select n.nspname into v_schema
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'throws_ok'
  limit 1;

  if v_schema is not null then
    execute format('grant usage on schema %I to teacher', v_schema);
    execute format('grant execute on all functions in schema %I to teacher', v_schema);
    execute format('grant usage on schema %I to authenticated', v_schema);
    execute format('grant execute on all functions in schema %I to authenticated', v_schema);
  end if;
end
$$;

-- 1 · estado_particiones devuelve una fila por cada partición existente
select is(
  (select count(*) from app.estado_particiones_learning_events()),
  (select count(*)
     from pg_catalog.pg_inherits i
     join pg_catalog.pg_class c on c.oid = i.inhrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where i.inhparent = 'public.learning_events'::regclass
      and n.nspname = 'public'),
  'estado_particiones_learning_events devuelve una fila por cada particion'
);

-- 2 · todas las particiones declaran RLS activada
select is(
  (select count(*) from app.estado_particiones_learning_events() where not rls_activa),
  0,
  'todas las particiones de learning_events tienen RLS activada'
);

-- Preparación del dry run
create temp table _retencion_particiones_antes as
select count(*)::bigint as n
from pg_catalog.pg_inherits i
join pg_catalog.pg_class c on c.oid = i.inhrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where i.inhparent = 'public.learning_events'::regclass
  and n.nspname = 'public';

create temp table _retencion_dry_out (linea text) as
select * from app.purgar_learning_events(24, true);

-- 3 · dry run no borra nada
select is(
  (select n from _retencion_particiones_antes),
  (select count(*)
     from pg_catalog.pg_inherits i
     join pg_catalog.pg_class c on c.oid = i.inhrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where i.inhparent = 'public.learning_events'::regclass
      and n.nspname = 'public'),
  'purgar_learning_events(24, true) no borra particiones'
);

-- Preparación del caso p_meses => 0
create temp table _retencion_purga_0 (linea text) as
select * from app.purgar_learning_events(0, true);

-- 4 · learning_events_default nunca aparece como candidata a purga
select ok(
  not exists (
    select 1 from _retencion_purga_0
    where linea like 'purga%'
      and linea like '%learning_events_default%'
  ),
  'learning_events_default no es candidata a purga ni con p_meses => 0'
);

-- 5 · las particiones siguen sin privilegios para authenticated, anon o teacher
select is(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_inherits i on i.inhrelid = c.oid
    where i.inhparent = 'public.learning_events'::regclass
      and n.nspname = 'public'
      and (has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'SELECT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('teacher', c.oid, 'INSERT')
        or has_table_privilege('teacher', c.oid, 'SELECT')
        or has_table_privilege('teacher', c.oid, 'UPDATE')
        or has_table_privilege('teacher', c.oid, 'DELETE'))),
  0,
  'ninguna particion concede privilegios a authenticated, anon o teacher'
);

-- 6 y 7 · aislamiento: un teacher no puede ejecutar las funciones
set role teacher;
select throws_ok(
  'select app.purgar_learning_events(24, false)',
  '42501',
  NULL,
  'teacher no puede ejecutar app.purgar_learning_events'
);
select throws_ok(
  'select app.estado_particiones_learning_events()',
  '42501',
  NULL,
  'teacher no puede ejecutar app.estado_particiones_learning_events'
);
reset role;

-- 8 · Un profesor de OTRO colegio no ve nada: rol authenticated con claim
--     teacher y school_id ajeno. La RLS de learning_events le oculta las filas
--     de colegios que no son el suyo.
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000aa',
  'role', 'teacher',
  'school_id', '00000000-0000-0000-0000-0000000000bb'
)::text, true);
set local role authenticated;
select is(
  (select count(*) from public.learning_events),
  0::bigint,
  'profesor de otro colegio no ve nada'
);
reset role;

