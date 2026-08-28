-- =============================================================================
-- 0028_leccion_en_espanol.sql — la lección deja de estar solo en inglés
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
-- Validada contra producción dentro de un `do $$ … raise exception $$` que
-- revierte la transacción entera (la técnica de VERIFICATION_PLAN, la misma que
-- validó 0026): el cuerpo se ejecutó DOS VECES seguidas y el md5 del contenido
-- después del primer pase y del segundo es idéntico. Salida literal:
--
--   == VALIDACION 0027 (transaccion revertida) ==
--   {
--       "md5_pase1": "3257ca955c92c3fe5568ca07923dc875",
--       "md5_pase2": "3257ca955c92c3fe5568ca07923dc875",
--       "idempotente": true,
--       "ingles_perdido": 0,
--       "html_total": 48, "html_con_en": 48, "html_con_es": 48,
--       "lessons_total": 8, "lessons_con_en": 8, "lessons_con_es": 8,
--       "modules_con_en": 1, "modules_con_es": 1,
--       "steps_elems_total": 19, "steps_elems_con_en": 19, "steps_elems_con_es": 19,
--       "table_celdas_obj": 11, "table_celdas_con_es": 11, "table_celdas_null": 1,
--       "table_headers_con_es": 3,
--       "interactive_sin_es": 6,
--       "html_es_identico_a_en": 1
--   }
--
-- `interactive_sin_es: 6` es lo que se busca: los seis bloques de figura salen
-- sin tocar. `html_es_identico_a_en: 1` es el bloque 12 de la lección 6
-- («<b>2,480 m → km</b>   ÷ 1,000 → <b>2.48 km</b>»): no tiene ni una palabra,
-- solo números y operadores, así que el español coincide carácter a carácter.
-- Los otros 47 difieren del inglés, que es la comprobación de que hay
-- traducción de verdad y no una copia.
--
-- -----------------------------------------------------------------------------
-- QUÉ ARREGLA
-- -----------------------------------------------------------------------------
-- La interfaz está entera en los dos idiomas, con paridad exacta de claves. El
-- CONTENIDO no: el alumno veía el marco en español y la lección en inglés.
--
--   select count(*) from lessons where not (title ? 'es');           --  8
--   select count(*) from course_modules where not (title ? 'es');    --  1
--   select count(*) from lesson_blocks
--    where content ? 'html' and not (content -> 'html' ? 'es');      -- 48
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
-- `math` global → curso de year_level 6 → módulo `ord` → lección `ord` →
-- bloque `ord`. Inventar UUIDs solo sirve para que dos entornos diverjan en
-- silencio (ver la cabecera de seed/0003_math_y6.sql).
--
-- -----------------------------------------------------------------------------
-- DE DÓNDE SALE EL TEXTO
-- -----------------------------------------------------------------------------
-- Traducción escrita a mano sobre el inglés que hay HOY en producción (el que
-- 0003 extrajo de `Y6A/Math/Grade 5 Maths Exam Trainer.html`). Criterio:
-- español de España tal y como lo diría un maestro a un niño de 10 años, con la
-- terminología fija sin negociar — numerador, denominador, fracción impropia,
-- número mixto, máximo común divisor, valor posicional, perímetro, área.
--
-- Tres decisiones que conviene mirar al aprobar:
--
--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal (12.6)
--      y coma de millar (1,000). No se convierten a la notación española. El
--      examen es en inglés y el niño escribirá `12.6` en él; enseñarle `12,6`
--      en la mitad española del mismo trainer sería enseñarle a fallar. Además,
--      la mitad del texto son cuentas que también aparecen en las figuras y en
--      los enunciados que genera el motor, y ahí el punto es el separador.
--
--   2. `&amp;` («Adding &amp; subtracting») pasa a «y». La entidad estaba ahí
--      para escapar un ampersand del inglés; en español el conector es «y» y
--      dejar un «&» sería un anglicismo tipográfico. El resto de entidades
--      (`&lt;`, que ES el signo «menor que» de una comparación) se conservan
--      literales, igual que `×`, `÷`, `→`, `²` y todo el HTML.
--
--   3. Las PALABRAS CLAVE de los problemas (lección 8, bloque 2) se traducen:
--      «altogether / in total» → «en total / entre todos», etc. Es una decisión
--      editorial, no lingüística: la lección enseña a cazar la pista en el
--      enunciado, y en la versión española los enunciados de los ejemplos están
--      en español. Si el examen se rinde siempre con enunciado en inglés, esta
--      es la línea a revisar.
--
-- -----------------------------------------------------------------------------
-- QUÉ **NO** TOCA
-- -----------------------------------------------------------------------------
--   · `courses.name`, `subjects.name`, `skills.name` — ya son bilingües (25/25).
--   · Los 6 bloques `kind = 'interactive'`: sus `props` no tienen ni una cadena
--     traducible (números, símbolos de unidad y el nombre del componente). Su
--     texto accesible lo genera el cliente en el idioma activo. Tocarlos sería
--     meter ruido en un contrato que no lo necesita.
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
  and s.code = 'math' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and not (m.title ? 'es');


