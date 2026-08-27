# REVIEW — `@cet/engine`

> Pasada 2 (revisión crítica adversarial) y pasada 3 (corrección) del protocolo de
> calidad del `MASTER_PLAN.md` §7, aplicadas al motor.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

**Estado:** 290 tests en verde · 54.000 items generados en fuzz sin un solo problema.

Nota metodológica: en esta máquina no hay `node_modules` instalado (prohibido ejecutar
`pnpm install` con cinco agentes en paralelo), así que la suite se ejecutó con un arnés
temporal — Node 24 con *type stripping* nativo y un shim mínimo de `vitest` — sobre una
copia del código. **Todos los hallazgos de abajo se descubrieron ejecutando código, no
leyéndolo.** Lo que queda sin verificar es `tsc --noEmit` y ESLint: eso hay que pasarlo
en la integración.

---

## 1. Hallazgos y correcciones

### H-01 · `nf()` devolvía notación científica — CRÍTICO, corregido
`String(1e21)` da `"1e+21"`, y el arreglo obvio (`toFixed(0)`) **también** devuelve
exponencial por encima de 1e21. Una pregunta cuyo enunciado dice `1e+21` es una pregunta
que el alumno no puede contestar: `parseAnswer` rechaza esa cadena, así que la respuesta
correcta sería imposible de teclear.
**Corrección:** por encima de 1e21 se formatea con `BigInt`. Test que lo fija:
`nf(1e21) === "1,000,000,000,000,000,000,000"`.

### H-02 · El examen en español mostraba los números en formato inglés — GRAVE, corregido
AD-7 exige es/en desde el día uno y el motor imprimía `97.8` y `41,000` también en
español. No es cosmético: la clave se muestra al alumno en la revisión y el alumno la
teclea.
**Corrección:** `nf(x, locale)` y `nfScaled(v, locale)`. En español el separador de miles
es `.` y el decimal es `,`. Afecta a enunciado, pista, solución y `canonical`.

### H-03 · …lo que abrió un agujero de corrección — CRÍTICO, corregido
Consecuencia directa de H-02: con la clave mostrada como `41.000 m`, el alumno español
teclea `41.000` y el parser lo leía como **41**. Respuesta correcta marcada mal.
El caso simétrico existía ya en inglés con `1,234`.

La firma `Grader` del contrato (`response, key, maxPoints`) **no recibe el idioma**, así
que adivinar es imposible. **Corrección:** `parseAnswerReadings()` devuelve *todas* las
lecturas plausibles de una cadena ambigua (`"41.000"` → `[41000, 41]`, `"1,234"` →
`[1234, 1.234]`) y los correctores numérico y de fracciones aceptan si **alguna**
coincide con la clave. Los formatos completos (`1,234.5`, `1.234,5`) no son ambiguos y
devuelven una sola lectura. `"1,2,3"` sigue devolviendo vacío: ilegible se rechaza, no
se inventa.

### H-04 · El texto alternativo de la figura regalaba la respuesta — GRAVE, corregido
`math.shape` esconde dos lados a propósito: deducirlos **es** el ejercicio. El primer
`figureAlt` decía *"un rectángulo de 15×8 al que se le ha quitado una esquina de 6×2"*,
o sea le entregaba resueltos al usuario de lector de pantalla los dos lados que los
demás tienen que calcular. Accesibilidad no es dar ventaja: es dar la misma información.
**Corrección:** el alt describe el recorrido de los seis lados con los dos ocultos
marcados como "sin rotular, con un signo de interrogación". Hay un test que recorre 120
figuras y verifica que las longitudes ocultas no aparecen en el alt.

### H-05 · En Y6A el símbolo `=` era inalcanzable — corregido (bug del original)
`GEN.compare` construía las dos fracciones con `F()`, que las reduce, y repetía el sorteo
mientras fueran idénticas. Resultado: `fval(a) === fval(b)` solo podía darse si eran la
misma fracción, y esa se descartaba. **El alumno nunca veía el caso de igualdad**, que es
justo el que confunde (`2/4` vs `1/2`).
**Corrección:** las fracciones se muestran **sin reducir** y una rama dedicada fabrica
pares equivalentes. Test: sobre 200 semillas aparecen `>`, `<` **y** `=`.

### H-06 · La pista de `GEN.metric` mostraba el factor equivocado — corregido (bug del original)
Y6A imprimía `nf(1/1*(1/c.k>1?1/c.k:c.k))`. Con `k = 1/1000` eso da `1000` (bien), pero
con `k = 1000` da… `1000` también, y con `k = 1/10` da `10` mientras el texto decía
"multiplica". La expresión no tenía sentido.
**Corrección:** el factor se guarda como **exponente** (`10^e`) y la pista se construye a
partir de él. De paso desaparece la fuzz de coma flotante: `0,75 kg → 750 g` sale exacto,
no `749.9999999999999`.

