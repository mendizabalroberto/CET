-- =============================================================================
-- 0027_corpus.sql — corpus de fuentes y cola de candidatos
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: docs/superpowers/specs/2026-08-28-corpus-y6a-design.md
-- =============================================================================
-- El problema que resuelve esta migración:
--
-- El pipeline de trainers (`@cet/content`) es determinista: parsea HTML y cada
-- dato del pack sale con `source: {file, symbol, index}`. Se puede rastrear
-- hasta el carácter del que salió. Los 65 ficheros restantes de Y6A —.docx,
-- .pptx, PDF, imágenes— no dan eso: convertir «Classwork 27» en una lección con
-- preguntas lo hace un MODELO, y un modelo inventa.
--
-- La respuesta no es confiar más en el modelo. Es hacer que **una pregunta sin
-- cita verificable no llegue a existir**:
--
--   source_documents  el fichero, con su sha256 y CÓMO se leyó
--   source_spans      la unidad citable, INMUTABLE
--   content_candidates            lo que un agente propone, en cuarentena
--   content_candidate_citations   el vínculo candidato -> span, con FK de verdad
--
-- Por qué las citas son una TABLA y no un `jsonb` dentro del candidato: un
-- `jsonb` con `{"span_id": "..."}` no lo comprueba nadie. Puede señalar un span
-- que no existe, o uno de otro documento, y la fila se inserta igual. Con una
-- clave foránea, una cita imposible **no entra en la base de datos**. Lo que se
-- le pide a un agente se negocia; lo que se le impide, no.
--
-- AD-2: `school_id` NULLABLE, NULL = biblioteca global. Denormalizado hacia
-- abajo por trigger, como en 0005 y 0006.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- Cómo se leyó el documento. No es metadato decorativo: `vision` significa que
-- el texto lo transcribió un modelo mirando una imagen, y por tanto el propio
-- span es una interpretación. Un revisor tiene derecho a saberlo sin abrir el
-- fichero.
create type public.extraction_method as enum (
  'office_xml',   -- .docx/.pptx: XML dentro del zip. Determinista.
  'text_layer',   -- PDF con capa de texto. Determinista.
  'plain',        -- .txt. Determinista.
  'vision'        -- imagen o PDF escaneado: transcrito mirando. NO determinista.
);

create type public.span_kind as enum (
  'heading',
  'paragraph',
  'list_item',
  'table_row',
  'figure_caption',
  'question',
  'answer_key'
);

-- El ciclo de vida de un candidato. `verified` NO es `approved`: la verificación
-- dice que la cita existe literalmente; la aprobación dice que un humano ha
-- leído la pregunta y la da por buena. Confundirlas es cómo se siembran 400
-- preguntas que nadie miró.
create type public.candidate_status as enum (
  'pending',    -- propuesto, sin verificar
  'verified',   -- la cita casa literalmente con el span; espera revisión humana
  'rejected',   -- la verificación falló, o un humano lo tumbó
  'approved'    -- un humano lo aprobó. Solo esto se siembra.
);

create type public.candidate_kind as enum ('lesson_block', 'question');


-- -----------------------------------------------------------------------------
-- source_documents — un fichero de material original
-- -----------------------------------------------------------------------------
create table public.source_documents (
  id                uuid primary key default extensions.gen_random_uuid(),
  school_id         uuid references public.schools (id) on delete cascade,  -- NULL = global
  -- restrict: no se borra una materia que tiene documentos colgando.
  subject_id        uuid not null references public.subjects (id) on delete restrict,
  -- Ruta relativa a la raíz del repo, con `/` SIEMPRE. Misma regla que
  -- `sourceRef.file` en @cet/content: un pack generado en Windows tiene que ser
  -- idéntico al generado en CI.
  path              text not null,
  mime              text not null,
  bytes             bigint not null,
  -- sha256 del fichero entero. Dos ficheros idénticos son un solo documento:
  -- así es como `Grade 5 Math Exam (v2).pdf` y `Grade 5 Math Exam_1.pdf` —el
  -- duplicado exacto que hay hoy en Y6A— dejan de poder entrar dos veces. Se
  -- impide por construcción, no por vigilancia.
  checksum          text not null,
  extraction        public.extraction_method not null,
  -- Versión del extractor que produjo los spans. Cuando cambie el extractor,
  -- los spans viejos siguen diciendo con qué se sacaron.
  extractor_version text not null,
  pages             integer,
  locale            text not null default 'en',
  ingested_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint source_documents_path_shape
    check (path ~ '^[A-Za-z0-9][A-Za-z0-9/._ ()#°ñÑáéíóúÁÉÍÓÚüÜ-]{0,511}$'
           and path not like '%..%'
           and path not like '%\%'),
  constraint source_documents_checksum_sha256 check (checksum ~ '^[0-9a-f]{64}$'),
  constraint source_documents_mime_shape check (mime ~ '^[a-z]+/[a-zA-Z0-9.+-]+$'),
  constraint source_documents_bytes_pos check (bytes > 0),
  constraint source_documents_pages_sane check (pages is null or pages > 0),
  constraint source_documents_locale_shape check (locale ~ '^[a-z]{2}$'),
  constraint source_documents_version_shape check (extractor_version ~ '^[a-z][a-z0-9_/-]{0,31}$')
);

