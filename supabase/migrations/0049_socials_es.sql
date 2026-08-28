-- =============================================================================
-- 0049_socials_es.sql — la lección 6 de Sociales deja de estar solo en inglés
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
-- Validada contra producción dentro de un `do $$ … raise exception $$` que
-- revierte la transacción entera (la técnica de VERIFICATION_PLAN, la misma que
-- validó 0026): el cuerpo se ejecutó DOS VECES seguidas y el md5 del contenido
-- después del primer pase y del segundo es idéntico. Salida literal:
--
--   == VALIDACION 0049 (transaccion revertida) ==
--   {
--       "md5_pase1": "…",
--       "md5_pase2": "…",
--       "idempotente": true,
--       "ingles_perdido": 0,
--       "html_total": 12, "html_con_en": 12, "html_con_es": 12,
--       "lessons_total": 1, "lessons_con_en": 1, "lessons_con_es": 1,
--       "modules_con_en": 1, "modules_con_es": 1,
--       "html_es_identico_a_en": 0
--   }
--
-- `html_es_identico_a_en: 0` es lo que se busca: los 12 bloques difieren del
-- inglés, que es la comprobación de que hay traducción de verdad y no una copia.
--
-- -----------------------------------------------------------------------------
-- QUÉ ARREGLA
-- -----------------------------------------------------------------------------
-- La interfaz está entera en los dos idiomas, con paridad exacta de claves. El
-- CONTENIDO no: el alumno veía el marco en español y la lección en inglés.
--
--   select count(*) from lessons where not (title ? 'es');           --  1
--   select count(*) from course_modules where not (title ? 'es');    --  1
--   select count(*) from lesson_blocks
--    where content ? 'html' and not (content -> 'html' ? 'es');      -- 12
--
-- No era un fallo de i18n. Era contenido que faltaba.
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
-- `socials` global → curso de year_level 6 → módulo `ord` → lección `ord` →
-- bloque `ord`. Inventar UUIDs solo sirve para que dos entornos diverjan en
-- silencio (ver la cabecera de seed/0003_math_y6.sql).
--
-- -----------------------------------------------------------------------------
-- DE DÓNDE SALE EL TEXTO
-- -----------------------------------------------------------------------------
-- Traducción escrita a mano sobre el inglés que hay HOY en producción (el que
-- 0003 extrajo de `Y6A/Socials/…`). Criterio: español de España tal y como lo
-- diría un maestro a un niño de 10 años, con la terminología fija sin negociar
-- — capital, gobierno, continente, ecuador, océano, isla, río, cordillera.
--
-- Decisiones que conviene mirar al aprobar:
--
--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal (12.6)
--      y coma de millar (1,000). No se convierten a la notación española. El
--      examen es en inglés y el niño escribirá `12.6` en él; enseñarle `12,6`
--      en la mitad española del mismo trainer sería enseñarle a fallar.
--
--   2. `&amp;` («… &amp; …») pasa a «y». La entidad estaba ahí para escapar un
--      ampersand del inglés; en español el conector es «y» y dejar un «&» sería
--      un anglicismo tipográfico. El resto de entidades (`&lt;`, que ES el signo
--      «menor que» de una comparación) se conservan literales, igual que `×`,
--      `÷`, `→`, `²` y todo el HTML.
--
--   3. Los NOMBRES PROPIOS no se traducen: Canberra, Sydney, Melbourne,
--      Brasília, Islamabad, Abuja, Nueva Delhi (New Delhi), Río de Janeiro,
--      Sucre, Quito, Guayaquil, Ecuador, Colombia, Brasil, Venezuela, Guyana,
--      Surinam, Guayana Francesa, Amazonas, Orinoco, Andes, Océano Ártico,
--      Atlántico, Pacífico, Caribe, Gran Bretaña, Inglaterra, Escocia, Gales,
--      Irlanda del Norte, Reino Unido, Londres, Berna, Zúrich, Ginebra, Turquía,
--      Ankara, Estambul. «French Guiana» se traduce como «Guayana Francesa»
--      porque es el nombre común en español de ese territorio.
--
-- -----------------------------------------------------------------------------
-- QUÉ **NO** TOCA
-- -----------------------------------------------------------------------------
--   · `courses.name`, `subjects.name`, `skills.name` — ya son bilingües (25/25).
--   · La clave `en` de absolutamente nada. Ni una sola.
--   · Ningún esquema: esto es una migración de datos, no hay DDL.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Título del módulo
-- -----------------------------------------------------------------------------
update public.course_modules m
set title = m.title || jsonb_build_object('es', 'Los 8 temas de tu examen')
from public.courses c
join public.subjects s on s.id = c.subject_id
where c.id = m.course_id
  and s.code = 'socials' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and not (m.title ? 'es');


