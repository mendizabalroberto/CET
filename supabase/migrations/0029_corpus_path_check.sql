-- =============================================================================
-- 0029_corpus_path_check.sql — arregla el CHECK de ruta de source_documents
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0027 escribió el CHECK de `source_documents.path` con dos defectos.
--
-- **Uno: `{0,511}`.** Postgres no admite repeticiones por encima de 255, y no
-- lo dice al crear la restricción: la crea sin protestar y falla al EVALUARLA,
-- con `invalid regular expression: invalid repetition count(s)`. Resultado: una
-- tabla donde no entra ni una fila, y un error que habla de expresiones
-- regulares cuando lo que fallaba era un INSERT.
--
-- **Dos: era una lista blanca de caracteres**, y por tanto una lista de lo que
-- a quien la escribió se le ocurrió. Se cayó con `Mountains, hills and maps.docx`
-- porque no había pensado en la coma. Mañana se caería con un apóstrofo, o con
-- un signo de admiración. Una lista blanca de caracteres sobre nombres de
-- fichero que pone un profesor es una promesa que no se puede cumplir.
--
-- Lo que de verdad hay que impedir es concreto y corto: **salir del árbol** y
-- **colar caracteres de control**. Eso es lo que se comprueba ahora, y nada
-- más. La longitud va en su propia restricción: mezclar "qué caracteres valen"
-- con "cuántos caben" en una sola regex es lo que causó el primer defecto.
-- =============================================================================

alter table public.source_documents
  drop constraint source_documents_path_shape;

alter table public.source_documents
  add constraint source_documents_path_shape
  check (
    -- Empieza por carácter normal: ni '/', ni '.', ni espacio.
    path ~ '^[A-Za-z0-9]'
    -- Sin traversal, en ninguna de sus formas.
    and path not like '%..%'
    -- Sin separador de Windows: la ruta canónica del repositorio usa '/'.
    and path not like '%\%'
    -- Sin caracteres de control (incluye NUL, salto de línea y tabulador), que
    -- son lo único que puede romper un log, una URL firmada o un shell.
    and path !~ '[[:cntrl:]]'
  );

alter table public.source_documents
  add constraint source_documents_path_bounded
  check (length(path) between 1 and 400);
