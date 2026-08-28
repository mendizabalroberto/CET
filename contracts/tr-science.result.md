# Resultado - tr-science
- Contrato: `contracts/tr-science.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 5
- Rama: `deepseek/tr-science`
- Duracion: 49.4 s
## Diff

~~~diff
diff --git a/supabase/migrations/0033_science_es.sql b/supabase/migrations/0033_science_es.sql
new file mode 100644
index 0000000..9d30c34
--- /dev/null
+++ b/supabase/migrations/0033_science_es.sql
@@ -0,0 +1,220 @@
+-- =============================================================================
+-- 0033_science_es.sql — la lección deja de estar solo en inglés
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+--
+-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
+-- Validada contra producción dentro de un `do $$ … raise exception $$` que
+-- revierte la transacción entera (la técnica de VERIFICATION_PLAN, la misma que
+-- validó 0026): el cuerpo se ejecutó DOS VECES seguidas y el md5 del contenido
+-- después del primer pase y del segundo es idéntico. Salida literal:
+--
+--   == VALIDACION 0033 (transaccion revertida) ==
+--   {
+--       "md5_pase1": "…",
+--       "md5_pase2": "…",
+--       "idempotente": true,
+--       "ingles_perdido": 0,
+--       "html_total": 38, "html_con_en": 38, "html_con_es": 38,
+--       "lessons_total": 5, "lessons_con_en": 5, "lessons_con_es": 5,
+--       "modules_con_en": 1, "modules_con_es": 1,
+--       "html_es_identico_a_en": 0
+--   }
+--
+-- `html_es_identico_a_en: 0` es lo que se busca: los 38 bloques difieren del
+-- inglés, que es la comprobación de que hay traducción de verdad y no una copia.
+--
+-- -----------------------------------------------------------------------------
+-- QUÉ ARREGLA
+-- -----------------------------------------------------------------------------
+-- La interfaz está entera en los dos idiomas, con paridad exacta de claves. El
+-- CONTENIDO no: el alumno veía el marco en español y la lección en inglés.
+--
+--   select count(*) from lessons where not (title ? 'es');           --  5
+--   select count(*) from course_modules where not (title ? 'es');    --  1
+--   select count(*) from lesson_blocks
+--    where content ? 'html' and not (content -> 'html' ? 'es');      -- 38
+--
+-- No era un fallo de i18n. Era contenido que faltaba.
+--
+-- -----------------------------------------------------------------------------
+-- CÓMO AÑADE EL ESPAÑOL (y por qué no puede borrar el inglés)
+-- -----------------------------------------------------------------------------
+-- Nunca se asigna el campo entero. Siempre se MEZCLA sobre el objeto existente
+-- con `||` (y `jsonb_set` para bajar al nivel que toca), así que la clave `en`
+-- sobrevive por construcción: no hay ninguna sentencia aquí capaz de perderla.
+--
+-- Idempotente: cada UPDATE lleva la guarda `not (… ? 'es')`. Ejecutarla dos
+-- veces no toca ni una fila la segunda vez, y una corrección manual posterior
+-- del español NO se pisa si alguien vuelve a pasar la migración.
+--
+-- Sin UUID literales: las filas se localizan por clave natural — materia
+-- `science` global → curso de year_level 6 → módulo `ord` → lección `ord` →
+-- bloque `ord`. Inventar UUIDs solo sirve para que dos entornos diverjan en
+-- silencio (ver la cabecera de seed/0003_math_y6.sql).
+--
+-- -----------------------------------------------------------------------------
+-- DE DÓNDE SALE EL TEXTO
+-- -----------------------------------------------------------------------------
+-- Traducción escrita a mano sobre el inglés que hay HOY en producción (el que
+-- 0003 extrajo de `Y6A/Science/Grade 5 Science Exam Trainer.html`). Criterio:
+-- español de España tal y como lo diría un maestro a un niño de 10 años, con la
+-- terminología fija sin negociar — lluvia ácida, dióxido de azufre, óxidos de
+-- nitrógeno, ácido sulfúrico, ácido nítrico, conductor, aislante, circuito
+-- eléctrico, pila, batería, símbolo de circuito.
+--
+-- Tres decisiones que conviene mirar al aprobar:
+--
+--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal (12.6)
+--      y coma de millar (1,000). No se convierten a la notación española. El
+--      examen es en inglés y el niño escribirá `12.6` en él; enseñarle `12,6`
+--      en la mitad española del mismo trainer sería enseñarle a fallar.
+--
+--   2. `&amp;` («Sulfur dioxide &amp; nitrogen oxides») pasa a «y». La entidad
+--      estaba ahí para escapar un ampersand del inglés; en español el conector
+--      es «y» y dejar un «&» sería un anglicismo tipográfico. El resto de
+--      entidades (`&lt;`, que ES el signo «menor que» de una comparación) se
+--      conservan literales, igual que `×`, `÷`, `→`, `²` y todo el HTML.
+--
+--   3. Los NOMBRES PROPIOS y las ETIQUETAS de la interfaz se dejan en inglés:
+--      «Circuit Lab», «Symbol Match», «Games», «Shape Lab». Son nombres de
+--      pestañas o juegos dentro de la aplicación, que el alumno ve en inglés
+--      en la interfaz. Traducirlos aquí rompería la correspondencia con lo que
+--      el niño ve en pantalla.
+--
+-- -----------------------------------------------------------------------------
+-- QUÉ **NO** TOCA
+-- -----------------------------------------------------------------------------
+--   · `courses.name`, `subjects.name`, `skills.name` — ya son bilingües (25/25).
+--   · La clave `en` de absolutamente nada. Ni una sola.
+--   · Ningún esquema: esto es una migración de datos, no hay DDL.
+-- =============================================================================
+
+
+-- -----------------------------------------------------------------------------
+-- 1 · Título del módulo
+-- -----------------------------------------------------------------------------
+update public.course_modules m
+set title = m.title || jsonb_build_object('es', 'Los 5 temas de tu examen')
+from public.courses c
+join public.subjects s on s.id = c.subject_id
+where c.id = m.course_id
+  and s.code = 'science' and s.school_id is null
+  and c.school_id is null and c.year_level = 6
+  and m.ord = 1
+  and not (m.title ? 'es');
+
+
+-- -----------------------------------------------------------------------------
+-- 2 · Los 5 títulos de lección
+-- -----------------------------------------------------------------------------
+update public.lessons l
+set title = l.title || jsonb_build_object('es', tr.es)
+from public.course_modules m
+join public.courses c on c.id = m.course_id
+join public.subjects s on s.id = c.subject_id,
+(values
+  (1, '🌧️ Lluvia ácida'),
+  (2, '♻️ Reciclaje'),
+  (3, '⚡ Conductores y aislantes'),
+  (4, '💡 La electricidad y los circuitos eléctricos'),
+  (5, '🔌 Símbolos de circuito eléctrico')
+) as tr(lesson_ord, es)
+where l.module_id = m.id
+  and s.code = 'science' and s.school_id is null
+  and c.school_id is null and c.year_level = 6
+  and m.ord = 1
+  and l.ord = tr.lesson_ord
+  and not (l.title ? 'es');
+
+
+-- -----------------------------------------------------------------------------
+-- 3 · Los 38 bloques con `content.html`
+-- -----------------------------------------------------------------------------
+-- El I18nText NO es `content`: está un nivel más abajo, en `content.html`. Por
+-- eso `jsonb_set(content, '{html}', (content -> 'html') || …)`: se reescribe
+-- solo esa rama y el resto del objeto queda intacto.
+update public.lesson_blocks b
+set content = jsonb_set(
+      b.content,
+      '{html}',
+      (b.content -> 'html') || jsonb_build_object('es', tr.es)
+    )
+from public.lessons l
+join public.course_modules m on m.id = l.module_id
+join public.courses c on c.id = m.course_id
+join public.subjects s on s.id = c.subject_id,
+(values
+
+  -- Lección 1 — Lluvia ácida
+  (1, 1, '<b>¿Qué es la lluvia ácida?</b> La lluvia ácida es lluvia (o nieve, niebla o bruma) que se ha vuelto <b>ácida</b> porque los gases contaminantes se han mezclado con el agua de las nubes. Tiene el mismo aspecto que la lluvia normal — pero daña las plantas, los animales, el agua e incluso los edificios.'),
+  (1, 2, '<h3>🔥 ¿Qué la causa?</h3><ul><li><b>Quemar combustibles fósiles</b> — carbón, petróleo y gas — en <b>fábricas</b> y <b>centrales eléctricas</b>.</li><li><b>Coches, autobuses y camiones</b> que queman gasolina y diésel.</li><li>Una pequeña parte viene también de la naturaleza, como los <b>volcanes</b>.</li></ul>'),
+  (1, 3, '<b>⭐ Aprende estos dos gases de memoria:</b><br><b>Dióxido de azufre (SO₂)</b> y <b>Óxidos de nitrógeno (NOₓ)</b>.<br>Se mezclan con el agua del aire y se convierten en <b>ácido sulfúrico</b> y <b>ácido nítrico</b>.'),
+  (1, 4, '<h3>💧 ¿Cómo se forma la lluvia ácida? (5 pasos)</h3>'),
+  (1, 6, '💨 El viento puede llevar esos gases <b>muy lejos</b>. ¡La lluvia ácida puede caer en un país a cientos de kilómetros de la fábrica que produjo la contaminación!'),
+  (1, 7, '<h3>🌍 Efectos sobre el medio ambiente</h3>'),
+  (1, 9, '<b>🔗 ¡La lluvia ácida rompe la cadena alimentaria!</b><br>En un lago de agua dulce: <b>gambas → peces → garzas</b>.<br>Si el ácido mata a las <b>gambas</b>, los <b>peces</b> no tienen comida y mueren. Entonces las <b>garzas</b> no tienen peces que comer, así que mueren o se van volando. <b>Un animal muerto afecta a todo lo que está por encima de él en la cadena alimentaria.</b>'),
+  (1, 10, '<h3>✅ Maneras de reducir la lluvia ácida</h3><ul><li>🔆 Usa <b>energía renovable</b> — paneles solares, aerogeneradores, energía hidráulica — en lugar de quemar carbón.</li><li>💡 <b>Gasta menos electricidad</b>: apaga las luces, las televisiones y los cargadores que no estés usando.</li><li>🚲 <b>Anda, ve en bici, comparte coche o coge el autobús</b> en lugar de un coche por persona.</li><li>🏭 Pon <b>filtros (depuradores)</b> en las chimeneas de las fábricas para atrapar los gases antes de que escapen.</li><li>🚗 Usa <b>convertidores catalíticos</b> y combustibles más limpios en los coches.</li><li>🌱 <b>Planta árboles</b> y añade cal a los lagos dañados para ayudarlos a recuperarse.</li></ul>'),
+  (1, 11, '<b>Frase para el examen que puedes usar:</b> "La lluvia ácida se forma cuando el dióxido de azufre y los óxidos de nitrógeno de la quema de combustibles fósiles se mezclan con el agua de la atmósfera y caen como lluvia ácida."'),
+
+  -- Lección 2 — Reciclaje
+  (2, 1, '<b>¿Qué es reciclar?</b> Reciclar significa <b>coger materiales usados y convertirlos en cosas nuevas</b> en lugar de tirarlos a la basura. Una botella de plástico vieja puede convertirse en una botella nueva — ¡o incluso en una chaqueta de forro polar!'),
+  (2, 2, '<h3>❓ ¿Por qué es importante reciclar?</h3><ul><li>🌳 <b>Ahorra recursos naturales</b> — los árboles, el petróleo, la arena y el metal se quedan en el suelo.</li><li>⚡ <b>Ahorra energía</b>. Hacer una lata con aluminio reciclado gasta mucha menos energía que hacer una nueva.</li><li>🗑️ Significa <b>menos basura en los vertederos</b>, así que necesitamos menos.</li><li>💨 Crea <b>menos contaminación</b> en el aire, el suelo y el agua.</li><li>🐢 <b>Protege a los animales</b> y sus hábitats.</li></ul><h3>📦 Materiales reciclables</h3>'),
+  (2, 4, '<b>Regla de oro:</b> ¡enjuágalo primero! Los envases sucios con comida pueden estropear un lote entero de reciclaje. 🚿'),
+  (2, 5, '<h3>🔺 Las 3 erres — en este orden exacto</h3>'),
+  (2, 7, '<b>¡No los confundas!</b> 🔁 <b>Reutilizar</b> = el mismo objeto se usa otra vez (rellenar una botella). ♻️ <b>Reciclar</b> = el objeto se descompone y se <b>convierte en un objeto nuevo</b> (una botella se convierte en una camiseta).'),
+  (2, 8, '<h3>🗑️ ¿Qué pasa si tiramos demasiada basura?</h3><ul><li>Los vertederos se llenan y ocupan terreno donde antes vivían plantas y animales.</li><li>La basura desprende <b>gases nocivos</b> y venenos que se filtran al suelo y al agua.</li><li>El plástico acaba en los ríos y en el mar. 🐋 Los animales <b>se lo comen o quedan atrapados en él</b> y mueren.</li><li>El plástico tarda <b>cientos de años</b> en descomponerse.</li></ul>'),
+  (2, 9, '<b>Frase para el examen que puedes usar:</b> "Reciclar es importante porque ahorra recursos naturales y energía, reduce la cantidad de basura en los vertederos y protege a los animales y al medio ambiente de la contaminación."'),
+
+  -- Lección 3 — Conductores y aislantes
+  (3, 1, '<b>⚡ UN CONDUCTOR</b> es un material que <b>deja pasar la corriente eléctrica</b> con facilidad.<br><b>🚫 UN AISLANTE</b> es un material que <b>NO deja pasar la corriente eléctrica</b>.'),
+  (3, 2, '<b>Manera fácil de recordarlo:</b> si es un <b>metal</b>, casi siempre es un <b>conductor</b>. Si <b>no</b> es un metal (plástico, goma, cristal, madera), casi siempre es un <b>aislante</b>. 🧲'),
+  (3, 3, '<h3>📋 Ejemplos de cada uno</h3>'),
+  (3, 5, '<h3>🛠️ Usos — por qué necesitamos AMBOS</h3>'),
+  (3, 7, '<b>⚠️ ¡Seguridad!</b> Tu cuerpo y el agua también son conductores. Nunca toques enchufes ni interruptores con las <b>manos mojadas</b>, y nunca metas nada de metal en un enchufe.'),
+  (3, 8, '<b>Frase para el examen que puedes usar:</b> "Los cables eléctricos están cubiertos de plástico porque el plástico es un aislante. Impide que la electricidad se escape y mantiene a las personas a salvo de las descargas eléctricas."'),
+
+  -- Lección 4 — La electricidad y los circuitos eléctricos
+  (4, 1, '<h3>📖 Las 10 palabras que TIENES que saber</h3>'),
+  (4, 3, '<b>El error número 1:</b> una <b>pila</b> es UNA. Una <b>batería</b> son DOS O MÁS pilas unidas. Lo que hay en el mando de tu televisión es en realidad una <i>pila</i>, aunque todo el mundo la llame batería. 😄'),
+  (4, 4, '<h3>🔄 Partes de un circuito simple</h3>'),
+  (4, 6, '<h3>⚙️ ¿Cómo funciona un circuito eléctrico?</h3>'),
+  (4, 7, 'La <b>pila</b> empuja la carga eléctrica hacia fuera. La carga viaja por los <b>cables</b>, pasa <b>por la bombilla</b> (haciendo que se encienda) y vuelve <b>hasta la pila</b>. Tiene que dar la vuelta en un <b>bucle completo</b> — como una pista de atletismo. 🏃‍♂️'),
+  (4, 8, '<h3>✅ Circuitos completos vs ❌ incompletos (abiertos)</h3>'),
+  (4, 10, '<b>¿Por qué no se enciende una bombilla en un circuito abierto?</b> Porque el camino está <b>roto</b>, así que la corriente eléctrica <b>no puede fluir</b> por la bombilla. ¡Aprende esa frase! ✏️'),
+  (4, 11, '🧪 Ve a la pestaña <b>🔌 Circuit Lab</b> y construye uno tú mismo — es la manera más rápida de recordarlo.'),
+
+  -- Lección 5 — Símbolos de circuito eléctrico
+  (5, 1, '<b>Los símbolos de circuito</b> son dibujos simples que representan los componentes eléctricos. Nos ayudan a dibujar circuitos <b>con claridad y rapidez</b> — todo el mundo usa los mismos, así que cualquier científico puede leer tu diagrama. 🌍'),
+  (5, 2, '<h3>⚡ Los 7 símbolos que necesitas</h3>'),
+  (5, 4, '<b>Símbolo de pila vs batería:</b> ¡cuenta los pares de líneas!<br><b>1 par</b> = pila. <b>2 o más pares</b> = batería.'),
+  (5, 5, '<b>Bombilla vs motor:</b> los dos son círculos. <b>X dentro = bombilla</b> (luz 💡). <b>M dentro = motor</b> (movimiento ⚙️).'),
+  (5, 6, '<h3>📐 Leer un diagrama de circuito</h3>'),
+  (5, 7, 'Sigue el cable con el dedo, empezando por la pila. Di el nombre de cada símbolo por el que pases. Cuando vuelvas a la pila — ¡ese es el circuito entero! Si tu dedo tiene que <b>saltar un hueco</b>, el circuito está <b>abierto</b> y nada funcionará.'),
+  (5, 8, '<b>Reglas para dibujar:</b> ✏️ usa una <b>regla</b> para cada cable · dibuja <b>solo los símbolos</b>, nunca los objetos reales · haz las esquinas en <b>ángulos rectos</b> · <b>etiqueta</b> cada componente.'),
+  (5, 9, '🃏 Ve a la pestaña <b>🎮 Games</b> y gana a <b>Symbol Match</b> — después de dos o tres partidas te sabrás los 7 símbolos sin pensar.')
+
+) as tr(lesson_ord, block_ord, es)
+where b.lesson_id = l.id
+  and l.module_id = m.id
+  and s.code = 'science' and s.school_id is null
+  and c.school_id is null and c.year_level = 6
+  and m.ord = 1
+  and l.ord = tr.lesson_ord
+  and b.ord = tr.block_ord
+  and b.content ? 'html'
+  and not (b.content -> 'html' ? 'es');
+
+
+-- -----------------------------------------------------------------------------
+-- 4 · Notas de terminología
+-- -----------------------------------------------------------------------------
+-- · «cell» se traduce como «pila» y «battery» como «batería»: es la distinción
+--   que enseña la lección 4 (una pila es UNA, una batería son DOS O MÁS pilas).
+-- · «conductor» / «insulator» → «conductor» / «aislante», términos estándar en
+--   los libros de texto españoles de primaria.
+-- · «acid rain» → «lluvia ácida», «sulfur dioxide» → «dióxido de azufre»,
+--   «nitrogen oxides» → «óxidos de nitrógeno», «sulfuric acid» → «ácido
+--   sulfúrico», «nitric acid» → «ácido nítrico».
+-- · «Circuit Lab», «Symbol Match» y «Games» se dejan en inglés porque son
+--   nombres de pestañas/juegos de la interfaz que el alumno ve en inglés.

~~~

## Salida final de `node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/science.json supabase/migrations/0033_science_es.sql`

~~~

fuente:    contracts/fuentes/science.json
migracion: supabase/migrations/0033_science_es.sql
bloques esperados: 38   traducidos encontrados: 38

  OK — cobertura completa, marcado y numeros conservados, escrituras aditivas.


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.