-- =============================================================================
-- 0006_content.sql — bloques de lección y media
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §3
-- =============================================================================

-- -----------------------------------------------------------------------------
-- media_assets
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id               uuid primary key default extensions.gen_random_uuid(),
  school_id        uuid references public.schools (id) on delete cascade,  -- NULL = global
  storage_path     text not null,        -- ruta dentro del bucket de Supabase Storage
  mime             text not null,
  bytes            bigint not null,
  width            integer,
  height           integer,
  duration_seconds numeric(10,3),
  -- NOT NULL a propósito (DATA_MODEL §3): la accesibilidad no es opcional. Un
  -- alumno con lector de pantalla no puede quedarse fuera de una lección porque
  -- alguien tuvo prisa subiendo una imagen.
  alt_text         jsonb not null,       -- I18nText
  -- sha256 del fichero: deduplicación. Si dos profesores suben la misma imagen,
  -- es una sola fila.
  checksum         text not null,
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint media_assets_alt_i18n  check (app.is_i18n_text(alt_text)),
  constraint media_assets_bytes_pos check (bytes > 0),
  constraint media_assets_checksum_sha256 check (checksum ~ '^[0-9a-f]{64}$'),
  constraint media_assets_mime_shape check (mime ~ '^[a-z]+/[a-zA-Z0-9.+-]+$'),
  constraint media_assets_dims_sane
    check ((width is null) = (height is null)
           and (width is null or (width > 0 and height > 0))),
  constraint media_assets_duration_sane
    check (duration_seconds is null or duration_seconds > 0),
  constraint media_assets_storage_path_shape
    -- Sin '..' no hay traversal al construir la URL firmada.
    check (storage_path ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{0,511}$'
           and storage_path not like '%..%')
);

-- Deduplicación real: el mismo fichero no se guarda dos veces en el mismo
-- ámbito. Dos índices parciales por la misma razón que en `subjects`: NULL no
-- colisiona con NULL en un UNIQUE ordinario.
create unique index media_assets_global_checksum_uniq
  on public.media_assets (checksum) where school_id is null;
create unique index media_assets_school_checksum_uniq
  on public.media_assets (school_id, checksum) where school_id is not null;

create index media_assets_school_idx on public.media_assets (school_id);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function app.set_updated_at();

alter table public.media_assets enable row level security;


-- -----------------------------------------------------------------------------
-- lesson_blocks — traducción directa de .rule .eg .tip .warn .steps de Y6A
-- -----------------------------------------------------------------------------
create table public.lesson_blocks (
  id        uuid primary key default extensions.gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  -- Denormalizado desde lessons por trigger, igual que en 0005.
  school_id uuid references public.schools (id) on delete cascade,
  ord       integer not null,
  kind      public.block_kind not null,
  -- jsonb, pero NO libre: validado por kind más abajo (DATA_MODEL §3).
  content   jsonb not null,
  -- set null: borrar una imagen deja el bloque, roto pero visible y arreglable.
  -- Un cascade borraría silenciosamente texto de lección al limpiar media.
  media_id  uuid references public.media_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lesson_blocks_ord_uniq unique (lesson_id, ord),
  constraint lesson_blocks_ord_pos  check (ord >= 1),
  constraint lesson_blocks_content_object check (app.is_jsonb_object(content))
);

-- Query caliente y única de esta tabla: "todos los bloques de esta lección, en
-- orden". El índice UNIQUE (lesson_id, ord) ya la sirve, así que NO se crea otro.
-- (Un índice extra sobre (lesson_id) sería puramente decorativo: el prefijo
--  izquierdo del único ya lo cubre.)

create index lesson_blocks_media_idx on public.lesson_blocks (media_id)
  where media_id is not null;   -- "¿qué bloques usan esta imagen?" antes de borrarla

create trigger lesson_blocks_set_updated_at
  before update on public.lesson_blocks
  for each row execute function app.set_updated_at();

alter table public.lesson_blocks enable row level security;

create or replace function app.sync_block_school_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select l.school_id into new.school_id
  from public.lessons l where l.id = new.lesson_id;
  return new;
end;
$$;

create trigger lesson_blocks_sync_school
  before insert or update of lesson_id on public.lesson_blocks
  for each row execute function app.sync_block_school_id();