### H-07 · Bucles `while` con `guard` en tres generadores — corregido
`GEN.fracop` (`guard++<30`), `GEN.mixed` (`guard++<40`) y `GEN.compare` (`tries<30`)
sorteaban hasta que salía algo válido. Dos problemas: el bucle puede agotar el guard y
**devolver un enunciado inválido** (una resta de resultado 0 o negativo, una fracción sin
simplificar), y consume una cantidad variable de números del PRNG, lo que hace el
generador frágil frente a cualquier cambio de rango.
**Corrección:** cero bucles de reintento.
- `fracop`: si sale `a === b` se sustituye `b = 1/(a.d+1)`, que es **demostrablemente**
  menor que `a` (`a.n ≥ 1 ⇒ a.n/a.d ≥ 1/a.d > 1/(a.d+1)`).
- `mixed`: el numerador se elige de la lista **precalculada** de coprimos de `d`.
- `compare`: si sale el mismo par, se desplaza el denominador un puesto en la lista.

El único bucle acotado que queda es el rechazo de sesgo de `Rng.int`, y está limitado a
64 intentos con salida garantizada (probabilidad de llegar al límite < 2⁻⁶⁴).

### H-08 · Aritmética de decimales sobre `double` — corregido
Y6A encadenaba `Math.round(x*100)/100` sobre doubles. Eso produce claves con fuzz y, en
`GEN.decimal`, divisiones que podían no ser exactas.
**Corrección:** tipo `ScaledDecimal` (`{scaled, dp}`, enteros). El enunciado se construye
**a partir del resultado**, no al revés: en la división el dividendo se deriva del
cociente, así que la respuesta siempre es exacta. `scaledDivInt` **lanza** si una división
no es exacta — un enunciado con respuesta periódica no puede llegar a un examen. Test:
`0.1 + 0.2` no aparece por ninguna parte.

### H-09 · `parseAns` podía dar resultados falsos con números enormes — corregido
El original hacía `parseInt` sin límite. `"99999999999999999999/7"` producía una fracción
basura en vez de un rechazo, y `gcd` sobre no-enteros seguros da resultados sin sentido.
**Corrección:** magnitud máxima 1e15, longitud máxima de entrada, decimales truncados a
12 cifras. Y el contrato duro: **`parseAnswer` no lanza jamás**; 32 entradas basura
distintas lo verifican (incluidas `"7/0"`, `"0/0"`, `"<script>"`, `"'; DROP TABLE …"`,
900 nueves, `undefined`, `{}`).

### H-10 · `isSimplest` colaba `1 6/8` — corregido
El original solo miraba la forma `a/b`; un número mixto con la parte fraccionaria sin
simplificar pasaba el filtro. Ahora también se comprueba la parte fraccionaria del mixto.

### H-11 · `GEN.word` t1 pedía "3/2 kg de una receta" — corregido
`F(ri(1,5), pick([2,3,4,5,6,8]))` podía dar fracciones impropias, y "una receta necesita
5/2 kg de harina y hago 4/3 de la receta" no es un enunciado de 5º de primaria.
**Corrección:** ambas fracciones son propias. (También se eliminó `M = pick(...)`, una
variable que Y6A calculaba y no usaba nunca.)

### H-12 · El enunciado llevaba `<div style="...">` — corregido
`GEN.shape` incrustaba la figura en el enunciado con un `div` con estilos inline. El
contrato tiene un campo `figureSvg` para eso y la allowlist del `stem` no admite estilos.
**Corrección:** la figura va en `figureSvg`, y el polígono se dibuja en **coordenadas del
modelo** dentro de un `<g transform="scale(s)">`. Efecto secundario valioso: la figura
persistida es **verificable** — el test aplica el área de Gauss a los puntos del polígono
y compara con la clave, una comprobación completamente independiente del generador.

### H-13 · El orden del banco decidía el examen — corregido
`materializeExam` filtraba el pool y barajaba. Pero Postgres **no garantiza** el orden de
un `SELECT` sin `ORDER BY`: dos ejecuciones podían devolver las filas en distinto orden y
producir exámenes distintos con la misma semilla. Eso rompe el principio rector.
**Corrección:** el pool se ordena por `question_version_id` antes de sortear. Test:
materializar con el pool invertido da el mismo examen byte a byte.