-- Dos índices parciales por materia y por ruta, misma razón que en `subjects`:
-- en un UNIQUE ordinario NULL nunca colisiona con NULL, así que podrían
-- coexistir cinco documentos globales con la misma ruta.
create unique index source_documents_global_checksum_uniq
  on public.source_documents (checksum) where school_id is null;
create unique index source_documents_school_checksum_uniq
  on public.source_documents (school_id, checksum) where school_id is not null;
create unique index source_documents_global_path_uniq
  on public.source_documents (path) where school_id is null;
create unique index source_documents_school_path_uniq
  on public.source_documents (school_id, path) where school_id is not null;

create index source_documents_subject_idx on public.source_documents (subject_id);
create index source_documents_school_idx on public.source_documents (school_id);

create trigger source_documents_set_updated_at
  before update on public.source_documents
  for each row execute function app.set_updated_at();

alter table public.source_documents enable row level security;

comment on table public.source_documents is
  'Un fichero de material original (Y6A). `extraction` dice si su texto es determinista o transcrito por un modelo.';


-- -----------------------------------------------------------------------------
-- source_spans — la unidad citable
-- -----------------------------------------------------------------------------
-- `text` es texto plano y NO es I18nText, a propósito. Es material original en
-- el idioma en que lo escribió el profesor; envolverlo en `{"en": …}` obligaría
-- a declarar un idioma que nadie ha declarado y a inventar la traducción que
-- falta. El idioma vive en `source_documents.locale`, que es donde se sabe.
create table public.source_spans (
  id          uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.source_documents (id) on delete cascade,
  -- Denormalizado desde el documento por trigger, igual que en 0005/0006: una
  -- política que sube dos joins para saber de qué colegio es un span se ejecuta
  -- por cada fila candidata de cada query.
  school_id   uuid references public.schools (id) on delete cascade,
  ord         integer not null,
  page        integer,
  kind        public.span_kind not null,
  span_text   text not null,
  -- sha256 del texto NORMALIZADO (espacios colapsados, comillas y guiones
  -- unificados). Es el mismo cálculo que hace `checksumOf` en @cet/content: si
  -- los dos divergen, la verificación de citas deja de significar nada.
  checksum    text not null,
  created_at  timestamptz not null default now(),

  constraint source_spans_ord_nonneg check (ord >= 0),
  constraint source_spans_page_sane check (page is null or page > 0),
  constraint source_spans_text_nonempty check (length(btrim(span_text)) > 0),
  constraint source_spans_text_bounded check (length(span_text) <= 8000),
  constraint source_spans_checksum_sha256 check (checksum ~ '^[0-9a-f]{64}$')
);

create unique index source_spans_doc_ord_uniq on public.source_spans (document_id, ord);
create index source_spans_school_idx on public.source_spans (school_id);

create or replace function app.sync_span_school_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select d.school_id into new.school_id
  from public.source_documents d
  where d.id = new.document_id;
  return new;
end;
$$;

create trigger source_spans_sync_school_id
  before insert on public.source_spans
  for each row execute function app.sync_span_school_id();

-- INMUTABLE en UPDATE. Reextraer un documento no muta sus spans: se borra el
-- documento y se vuelve a ingerir, o se crea otro. Mismo principio que hace que
-- editar una pregunta no altere un examen ya realizado (question_versions, C1).
--
-- Se bloquea UPDATE y NO DELETE, y la diferencia no es un descuido: un trigger
-- BEFORE DELETE en la hija se dispara también en el borrado en cascada desde el
-- padre, y dejaría los documentos imborrables para siempre. Un span solo muere
-- con su documento, que es la única forma de borrado que tiene sentido.
create trigger source_spans_immutable
  before update on public.source_spans
  for each row execute function app.block_mutation();