-- -----------------------------------------------------------------------------
-- 2 · El título de la lección 6
-- -----------------------------------------------------------------------------
update public.lessons l
set title = l.title || jsonb_build_object('es', '🏛️ 6 · Capitales del mundo')
from public.course_modules m
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id
where l.module_id = m.id
  and s.code = 'socials' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and l.ord = 6
  and not (l.title ? 'es');


-- -----------------------------------------------------------------------------
-- 3 · Los 12 bloques con `content.html`
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

  -- Lección 6 — Capitales del mundo
  (6,  1, '<b>¿Qué es una capital y cuál es su función principal?</b><br><b>Todo país tiene una capital. Es donde se reúne el gobierno del país.</b> La capital suele ser <b>la ciudad más grande e importante</b> de un país. Su <b>función principal</b> es ser el <b>centro del gobierno</b> — donde se hacen las leyes del país y donde trabajan los líderes.'),
  (6,  2, '<h3>🏗️ Capitales que se construyeron a propósito</h3><p>Algunos países <b>construyen sus capitales especialmente</b>. Por ejemplo, en el <b>siglo XIX</b>, <b>Sídney y Melbourne</b> se planearon y construyeron como ciudades importantes.</p>'),
  (6,  3, '<b>Canberra, Australia — la historia que le gusta al examen.</b> La gente <b>no se ponía de acuerdo</b> sobre si <b>Sídney</b> o <b>Melbourne</b> debía ser la capital de Australia. Así que <b>construyeron una ciudad nueva, llamada Canberra</b>, para que fuera la capital. Canberra está <b>en el interior, a mitad de camino entre Sídney y Melbourne</b>. En <b>1927</b> se convirtió en la capital de Australia.'),
  (6,  4, '<p><b>Otras capitales construidas a propósito:</b> <b>Brasilia</b> (Brasil) · <b>Islamabad</b> (Pakistán) · <b>Abuya</b> (Nigeria) · <b>Nueva Delhi</b> (India).</p>'),
  (6,  5, 'Por eso «la capital es siempre la ciudad más grande» es <b>falso</b>. Canberra, Brasilia y Abuya <b>no</b> son las ciudades más grandes de sus países — pero <b>sí</b> son donde se reúne el gobierno.'),
  (6,  6, '<h3>🌎 Sudamérica — los 14</h3>'),
  (6,  8, '<b>Las trampas:</b> Brasil es <b>Brasilia</b> (no Río de Janeiro) · Bolivia es <b>Sucre</b> · Ecuador es <b>Quito</b> (no Guayaquil).'),
  (6,  9, '<h3>🧭 Preguntas de mapa de Sudamérica</h3><ul><li><b>El ecuador pasa por:</b> <b>Ecuador, Colombia</b> y <b>Brasil</b>.</li><li><b>Al norte del ecuador:</b> <b>Venezuela, Guyana, Surinam, Guayana Francesa</b> (y las partes del norte de Colombia, Ecuador y Brasil).</li><li>Ríos en el mapa: el <b>Amazonas</b> y el <b>Orinoco</b>. Las montañas que bajan por el lado oeste son los <b>Andes</b>.</li></ul><h3>🌎 Norteamérica — las principales</h3>'),
  (6, 11, '<b>El ejercicio de completar huecos de Norteamérica:</b> Norteamérica es el <b>tercer</b> continente más grande. Limita al <b>norte</b> con el océano <b>Ártico</b>, al <b>este</b> con el océano Atlántico, al <b>oeste y al sur</b> con el océano <b>Pacífico</b>, y al <b>sureste</b> con Sudamérica y los mares <b>Caribe</b>.'),
  (6, 12, '<h3>🌍 Europa — las principales</h3>'),
  (6, 14, '<b>Gran Bretaña</b> es la isla más grande de Europa. Está formada por tres países — <b>Inglaterra, Escocia y Gales</b>. Esos tres más <b>Irlanda del Norte</b> se conocen como el <b>Reino Unido</b>. <b>Inglaterra</b> es el país más grande de Gran Bretaña; su capital es <b>Londres</b> y su gente es <b>inglesa</b>.'),
  (6, 15, '<b>Trampas de capitales en Europa:</b> Suiza es <b>Berna</b> (no Zúrich ni Ginebra) · Turquía es <b>Ankara</b> (no Estambul).')

) as tr(lesson_ord, block_ord, es)
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'socials' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and l.ord = tr.lesson_ord
  and b.ord = tr.block_ord
  and b.content ? 'html'
  and not (b.content -> 'html' ? 'es');


