-- =============================================================================
-- 0001_extensions.sql — extensiones, esquema `app` y utilidades transversales
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §0, §9
-- =============================================================================
-- Este fichero NO crea tablas. Crea el terreno: extensiones, el esquema privado
-- `app` (helpers de RLS y utilidades), el trigger genérico de `updated_at` y los
-- validadores de jsonb usados por CHECK constraints en migraciones posteriores.
--
-- REGLA DURA: toda función de este proyecto declara `set search_path = ''` y usa
-- nombres completamente cualificados. Sin eso, un `CREATE TABLE public.profiles`
-- malicioso (o un schema en el search_path del invocante) secuestra una función
-- `security definer` y se convierte en escalada de privilegios. Es el fallo
-- clásico de Supabase y aquí no se comete ni una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensiones
-- -----------------------------------------------------------------------------
-- Supabase coloca las extensiones en el esquema `extensions`, que está en el
-- search_path por defecto de los roles. Como todas nuestras funciones usan
-- search_path = '', cualificamos siempre: extensions.gen_random_uuid(), etc.
create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid, digest
create extension if not exists citext    with schema extensions;  -- emails, slugs, códigos de alumno
create extension if not exists pg_trgm   with schema extensions;  -- búsqueda por nombre en el panel admin

-- -----------------------------------------------------------------------------
-- Esquema `app` — superficie privada del servidor
-- -----------------------------------------------------------------------------
-- Nada de `app` se expone por PostgREST (no está en `db-schemas`). Contiene los
-- helpers de RLS y las funciones de mantenimiento.
create schema if not exists app;

comment on schema app is
  'Helpers de RLS y utilidades internas de CET. No expuesto por PostgREST.';

-- Fail-closed: nadie tiene nada en `app` salvo lo que se conceda explícitamente
-- al final (0013_grants.sql).
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- app.set_updated_at() — trigger genérico de DATA_MODEL §0
-- -----------------------------------------------------------------------------
-- No es `security definer`: no necesita privilegios ajenos, solo tocar NEW.
-- Aun así fija search_path porque el cuerpo referencia tipos.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE: sella updated_at con el reloj del servidor. El cliente nunca lo escribe.';

-- -----------------------------------------------------------------------------
-- app.block_mutation() — trigger genérico de append-only / inmutabilidad
-- -----------------------------------------------------------------------------
-- Se usa en question_versions, audit_log, auth_attempts, learning_events.
-- Bloquea a TODOS los roles, incluido service_role: la inmutabilidad histórica
-- no debe depender de que el backend se porte bien.
create or replace function app.block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'La tabla %.% es inmutable: la operación % está prohibida (CET/DATA_MODEL §4, §8)',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function app.block_mutation() is
  'Trigger de inmutabilidad. Lanza excepción en cualquier UPDATE/DELETE. Ver DATA_MODEL §4 y §8.';

-- -----------------------------------------------------------------------------
-- app.is_i18n_text(jsonb) — validador de I18nText (DATA_MODEL §0)
-- -----------------------------------------------------------------------------
-- Espejo exacto de `i18nText` en packages/shared/src/i18n.ts:
--   objeto, claves ⊆ {es,en}, al menos una presente, de tipo string y no vacía.
-- Un I18nText totalmente vacío es dato corrupto, no un texto opcional.
--
-- IMMUTABLE porque solo depende de su argumento: puede usarse en CHECK e índices.
create or replace function app.is_i18n_text(v jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    v is not null
    and jsonb_typeof(v) = 'object'
    -- ninguna clave fuera del contrato
    and not exists (
      select 1 from jsonb_object_keys(v) k where k not in ('es', 'en')
    )
    -- todo valor presente es string no vacío
    and not exists (
      select 1
      from jsonb_each(v) e
      where jsonb_typeof(e.value) <> 'string'
         or length(btrim(e.value #>> '{}')) = 0
    )
    -- al menos un idioma con contenido
    and (v ? 'es' or v ? 'en');
$$;

comment on function app.is_i18n_text(jsonb) is
  'true si el jsonb cumple el contrato I18nText de @cet/shared ({es?,en?}, al menos uno no vacío).';

-- Variante que acepta NULL, para columnas I18nText opcionales.
create or replace function app.is_i18n_text_or_null(v jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select v is null or app.is_i18n_text(v);
$$;

-- -----------------------------------------------------------------------------
-- app.is_jsonb_object(jsonb) — guardia mínima para columnas jsonb "de objeto"
-- -----------------------------------------------------------------------------
-- jsonb sin validación es una tabla de basura (DATA_MODEL §3). Como mínimo,
-- las columnas que el contrato define como objeto no pueden ser un escalar.
create or replace function app.is_jsonb_object(v jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select v is not null and jsonb_typeof(v) = 'object';
$$;

-- -----------------------------------------------------------------------------
-- app.is_permutation(int[]) — valida `attempt_items.option_order`
-- -----------------------------------------------------------------------------
-- Debe ser exactamente 0..n-1 en algún orden: sin repetidos, sin huecos, sin
-- negativos y sin NULL. Si no lo es, "el alumno eligió la opción de la posición
-- 2" deja de ser reconstruible, que es el principio rector del MASTER_PLAN.
--
-- Vive aquí (y no inline en el CHECK) porque un CHECK constraint no admite
-- subconsultas, y "sin elementos repetidos" no se expresa sin una.
create or replace function app.is_permutation(arr integer[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    arr is null
    or (
      cardinality(arr) > 0
      and not exists (select 1 from unnest(arr) v where v is null)
      and (select count(distinct v) from unnest(arr) v) = cardinality(arr)
      and (select min(v) from unnest(arr) v) = 0
      and (select max(v) from unnest(arr) v) = cardinality(arr) - 1
    );
$$;

comment on function app.is_permutation(integer[]) is
  'true si el array es una permutación de 0..n-1 (o NULL). Usado por attempt_items.option_order.';

-- -----------------------------------------------------------------------------
-- app.sha256_hex(text) — hashing determinista para ip_hash y checksums
-- -----------------------------------------------------------------------------
-- DATA_MODEL §6: `ip_hash = sha256(ip + salt)`. Nunca la IP en claro.
-- El salt lo aporta quien llama (la Edge Function, desde un secreto de entorno):
-- si viviera en la DB, un volcado del esquema bastaría para revertir el hash de
-- un espacio de direcciones IPv4 tan pequeño.
create or replace function app.sha256_hex(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select encode(extensions.digest(input, 'sha256'), 'hex');
$$;

comment on function app.sha256_hex(text) is
  'sha256 en hex. El salt lo aporta el llamante: mantenerlo en la DB anularía su propósito.';