alter table public.source_spans enable row level security;

comment on table public.source_spans is
  'Unidad citable del corpus. Inmutable: reingerir un documento crea spans nuevos, no muta los viejos.';


-- -----------------------------------------------------------------------------
-- content_candidates — lo que propone un agente, en cuarentena
-- -----------------------------------------------------------------------------
create table public.content_candidates (
  id            uuid primary key default extensions.gen_random_uuid(),
  document_id   uuid not null references public.source_documents (id) on delete cascade,
  school_id     uuid references public.schools (id) on delete cascade,
  kind          public.candidate_kind not null,
  -- El bloque o la pregunta, en el MISMO formato que un content pack. Se valida
  -- con Zod en @cet/content antes de llegar aquí; esto es la red que impide que
  -- un insert directo meta basura.
  payload       jsonb not null,
  status        public.candidate_status not null default 'pending',
  -- Qué dijo la verificación: qué cita falló y por qué. Un rechazo sin motivo
  -- legible obliga a repetir el trabajo para saber qué pasó.
  verify_report jsonb,
  model         text,
  cost_usd      numeric(10, 6),
  rounds        smallint,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint content_candidates_payload_object check (app.is_jsonb_object(payload)),
  constraint content_candidates_report_object
    check (verify_report is null or app.is_jsonb_object(verify_report)),
  constraint content_candidates_cost_sane check (cost_usd is null or cost_usd >= 0),
  constraint content_candidates_rounds_sane check (rounds is null or rounds > 0),
  -- Aprobar es un acto de una persona: sin firma y sin fecha, no es aprobación.
  constraint content_candidates_approval_signed
    check (status <> 'approved' or (reviewed_by is not null and reviewed_at is not null))
);

create index content_candidates_document_idx on public.content_candidates (document_id);
create index content_candidates_school_idx on public.content_candidates (school_id);
-- El índice que sirve a la cola de revisión: "dame lo verificado y sin revisar".
create index content_candidates_pending_idx
  on public.content_candidates (status, created_at) where status in ('pending', 'verified');

create or replace function app.sync_candidate_school_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select d.school_id into new.school_id
  from public.source_documents d
  where d.id = new.document_id;
  return new;
end;
$$;

create trigger content_candidates_sync_school_id
  before insert or update of document_id on public.content_candidates
  for each row execute function app.sync_candidate_school_id();

create trigger content_candidates_set_updated_at
  before update on public.content_candidates
  for each row execute function app.set_updated_at();

alter table public.content_candidates enable row level security;

comment on table public.content_candidates is
  'Cuarentena: bloques y preguntas propuestos por un agente. Solo `approved` se siembra.';


-- -----------------------------------------------------------------------------
-- content_candidate_citations — el vínculo que hace verificable la propuesta
-- -----------------------------------------------------------------------------
create table public.content_candidate_citations (
  id           uuid primary key default extensions.gen_random_uuid(),
  candidate_id uuid not null references public.content_candidates (id) on delete cascade,
  -- restrict, no cascade: borrar un span que sostiene una cita dejaría al
  -- candidato citando el vacío. Si hay que borrar el documento, primero caen
  -- sus candidatos (que sí cascadean) y entonces la cita ya no existe.
  span_id      uuid not null references public.source_spans (id) on delete restrict,
  -- El trozo LITERAL que el agente dice haber copiado. La verificación
  -- comprueba, fuera, que este texto está contenido en el span citado tras
  -- normalizar. Guardarlo permite auditar después sin volver a llamar a nadie.
  quote        text not null,
  created_at   timestamptz not null default now(),

  constraint candidate_citations_quote_nonempty check (length(btrim(quote)) > 0),
  constraint candidate_citations_quote_bounded check (length(quote) <= 8000)
);

create unique index candidate_citations_uniq
  on public.content_candidate_citations (candidate_id, span_id, md5(quote));
create index candidate_citations_span_idx on public.content_candidate_citations (span_id);

alter table public.content_candidate_citations enable row level security;

comment on table public.content_candidate_citations is
  'Cita candidato -> span, con FK real: una cita a un span inexistente no entra en la base de datos.';


