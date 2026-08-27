# REVISIÓN CRÍTICA — `@cet/content`

> Pasada 2 (adversarial) y pasada 3 (corrección) del protocolo de calidad del `MASTER_PLAN` §7.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

La pregunta que guía esta revisión no es "¿funciona?" sino **"¿de qué manera podría estar
mintiendo?"**. Un pipeline de extracción tiene un modo de fallo peor que romperse: producir
un pack que parece correcto y no lo es. Nadie lo mira, se siembra en la base de datos, y el
error aparece meses después como una pregunta con la respuesta cambiada.

Estado: **4 defectos reales encontrados, 4 corregidos y con test de regresión.**
Verificación: `tsc --noEmit` limpio · 177 tests en verde · seis packs regenerados e idénticos.

> Se numeran D-1 a D-4 en el orden en que se encontraron. D-2 es el más instructivo:
> es un defecto **en la corrección de D-1**.

---

## Defectos encontrados y corregidos

### D-1 · `readSymbol` se enganchaba a declaraciones comentadas · **CRÍTICO — corrupción silenciosa**

**Encontrado por**: el test `readSymbol > encuentra el símbolo y respeta los corchetes dentro de
strings`, escrito con un fixture que incluía a propósito una versión vieja comentada.

**Qué pasaba.** `readSymbol` buscaba `var SYMBOL=` con una expresión regular sobre el texto crudo
del `<script>`. Un trainer con una versión anterior comentada:

```js
/* var BANK=[{c:"ps", q:"PREGUNTA VIEJA", …}];  version anterior */
var BANK=[ …el banco real… ];
```

devolvía **el banco comentado**. Sin error, sin aviso: un curso entero con el contenido
equivocado. Es exactamente el fallo que este documento busca — no rompe, miente.

**Corrección.** `blankComments()` sustituye por espacios todo el contenido de los comentarios
antes de buscar la declaración, conservando la longitud (para no invalidar los offsets de
`JsLiteralError`). Además, dos declaraciones **reales** del mismo símbolo ahora lanzan en vez de
elegir una: cuál gana depende del orden de ejecución, y adivinarlo sería volver a inventar.

---

### D-2 · La corrección de D-1 quedaba anulada por un apóstrofo · **CRÍTICO — el parche no parcheaba**

**Encontrado por**: probar `blankComments` contra el código real de English en vez de contra un
ejemplo cómodo.

**Qué pasaba.** La primera versión de `blankComments` conocía comillas pero no expresiones
regulares. English tiene esto **justo antes** de su banco:

```js
function norm(s){ return (s||"").replace(/[^a-z0-9' ]/g, "") }
```

Ese apóstrofo dentro de la clase de caracteres metía al escáner en "estado de string". A partir
de ahí buscaba una comilla de cierre que no existía como tal, y el blanqueo de comentarios
quedaba desactivado para todo el trozo siguiente — es decir, **la protección recién añadida se
apagaba sola, en silencio, en el único fichero donde hacía falta**.

Un segundo defecto vivía en el mismo sitio: un `!/s/.test(c)` al que le faltaba una barra
(debía ser `!/\s/`) hacía que el rastreo del "último token significativo" tratase los espacios
como significativos, y entonces el `/` de una división (`total / count`) se interpretaba como
apertura de expresión regular y se comía el comentario siguiente.

**Corrección.** `blankComments` es ahora un lexer que reconoce cuatro estados —código, string,
plantilla y expresión regular— y decide si un `/` abre una regex con la heurística estándar del
último token significativo (identificador, número o cierre `) ] }` ⇒ división; cualquier otra
cosa ⇒ regex). Seis tests de regresión, incluido el fragmento literal de English.

**Lección**: probar un parche de seguridad contra un ejemplo inventado no demuestra nada. Hay
que probarlo contra la entrada que motivó el parche.

---

### D-3 · Doble decodificación de entidades en `sanitizeToText` · **MEDIO — corrupción de contenido**

**Encontrado por**: recorrer a mano el camino de un título de lección.

**Qué pasaba.** `sanitizeToText` estaba implementado como "sanear, quitar etiquetas con una
regex, decodificar". Como `sanitizeHtml` ya decodifica una vez, eso son **dos** decodificaciones.
Y el resultado se volvía a pasar por `sanitizeHtml` en `lessonsFromAccordions` — tres. Cada
pasada quitaba un nivel de escape:

| pasada | valor |
|---|---|
| fuente | `&amp;lt;b&amp;gt;` |
| lo que el alumno debe leer | `&lt;b&gt;` |
| lo que se guardaba | `<b>` — **texto convertido en marcado** |

**¿Es un XSS?** No, y merece decirse con precisión: la allowlist vuelve a tokenizar el resultado
y filtra etiqueta por etiqueta y atributo por atributo, así que `<img onerror=…>` no sobrevive a
ninguna cantidad de decodificaciones. Pero la seguridad pasaba a depender de **una sola** capa,
y el contenido se corrompía de verdad.

**Corrección.** `sanitizeToText` tokeniza la entrada y decodifica sus nodos de texto **una sola
vez**, sin viaje de ida y vuelta por HTML escapado; descarta además el contenido de `<script>` y
compañía. Se añade `textToSafeHtml()` —decodificar una vez, escapar una vez— y
`titleFromButton()` devuelve ya HTML seguro que el llamante guarda **sin volver a sanear**. Test
de estabilidad: aplicar la función dos veces da el mismo resultado.

