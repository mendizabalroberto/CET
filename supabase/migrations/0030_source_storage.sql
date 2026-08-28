-- =============================================================================
-- 0030_source_storage.sql — el fichero original, guardado y solo para el staff
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: docs/superpowers/specs/2026-08-28-corpus-y6a-design.md §4
-- =============================================================================
-- El corpus guarda lo que PONE en cada documento. No guarda el documento.
--
-- Y hace falta, por una razón concreta: cuando un revisor mire una pregunta
-- rara y siga su cita hasta el span, va a querer ver la página. Sobre todo en
-- el carril de visión, donde el span no es una copia sino la INTERPRETACIÓN que
-- alguien hizo de una imagen. Sin el original al lado, esa cadena termina en
-- "confía en quien transcribió".
--
-- POR QUÉ NO VA A `media_assets`
--
-- Esa tabla exige `alt_text NOT NULL`, y con razón: su contenido se le RENDERIZA
-- AL ALUMNO, y un alumno con lector de pantalla no puede quedarse fuera de una
-- lección porque alguien tuviera prisa. Estos ficheros son otra cosa: son
-- procedencia, los mira el staff para auditar, y ninguno se le muestra a un
-- alumno. Inventarles un texto alternativo a 71 escaneos que nadie va a
-- escuchar sería cumplir la letra de esa regla traicionando su motivo — y
-- además llenaría de ruido la tabla que sí sirve para lecciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dónde vive el original
-- -----------------------------------------------------------------------------
alter table public.source_documents
  add column storage_path text;

alter table public.source_documents
  add constraint source_documents_storage_path_shape
  check (
    storage_path is null
    or (
      storage_path ~ '^[A-Za-z0-9]'
      and storage_path not like '%..%'
      and storage_path not like '%\%'
      and storage_path !~ '[[:cntrl:]]'
      and length(storage_path) <= 400
    )
  );

comment on column public.source_documents.storage_path is
  'Ruta dentro del bucket `source-material`. NULL = el original aún no se ha subido.';


-- -----------------------------------------------------------------------------
-- El bucket, privado
-- -----------------------------------------------------------------------------
-- `public = false` no es una precaución genérica. Aquí dentro está
-- `Grade 5 Math Exam - ANSWER KEY.pdf`: la clave de respuestas del examen. Un
-- bucket público la serviría a cualquiera con la URL, y la URL es adivinable
-- desde el nombre del fichero. Sería la misma fuga que 0013 evita a nivel de
-- columna, abierta por otra puerta.
insert into storage.buckets (id, name, public, file_size_limit)
values ('source-material', 'source-material', false, 52428800)
on conflict (id) do update set public = false;


-- -----------------------------------------------------------------------------
-- Quién puede tocarlo
-- -----------------------------------------------------------------------------
-- El ALUMNO no aparece. Ni para leer. Es la misma decisión que en 0027 con las
-- cuatro tablas del corpus, y por el mismo motivo: aquí están los exámenes con
-- su clave. Que un alumno no pueda leer `question_versions.answer_spec` no
-- sirve de nada si puede descargarse el PDF de la clave.
--
-- `storage.objects` ya tiene la RLS activada por Supabase; solo se añaden las
-- políticas, acotadas a este bucket.

drop policy if exists source_material_select on storage.objects;
create policy source_material_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'source-material'
    and ((select app.is_staff()) or (select app.is_superadmin()))
  );

drop policy if exists source_material_insert on storage.objects;
create policy source_material_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'source-material'
    and ((select app.is_staff()) or (select app.is_superadmin()))
  );

drop policy if exists source_material_update on storage.objects;
create policy source_material_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'source-material'
    and ((select app.is_staff()) or (select app.is_superadmin()))
  )
  with check (
    bucket_id = 'source-material'
    and ((select app.is_staff()) or (select app.is_superadmin()))
  );

-- Sin política de DELETE: borrar un original deja huérfanas las citas que
-- alguien pueda querer auditar. Si hay que borrar algo, se hace a conciencia y
-- con la clave de servicio, no por una ruta que exista de serie.
