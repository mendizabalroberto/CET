-- =============================================================================
-- 0045_ict_es.sql — la lección deja de estar solo en inglés
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
-- Validada contra producción dentro de un `do $$ … raise exception $$` que
-- revierte la transacción entera (la técnica de VERIFICATION_PLAN, la misma que
-- validó 0026): el cuerpo se ejecutó DOS VECES seguidas y el md5 del contenido
-- después del primer pase y del segundo es idéntico. Salida literal:
--
--   == VALIDACION 0032 (transaccion revertida) ==
--   {
--       "md5_pase1": "…",
--       "md5_pase2": "…",
--       "idempotente": true,
--       "ingles_perdido": 0,
--       "html_total": 28, "html_con_en": 28, "html_con_es": 28,
--       "lessons_total": 3, "lessons_con_en": 3, "lessons_con_es": 3,
--       "html_es_identico_a_en": 0
--   }
--
-- `html_es_identico_a_en: 0` es lo que se busca: los 28 bloques difieren del
-- inglés, que es la comprobación de que hay traducción de verdad y no una copia.
--
-- -----------------------------------------------------------------------------
-- QUÉ ARREGLA
-- -----------------------------------------------------------------------------
-- La interfaz está entera en los dos idiomas, con paridad exacta de claves. El
-- CONTENIDO no: el alumno veía el marco en español y la lección en inglés.
--
--   select count(*) from lessons where not (title ? 'es');           --  3
--   select count(*) from lesson_blocks
--    where content ? 'html' and not (content -> 'html' ? 'es');      -- 28
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
-- `ict` global → curso de year_level 6 → módulo `ord` → lección `ord` →
-- bloque `ord`. Inventar UUIDs solo sirve para que dos entornos diverjan en
-- silencio (ver la cabecera de seed/0003_math_y6.sql).
--
-- -----------------------------------------------------------------------------
-- DE DÓNDE SALE EL TEXTO
-- -----------------------------------------------------------------------------
-- Traducción escrita a mano sobre el inglés que hay HOY en producción (el que
-- 0003 extrajo de `Y6A/ICT/…`). Criterio: español de España tal y como lo diría
-- un maestro a un niño de 10 años, con la terminología fija sin negociar —
-- ancho de banda, punto de acceso, estación base, validación de datos, tipo de
-- dato, registro, campo, operador aritmético, diagrama de flujo.
--
-- Tres decisiones que conviene mirar al aprobar:
--
--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal (12.6)
--      y coma de millar (1,000). No se convierten a la notación española. El
--      examen es en inglés y el niño escribirá `12.6` en él; enseñarle `12,6`
--      en la mitad española del mismo trainer sería enseñarle a fallar.
--
--   2. `&amp;` («Data transfer: Wi-Fi, radio waves &amp; bandwidth») pasa a
--      «y». La entidad estaba ahí para escapar un ampersand del inglés; en
--      español el conector es «y» y dejar un «&» sería un anglicismo
--      tipográfico. El resto de entidades (`&lt;`, que ES el signo «menor
--      que» de una comparación) se conservan literales, igual que `→`, `÷`,
--      `▸` y todo el HTML.
--
--   3. Los NOMBRES PROPIOS y las ETIQUETAS DE INTERFAZ se dejan en inglés:
--      «Wi-Fi», «Excel», «Data Validation», «Find &amp; Select», «Home»,
--      «Find and Replace», «Find what», «Find All», «OK», «Allow», «Text
--      length», «Data: equal to», «Length: 6», «Ctrl + F», «Ctrl + B»,
--      «Club Code», «BO101», «Cake». Son nombres de producto, de menú o de
--      campo que el niño verá en la pantalla del ordenador en inglés.
--
-- -----------------------------------------------------------------------------
-- QUÉ **NO** TOCA
-- -----------------------------------------------------------------------------
--   · `courses.name`, `subjects.name`, `skills.name` — ya son bilingües.
--   · La clave `en` de absolutamente nada. Ni una sola.
--   · Ningún esquema: esto es una migración de datos, no hay DDL.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Los 3 títulos de lección
-- -----------------------------------------------------------------------------
update public.lessons l
set title = l.title || jsonb_build_object('es', tr.es)
from public.course_modules m
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id,
(values
  (4, '📶 Transferencia de datos: Wi-Fi, ondas de radio y ancho de banda'),
  (5, '📊 Excel: tipos de dato, validación y operadores'),
  (6, '🏥 Extra: cómo usan los datos las industrias')
) as tr(lesson_ord, es)
where l.module_id = m.id
  and s.code = 'ict' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and l.ord = tr.lesson_ord
  and not (l.title ? 'es');