-- -----------------------------------------------------------------------------
-- 2 · Los 8 títulos de lección
-- -----------------------------------------------------------------------------
update public.lessons l
set title = l.title || jsonb_build_object('es', tr.es)
from public.course_modules m
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id,
(values
  (1, 'Comparar y simplificar fracciones'),
  (2, 'Sumar, restar, multiplicar y dividir fracciones'),
  (3, 'Fracciones impropias y números mixtos'),
  (4, 'Multiplicar y dividir decimales'),
  (5, 'Multiplicar y dividir por 10, 100 y 1,000'),
  (6, 'Conversiones de unidades métricas (longitud, masa, capacidad)'),
  (7, 'Figuras compuestas: área y perímetro'),
  (8, 'Problemas')
) as tr(lesson_ord, es)
where l.module_id = m.id
  and s.code = 'math' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and l.ord = tr.lesson_ord
  and not (l.title ? 'es');


-- -----------------------------------------------------------------------------
-- 3 · Los 48 bloques con `content.html`
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

  -- Lección 1 — Comparar y simplificar fracciones
  (1, 1, '<b>Simplificar</b> = dividir el numerador y el denominador entre el mismo número hasta que ya no se pueda más. El número más grande que divide a los dos es el <b>máximo común divisor</b>.'),
  (1, 2, '<b>Simplifica 24/36</b> <div class="step">24 ÷ 12 = 2    36 ÷ 12 = 3  →  <b>2/3</b></div> <div class="step">¿No sabes cuál es el máximo común divisor? Ve haciendo mitades paso a paso: 24/36 → 12/18 → 6/9 → 2/3. Sale lo mismo.</div>'),
  (1, 3, '<b>Comparar</b> dos fracciones es ponerles el <b>mismo denominador</b> y después mirar solo los numeradores. Con el mismo denominador es fácil: numerador más grande = fracción más grande.'),
  (1, 4, '<b>¿Cuál es mayor, 5/9 o 2/3?</b> <div class="step">Denominador común 9:   2/3 = 6/9</div> <div class="step">5/9 frente a 6/9 → 5 &lt; 6, así que  <b>5/9 &lt; 2/3</b></div>'),
  (1, 6, '<b>Truco rápido — multiplicar en cruz.</b> Para a/b frente a c/d, compara a×d con c×b. 5/9 frente a 2/3 → 5×3 = 15 y 2×9 = 18. 15 &lt; 18, así que 5/9 &lt; 2/3.'),
  (1, 7, '<b>Cuidado:</b> un denominador más grande <u>no</u> significa una fracción más grande. 1/10 es mucho más pequeña que 1/2 — cuantos más trozos, más pequeño es cada trozo.'),

  -- Lección 2 — Las cuatro operaciones con fracciones
  (2, 1, '<b>Sumar y restar</b> — primero TIENES que tener el mismo denominador. Busca un denominador común, convierte las dos fracciones y después suma o resta <b>solo los numeradores</b>. El denominador no cambia nunca.'),
  (2, 2, '<b>3/8 + 1/6</b> <div class="step">Denominador común de 8 y 6 → 24</div> <div class="step">3/8 = 9/24    1/6 = 4/24</div> <div class="step">9/24 + 4/24 = <b>13/24</b>  (ya está simplificada)</div>'),
  (2, 3, '<b>Multiplicar</b> — ¡no hace falta denominador común! Numerador × numerador, denominador × denominador, y después simplifica.'),
  (2, 4, '<b>3/4 × 8/9</b> <div class="step">3 × 8 = 24    4 × 9 = 36  →  24/36</div> <div class="step">Simplifica: 24/36 = <b>2/3</b></div>'),
  (2, 5, '<b>Dividir</b> — <b>copia, cambia y da la vuelta</b>. Copia la primera fracción, cambia el ÷ por ×, y dale la vuelta a la segunda fracción. Después multiplica como siempre.'),
  (2, 6, '<b>4/5 ÷ 2/3</b> <div class="step">Copia 4/5 · Cambia ÷ por × · Da la vuelta a 2/3 → 3/2</div> <div class="step">4/5 × 3/2 = 12/10 = 6/5 = <b>1 1/5</b></div>'),
  (2, 7, '<b>Los dos fallos de siempre:</b> buscar denominador común antes de multiplicar (no hace falta) y olvidarse de dar la vuelta a la segunda fracción al dividir (fatal).'),

  -- Lección 3 — Fracciones impropias y números mixtos
  (3, 1, '<b>Mixto → impropia:</b> multiplica la parte entera por el denominador, suma el numerador y deja el mismo denominador.  <i>(denominador × entero + numerador)</i>'),
  (3, 2, '<b>5 2/3 → impropia</b> <div class="step">5 × 3 = 15    15 + 2 = 17</div> <div class="step">Resultado: <b>17/3</b></div>'),
  (3, 3, '<b>Impropia → mixto:</b> divide el numerador entre el denominador. El cociente es la parte entera, el resto es el nuevo numerador y el denominador se queda igual.'),
  (3, 4, '<b>41/6 → mixto</b> <div class="step">41 ÷ 6 = 6, resto 5</div> <div class="step">Resultado: <b>6 5/6</b></div>'),
  (3, 5, '<b>Compruébalo al instante:</b> 6 5/6 vuelto a impropia es 6×6+5 = 41 → 41/6 ✓ Cualquier conversión se comprueba en cinco segundos. Hazlo.'),
  (3, 6, '<b>Una fracción impropia siempre vale 1 o más</b> — el numerador es mayor que el denominador (o igual). Si tu fracción "impropia" es menor que 1, te has equivocado.'),

  -- Lección 4 — Multiplicar y dividir decimales
  (4, 1, '<b>Multiplicar:</b> no hagas caso del punto decimal, multiplica como si fueran números enteros y después cuenta cuántas cifras decimales había en el enunciado <i>en total</i> — el resultado lleva exactamente esas.'),
  (4, 2, '<b>12.6 × 4.3</b> <div class="step">Sin el punto: 126 × 43 = 5418</div> <div class="step">Cifras decimales: 12.<b>6</b> tiene 1, 4.<b>3</b> tiene 1 → 2 en total</div> <div class="step">Devuelve las 2 cifras decimales: <b>54.18</b></div>'),
  (4, 3, '<b>Dividir entre un número entero:</b> haz la división como siempre y coloca el punto decimal del resultado <b>justo encima</b> del que hay en el enunciado.'),
  (4, 4, '<b>48.24 ÷ 8</b> <div class="step">48 ÷ 8 = 6  ·  2 ÷ 8 = 0, resto 2  ·  24 ÷ 8 = 3</div> <div class="step">Resultado: <b>6.03</b>  (¡no te comas ese cero!)</div>'),
  (4, 5, '<b>Estima primero, siempre.</b> 12.6 × 4.3 es más o menos 13 × 4 = 52. Si te sale 5.418 o 541.8, sabes al momento que el punto está mal puesto.'),
  (4, 6, '<b>Los ceros cuentan.</b> 48.24 ÷ 8 = 6.03, no 6.3. Escribe ese cero que ocupa el sitio.'),

  -- Lección 5 — Multiplicar y dividir por 10, 100 y 1,000
  (5, 1, 'El punto decimal no se mueve — se mueven las <b>cifras</b>. <b>× 10</b> → 1 lugar a la izquierda  ·  <b>× 100</b> → 2 lugares a la izquierda  ·  <b>× 1,000</b> → 3 lugares a la izquierda. Al dividir se mueven los mismos lugares a la <b>derecha</b>.'),
  (5, 3, '<b>0.086 × 1,000</b> <div class="step">3 lugares a la izquierda: 0.086 → 0.86 → 8.6 → <b>86</b></div>'),
  (5, 5, '<b>9.3 ÷ 100</b> <div class="step">2 lugares a la derecha: 9.3 → 0.93 → <b>0.093</b>  (añade ceros para ocupar el sitio)</div>'),
  (5, 7, '<b>Piensa si tiene sentido:</b> al multiplicar sale <i>más grande</i> y al dividir sale <i>más pequeño</i>. Si 9.3 ÷ 100 te ha dado 930, has movido las cifras hacia el lado que no era.'),

  -- Lección 6 — Conversiones de unidades métricas
  (6,  1, '<b>Si pasas a una unidad más pequeña → multiplica. Si pasas a una unidad más grande → divide.</b> Un metro es más grande que un centímetro, así que de m → cm se multiplica × 100.'),
  (6,  2, '<p>LONGITUD</p>'),
  (6,  4, '<p>MASA</p>'),
  (6,  6, '<p>CAPACIDAD</p>'),
  (6,  8, '<b>6.35 km → m</b>   el km es más grande, así que × 1,000 → <b>6,350 m</b>'),
  (6, 10, '<b>950 g → kg</b>   el g es más pequeño, así que ÷ 1,000 → <b>0.95 kg</b>'),
  (6, 12, '<b>2,480 m → km</b>   ÷ 1,000 → <b>2.48 km</b>'),
  (6, 13, 'Solo la <b>longitud</b> usa 10 y 100. La masa y la capacidad van <b>siempre de 1,000 en 1,000</b> — solo con eso ya ganas varios puntos.'),

  -- Lección 7 — Figuras compuestas: área y perímetro
  (7, 1, 'Una figura compuesta no es más que rectángulos pegados. Divídela en trozos, o empieza por el rectángulo grande y quítale un trozo.'),
  (7, 2, '<b>Una figura en L: 12 cm de ancho, 9 cm de alto, con una esquina de 5 cm × 5 cm recortada</b> <div class="step">Área = 12 × 9 − 5 × 5 = 108 − 25 = <b>83 cm²</b></div> <div class="step">Perímetro = 12 + 9 + 7 + 5 + 5 + 4 = <b>42 cm</b></div>'),
  (7, 3, '<b>Los lados que faltan.</b> Los dos trozos horizontales de un mismo nivel tienen que sumar el ancho entero. Con los verticales, igual. Así que: lado entero − trozo conocido = trozo que falta.'),
  (7, 4, '<b>Arriba mide 12 cm y abajo mide 7 cm →</b> el escalón horizontal que falta = 12 − 7 = <b>5 cm</b> <div class="step">La izquierda es ? y la figura mide 9 cm de alto con un escalón de 5 cm → 9 − 5 = <b>4 cm</b></div>'),
  (7, 5, 'Practícalo en la pestaña <b>Shape Lab</b> — genera una figura nueva con lados ocultos cada vez que haces clic.'),
  (7, 6, '<b>Unidades:</b> el área va al cuadrado (cm², mm², m²) y el perímetro no (cm, mm, m). Poner la que no es te cuesta el punto aunque el número esté bien.'),

  -- Lección 8 — Problemas
  (8, 1, '<b>Léelo dos veces.</b> En la segunda lectura es cuando te das cuenta de qué te está pidiendo de verdad. Después sigue estos cuatro pasos.'),
  (8, 2, '<ol> <li><b>Subraya los números y las unidades.</b></li> <li><b>Decide la operación.</b> "en total / entre todos" → sumar · "le queda / diferencia" → restar · "cada uno / por / a partes iguales" → dividir · "de" (como en 2/3 de) → multiplicar.</li> <li><b>Resuélvelo escribiendo todas las líneas.</b> Los pasos puntúan aunque el resultado final se te escape.</li> <li><b>Responde a lo que te han preguntado</b> — con la unidad correcta y simplificado.</li> </ol>'),
  (8, 3, '<b>Una receta lleva 3/4 kg de harina. María hace 2/3 de la receta. ¿Cuánta harina necesita?</b> <div class="step">"2/3 <b>de</b> 3/4" → multiplicar</div> <div class="step">3/4 × 2/3 = 6/12 = <b>1/2 kg</b></div>'),
  (8, 4, '<b>Una cinta de 9.6 m de largo se corta en 8 trozos iguales. ¿Cuánto mide cada trozo en cm?</b> <div class="step">"trozos iguales" → dividir: 9.6 ÷ 8 = 1.2 m</div> <div class="step">La pregunta pedía <b>cm</b>: 1.2 × 100 = <b>120 cm</b></div>'),
  (8, 5, '<b>El punto que más se pierde:</b> hacer las cuentas perfectas y dar el resultado en la unidad equivocada. Vuelve a leer la última línea del enunciado antes de escribir tu respuesta.')

) as tr(lesson_ord, block_ord, es)
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'math' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and l.ord = tr.lesson_ord
  and b.ord = tr.block_ord
  and b.content ? 'html'
  and not (b.content -> 'html' ? 'es');