-- -----------------------------------------------------------------------------
-- Validación de `content` por `kind` (DATA_MODEL §3)
-- -----------------------------------------------------------------------------
-- "jsonb sin validación es una tabla de basura." Postgres no trae JSON Schema,
-- así que se valida la ESTRUCTURA mínima de cada variante: exactamente lo que
-- el renderizador da por hecho. La validación fina (longitudes, allowlist de
-- HTML) la hace Zod en @cet/shared; esto es la red que impide que un insert
-- directo, un script de migración o un bug de servidor metan basura.
--
-- Se implementa como TRIGGER y no como CHECK porque la unión discriminada
-- depende de dos columnas y porque un CHECK con función deja el esquema atado a
-- ella en cada pg_restore.
create or replace function app.validate_lesson_block_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c jsonb := new.content;
begin
  case new.kind
    -- Bloques de prosa: html es I18nText. Cubre .rule/.eg/.tip/.warn de Y6A.
    when 'rule', 'example', 'tip', 'warning', 'text', 'formula' then
      if not (c ? 'html' and app.is_i18n_text(c -> 'html')) then
        raise exception 'lesson_blocks.content de kind=% requiere { html: I18nText }', new.kind
          using errcode = 'check_violation';
      end if;

    -- Lista ordenada de pasos: el .steps de Y6A.
    when 'steps' then
      if not (c ? 'steps' and jsonb_typeof(c -> 'steps') = 'array'
              and jsonb_array_length(c -> 'steps') > 0) then
        raise exception 'lesson_blocks.content de kind=steps requiere { steps: I18nText[] no vacío }'
          using errcode = 'check_violation';
      end if;
      if exists (select 1 from jsonb_array_elements(c -> 'steps') s
                 where not app.is_i18n_text(s.value)) then
        raise exception 'lesson_blocks.content.steps: cada elemento debe ser un I18nText válido'
          using errcode = 'check_violation';
      end if;

    when 'table' then
      if not (c ? 'headers' and jsonb_typeof(c -> 'headers') = 'array'
              and c ? 'rows' and jsonb_typeof(c -> 'rows') = 'array') then
        raise exception 'lesson_blocks.content de kind=table requiere { headers: [], rows: [[]] }'
          using errcode = 'check_violation';
      end if;
      -- Una tabla con filas de anchura distinta a la cabecera se renderiza rota.
      if exists (
        select 1 from jsonb_array_elements(c -> 'rows') r
        where jsonb_typeof(r.value) <> 'array'
           or jsonb_array_length(r.value) <> jsonb_array_length(c -> 'headers')
      ) then
        raise exception 'lesson_blocks.content de kind=table: toda fila debe tener % celdas',
          jsonb_array_length(c -> 'headers')
          using errcode = 'check_violation';
      end if;

    -- Imagen y vídeo se apoyan en media_assets, que ya obliga a alt_text.
    when 'image', 'video' then
      if new.media_id is null then
        raise exception 'lesson_blocks de kind=% requiere media_id (la accesibilidad vive en media_assets.alt_text)',
          new.kind
          using errcode = 'check_violation';
      end if;

    -- Widget del cliente: `component` identifica el componente de @cet/ui y
    -- `props` sus parámetros. Sin `component` el bloque es un hueco en blanco.
    when 'interactive' then
      if not (c ? 'component' and jsonb_typeof(c -> 'component') = 'string'
              and length(c ->> 'component') > 0) then
        raise exception 'lesson_blocks.content de kind=interactive requiere { component: string, props?: object }'
          using errcode = 'check_violation';
      end if;
      if c ? 'props' and jsonb_typeof(c -> 'props') <> 'object' then
        raise exception 'lesson_blocks.content.props debe ser un objeto'
          using errcode = 'check_violation';
      end if;

    -- Fail-closed: si mañana se añade un miembro a `block_kind` y nadie escribe
    -- su validador, los inserts de ese kind FALLAN en vez de colarse sin validar.
    -- Sin este ELSE, plpgsql lanzaría CASE_NOT_FOUND con un mensaje ininteligible.
    else
      raise exception 'block_kind=% no tiene validador en app.validate_lesson_block_content()', new.kind
        using errcode = 'check_violation';
  end case;

  return new;
end;
$$;

comment on function app.validate_lesson_block_content() is
  'Unión discriminada por kind. La validación fina la hace Zod; esto impide basura por la puerta de atrás.';

create trigger lesson_blocks_validate_content
  before insert or update of content, kind, media_id on public.lesson_blocks
  for each row execute function app.validate_lesson_block_content();