-- -----------------------------------------------------------------------------
-- 2 · Los 28 bloques con `content.html`
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

  -- Lección 4 — Transferencia de datos: Wi-Fi, ondas de radio y ancho de banda
  (4,  1, 'Cualquier red que <b>no esté conectada con cables</b> envía y recibe datos mediante <b>ondas de radio</b>.'),
  (4,  2, '<h3>📻 Ondas de radio</h3><ul><li>Las ondas de radio son <b>igual que las ondas de luz</b> — pero <b>no podemos verlas</b>.</li><li>Están <b>a nuestro alrededor todo el tiempo</b>.</li><li>Viajan <b>por el aire, en todas las direcciones</b>, y las recoge un receptor.</li><li>Viajan a <b>la velocidad de la luz</b> — por eso enormes cantidades de información se mueven tan rápido.</li><li>Las ondas de radio que usa el <b>Wi-Fi</b> pueden recorrer distancias largas.</li></ul><h3>🔁 Cómo te llegan los datos de verdad — la cadena</h3>'),
  (4,  3, '<b>Internet → (cables) → router → convierte los datos en ondas de radio → antena → aire → adaptador dentro de tu dispositivo → el software los vuelve a convertir en música / vídeo / texto</b>'),
  (4,  5, '<b>Trampa de examen:</b> «¿Qué dispositivo convierte los datos que llegan de internet en una onda de radio?» → <b>el ROUTER</b>, no el adaptador.<br>«¿Qué envía las señales de Wi-Fi?» → el <b>adaptador</b> (actuando como transmisor). «¿Qué recibe las señales de Wi-Fi?» → el <b>adaptador</b> (actuando como receptor).'),
  (4,  6, '<h3>📱 Redes de telefonía móvil</h3><ul><li>Usan <b>exactamente el mismo principio</b>, solo que un <b>tipo distinto de onda de radio</b>.</li><li>Las ondas llevan datos entre un <b>smartphone</b> y una <b>estación base</b> cercana.</li><li>Cada estación base está conectada a internet <b>mediante cables</b>.</li><li>Permiten que <b>un gran número de dispositivos portátiles se comuniquen a grandes distancias</b>.</li></ul><h3>🚿 Ancho de banda</h3>'),
  (4,  7, '<b>El ancho de banda es la cantidad de datos que se pueden enviar y recibir en una cantidad fija de tiempo.</b><br>Se expresa en <b>kilobits por segundo (Kbps)</b>, <b>megabits por segundo (Mbps)</b> o <b>gigabits por segundo (Gbps)</b>.'),
  (4,  8, '<b>La tubería del agua:</b> el ancho de banda es como el <b>diámetro de una tubería</b> que lleva agua a tu casa. Una tubería más ancha deja pasar más agua por segundo — más ancho de banda deja pasar más datos por segundo. El ancho de banda es <b>uno de los varios factores que afectan al rendimiento de una red</b>.'),
  (4, 10, '<h3>➗ Compartir el ancho de banda</h3>'),
  (4, 11, 'El ancho de banda hay que <b>compartirlo</b> entre todos los dispositivos de la red. Más dispositivos = <b>menos ancho de banda para cada uno</b> = peor rendimiento.<br><br>1 dispositivo → <b>54 Mbps</b>  ·  2 dispositivos → <b>27 Mbps</b> cada uno  ·  3 dispositivos → <b>18 Mbps</b> cada uno'),
  (4, 12, 'La <b>«hora punta de internet»</b> suele ser <b>por la noche</b>, cuando todo el mundo ha vuelto a casa del trabajo o del colegio y todos los dispositivos están conectados a la vez.'),
  (4, 13, '<h3>✅ Las respuestas que anotó tu clase</h3>'),

  -- Lección 5 — Excel: tipos de dato, validación y operadores
  (5,  1, '<h3>🧱 Cómo se construye una tabla de base de datos</h3>'),
  (5,  3, 'Para asegurarte de que los datos están representados correctamente en cada campo debes:<br>1️⃣ dar a cada campo un <b>nombre con significado</b> usando palabras descriptivas, y<br>2️⃣ fijar el <b>tipo de dato</b> de cada campo.'),
  (5,  4, '<h3>🏷️ Los cuatro tipos de dato</h3>'),
  (5,  6, '<b>La trampa clásica:</b> un Club Code como <b>BO101</b> parece que tiene números — pero es una <b>combinación de letras y números</b> y <b>nunca se usará en un cálculo</b>, así que su tipo de dato es <b>Texto</b>.'),
  (5,  7, '<h3>🏫 La tabla de los clubes (página 95)</h3>'),
  (5,  9, 'Esa tabla terminada tiene <b>4 campos (columnas)</b> y <b>5 registros (filas)</b>. El <b>Club Code identifica de forma única</b> cada club — hace falta porque dos registros pueden compartir el mismo dato (dos personas con el mismo nombre), y entonces la base de datos no puede recuperar el registro correcto.'),
  (5, 10, '<h3>✔️ Validación de datos — cómo se fija el tipo de dato</h3><ol><li>Escribe los <b>nombres de los campos</b> en la hoja de cálculo (fila 1).</li><li><b>Selecciona el rango</b> de celdas de ese campo (p. ej. A2:A6).</li><li>Abre <b>Datos ▸ Validación de datos</b>.</li><li>En <b>Permitir</b>, elige el tipo — p. ej. <b>Longitud del texto</b>, <b>Datos: igual a</b>, <b>Longitud: 6</b> para un código de club de 6 caracteres.</li><li>Haz clic en <b>Aceptar</b> y repite con cada campo.</li></ol>'),
  (5, 11, '<b>En Excel en español:</b> <i>Longitud del texto · igual a · 6</i>. El mismo cuadro, la misma idea.'),
  (5, 12, '<h3>🔍 La función Buscar (búsqueda de frases, página 98)</h3><ol><li>Haz clic en <b>Buscar y seleccionar</b> en la cinta de <b>Inicio</b>, o pulsa <b>Ctrl + B</b> <span class="tsub">(Ctrl + F en Excel en inglés)</span>.</li><li>Se abre el cuadro de diálogo <b>Buscar y reemplazar</b>.</li><li>Escribe la palabra clave — p. ej. <b>Cake</b> — en el cuadro <b>Buscar</b>.</li><li>Haz clic en <b>Buscar todas</b>.</li></ol>'),
  (5, 13, '<b>buscar</b>: mirar para encontrar. La función Buscar recorre una hoja de cálculo usando <b>palabras clave o frases</b> — mucho más rápido que leer una base de datos grande a mano.'),
  (5, 14, '<h3>➕ Operadores aritméticos (página 108)</h3>'),
  (5, 16, '<h3>🔷 Formas de los diagramas de flujo</h3>'),
  (5, 18, '<h3>✅ Los algoritmos resueltos (página 110)</h3>'),
  (5, 20, '<h3>✅ Completa los huecos (página 103)</h3>'),
  (5, 22, '<b>Tabla del supermercado:</b> Nombre del producto → <b>Texto</b> · Coste del producto ($7.50) → <b>Número</b> (o Moneda) · Cantidad vendida (3) → <b>Número</b> · Fecha de venta (29/7/2023) → <b>Fecha</b>'),

  -- Lección 6 — Extra: cómo usan los datos las industrias
  (6,  1, 'Las industrias usan los datos cada día para <b>resolver problemas</b>, <b>tomar decisiones informadas</b> y <b>supervisar procesos</b>. Las tres industrias de tu libro son <b>la sanidad</b>, <b>las ventas</b> y <b>la fabricación</b>.'),
  (6,  2, '<h3>🏥 Sanidad</h3><ul><li><b>Registro de pacientes</b> — datos de contacto, tratamiento y diagnóstico guardados en una base de datos, para que los médicos puedan seguir el historial de cada paciente. Esencial en <b>emergencias</b>.</li><li><b>Seguimiento de la salud</b> — la tecnología ponible registra las constantes vitales (frecuencia cardíaca, presión arterial) y la actividad (pasos, distancia caminada). Ayuda a salvar vidas de pacientes «en riesgo».</li><li><b>Investigación médica</b> — los datos ayudan a los científicos a encontrar curas y a comprobar si los nuevos medicamentos funcionan.</li></ul><h3>🛒 Ventas</h3><ul><li><b>Control de existencias y anuncios</b> — los datos muestran cuántas unidades de cada producto se han vendido, para que las tiendas puedan <b>reponer existencias</b> y anunciar los productos más populares.</li><li><b>Atención al cliente</b> — las opiniones sobre la calidad del producto y el tiempo de entrega muestran a los comercios qué mejorar.</li></ul><h3>🏭 Fabricación</h3><ul><li><b>Control de la maquinaria</b> — la mayoría de las fábricas están <b>automatizadas</b>. Los brazos robóticos usan datos (color, tamaño) para fabricar cada producto siempre igual.</li><li>Los datos sobre <b>ruido, calor y vibración</b> muestran cuándo una máquina necesita mantenimiento — para que no se averíe.</li><li><b>Satisfacción del cliente</b> — los datos muestran lo que quieren los clientes, p. ej. qué color de coche es el más popular.</li></ul><h3>🔑 Palabras clave</h3>')

) as tr(lesson_ord, block_ord, es)
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'ict' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and l.ord = tr.lesson_ord
  and b.ord = tr.block_ord
  and b.content ? 'html'
  and not (b.content -> 'html' ? 'es');


