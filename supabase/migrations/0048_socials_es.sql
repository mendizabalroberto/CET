-- =============================================================================
-- 0048_socials_es.sql — la lección 5 de Sociales deja de estar solo en inglés
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
-- Sigue la forma de 0028_leccion_en_espanol.sql (matemáticas): localización por
-- clave natural, escrituras aditivas con `jsonb_set(content, '{html}', …)`,
-- guarda `not (content -> 'html' ? 'es')` en cada UPDATE, y cero UUID.
--
-- -----------------------------------------------------------------------------
-- QUÉ ARREGLA
-- -----------------------------------------------------------------------------
-- La materia socials está sembrada en producción solo en inglés. El alumno ve
-- el marco de la aplicación en español y la lección en inglés. No es un fallo
-- de i18n: es contenido que falta.
--
--   select count(*) from lesson_blocks b
--   join lessons l on l.id = b.lesson_id
--   join course_modules m on m.id = l.module_id
--   join courses c on c.id = m.course_id
--   join subjects s on s.id = c.subject_id
--   where s.code = 'socials' and s.school_id is null
--     and c.school_id is null and c.year_level = 6
--     and l.ord = 5
--     and b.content ? 'html' and not (b.content -> 'html' ? 'es');  -- 11
--
-- -----------------------------------------------------------------------------
-- CÓMO AÑADE EL ESPAÑOL (y por qué no puede borrar el inglés)
-- -----------------------------------------------------------------------------
-- Nunca se asigna el campo entero. Siempre se MEZCLA sobre el objeto existente
-- con `||` (y `jsonb_set` para bajar al nivel que toca), así que la clave `en`
-- sobrevive por construcción: no hay ninguna sentencia aquí capaz de perderla.
--
-- Idempotente: cada UPDATE lleva la guarda `not (… ? 'es')`. Ejecutarla dos
-- veces no toca ni una fila la segunda vez, y una corrección manual posterior
-- del español NO se pisa si alguien vuelve a pasar la migración.
--
-- Sin UUID literales: las filas se localizan por clave natural — materia
-- `socials` global → curso de year_level 6 → lección `ord` → bloque `ord`.
--
-- -----------------------------------------------------------------------------
-- DE DÓNDE SALE EL TEXTO
-- -----------------------------------------------------------------------------
-- Traducción escrita a mano sobre el inglés que hay HOY en producción
-- (contracts/fuentes/socials-b5.json). Criterio: español de España tal y como
-- lo diría un maestro a un niño de 10 años, con la terminología fija sin
-- negociar — asentamiento, distrito comercial central (CBD), conurbación,
-- área residencial, rascacielos.
--
-- Decisiones que conviene mirar al aprobar:
--
--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal y coma
--      de millar. El examen es en inglés y el niño escribirá `12.6` en él;
--      enseñarle `12,6` en la mitad española del mismo trainer sería enseñarle
--      a fallar.
--
--   2. `&amp;` («railway and bus stations») pasa a «y». La entidad estaba ahí
--      para escapar un ampersand del inglés; en español el conector es «y».
--      El resto de entidades (`&lt;`) se conservan literales.
--
--   3. Los nombres propios no se traducen: Mesopotamia, Tigris, Éufrates,
--      Nilo, Indo, río Amarillo, Irak, Egipto, Pakistán, India, China,
--      Sídney, Melbourne, Australia. «CBD» se deja como sigla y se explica
--      entre paréntesis la primera vez.
--
--   4. Terminología: «asentamiento» (settlement), «distrito comercial
--      central» (central business district), «conurbación» (conurbation),
--      «área residencial» (residential area), «rascacielos» (skyscraper),
--      «ayuntamiento» (city hall / town hall), «edificios cívicos» (civic
--      buildings), «trenes de cercanías» (commuter trains), «metro» (metro).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Los 11 bloques con `content.html` de la lección 5
-- -----------------------------------------------------------------------------
-- El I18nText NO es `content`: está un nivel más abajo, en `content.html`. Por
-- eso `jsonb_set(content, '{html}', (content -> 'html') || …)`: se reescribe
-- solo esa rama y el resto del objeto queda intacto.
update public.lesson_blocks b
set content = jsonb_set(
      b.content,
      '{html}',
      (b.content -> 'html') || jsonb_build_object('es', tr.es)
    )
