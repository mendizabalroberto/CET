-- =============================================================================
-- 0016_content_pack_compat.sql — compatibilidad con los content packs
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `answer_spec.type = 'engine'` para preguntas generadas
-- -----------------------------------------------------------------------------
-- Una pregunta `kind = 'generated'` NO lleva clave de corrección en el banco: la
-- clave se produce al materializar el intento, cuando el generador resuelve la
-- semilla, y se congela en `attempt_items.answer_key`. Lo que guarda
-- `question_versions.answer_spec` es un marcador que dice "pregúntale al motor".
--
-- Hasta ahora el CHECK solo admitía los siete tipos de clave real, así que el
-- banco de Matemáticas entero era irrepresentable. Se añade `engine`, que es
-- honesto y autodocumentado, en vez de meter una clave falsa de tipo `numeric`
-- que nadie usaría y que confundiría a quien leyera la tabla.
alter table public.question_versions
  drop constraint question_versions_answer_has_type;

alter table public.question_versions
  add constraint question_versions_answer_has_type
  check (answer_spec ? 'type'
         and answer_spec ->> 'type' in
             ('choice','numeric','fraction','text','ordering','matching','manual','engine'));

-- Un marcador `engine` obliga a que la pregunta declare a qué generador llamar.
-- Sin esto, una pregunta podría llevar el marcador y quedarse sin forma de
-- corregirse — un item en blanco a mitad del examen.
alter table public.question_versions
  add constraint question_versions_engine_marker_needs_engine_key
  check (
    answer_spec ->> 'type' <> 'engine'
    or (answer_spec ? 'engineKey'
        and (answer_spec ->> 'engineKey') ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
  );

comment on constraint question_versions_answer_has_type on public.question_versions is
  'Unión discriminada AnswerKey de @cet/shared, más `engine` para las preguntas generadas, '
  'cuya clave real nace al materializar el intento.';

-- -----------------------------------------------------------------------------
-- 2. `pass_threshold` es un PORCENTAJE, no un ratio
-- -----------------------------------------------------------------------------
-- Los content packs lo expresan como ratio (0.6). La columna lo guarda como
-- porcentaje (60). Ambos valores pasaban el CHECK `between 0 and 100`, así que
-- cargar un pack sin convertir habría fijado el aprobado en 0,6 % — es decir,
-- todo el mundo aprueba con una pregunta bien, y nadie se entera hasta que un
-- profesor mira las notas.
--
-- Un umbral por debajo del 1 % no tiene sentido pedagógico en ninguna escala, así
-- que se prohíbe: convierte un fallo de unidades silencioso en uno ruidoso.
alter table public.exam_blueprints
  drop constraint exam_blueprints_threshold_range;

alter table public.exam_blueprints
  add constraint exam_blueprints_threshold_range
  check (pass_threshold = 0 or (pass_threshold >= 1 and pass_threshold <= 100));

comment on column public.exam_blueprints.pass_threshold is
  'PORCENTAJE (60 = 60 %), no ratio. Los content packs usan ratio: hay que multiplicar por 100 al cargar.';
