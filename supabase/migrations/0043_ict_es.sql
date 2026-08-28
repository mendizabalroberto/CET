-- =============================================================================
-- 0043_ict_es.sql — la lección 2 de Informática deja de estar solo en inglés
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
-- Sigue la forma de 0028_leccion_en_espanol.sql (matemáticas): localización por
-- clave natural, escrituras aditivas con `jsonb_set(content, '{html}', …)`,
-- guarda `not (content -> 'html' ? 'es')` en cada UPDATE y cero UUID.
--
-- -----------------------------------------------------------------------------
-- QUÉ ARREGLA
-- -----------------------------------------------------------------------------
-- La materia ict (Informática) está sembrada en producción solo en inglés.
-- El alumno ve el marco de la aplicación en español y la lección en inglés.
-- No es un fallo de i18n: es contenido que falta.
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
-- `ict` global → curso de year_level 6 → lección `ord` → bloque `ord`.
--
-- -----------------------------------------------------------------------------
-- DE DÓNDE SALE EL TEXTO
-- -----------------------------------------------------------------------------
-- Traducción escrita a mano sobre el inglés que hay HOY en producción
-- (contracts/fuentes/ict-a2.json). Criterio: español de España tal y como lo
-- diría un maestro a un niño de 10 años, con la terminología fija sin negociar
-- — variable, sub-rutina, algoritmo, paleta, extensión, escenario.
--
-- Decisiones que conviene mirar al aprobar:
--
--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal y coma
--      de millar. El examen es en inglés y el niño escribirá `12.6` en él.
--
--   2. `&amp;` («predict the outcome &amp; draw shapes») pasa a «y». El resto
--      de entidades (`&lt;`) se conservan literales.
--
--   3. Los NOMBRES DE BLOQUES de Scratch se dejan en inglés: «when this sprite
--      clicked», «ask … and wait», «set … to …», «say … for … seconds»,
--      «repeat», «move … steps», «Draw Triangle», «Draw Square». Son la
--      etiqueta exacta del bloque en la interfaz de Scratch, que no se traduce
--      en la versión española del programa. El niño tiene que reconocer el
--      bloque por su nombre en pantalla.
--
--   4. «Number 1», «Number 2», «Result» se dejan en inglés: son los nombres de
--      las variables tal y como aparecen en el programa de Scratch del libro.
--      Traducirlos rompería la correspondencia con la figura.
--
--   5. «Scratch Lab» se deja en inglés: es el nombre de una pestaña de la
--      interfaz.
--
--   6. «Green Flag» se traduce como «Bandera Verde»: es un objeto visible en
--      el escenario, no una etiqueta de interfaz.
--
--   7. «sub-routine» se traduce como «sub-rutina»: es el término usado en los
--      libros de texto de primaria en España para este concepto de Scratch.
--
--   8. Los bloques 5, 6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27, 28, 29, 30,
--      31, 32, 33, 34 son código Scratch: solo contienen nombres de bloques y
--      variables, que se dejan en inglés por la decisión 3. El texto visible
--      que sí es traducible («What is the first number?», «What is the second
--      number?») se traduce.
--
-- -----------------------------------------------------------------------------
-- QUÉ **NO** TOCA
-- -----------------------------------------------------------------------------
--   · La clave `en` de absolutamente nada. Ni una sola.
--   · Ningún esquema: esto es una migración de datos, no hay DDL.
--   · Ninguna otra migración, ni otra materia, ni otra lección.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Los 33 bloques con `content.html` de la lección 2
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

  -- Lección 2 — 🐱 Scratch: predice el resultado y dibuja formas
  (2,  1, 'Una <b>variable</b> es una caja con nombre que guarda un valor. En Scratch <b>fijas</b> una variable a un valor, y el valor puede cambiar mientras el programa se ejecuta.'),
  (2,  2, '<h3>🔢 Los bloques que debes reconocer</h3>'),
  (2,  4, '<h3>➖ Ejemplo: restar dos números (página 60)</h3>'),
  (2,  5, '<span>when this sprite clicked</span><!--bloque de evento-->'),
  (2,  6, '<span>ask <span>¿Cuál es el primer número?</span> and wait</span>'),
  (2,  7, '<span>set <span>Number 1</span> to <span>answer</span></span><!--variable-->'),
  (2,  8, '<span>ask <span>¿Cuál es el segundo número?</span> and wait</span>'),
  (2,  9, '<span>set <span>Number 2</span> to <span>answer</span></span><!--variable-->'),
  (2, 10, '<span>set <span>Result</span> to <span>Number 1 − Number 2</span></span><!--operacion-->'),
  (2, 11, '<span>say <span>join Result = Result</span> for <span>2</span> seconds</span><!--decir-->'),
  (2, 12, 'Escribe <b>10</b> y luego <b>4</b> → Sam dice <b>Result = 6</b>. Las variables se muestran en la <b>esquina superior izquierda</b> del escenario, y muestran el valor guardado en ese momento.'),
  (2, 13, '<b>Cuidado:</b> cuando haces clic en la <b>Bandera Verde</b>, las variables se <b>ponen a 0</b>. Por eso la Sección 1 contiene <span>set <span>Number 3</span> to <span>0</span></span>.'),
  (2, 14, '<h3>➕ Sumar tres números (página 64)</h3><p>La misma idea, pero con <b>tres</b> parejas de ask/set y <b>dos</b> operadores de suma anidados dentro de un solo bloque <span>set Result to</span>:</p>'),
  (2, 15, '<span>set <span>Result</span> to <span>( Number 1 + Number 2 ) + Number 3</span></span><!--suma-->'),
  (2, 16, 'Para sumar tres números colocas <b>un operador de suma dentro del bloque set</b>, y luego <b>suelta un segundo operador de suma en la primera zona en blanco</b>.'),
  (2, 17, '<h3>📐 Sub-rutinas: Dibuja Triángulo y Dibuja Cuadrado (página 84)</h3><p>Una <b>sub-rutina</b> es tu propio bloque, hecho con <b>Make a block</b> en la paleta <b>My Blocks</b>. Escribes el código una vez y lo reutilizas tantas veces como quieras.</p>'),
  (2, 19, '<b>repeat = número de lados  ·  turn = 360 ÷ número de lados</b>'),
  (2, 21, '<h3>🎨 El algoritmo del Patrón</h3>'),
  (2, 22, '<span>when 🏳 clicked</span><!--evento-->'),
  (2, 23, '<span>repeat <span>3</span></span><!--repetir-->'),
  (2, 24, '<span>Draw Triangle</span><!--dibuja triangulo-->'),
  (2, 25, '<span>move <span>40</span> steps</span><!--mover-->'),
  (2, 26, '<span>repeat <span>3</span></span><!--repetir-->'),
  (2, 27, '<span>Draw Square</span><!--dibuja cuadrado-->'),
  (2, 28, '<span>move <span>40</span> steps</span><!--mover-->'),
  (2, 29, '<span>repeat <span>3</span></span><!--repetir-->'),
  (2, 30, '<span>Draw Triangle</span><!--dibuja triangulo-->'),
  (2, 31, '<span>move <span>40</span> steps</span><!--mover-->'),
  (2, 32, '<span>repeat <span>2</span></span><!--repetir-->'),
  (2, 33, '<span>Draw Square</span><!--dibuja cuadrado-->'),
  (2, 34, '<span>move <span>40</span> steps</span><!--mover-->'),
  (2, 35, 'Eso dibuja <b>3 triángulos, 3 cuadrados, 3 triángulos, 2 cuadrados</b> — 11 formas en fila, separadas 40 pasos. Pruébalo en la pestaña <b>Scratch Lab</b>. 🎨'),
  (2, 36, 'La paleta <b>Pen</b> no se muestra por defecto — la añades con el icono <b>Add Extension</b> en la esquina inferior izquierda.')

) as tr(lesson_ord, block_ord, es)
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'ict' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and l.ord = tr.lesson_ord
  and b.ord = tr.block_ord
  and b.content ? 'html'
  and not (b.content -> 'html' ? 'es');


-- -----------------------------------------------------------------------------
-- NOTAS DE TERMINOLOGÍA
-- -----------------------------------------------------------------------------
-- · «sub-rutina»: término usado en los libros de texto de primaria en España
--   para el concepto de Scratch «sub-routine».
-- · «paleta»: traducción de «palette» en el contexto de Scratch.
-- · «escenario»: traducción de «stage» en el contexto de Scratch.
-- · «Bandera Verde»: traducción de «Green Flag», el objeto visible en el
--   escenario de Scratch.
-- · «Make a block», «My Blocks», «Pen», «Add Extension», «Scratch Lab»,
--   «when this sprite clicked», «ask … and wait», «set … to …»,
--   «say … for … seconds», «repeat», «move … steps», «Draw Triangle»,
--   «Draw Square», «Number 1», «Number 2», «Result»: se dejan en inglés por
--   ser nombres de bloques, variables o elementos de la interfaz de Scratch
--   que no se traducen en la versión española del programa.
-- =============================================================================