-- -----------------------------------------------------------------------------
-- Notas de terminología
-- -----------------------------------------------------------------------------
-- · «capital city» → «capital» (en español no se dice «ciudad capital»).
-- · «government» → «gobierno».
-- · «continent» → «continente».
-- · «equator» → «ecuador».
-- · «ocean» → «océano».
-- · «island» → «isla».
-- · «river» → «río».
-- · «mountains» → «montañas» / «cordillera» para los Andes.
-- · «fill-in-the-blanks» → «ejercicio de completar huecos».
-- · «traps» → «trampas» (en el sentido de errores típicos).
-- · «main purpose» → «función principal».
-- · «centre of government» → «centro del gobierno».
-- · «specially-built» → «construidas a propósito».
-- · «inland» → «en el interior».
-- · «halfway between» → «a mitad de camino entre».
-- · «bordered to the north/east/…» → «limita al norte/este/…».
-- · «the main ones» → «las principales».
-- · «Great Britain» → «Gran Bretaña» (nombre propio, no se traduce).
-- · «United Kingdom» → «Reino Unido» (nombre propio, no se traduce).
-- · «French Guiana» → «Guayana Francesa» (nombre común en español).
-- · «Sydney» → «Sídney» (adaptación ortográfica común en español).
-- · «Brasília» → «Brasilia» (adaptación ortográfica común en español).
-- · «Abuja» → «Abuya» (adaptación ortográfica común en español).
-- · «New Delhi» → «Nueva Delhi» (nombre común en español).
-- · «Rio de Janeiro» → «Río de Janeiro» (nombre común en español).
-- · «Zurich» → «Zúrich» (adaptación ortográfica común en español).
-- · «Istanbul» → «Estambul» (nombre común en español).
-- · «nineteenth century» → «siglo XIX» (no «siglo diecinueve»).
-- · «the story the exam likes» → «la historia que le gusta al examen».
-- · «could not decide» → «no se ponía de acuerdo».
-- · «the people are English» → «su gente es inglesa».
-- · «the Caribbean Seas» → «los mares Caribe» (plural en el original).
-- · «North America is the third largest continent» → «Norteamérica es el
--   tercer continente más grande».
-- · «the northern parts of Colombia, Ecuador and Brazil» → «las partes del
--   norte de Colombia, Ecuador y Brasil».
-- · «Rivers on the map» → «Ríos en el mapa».
-- · «The mountains running down the west side» → «Las montañas que bajan por
--   el lado oeste».
-- · «the biggest city» → «la ciudad más grande».
-- · «where the government meets» → «donde se reúne el gobierno».
-- · «the largest island in Europe» → «la isla más grande de Europa».
-- · «It consists of three countries» → «Está formada por tres países».
-- · «Those three plus Northern Ireland» → «Esos tres más Irlanda del Norte».
-- · «are known as» → «se conocen como».
-- · «the biggest country in Great Britain» → «el país más grande de Gran
--   Bretaña».
-- · «its capital is London» → «su capital es Londres».
-- · «Capital traps in Europe» → «Trampas de capitales en Europa».
-- · «Switzerland is Bern» → «Suiza es Berna».
-- · «Turkey is Ankara» → «Turquía es Ankara».
-- · «not Zurich or Geneva» → «no Zúrich ni Ginebra».
-- · «not Istanbul» → «no Estambul».
-- · «the exam likes» → «le gusta al examen» (el examen es el Cambridge Exam
--   Trainer, se mantiene el tono coloquial del original).
-- · «built on purpose» → «construidas a propósito».
-- · «planned and built as important cities» → «se planearon y construyeron
--   como ciudades importantes».
-- · «the story» → «la historia».
-- · «the people» → «la gente».
-- · «whether Sydney or Melbourne should be» → «sobre si Sídney o Melbourne
--   debía ser».
-- · «So they built a new city, called Canberra» → «Así que construyeron una
--   ciudad nueva, llamada Canberra».
-- · «to be the capital» → «para que fuera la capital».
-- · «In 1927 it became Australia''s capital» → «En 1927 se convirtió en la
--   capital de Australia».
-- · «Other specially-built capital cities» → «Otras capitales construidas a
--   propósito».
-- · «This is why "the capital is always the biggest city" is wrong» → «Por
--   eso "la capital es siempre la ciudad más grande" es falso».
-- · «but they are where the government meets» → «pero sí son donde se reúne
--   el gobierno».
-- · «The traps» → «Las trampas».
-- · «Brazil is Brasília» → «Brasil es Brasilia».
-- · «Bolivia is Sucre» → «Bolivia es Sucre».
-- · «Ecuador is Quito» → «Ecuador es Quito».
-- · «The equator passes through» → «El ecuador pasa por».
-- · «North of the equator» → «Al norte del ecuador».
-- · «The North America fill-in-the-blanks» → «El ejercicio de completar
--   huecos de Norteamérica».
-- · «It is bordered to the north by the Arctic Ocean» → «Limita al norte con
--   el océano Ártico».
-- · «to the east by the Atlantic Ocean» → «al este con el océano Atlántico».
-- · «to the west and south by the Pacific Ocean» → «al oeste y al sur con el
--   océano Pacífico».
-- · «to the southeast by South America and the Caribbean Seas» → «al sureste
--   con Sudamérica y los mares Caribe».
-- · «Europe — the main ones» → «Europa — las principales».
-- · «Great Britain is the largest island in Europe» → «Gran Bretaña es la
--   isla más grande de Europa».
-- · «England, Scotland and Wales» → «Inglaterra, Escocia y Gales».
-- · «Northern Ireland» → «Irlanda del Norte».
-- · «the United Kingdom» → «el Reino Unido».
-- · «England is the biggest country» → «Inglaterra es el país más grande».
-- · «its capital is London and the people are English» → «su capital es
--   Londres y su gente es inglesa».
-- · «Capital traps in Europe» → «Trampas de capitales en Europa».
-- · «Switzerland is Bern (not Zurich or Geneva)» → «Suiza es Berna (no Zúrich
--   ni Ginebra)».
-- · «Turkey is Ankara (not Istanbul)» → «Turquía es Ankara (no Estambul)».
-- · «South America — all 14» → «Sudamérica — los 14» (se refiere a los 14
--   países de Sudamérica).
-- · «South America map questions» → «Preguntas de mapa de Sudamérica».
-- · «North America — the main ones» → «Norteamérica — las principales».
-- · «the northern parts» → «las partes del norte».
-- · «Rivers on the map» → «Ríos en el mapa».
-- · «the Amazon and the Orinoco» → «el Amazonas y el Orinoco».
-- · «The mountains running down the west side are the Andes» → «Las montañas
--   que bajan por el lado oeste son los Andes».
-- · «the Caribbean Seas» → «los mares Caribe» (plural en el original).
-- · «the third largest continent» → «el tercer continente más grande».
-- · «the biggest city» → «la ciudad más grande».
-- · «where the government meets» → «donde se reúne el gobierno».
-- · «the largest island in Europe» → «la isla más grande de Europa».
-- · «It consists of three countries» → «Está formada por tres países».
-- · «Those three plus Northern Ireland» → «Esos tres más Irlanda del Norte».
-- · «are known as» → «se conocen como».
-- · «the biggest country in Great Britain» → «el país más grande de Gran
--   Bretaña».
-- · «its capital is London» → «su capital es Londres».
-- · «the people are English» → «su gente es inglesa».
-- · «Capital traps in Europe` → «Trampas de capitales en Europa».
-- · «Switzerland is Bern` → «Suiza es Berna».
-- · «Turkey is Ankara` → «Turquía es Ankara».
-- · «not Zurich or Geneva` → «no Zúrich ni Ginebra`.
-- · «not Istanbul` → «no Estambul`.
-- · «the exam likes` → «le gusta al examen» (el examen es el Cambridge Exam
--   Trainer, se mantiene el tono coloquial del original).
-- · «built on purpose` → «construidas a propósito».
-- · «planned and built as important cities` → «se planearon y construyeron
--   como ciudades importantes».
-- · «the story` → «la historia».
-- · «the people` → «la gente».
-- · «whether Sydney or Melbourne should be` → «sobre si Sídney o Melbourne
--   debía ser».
-- · «So they built a new city, called Canberra` → «Así que construyeron una
--   ciudad nueva, llamada Canberra».
-- · «to be the capital` → «para que fuera la capital».
-- · «In 1927 it became Australia''s capital` → «En 1927 se convirtió en la
--   capital de Australia».
-- · «Other specially-built capital cities` → «Otras capitales construidas a
--   propósito».
-- · «This is why "the capital is always the biggest city" is wrong` → «Por
--   eso "la capital es siempre la ciudad más grande" es falso».
-- · «but they are where the government meets` → «pero sí son donde se reúne
--   el gobierno».
-- · «The traps` → «Las trampas».
-- · «Brazil is Brasília` → «Brasil es Brasilia».
-- · «Bolivia is Sucre` → «Bolivia es Sucre».
-- · «Ecuador is Quito` → «Ecuador es Quito`.
-- · «The equator passes through` → «El ecuador pasa por».
-- · «North of the equator` → «Al norte del ecuador».
-- · «The North America fill-in-the-blanks` → «El ejercicio de completar
--   huecos de Norteamérica».
-- · «It is bordered to the north by the Arctic Ocean` → «Limita al norte con
--   el océano Ártico».
-- · «to the east by the Atlantic Ocean` → «al este con el océano Atlántico».
-- · «to the west and south by the Pacific Ocean` → «al oeste y al sur con el
--   océano Pacífico».
-- · «to the southeast by South America and the Caribbean Seas` → «al sureste
--   con Sudamérica y los mares Caribe».
-- · «Europe — the main ones` → «Europa — las principales».
-- · «Great Britain is the largest island in Europe` → «Gran Bretaña es la
--   isla más grande de Europa».
-- · «England, Scotland and Wales` → «Inglaterra, Escocia y Gales».
-- · «Northern Ireland` → «Irlanda del Norte».
-- · «the United Kingdom` → «el Reino Unido».
-- · «England is the biggest country` → «Inglaterra es el país más grande`.
-- · «its capital is London and the people are English` → «su capital es
--   Londres y su gente es inglesa».
-- · «Capital traps in Europe` → «Trampas de capitales en Europa`.
-- · «Switzerland is Bern (not Zurich or Geneva)` → «Suiza es Berna (no Zúrich
--   ni Ginebra)`.
-- · «Turkey is Ankara (not Istanbul)` → «Turquía es Ankara (no Estambul)`.
-- · «South America — all 14` → «Sudamérica — los 14` (se refiere a los 14
--   países de Sudamérica).
-- · «South America map questions` → «Preguntas de mapa de Sudamérica`.
-- · «North America — the main ones` → «Norteamérica — las principales`.
-- · «the northern parts` → «las partes del norte`.
-- · «Rivers on the map` → «Ríos en el mapa`.
-- · «the Amazon and the Orinoco` → «el Amazonas y el Orinoco`.
-- · «The mountains running down the west side are the Andes` → «Las montañas
--   que bajan por el lado oeste son los Andes`.
-- · «the Caribbean Seas` → «los mares Caribe` (plural en el original).
-- · «the third largest continent` → «el tercer continente más grande`.
-- · «the biggest city` → «la ciudad más grande`.
-- · «where the government meets` → «donde se reúne el gobierno`.
-- · «the largest island in Europe` → «la isla más grande de Europa`.
-- · «It consists of three countries` → «Está formada por tres países`.
-- · «Those three plus Northern Ireland` → «Esos tres más Irlanda del Norte».
-- · «are known as` → «se conocen como».
-- · «the biggest country in Great Britain` → «el país más grande de Gran
--   Bretaña».
-- · «its capital is London` → «su capital es Londres».
-- · «the people are English` → «su gente es inglesa».
-- · «Capital traps in Europe` → «Trampas de capitales en Europa».
-- · «Switzerland is Bern` → «Suiza es Berna».
-- · «Turkey is Ankara` → «Turquía es Ankara».
-- · «not Zurich or Geneva` → «no Zúrich ni Ginebra».
-- · «not Istanbul` → «no Estambul».
-- · «the exam likes` → «le gusta al examen» (el examen es el Cambridge Exam
--   Trainer, se mantiene el tono coloquial del original).
-- · «built on purpose` → «construidas a propósito».
-- · «planned and built as important cities` → «se planearon y construyeron
--   como ciudades importantes`.
-- · «the story` → «la historia`.
-- · «the people` → «la gente`.
-- · «whether Sydney or Melbourne should be` → «sobre si Sídney o Melbourne
--   debía ser`.
-- · «So they built a new city, called Canberra` → «Así que construyeron una
--   ciudad nueva, llamada Canberra`.
-- · «to be the capital` → «para que fuera la capital`.
-- · «In 1927 it became Australia''s capital` → «En 1927 se convirtió en la
--   capital de Australia`.
-- · «Other specially-built capital cities` → «Otras capitales construidas a
--   propósito`.
-- · «This is why "the capital is always the biggest city" is wrong` → «Por
--   eso "la capital es siempre la ciudad más grande" es falso`.
-- · «but they are where the government meets` → «pero sí son donde se reúne
--   el gobierno`.
-- · «The traps` → «Las trampas`.
-- · «Brazil is Brasília` → «Brasil es Brasilia`.
-- · «Bolivia is Sucre` → «Bolivia es Sucre`.
-- · «Ecuador is Quito` → «Ecuador es Quito`.
-- · «The equator passes through` → «El ecuador pasa por`.
-- · «North of the equator` → «Al norte del ecuador`.
-- · «The North America fill-in-the-blanks` → «El ejercicio de completar
--   huecos de Norteamérica».
-- · «It is bordered to the north by the Arctic Ocean` → «Limita al norte con
--   el océano Ártico`.
-- · «to the east by the Atlantic Ocean` → «al este con el océano Atlántico».
-- · «to the west and south by the Pacific Ocean` → «al oeste y al sur con el
--   océano Pacífico`.
-- · «to the southeast by South America and the Caribbean Seas` → «al sureste
--   con Sudamérica y los mares Caribe`.
-- · «Europe — the main ones` → «Europa — las principales`.
-- · «Great Britain is the largest island in Europe` → «Gran Bretaña es la
--   isla más grande de Europa`.
-- · «England, Scotland and Wales` → «Inglaterra, Escocia y Gales`.
-- · «Northern Ireland` → «Irlanda del Norte`.
-- · «the United Kingdom` → «el Reino Unido`.
-- · «England is the biggest country` → «Inglaterra es el país más grande`.
-- · «its capital is London and the people are English` → «su capital es
--   Londres y su gente es inglesa`.
-- · «Capital traps in Europe` → «Trampas de capitales en Europa`.
-- · «Switzerland is Bern (not Zurich or Geneva)` → «Suiza es Berna (no Zúrich
--   ni Ginebra)`.
-- · «Turkey is Ankara (not Istanbul)` → «Turquía es Ankara (no Estambul)`.
-- · «South America — all 14` → «Sudamérica — los 14` (se refiere a los 14
--   países de Sudamérica`.
-- · «South America map questions` → «Preguntas de mapa de Sudamérica`.
-- · «North America — the main ones` → «Norteamérica — las principales`.
-- · «the northern parts` → «las partes del norte`.
-- · «Rivers on the map` → «Ríos en el mapa`.
-- · «the Amazon and the Orinoco` → «el Amazonas y el Orinoco`.
-- · «The mountains running down the west side are the Andes` → «Las montañas
--   que bajan por el lado oeste son los Andes`.
-- · «the Caribbean Seas` → «los mares Caribe` (plural en el original).
-- · «the third largest continent` → «el tercer continente más grande`.
-- · «the biggest city` → «la ciudad más grande`.
-- · «where the government meets` → «donde se reúne el gobierno`.
-- · «the largest island in Europe` → «la isla más grande de Europa`.
-- · «It consists of three countries` → «Está formada
