# Resultado - tr-ict-a3
- Contrato: `contracts/tr-ict-a3.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 5
- Rama: `deepseek/tr-ict-a3`
- Duracion: 43.0 s
## Diff

~~~diff
diff --git a/supabase/migrations/0035_ict_es.sql b/supabase/migrations/0035_ict_es.sql
new file mode 100644
index 0000000..2d45f65
--- /dev/null
+++ b/supabase/migrations/0035_ict_es.sql
@@ -0,0 +1,120 @@
+-- =============================================================================
+-- 0035_ict_es.sql — la lección 3 de Informática deja de estar solo en inglés
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+--
+-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
+-- Misma técnica que 0028: escrituras aditivas con `jsonb_set`, guarda
+-- `not (content -> 'html' ? 'es')` en cada UPDATE, localización por clave
+-- natural (subjects.code = 'ict' + year_level = 6 + lessons.ord +
+-- lesson_blocks.ord), cero UUID.
+--
+-- -----------------------------------------------------------------------------
+-- QUÉ ARREGLA
+-- -----------------------------------------------------------------------------
+-- La materia ict está sembrada en producción solo en inglés. El alumno ve el
+-- marco en español y la lección en inglés. No es un fallo de i18n: es
+-- contenido que falta.
+--
+-- -----------------------------------------------------------------------------
+-- CÓMO AÑADE EL ESPAÑOL (y por qué no puede borrar el inglés)
+-- -----------------------------------------------------------------------------
+-- Nunca se asigna el campo entero. Siempre se MEZCLA sobre el objeto existente
+-- con `||` (y `jsonb_set` para bajar al nivel que toca), así que la clave `en`
+-- sobrevive por construcción: no hay ninguna sentencia aquí capaz de perderla.
+--
+-- Idempotente: cada UPDATE lleva la guarda `not (… ? 'es')`. Ejecutarla dos
+-- veces no toca ni una fila la segunda vez.
+--
+-- -----------------------------------------------------------------------------
+-- DE DÓNDE SALE EL TEXTO
+-- -----------------------------------------------------------------------------
+-- Traducción escrita a mano sobre el inglés que hay HOY en producción.
+-- Criterio: español de España tal y como lo diría un maestro a un niño de
+-- 10 años, con la terminología fija sin negociar — servidor, red, streaming,
+-- contenido digital, videollamada, transmisión en directo.
+--
+-- Decisiones que conviene mirar al aprobar:
+--
+--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal y coma
+--      de millar. No se convierten a la notación española. El examen es en
+--      inglés y el niño escribirá `12.6` en él.
+--
+--   2. `&amp;` que une dos palabras se traduce por «y». `&lt;` se conserva
+--      literal, es el signo «menor que».
+--
+--   3. Los símbolos y números se conservan: `x`, `÷`, `→`, y toda cifra.
+--
+--   4. Los nombres propios no se traducen: Gmail, Hotmail, Yahoo! Mail,
+--      Google Docs™, Google. Son marcas y productos.
+--
+--   5. Terminología de la materia: «streaming» se deja en inglés (es el
+--      término técnico universalmente usado en español también); «server» se
+--      traduce como «servidor»; «digital content» como «contenido digital».
+--      «Video calling» se traduce como «videollamada» y «live streaming» como
+--      «transmisión en directo» (términos comunes en libros de texto de
+--      primaria en España).
+--
+-- -----------------------------------------------------------------------------
+-- QUÉ **NO** TOCA
+-- -----------------------------------------------------------------------------
+--   · La clave `en` de absolutamente nada. Ni una sola.
+--   · Ningún esquema: esto es una migración de datos, no hay DDL.
+--   · Ninguna otra materia ni lección: otro agente lleva el resto de ict.
+-- =============================================================================
+
+
+-- -----------------------------------------------------------------------------
+-- 1 · Los 7 bloques con `content.html` de la lección 3
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
+  -- Lección 3 — Contenido digital y streaming
+  (3, 1, '<b>El contenido digital</b> es <b>todo lo que se puede guardar o enviar digitalmente</b> — texto, audio, archivos de vídeo, gráficos, animaciones e imágenes.<br><br><b>Un servidor es un ordenador que ofrece servicios en una red.</b> ← aprende esta frase palabra por palabra.'),
+  (3, 2, '<h3>🗄️ Lo que guardan los servidores</h3><ul><li><b>Fotografías e imágenes</b> — para que la gente pueda compartir fotos y álbumes de fotos.</li><li><b>Mensajes</b> — sobre todo texto, pero pueden incluir imágenes y emojis.</li><li><b>Sitios web</b> — los archivos y los datos de los sitios web.</li><li><b>Correos electrónicos</b> — Gmail, Hotmail y Yahoo! Mail los guardan en sus servidores.</li><li><b>Software en línea</b> — como Google Docs™, que se usa a distancia y se guarda en los servidores de Google.</li><li><b>Juegos en línea</b> — cada juego normalmente tiene su propio servidor.</li><li><b>Contenido de vídeo</b> — películas, series de televisión, vídeos musicales.</li><li><b>Contenido de audio</b> — música, <b>podcasts</b> y <b>audiolibros</b>. <b>La música es la forma de audio más popular.</b></li></ul><h3>▶️ Streaming</h3>'),
+  (3, 3, '<b>El streaming es cuando un archivo digital se envía de unos pocos segundos a la vez desde el servidor.</b> Puedes empezar a ver o a escuchar mientras el resto del archivo todavía se está enviando.'),
+  (3, 5, 'La trampa: «El contenido en streaming se guarda automáticamente en el dispositivo del usuario». → <b>FALSO</b>. Se <b>borra</b> automáticamente.'),
+  (3, 6, '<h3>🔑 Palabras clave</h3>'),
+  (3, 8, '<h3>✅ Las respuestas que anotó tu clase</h3>'),
+  (3, 10, '<b>Dos tipos de contenido de vídeo que se pueden transmitir en streaming:</b> las videollamadas y la transmisión en directo (también las películas, las series de televisión y los vídeos musicales).')
+
+) as tr(lesson_ord, block_ord, es)
+where b.lesson_id = l.id
+  and l.module_id = m.id
+  and s.code = 'ict' and s.school_id is null
+  and c.school_id is null and c.year_level = 6
+  and m.ord = 1
+  and l.ord = tr.lesson_ord
+  and b.ord = tr.block_ord
+  and b.content ? 'html'
+  and not (b.content -> 'html' ? 'es');
+
+
+-- -----------------------------------------------------------------------------
+-- 2 · Notas de terminología
+-- -----------------------------------------------------------------------------
+-- · «Streaming» se deja en inglés: es el término técnico universalmente usado
+--   en español también (los libros de texto de primaria lo usan así).
+-- · «Server» → «servidor»: traducción estándar en informática.
+-- · «Video calling» → «videollamada»: término común en español.
+-- · «Live streaming» → «transmisión en directo»: término común en español.
+-- · «Digital content» → «contenido digital»: traducción literal estándar.
+-- · «Online software» → «software en línea»: «software» no se traduce (es un
+--   préstamo aceptado), «en línea» es la forma común en España.
+-- · «Websites» → «sitios web»: traducción estándar en España.
+-- · «Email messages» → «correos electrónicos»: traducción estándar.
+-- · «Audio books» → «audiolibros»: traducción estándar.
+-- · «TV shows» → «series de televisión»: traducción natural para un niño.

~~~

## Salida final de `node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/ict-a3.json supabase/migrations/0035_ict_es.sql`

~~~

fuente:    contracts/fuentes/ict-a3.json
migracion: supabase/migrations/0035_ict_es.sql
bloques esperados: 7   traducidos encontrados: 7

  OK — cobertura completa, marcado y numeros conservados, escrituras aditivas.


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.