---

### D-4 · Contenido real descartado sin dejar rastro · **MEDIO — pérdida silenciosa**

**Encontrado por**: comparar el panel `#learn` de English con lo que salía en el pack.

**Qué pasaba.** `lessonsFromAccordions` leía únicamente los `div.topic`. English y Español ponen,
**fuera** de los acordeones, una tarjeta de introducción con una tabla real de contenidos
("Grammar | Vocabulary | Skills", "Tema | Contenido | Página del texto"). Se descartaba entera —
y ni siquiera aparecía en `COVERAGE.md`, porque el pipeline solo sabía informar de lo que había
intentado convertir.

**Corrección.** El extractor calcula ahora los bloques **por sustracción**: todo lo de la sección
menos los acordeones. Van a `courseModule.overview` (campo nuevo del esquema). Se hace por
sustracción a propósito: si mañana alguien añade otro contenedor al panel, aparecerá en
`overview` en vez de desaparecer. Las cuatro materias restantes usan `overviewFromSection()`
para lo mismo.

---

## Riesgos aceptados, con su razón

No todo hallazgo es un defecto. Estos se han evaluado y se dejan como están, documentados aquí
para que la próxima persona no tenga que redescubrirlos.

| # | Situación | Por qué se acepta |
|---|---|---|
| R-1 | `findClosingTag` usa una expresión regular y se rompería con un atributo que contenga `>` (`title="a>b"`) | Ningún trainer lo hace. Si ocurriera, el resultado sería una lección truncada y **visible**, no un dato falso. Un parser HTML completo es desproporcionado para seis ficheros conocidos. |
| R-2 | `topLevelNodes` llama a `findClosingTag` por cada apertura: O(n²) en el peor caso | El fichero más grande (Socials, 145 KB) se procesa en decenas de milisegundos. Optimizar sería complejidad sin beneficio. |
| R-3 | La heurística de expresión regular de `blankComments` no es un parser de JS | Es la misma que usan los resaltadores de sintaxis. El JS de Y6A no contiene los casos patológicos (`a++ /re/`). Un fallo produce `SymbolNotFoundError`, que es ruidoso. |
| R-4 | El saneador **desenvuelve** `<a>`: se pierde el destino del enlace | Un `href` es superficie de ataque (`javascript:`, phishing) y ningún enlace de Y6A es contenido esencial. Se conserva el texto. Si mañana hacen falta enlaces, se añaden con una allowlist de esquemas y de dominios, no relajando esto. |
| R-5 | La cadena métrica de Math (`.chain`) sale como una lista plana alternando unidad y operador | Es exactamente lo que dice la fuente. Darle más estructura sería interpretar, y la UI puede reconstruir la escalera desde esa alternancia. |
| R-6 | `question_versions` no se modela: el pack trae una sola versión | El versionado inmutable (§4 de `DATA_MODEL`) es responsabilidad del sembrador y de la DB. Un pack es una importación, no un historial. |
| R-7 | `lesson_skills.weight` no se emite | El pack da `skillCodes` sin peso; el sembrador aplica peso uniforme. Ponderar sin base pedagógica sería inventar. |

---

## Lo que ya estaba bien (y por qué se comprobó)

- **No se ejecuta nada del fichero fuente.** Ni `eval`, ni `node:vm` (que no es un sandbox de
  seguridad y su documentación lo dice). El parser restringido acepta la gramática de datos que
  Y6A usa y rechaza todo lo demás con la posición exacta. 20 tests de rechazo.
- **La contaminación de prototipo está bloqueada**: `__proto__`, `constructor` y `prototype` como
  clave de objeto lanzan.
- **La idempotencia se demuestra, no se afirma**: `verifyIdempotence()` extrae dos veces desde
  disco y compara byte a byte, y `--check` falla si `packs/` está desactualizado respecto al
  código. Cero `Date.now()`, cero `randomUUID()`, cero rutas absolutas en la salida.
- **Los ids no colisionan entre materias**: se comprueba sobre los seis packs a la vez, porque
  los seis se siembran en la misma base de datos.
- **El esquema impide estados imposibles**: una pregunta `generated` no puede llevar clave
  estática (unión discriminada), un blueprint no puede pedir más ítems de los que el banco tiene
  (`superRefine`), y ningún skill puede referenciar un padre inexistente.
- **Los valores inventados están declarados como tales.** `difficulty`, `estimatedMinutes`,
  `passThreshold` y `maxAttempts` no existen en Y6A. Se rellenan con un valor uniforme y
  **todos** los packs llevan un hueco que lo dice con nombre y apellidos. Un profesor que vea
  "dificultad 2" tiene derecho a saber que eso no lo escribió nadie.

---

## Lo que esta revisión NO cubre

- **Que el motor implemente los nueve `engine_key`.** `math.simplify`, `math.fracop`, … son un
  contrato con `@cet/engine` (vía B). Este paquete comprueba que emite exactamente esos nombres;
  que existan al otro lado lo tiene que verificar un test de contrato cuando el motor aterrice.
- **Que el sembrador respete el pack.** `supabase/seed` es de otra vía.
- **La corrección pedagógica del material.** Si una pregunta de Y6A tiene mal la respuesta, el
  pipeline la copia fielmente. Detectar eso es trabajo de un profesor, no de un extractor —
  aunque sí se detectan las opciones duplicadas, que hacen la respuesta ambigua en cuanto la UI
  baraja.
