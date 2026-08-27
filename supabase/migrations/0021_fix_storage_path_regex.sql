-- 0021 · La CHECK de `media_assets.storage_path` era un regex inválido.
-- © 2026 Roberto Mendizabal. Todos los derechos reservados.
--
-- EL FALLO
-- ---------------------------------------------------------------------------
-- 0006_content.sql declaró:
--
--   check (storage_path ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{0,511}$' and ...)
--
-- El motor de expresiones regulares de Postgres limita las repeticiones de un
-- bound `{m,n}` a 255. Con 511, el patrón NO COMPILA:
--
--   select 'alfa/shape.png' ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{0,511}$';
--   ERROR: 2201B: invalid regular expression: invalid repetition count(s)
--
-- POR QUÉ NADIE SE ENTERÓ
-- `ALTER TABLE ... ADD CHECK` no compila el patrón si la tabla está vacía: no
-- hay ninguna fila contra la que evaluarlo. La constraint se creó limpiamente,
-- lleva meses en el esquema con aspecto correcto, y `media_assets` sigue con
-- CERO filas. El error aparecería en el PRIMER insert de un recurso multimedia
-- —es decir, al cargar los packs de contenido con imágenes— y no como una
-- violación de constraint, sino como un error de expresión regular, que manda a
-- depurar el sitio equivocado.
--
-- Lo destapó la primera ejecución de las suites pgTAP: la fixture inserta dos
-- `media_assets` y las seis suites morían ahí, con 168 tests planificados y 0
-- ejecutados.
--
-- LA CORRECCIÓN
-- La intención original se conserva entera, repartida en tres condiciones que
-- sí compilan. El límite de longitud pasa a `length()`, que no tiene tope
-- artificial y además dice lo que quiere decir; el regex se queda solo con la
-- FORMA, que es lo que un regex sabe expresar bien.
--
-- REGLA: si un bound de un regex se acerca a 255, no es un regex, es una
-- comprobación de longitud disfrazada. Sepáralas.

alter table public.media_assets
  drop constraint if exists media_assets_storage_path_shape;

alter table public.media_assets
  add constraint media_assets_storage_path_shape
  check (
    -- Forma: empieza por alfanumérico, y solo caracteres seguros de ruta.
    storage_path ~ '^[A-Za-z0-9][A-Za-z0-9/._-]*$'
    -- Longitud: el mismo techo de 512 que pretendía el `{0,511}` (1 + 511).
    and length(storage_path) between 1 and 512
    -- Sin travesía de directorios. Se mantiene tal cual estaba.
    and storage_path not like '%..%'
  );

comment on constraint media_assets_storage_path_shape on public.media_assets is
  'Forma, longitud (<=512) y ausencia de travesía. La longitud va aparte: un bound {0,511} no compila (Postgres limita las repeticiones a 255).';