-- -----------------------------------------------------------------------------
-- 4 · Los 3 bloques `steps` (las escaleras de unidades)
-- -----------------------------------------------------------------------------
-- Aquí no hay prosa que traducir: los siete elementos de cada escalera son
-- símbolos del SI (km, m, cm, mm, t, kg, g, mg, kL, L, mL) y operadores
-- (`<b>× 1,000 →</b><i>← ÷ 1,000</i>`). En español se escriben exactamente
-- igual — los símbolos del SI son internacionales y no se traducen.
--
-- Aun así la clave `es` tiene que existir, para que la escalera no sea el único
-- trozo de la lección que el resolvedor sirve por fallback al inglés y para que
-- un recuento de paridad no la marque como pendiente para siempre. Por eso el
-- valor español se copia del inglés en vez de escribirse a mano: escribir a
-- mano la misma cadena solo abre la puerta a una errata.
update public.lesson_blocks b
set content = jsonb_set(
      b.content,
      '{steps}',
      (
        select jsonb_agg(
                 case
                   when e.value ? 'es' or not (e.value ? 'en') then e.value
                   else e.value || jsonb_build_object('es', e.value ->> 'en')
                 end
                 order by e.ord)
        from jsonb_array_elements(b.content -> 'steps') with ordinality e(value, ord)
      )
    )