-- -----------------------------------------------------------------------------
-- Un candidato sin cita no existe
-- -----------------------------------------------------------------------------
-- No se puede expresar con un CHECK (mira otra tabla) ni con una FK. Se hace
-- con un trigger CONSTRAINT DIFERIDO: durante la transacción el candidato puede
-- estar un instante sin citas —hay que insertarlo para tener su id—, pero al
-- hacer COMMIT tiene que tener al menos una. La regla se cumple en el único
-- momento en que se puede observar desde fuera.
create or replace function app.require_candidate_citation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  select count(*) into n
  from public.content_candidate_citations c
  where c.candidate_id = new.id;

  if n = 0 then
    raise exception
      'content_candidates %: un candidato sin cita verificable no puede existir', new.id
      using errcode = 'restrict_violation';
  end if;
  return null;
end;
$$;

create constraint trigger content_candidates_need_citation
  after insert or update on public.content_candidates
  deferrable initially deferred
  for each row execute function app.require_candidate_citation();


-- =============================================================================
-- RLS — quién ve qué
-- =============================================================================
-- El ALUMNO no aparece en ninguna política de este fichero. Ni una.
-- Consecuencia: para un alumno estas cuatro tablas están vacías. Es el fallo
-- seguro correcto (MODULES, regla transversal 1) y además el necesario: los
-- spans de un examen con su clave de respuestas viven aquí.

-- --- source_documents --------------------------------------------------------
create policy source_documents_select on public.source_documents
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and (select app.can_read_content(school_id))
  );

create policy source_documents_insert on public.source_documents
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy source_documents_update on public.source_documents
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy source_documents_delete on public.source_documents
  for delete to authenticated
  using ((select app.can_write_content(school_id)));

-- --- source_spans ------------------------------------------------------------
create policy source_spans_select on public.source_spans
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and (select app.can_read_content(school_id))
  );

create policy source_spans_insert on public.source_spans
  for insert to authenticated
  with check (
    exists (
      select 1 from public.source_documents d
      where d.id = source_spans.document_id
        and (select app.can_write_content(d.school_id))
    )
  );

create policy source_spans_delete on public.source_spans
  for delete to authenticated
  using ((select app.can_write_content(school_id)));

-- Sin política de UPDATE: la tabla es inmutable y el trigger ya lo impone. La
-- ausencia de política es la segunda cerradura, por si alguien quita el trigger.

-- --- content_candidates ------------------------------------------------------
create policy content_candidates_select on public.content_candidates
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and (select app.can_read_content(school_id))
  );

create policy content_candidates_insert on public.content_candidates
  for insert to authenticated
  with check (
    exists (
      select 1 from public.source_documents d
      where d.id = content_candidates.document_id
        and (select app.can_write_content(d.school_id))
    )
  );

create policy content_candidates_update on public.content_candidates
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy content_candidates_delete on public.content_candidates
  for delete to authenticated
  using ((select app.can_write_content(school_id)));

-- --- content_candidate_citations ---------------------------------------------
create policy candidate_citations_select on public.content_candidate_citations
  for select to authenticated
  using (
    exists (
      select 1 from public.content_candidates c
      where c.id = content_candidate_citations.candidate_id
        and ((select app.is_staff()) or (select app.is_superadmin()))
        and (select app.can_read_content(c.school_id))
    )
  );

create policy candidate_citations_insert on public.content_candidate_citations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.content_candidates c
      where c.id = content_candidate_citations.candidate_id
        and (select app.can_write_content(c.school_id))
    )
  );

create policy candidate_citations_delete on public.content_candidate_citations
  for delete to authenticated
  using (
    exists (
      select 1 from public.content_candidates c
      where c.id = content_candidate_citations.candidate_id
        and (select app.can_write_content(c.school_id))
    )
  );


-- =============================================================================
-- GRANTS — qué operaciones puede siquiera intentar cada rol (0013)
-- =============================================================================
-- Fail-closed primero: Supabase concede ALL por defecto sobre lo nuevo de
-- `public`. Se retira todo y se devuelve solo lo necesario.
revoke all on public.source_documents            from anon, authenticated;
revoke all on public.source_spans                from anon, authenticated;
revoke all on public.content_candidates          from anon, authenticated;
revoke all on public.content_candidate_citations from anon, authenticated;

grant select, insert, update, delete on public.source_documents            to authenticated;
grant select, insert,         delete on public.source_spans                to authenticated;
grant select, insert, update, delete on public.content_candidates          to authenticated;
grant select, insert,         delete on public.content_candidate_citations to authenticated;

revoke all on function app.sync_span_school_id()        from public, anon, authenticated;
revoke all on function app.sync_candidate_school_id()   from public, anon, authenticated;
revoke all on function app.require_candidate_citation() from public, anon, authenticated;
