# Resultado - tr-ict-a1
- Contrato: `contracts/tr-ict-a1.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 3 de 5
- Rama: `deepseek/tr-ict-a1`
- Duracion: 45.4 s
## Diff

~~~diff
diff --git a/supabase/migrations/0031_ict_es.sql b/supabase/migrations/0031_ict_es.sql
new file mode 100644
index 0000000..b672f3f
--- /dev/null
+++ b/supabase/migrations/0031_ict_es.sql
@@ -0,0 +1,122 @@
+-- =============================================================================
+-- 0031_ict_es.sql — la lección 1 de Informática deja de estar solo en inglés
+-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
+-- =============================================================================
+--
+-- SIN APLICAR. Es texto que lee un niño, así que lo aprueba una persona.
+-- Misma técnica que 0028: escrituras aditivas con `jsonb_set` sobre
+-- `content.html`, guarda `not (content -> 'html' ? 'es')` en cada UPDATE,
+-- localización por clave natural (materia `ict` global → curso year_level 6 →
+-- lección `ord` → bloque `ord`), cero UUID.
+--
+-- -----------------------------------------------------------------------------
+-- QUÉ ARREGLA
+-- -----------------------------------------------------------------------------
+-- La interfaz está entera en los dos idiomas, con paridad exacta de claves. El
+-- CONTENIDO no: el alumno veía el marco en español y la lección en inglés.
+-- Esta migración traduce los 12 bloques de la lección 1 de Informática.
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
+-- -----------------------------------------------------------------------------
+-- DE DÓNDE SALE EL TEXTO
+-- -----------------------------------------------------------------------------
+-- Traducción escrita a mano sobre el inglés que hay HOY en producción.
+-- Criterio: español de España tal y como lo diría un maestro a un niño de
+-- 10 años, con la terminología fija sin negociar — hardware, software,
+-- sistema operativo, procesador de textos, hoja de cálculo, presentación,
+-- edición de vídeo, almacenamiento secundario, capacidad, velocidad.
+--
+-- Decisiones que conviene mirar al aprobar:
+--
+--   1. NÚMEROS: se conservan EXACTAMENTE como en inglés — punto decimal y coma
+--      de millar. No se convierten a la notación española. El examen es en
+--      inglés y el niño escribirá `12.6` en él; enseñarle `12,6` en la mitad
+--      española del mismo trainer sería enseñarle a fallar.
+--
+--   2. `&amp;` que une dos palabras se traduce por «y». El resto de entidades
+--      (`&lt;`, que ES el signo «menor que» de una comparación) se conservan
+--      literales, igual que `→`, `÷`, `×` y todo el HTML.
+--
+--   3. Los nombres propios y las etiquetas de interfaz se dejan en inglés:
+--      Windows, macOS, Android, Funny Cats Can Sing Anything (la regla
+--      mnemotécnica se enseña en inglés porque el examen es en inglés).
+--
+--   4. El bloque 13 («bit → byte → kilobyte → megabyte → gigabyte → terabyte»)
+--      se declara IDÉNTICO: son unidades internacionales, no hay nada que
+--      traducir.
+--
+-- -----------------------------------------------------------------------------
+-- QUÉ **NO** TOCA
+-- -----------------------------------------------------------------------------
+--   · La clave `en` de absolutamente nada. Ni una sola.
+--   · Ningún esquema: esto es una migración de datos, no hay DDL.
+--   · Ninguna otra materia ni lección: otro agente lleva el resto en paralelo.
+-- =============================================================================
+
+
+-- -----------------------------------------------------------------------------
+-- 1 · Los 12 bloques con `content.html` de la lección 1
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
+  -- Lección 1 — Hardware y software
+  (1,  1, '<b>Hardware</b> = todos los componentes <b>físicos</b> de un ordenador — las partes que puedes tocar.<br><b>Software</b> = todos los <b>programas</b> que le dicen a los componentes físicos qué hacer.'),
+  (1,  2, '<h3>🔩 Componentes del hardware</h3>'),
+  (1,  4, '<h3>💿 Componentes del software</h3><ul><li><b>Software de sistema</b> — el <b>sistema operativo</b> (Windows, macOS, Android).</li><li><b>Software de aplicación</b> — <b>procesador de textos</b>, <b>hoja de cálculo</b>, <b>presentación</b> y <b>edición de vídeo</b>.</li></ul>'),
+  (1,  5, 'El hardware y el software son <b>complementarios</b>. Un dispositivo informático solo produce resultados útiles cuando <b>los dos trabajan juntos</b>.'),
+  (1,  6, '<h3>⭐ Los 5 factores al elegir hardware y software</h3>'),
+  (1,  8, '<b>Truco para recordarlo:</b> <b>F–C–C–S–A</b> → <i>Funny Cats Can Sing Anything</i>. Esas son las cinco cosas que tienes que enumerar si el examen pregunta «¿qué hay que tener en cuenta al comprar hardware y software?»'),
+  (1,  9, '<h3>💾 Almacenamiento: HDD frente a SSD</h3>'),
+  (1, 11, 'Al elegir un dispositivo de <b>almacenamiento secundario</b>, las dos consideraciones son el <b>espacio (capacidad)</b> y la <b>velocidad</b>.'),
+  (1, 12, '<h3>📏 Unidades de almacenamiento de datos — de menor a mayor</h3>'),
+  (1, 13, '<b>bit → byte → kilobyte → megabyte → gigabyte → terabyte</b>'),
+  (1, 14, '<b>1 byte = 1 carácter.</b> Así que la frase <i>“Hello, what is your name?”</i> necesita <b>25 bytes</b> — porque <b>los espacios, las comas y el signo de interrogación también son caracteres</b>. ¡Cuéntalos todos!'),
+  (1, 15, '<h3>⚡ Velocidad del procesador</h3><ul><li>Funciones de todos los días (escribir, navegar): unos <b>1–2 GHz</b>.</li><li><b>Juegos</b>: unos <b>3 GHz</b> o más.</li><li>La velocidad del procesador importa porque la CPU es <b>el cerebro del ordenador</b> — todo espera a que ella termine.</li></ul><h3>✅ Las respuestas que anotó tu clase</h3>')
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
+-- IDENTICO 1:13 — «bit → byte → kilobyte → megabyte → gigabyte → terabyte» son
+-- unidades internacionales de almacenamiento, no hay nada que traducir.
+
+
+-- -----------------------------------------------------------------------------
+-- 2 · Notas de terminología
+-- -----------------------------------------------------------------------------
+--   · «hardware» y «software» se dejan en inglés: son los términos que usa el
+--     libro de texto español de primaria (y el examen).
+--   · «ordenador» en lugar de «computadora»: español de España.
+--   · «procesador de textos», «hoja de cálculo», «presentación» y «edición de
+--     vídeo» son los nombres estándar de las aplicaciones de Office en español.

~~~

## Salida final de `node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/ict-a1.json supabase/migrations/0031_ict_es.sql`

~~~

fuente:    contracts/fuentes/ict-a1.json
migracion: supabase/migrations/0031_ict_es.sql
bloques esperados: 12   traducidos encontrados: 12

  OK — cobertura completa, marcado y numeros conservados, escrituras aditivas.


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.