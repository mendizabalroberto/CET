-- =============================================================================
-- 0041_socials_es.sql — la lección 4 de Sociales deja de estar solo en inglés
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
-- Sigue la forma de 0028_leccion_en_espanol.sql (matemáticas): localización por
-- clave natural, escrituras aditivas con `jsonb_set`, guarda `not (… ? 'es')`
-- en cada UPDATE y cero UUID.
--
-- -----------------------------------------------------------------------------
-- QUÉ ARREGLA
-- -----------------------------------------------------------------------------
-- La materia `socials` está sembrada en producción solo en inglés. El alumno
-- ve el marco de la aplicación en español y la lección en inglés. No es un
-- fallo de i18n: es contenido que falta.
--
--   select count(*) from lesson_blocks b
--   join lessons l on l.id = b.lesson_id
--   join course_modules m on m.id = l.module_id
--   join courses c on c.id = m.course_id
--   join subjects s on s.id = c.subject_id
--   where s.code = 'socials' and s.school_id is null
--     and c.school_id is null and c.year_level = 6
--     and l.ord = 4 and b.content ? 'html'
--     and not (b.content -> 'html' ? 'es');   -- 10
--
-- -----------------------------------------------------------------------------
-- CÓMO AÑADE EL ESPAÑOL (y por qué no puede borrar el inglés)
-- -----------------------------------------------------------------------------
-- Nunca se asigna el campo entero. Siempre se MEZCLA sobre el objeto existente
-- con `||` (y `jsonb_set` para bajar al nivel que toca), así que la clave `en`
-- sobrevive por construcción: no hay ninguna sentencia aquí capaz de perderla.
--
-- Idempotente: cada UPDATE lleva la guarda `not (… ? 'es')`. Ejecutarla dos
-- veces no toca ni una fila la segunda vez.
--
-- Sin UUID literales: las filas se localizan por clave natural — materia
-- `socials` global → curso de year_level 6 → lección `ord` → bloque `ord`.
--
-- -----------------------------------------------------------------------------
-- DE DÓNDE SALE EL TEXTO
-- -----------------------------------------------------------------------------
-- Traducción escrita a mano sobre el inglés que hay HOY en producción (el que
-- extrajo contracts/fuentes/socials-b4.json). Criterio: español de España tal
-- y como lo diría un maestro a un niño de 10 años, con la terminología fija sin
-- negociar — pliegues, falla, corteza terrestre, manto, magma, placa tectónica.
--
-- Decisiones que conviene mirar al aprobar:
--
--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal y coma
--      de millar. No se convierten a la notación española. El examen es en
--      inglés y el niño escribirá `12.6` en él; enseñarle `12,6` en la mitad
--      española del mismo trainer sería enseñarle a fallar.
--
--   2. `&amp;` que une dos palabras se traduce por «y». `&lt;` se conserva
--      literal, es el signo «menor que».
--
--   3. Los símbolos y números se conservan: `x`, `÷`, `→`, y toda cifra.
--
--   4. Los nombres propios no se traducen: Himalayas, Alpes, Andes, Rocosas,
--      Urales, África Oriental, Ruwenzori, Usambara, Uluguru, Kilimanjaro,
--      Fujiyama, Taranaki, Kenia, Sarawat, India, Asia, Europa, Norteamérica,
--      Atlántico.
--
--   5. Terminología de la materia (fija, la más común en un libro de texto
--      español de primaria): montañas de pliegues, montañas en bloque,
--      montañas volcánicas, corteza terrestre, manto, magma, placa, falla,
--      meseta, cordillera.
--
-- -----------------------------------------------------------------------------
-- QUÉ **NO** TOCA
-- -----------------------------------------------------------------------------
--   · La clave `en` de absolutamente nada. Ni una sola.
--   · Ningún esquema: esto es una migración de datos, no hay DDL.
--   · Ninguna otra lección de `socials` ni ninguna otra materia.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Los 10 bloques con `content.html` de la lección 4
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
  (1, '<b>Respuesta a la pregunta 1, lista para escribir:</b><br>Hay dos tipos de montañas: las <b>montañas de pliegues</b> (ejemplos: el <b>Himalaya</b>, los <b>Alpes</b>, los <b>Andes</b> — también las Rocosas y los Urales) y las <b>montañas en bloque</b> (ejemplos: las zonas de tierras altas de <b>África Oriental</b>, como las montañas <b>Ruwenzori</b>, <b>Usambara</b> y <b>Uluguru</b>). Un tercer tipo son las <b>montañas volcánicas</b> (ejemplos: el <b>Kilimanjaro</b>, el <b>Fujiyama</b>, el <b>monte Taranaki</b>).'),
  (2, '<h3>🗻 ¿Solas o en cadena?</h3><ul><li>Unas <b>pocas</b> montañas <b>están solas</b>: el <b>Fujiyama</b> en Japón, el <b>monte Taranaki</b> en Nueva Zelanda, el <b>monte Kenia</b> en África y el <b>Kilimanjaro</b> en África (una montaña volcánica que está sola).</li><li>La <b>mayoría</b> de las montañas están en <b>cadenas largas llamadas cordilleras</b>. Ejemplos de cordilleras: los <b>Alpes</b>, los <b>Andes</b>, el <b>Himalaya</b>, el <b>Sarawat</b> y las <b>Montañas Rocosas</b>.</li></ul>'),
  (3, '<b>Definición para aprender:</b> una <b>cordillera</b> es una <b>cadena larga de montañas unidas entre sí</b>.'),
  (4, '<h3>🌍 ¿De qué está hecha la Tierra?</h3><ul><li>La Tierra está hecha de <b>capas de roca</b>.</li><li>La <b>capa sólida exterior</b> de roca se llama <b>corteza terrestre</b>.</li><li>Debajo de la corteza hay una capa llamada <b>manto</b>.</li><li>Cerca de la <b>parte superior del manto</b>, algunas rocas están tan <b>calientes</b> que se han <b>fundido</b> y forman un <b>líquido espeso, como alquitrán pegajoso</b> — esto es el <b>magma</b> (roca fundida).</li></ul>'),
  (5, '<b>¿De qué está hecha la corteza terrestre?</b> La corteza está hecha de <b>piezas grandes llamadas placas</b>, que <b>encajan como las piezas de un puzle</b>. Algunas placas <b>llevan continentes</b> y otras <b>llevan océanos</b>. Las placas <b>se mueven lentamente, flotando sobre la roca fundida del manto que tienen debajo</b>.'),
  (6, '<h3>🌋 Montañas volcánicas</h3><ol><li>Todas las rocas que rodean el manto <b>presionan sobre él</b>, así que la <b>roca fundida está bajo una gran presión</b>.</li><li>Si hay un <b>punto débil en la corteza terrestre</b>, la roca fundida <b>sale a través de él</b>…</li><li>…y <b>sale a la superficie de la Tierra</b>, formando un <b>volcán</b>.</li><li>El material se acumula alrededor de la abertura y forma una <b>montaña volcánica</b>.</li></ol><p>Ejemplo: el <b>Kilimanjaro</b> en África es una montaña volcánica que está sola.</p><h3>🗻 Montañas de pliegues</h3><ol><li>La corteza está hecha de <b>placas</b> que <b>se mueven lentamente</b> sobre la roca fundida del manto.</li><li>Donde <b>dos placas empujan una contra la otra</b>, la corteza terrestre <b>se empuja lentamente hacia arriba formando pliegues o crestas</b>.</li><li>Estos pliegues forman las <b>montañas de pliegues</b>.</li></ol>'),
  (7, '<b>La historia del Himalaya — aprende este ejemplo.</b> La India solía estar muy lejos de Asia. Poco a poco, la placa con la <b>India</b> se fue acercando a la placa con <b>Asia</b>. Las rocas del <b>mar que había entre ellas</b> se fueron <b>empujando hacia arriba en pliegues</b> que ahora forman la <b>cordillera del Himalaya</b>. Por eso a veces se pueden encontrar <b>conchas marinas fosilizadas cerca de las cimas del Himalaya</b>. 🐚'),
  (8, '<p>Muchas otras cordilleras — los <b>Alpes, las Rocosas, los Andes y los Urales</b> — también son <b>montañas de pliegues</b>.</p><h3>🧱 Fallas y montañas en bloque</h3><ol><li>Mientras unas placas <b>empujan juntas</b>, otras <b>se separan</b>. Europa y Norteamérica se separan lentamente — cada año el <b>océano Atlántico es unos centímetros más ancho</b>.</li><li>Cuando las rocas se separan, a menudo <b>se agrietan</b> y crean roturas llamadas <b>fallas</b>.</li><li>A veces <b>grandes bloques de roca se empujan hacia arriba entre dos fallas</b>.</li><li>Estos bloques pueden ser tan <b>grandes y altos</b> que forman <b>montañas en bloque</b> — como algunas de las <b>zonas de tierras altas de África Oriental</b>.</li><li>Las montañas en bloque suelen tener <b>cimas planas</b>. Una <b>tierra alta de cima plana se llama meseta</b>.</li></ol>'),
  (9, '<b>¡No los confundas!</b><br>Las placas <b>EMPUIJAN JUNTAS</b> → la corteza <b>se pliega</b> → montañas de <b>PLIEGUES</b>.<br>Las placas <b>SE SEPARAN</b> → la roca <b>se agrieta en fallas</b> → bloques empujados hacia arriba → montañas en <b>BLOQUE</b>.<br>El magma <b>SALE A TRAVÉS</b> de un punto débil → montañas <b>VOLCÁNICAS</b>.'),
  (10, '<h3>✅ Las 7 preguntas de clase, respondidas</h3>')
) as tr(block_ord, es)
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'socials' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and l.ord = 4
  and b.ord = tr.block_ord
  and b.content ? 'html'
  and not (b.content -> 'html' ? 'es');