from public.lessons l
join public.course_modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'math' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and b.kind = 'steps'
  and exists (
    select 1
    from jsonb_array_elements(b.content -> 'steps') x
    where x ? 'en' and not (x ? 'es')
  );


-- -----------------------------------------------------------------------------
-- 5 · El bloque `table` (la tabla de valor posicional × / ÷ 10, 100, 1,000)
-- -----------------------------------------------------------------------------
-- Mismo caso que las escaleras, y por la misma razón: cada celda es un número
-- (`4.7`, `0.0652`) o un operador (`× 10`, `÷ 1,000`). Cero palabras. El
-- español se copia del inglés carácter a carácter — y con el punto decimal y la
-- coma de millar intactos, que es la decisión 1 de la cabecera.
--
-- Las celdas `null` de la primera columna se dejan como están: son huecos de
-- maquetación, no textos sin traducir. El validador de `0006_content.sql` exige
-- que toda fila tenga tantas celdas como la cabecera, así que se reconstruyen
-- respetando el orden y la longitud.
update public.lesson_blocks b
set content = b.content
  || jsonb_build_object(
       'headers',
       (
         select jsonb_agg(
                  case
                    when jsonb_typeof(h.value) <> 'object' then h.value
                    when h.value ? 'es' or not (h.value ? 'en') then h.value
                    else h.value || jsonb_build_object('es', h.value ->> 'en')
                  end
                  order by h.ord)
         from jsonb_array_elements(b.content -> 'headers') with ordinality h(value, ord)
       ))
  || jsonb_build_object(
       'rows',
       (
         select jsonb_agg(
                  (
                    select jsonb_agg(
                             case
                               when jsonb_typeof(x.value) <> 'object' then x.value
                               when x.value ? 'es' or not (x.value ? 'en') then x.value
                               else x.value || jsonb_build_object('es', x.value ->> 'en')
                             end
                             order by x.ord)
                    from jsonb_array_elements(r.value) with ordinality x(value, ord)
                  )
                  order by r.ord)
         from jsonb_array_elements(b.content -> 'rows') with ordinality r(value, ord)
       ))
from public.lessons l
join public.course_modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id
where b.lesson_id = l.id
  and l.module_id = m.id
  and s.code = 'math' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.ord = 1
  and b.kind = 'table'
  and (
    exists (
      select 1 from jsonb_array_elements(b.content -> 'headers') h
      where jsonb_typeof(h.value) = 'object' and h.value ? 'en' and not (h.value ? 'es')
    )
    or exists (
      select 1
      from jsonb_array_elements(b.content -> 'rows') r,
           jsonb_array_elements(r.value) x
      where jsonb_typeof(x.value) = 'object' and x.value ? 'en' and not (x.value ? 'es')
    )
  );