from public.lessons l
join public.course_modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id,
(values

  -- Lección 5 — El crecimiento de las ciudades
  (5,  1, '<b>¿Dónde se desarrollaron las primeras ciudades?</b> Las primeras ciudades crecieron <b>hace unos 5,000 a 6,000 años</b>, en <b>Mesopotamia</b> — la tierra entre los ríos <b>Tigris y Éufrates</b> (en el actual Irak). Otras ciudades antiguas aparecieron a lo largo del <b>Nilo</b> en Egipto, el <b>Indo</b> en Pakistán/India y el <b>río Amarillo</b> en China. Todas crecieron <b>junto a los ríos</b>, porque los ríos daban a la gente <b>agua, comida, tierra fértil para cultivar y transporte</b>.'),
  (5,  2, '<h3>🏢 ¿Qué es una ciudad moderna?</h3><p>Una ciudad moderna es un <b>asentamiento muy grande</b> donde vive y trabaja mucha gente. En la mayoría de las ciudades modernas, el suelo se usa para:</p>'),
  (5,  3, '<ul><li><b>viviendas</b></li><li><b>tiendas</b></li><li><b>oficinas</b></li><li><b>bancos</b></li><li><b>fábricas</b></li></ul>'),
  (5,  4, '<ul><li><b>colegios</b></li><li><b>hospitales</b></li><li><b>estaciones de tren y de autobús</b></li><li><b>edificios cívicos</b>, como <b>ayuntamientos</b> o <b>casas consistoriales</b></li></ul>'),
  (5,  5, 'Muchas ciudades tienen una <b>mezcla de edificios antiguos y modernos</b>, porque la ciudad se ha <b>desarrollado durante un largo periodo de tiempo</b>.'),
  (5,  6, '<h3>🏗️ ¿Por qué se construyen rascacielos en los centros de las ciudades?</h3>'),
  (5,  7, 'Porque <b>el suelo en el centro de la ciudad es muy caro</b>. Para <b>aprovechar al máximo el suelo</b>, la gente construye <b>edificios muy altos llamados rascacielos</b>, que <b>se elevan por encima de los edificios antiguos</b>. Construir <b>hacia arriba</b> permite meter muchas más oficinas y viviendas en un terreno pequeño y costoso.'),
  (5,  8, '<h3>🏦 Zonas de la ciudad y el CBD</h3><ul><li>Las ciudades pueden dividirse en diferentes <b>áreas o zonas</b>, cada una con una <b>finalidad distinta</b>.</li><li>El <b>centro</b> de la ciudad se llama <b>distrito comercial central (CBD)</b>.</li><li>En el CBD se encuentran <b>la mayoría de las oficinas, los bancos, las grandes tiendas, las galerías de arte y los museos</b>.</li></ul><h3>🚆 Cómo el transporte ayudó a que las ciudades crecieran hacia fuera</h3><ol><li>Un mejor transporte — <b>trenes de cercanías</b> y <b>metros</b> — ayuda a las ciudades a <b>extenderse hacia fuera</b>.</li><li>Así, más gente puede <b>vivir más lejos del centro de la ciudad</b> y <b>aun así poder viajar al trabajo</b>.</li><li>Como resultado, se desarrollan nuevas <b>áreas residenciales llamadas suburbios</b> <b>alrededor de los bordes de la ciudad</b>.</li></ol><h3>🔑 Palabras clave</h3>'),
  (5, 10, '<h3>🏘️ Conurbaciones</h3><p>A medida que las ciudades crecen, <b>se extienden hacia el campo que las rodea</b>. Con el tiempo, los pueblos y ciudades vecinos pueden <b>fusionarse</b> y convertirse en <b>una única área urbana muy grande</b>. Esto se llama <b>conurbación</b>.</p>'),
  (5, 12, '<b>¿Sabías que…?</b> <b>Sídney</b> y <b>Melbourne</b> son las <b>dos ciudades más grandes de Australia</b>. En el siglo XIX fueron <b>planificadas y construidas</b> como ciudades importantes.'),
  (5, 13, '<h3>🤔 Piensa en ello: vivir en una conurbación</h3>')

) as tr(lesson_ord, block_ord, es)
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'socials' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and l.ord = tr.lesson_ord
  and b.ord = tr.block_ord
  and b.content ? 'html'
  and not (b.content -> 'html' ? 'es');


-- -----------------------------------------------------------------------------
-- Notas de terminología
-- -----------------------------------------------------------------------------
-- · «settlement» → «asentamiento»: término estándar en geografía de primaria.