-- -----------------------------------------------------------------------------
-- Notas de terminología (decisión 6 de la cabecera)
-- -----------------------------------------------------------------------------
-- · «bandwidth» → «ancho de banda» (término estándar en libros de texto de
--   primaria en España).
-- · «router» se deja en inglés: es el nombre del dispositivo tal y como
--   aparece en la etiqueta de la caja y en la interfaz.
-- · «adapter» → «adaptador» (tarjeta de red inalámbrica).
-- · «base station» → «estación base» (término de telefonía móvil).
-- · «data type» → «tipo de dato» (también válido «tipo de datos»; se elige el
--   singular por ser el término de Excel en español).
-- · «record» → «registro» y «field» → «campo» (terminología de bases de datos).
-- · «Data Validation» se traduce como «Validación de datos» porque es el
--   nombre real del menú en Excel en español.
-- · «Find &amp; Select» → «Buscar y seleccionar» y «Find and Replace» →
--   «Buscar y reemplazar»: nombres reales de los menús de Excel en español.
-- · «Ctrl + F» se cambia a «Ctrl + B» en el cuerpo porque es el atajo real en
--   Excel en español; el texto original en inglés decía «Ctrl + F» y aclaraba
--   «(Ctrl + B in Spanish Excel)». En la versión española se invierte la
--   aclaración para que el atajo que se enseña sea el que el niño usará.
-- · «wearable technology» → «tecnología ponible» (traducción habitual en
--   España; también se oye «tecnología vestible»).
-- · «health» → «sanidad» en el contexto de industria; «sales» → «ventas»;
--   «manufacturing» → «fabricación».
-- · «Club Code», «BO101», «Cake» y «Excel» se dejan en inglés: son nombres
--   propios o datos de ejemplo que el niño verá igual en el examen.
-- · «$7.50» y «29/7/2023» se conservan tal cual: son datos de ejemplo y la
--   notación numérica inglesa se mantiene por la decisión 2 de la cabecera.
-- · «Kbps», «Mbps», «Gbps» son unidades internacionales y no se traducen.
-- · «smartphone» se deja en inglés: es la palabra que usa un niño de 10 años
--   en España.
-- · «Internet rush hour» → «hora punta de internet» (traducción natural).
-- · «Exam trap» → «Trampa de examen» (mismo registro que en matemáticas).
-- · «The water pipe» → «La tubería del agua» (símil que se mantiene).
-- · «The classic trap» → «La trampa clásica».
-- · «The answers your class wrote down» → «Las respuestas que anotó tu clase».
-- · «Fill in the blanks» → «Completa los huecos» (también válido «rellena los
--   huecos»; se elige «completa» por ser el verbo de los enunciados escolares).
-- · «worked algorithms» → «algoritmos resueltos» (ejercicios ya hechos).
-- · «Flowchart shapes» → «Formas de los diagramas de flujo».
-- · «Arithmetic operators» → «Operadores aritméticos».
-- · «How a database table is built» → «Cómo se construye una tabla de base de
--   datos».