### H-14 · Un solo flujo de PRNG para todo — corregido
Si la selección de preguntas, el barajado de secciones y el de opciones compartieran
corriente, cambiar el número de opciones de **una** pregunta cambiaría el examen entero.
**Corrección:** `SEED_STREAM` separa cuatro flujos derivados de la misma raíz.

### H-15 · Credito parcial: marcarlo todo daba nota — mitigado y documentado
La fórmula es `max(0, (aciertos − fallos) / total_correctas)`. Con 2 correctas de 4
opciones, marcarlo todo da **0** ✔. Con 3 correctas de 5, da 1/3.
**Limitación aceptada y documentada:** el `AnswerKey` de tipo `choice` no lleva el número
total de opciones, así que el corrector no puede normalizar el castigo. Anular por
completo el "marcar todo" exigiría cambiar el contrato congelado. Hay tests para los dos
casos.

### H-16 · Otros ajustes menores
- `t()` se exportaba desde el índice del paquete con un nombre demasiado genérico
  (colisiona con el `t` de i18n de cualquier app). Renombrado a `pickLocale`.
- `math.compare` aceptaba `"&#61;"` como respuesta. Sin sentido; fuera.
- `math.word` declaraba `format: "numeric"` pero emitía items de formato `fraction` en
  dos de sus seis plantillas. Ahora declara `short_text` (que es el widget real: una caja
  de texto) y quien decide cómo se corrige es `answerKey.type`.
- El registro rechaza claves duplicadas: dos generadores con la misma `engineKey` harían
  irreproducible cualquier examen que la usara.
- `deriveItemSeed` descarta las 8 primeras salidas del PRNG para que semillas
  consecutivas no produzcan exámenes parecidos.

---

## 2. Lo que se buscó y NO se encontró

- **`Math.random` / `Date.now` / `new Date()` / `crypto.getRandomValues` en producción:**
  cero. Hay un test que **lee el código fuente** de `src/` (menos `__tests__`), le quita
  los comentarios y falla si aparece alguno. Es el guardián real del invariante: un
  humano futuro que meta un `Math.random()` se estrella contra él.
- **`any` en código propio:** ninguno. El único tipo borrado es `z.ZodTypeAny`, alias de
  la propia zod, y solo para *exponer* el esquema en el registro; la validación la hace
  `generate`, que tiene capturado el generador concreto con su tipo.
- **Preguntas imposibles o ambiguas:** 54.000 items generados en los dos idiomas; para
  cada uno se comprueba que **escribir la respuesta canónica se corrige como correcta**,
  que no aparece `NaN`/`undefined`/`Infinity` en nada que vea el alumno, y que la clave
  numérica no tiene más de 6 decimales. Cero fallos.
- **Fuga de la clave:** el motor devuelve `answerKey` porque el servidor la necesita para
  persistirla y corregir. Nunca la escribe en `renderedBody`. Impedir que llegue al
  cliente es responsabilidad de la RLS por columna y de la vista `attempt_items_student`
  (DATA_MODEL §9); está documentado en `modules/exam-engine/CLAUDE.md`.

---

## 3. Riesgos abiertos (no resueltos aquí)

| # | Riesgo | Por qué se deja | Quién lo cierra |
|---|---|---|---|
| R-1 | `tsc --noEmit` y `eslint` no ejecutados | No hay `node_modules` y está prohibido instalar | Integración: `pnpm verify` |
| R-2 | La unidad ("cm", "kg") no puntúa | `AnswerKey` numeric/fraction no lleva la unidad esperada y el contrato está congelado. El corrector quita el sufijo para poder leer el número; "120 cm", "120cm" y "120" valen igual | M07 si algún día se amplía el contrato |
| R-3 | `"120 pollos"` se acepta como 120 | Efecto colateral de R-2: se elimina cualquier sufijo alfabético final. Se prefirió la tolerancia al niño que escribe la unidad | Documentado, aceptado |
| R-4 | `ordering` puntúa por posición absoluta | Es lo único explicable a un niño ("acertaste 3 de 5 posiciones"). Kendall-tau sería más justo y menos comprensible | M10 puede recalificar a mano |
| R-5 | `sanitizeStem` en modo `strip` **escapa** el marcado no permitido en vez de borrarlo | Un `<p>` de un profesor se ve como `&lt;p&gt;`. Feo pero seguro y visible, que es lo que se quiere en contenido de autoría | M07 (editor con allowlist en origen) |
| R-6 | El SVG lo sanea el motor, pero `@cet/ui` **debe** volver a sanearlo | Defensa en profundidad: el motor no es la última línea | @cet/ui |
| R-7 | Solo hay generadores de Math | Es el alcance del Hito 1 | Hito 4 |
