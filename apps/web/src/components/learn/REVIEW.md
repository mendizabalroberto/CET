# Pasada 2 — revisión crítica adversarial: `/learn` y `/practice`

> Hito 2 · vía learn+practice · © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Revisado el 2026-08-26 contra la lista del §7 del `MASTER_PLAN`.

Este documento es la pasada 2 del protocolo de tres pasadas. Todo lo que aparece
como **CORREGIDO** ya está arreglado en el código y re-verificado con
`npx tsc --noEmit` y `npx vitest run`. Lo que aparece como **ACEPTADO** es una
decisión consciente con su motivo escrito, no un olvido.

---

## 1. Seguridad

### 1.1 ¿Algún `dangerouslySetInnerHTML` sin sanear? — **No**

`grep -rn dangerouslySetInnerHTML` sobre `src/components/learn/**` y
`src/app/(student)/{learn,practice}/**` devuelve **cero** ocurrencias de código
(la única coincidencia es el comentario de `block-mapping.ts` que lo dice).

Todo el HTML de la base de datos cruza **dos** barreras:

1. `mapLessonBlock()` lo pasa por `sanitizeHtml` / `sanitizeSvg` de `@cet/ui`
   antes de construir el `LessonBlockContent` (contrato C5 de `MODULES.md`);
2. los componentes de `@cet/ui` lo vuelven a sanear por dentro, en
   `safe-html.tsx`, que es el único punto del sistema autorizado a usar
   `dangerouslySetInnerHTML`.

Sanear dos veces es idempotente y barato. Confiar en que alguien saneó antes, no.

Cubierto por `block-mapping.test.ts` con `<script>`, `onerror=` y
`href="javascript:"` en un bloque de prosa, en un paso de `steps`, en una celda
de tabla y en el SVG de un bloque `interactive`.

### 1.2 ¿Se filtra la respuesta correcta en el DOM antes de responder? — **CORREGIDO**

`HintPanel` y `SolutionPanel` de `@cet/ui` renderizan su contenido con
`hidden={!open}`: el HTML está en el DOM aunque el panel esté cerrado. Bastaba
abrir el inspector —o un lector de pantalla mal configurado— para leer la
solución antes de contestar.

Arreglo: el `html` **solo se pasa cuando el panel está abierto**
(`html={state.solutionOpen ? … : undefined}`). Cerrado, el panel no contiene
nada. La `answerKey` vive únicamente en memoria de JavaScript; no se serializa
en el HTML porque la pregunta se genera en el cliente.

Nota de alcance: en práctica esto **no** es un fallo de seguridad —no puntúa, y
AD-5 pone el motor entero en el cliente a propósito—. Es un fallo pedagógico:
si la solución se puede leer sin pedirla, `solution_viewed` deja de medir nada.

### 1.3 Aislamiento por colegio — filtro explícito además de la RLS

`queries.ts` cumple la regla transversal 2 de `MODULES.md`: **toda** consulta
filtra por `school_id`, aunque la RLS ya lo haga.

- `school_courses`: `.eq("school_id", schoolId).eq("is_active", true)`.
- `courses`, `course_modules`, `lessons`, `subjects`, `skills`,
  `lesson_blocks`, `media_assets`: filtro AD-2 `school_id is null or = X`.
- `skill_mastery`: `.eq("student_id").eq("school_id")`.

Agujero encontrado y **CORREGIDO**: `getLesson()` verificaba que la lección
fuera visible pero **no** que su curso estuviera ACTIVADO para el colegio. Una
lección global de un curso que el colegio nunca encendió era alcanzable
adivinando su uuid. Ahora se comprueba `school_courses` explícitamente antes de
devolver nada.

Además, `globalOrOwn()` **valida que `school_id` sea un uuid antes de
interpolarlo** en el filtro de PostgREST. El valor viene de la sesión, no del
usuario; se valida igualmente porque interpolar sin comprobar en un lenguaje de
filtros es el hábito que un día se copia a un sitio donde el valor sí viene de
fuera.

---

## 2. Lógica y casos límite

| Caso | Estado |
|---|---|
| Respuesta en blanco | No corrige, no rompe la racha, avisa con `role="alert"`. Igual que Y6A. Test. |
| Doble `submit` (doble clic, Enter repetido) | La segunda no cuenta: `phase !== "answering"` corta. Test. |
| Reloj del cliente que salta hacia atrás | `timeOnItem` nunca devuelve negativo. Test. |
| `shownAt === 0` | **CORREGIDO** (ver abajo). |
| Generador que lanza | `try/catch` → `ErrorState` con "probar otra vez", sin detalle técnico. |
| `[skillCode]` inventado en la URL | Se resuelve en el SERVIDOR; si no existe no se monta la isla de práctica. |
| Lección sin bloques | `EmptyState` en lenguaje de niño, no una página en blanco. |
| Bloque con `kind` desconocido / imagen sin media / vídeo sin subtítulos | Se omite explícitamente en vez de dejar un hueco mudo. Tests. |
| Marcador de sesión manipulado en `sessionStorage` | Se sanea al restaurar (`correct ≤ asked`, sin negativos, `best ≥ streak`). Test. |

### 2.1 El centinela `shownAt: 0` — **CORREGIDO** (bug real encontrado por un test)

`timeOnItem()` usaba `shownAt === 0` como "no hay pregunta en curso". Pero `0`
es un instante perfectamente válido, y en cuanto un test —o un reloj monotónico—
mostraba una pregunta en `t=0`, **todos** los `timeOnItemMs`,
`timeBeforeHintMs` y tiempos de `question_skipped` de esa pregunta salían a
cero. La analítica de dificultad habría estado sistemáticamente sesgada sin que
nadie lo notara. Ahora el centinela es `null`.

Este es exactamente el fallo que el protocolo busca: compilaba, no rompía nada
visible, y corrompía datos en silencio.

---

## 3. Red caída y pérdida de eventos

- **Nada del camino crítico toca la red** (AD-5). Generar, corregir y pintar el
  feedback son llamadas síncronas a `@cet/engine`. Con el wifi caído el bucle
  funciona idéntico.
- Los eventos van a `TelemetryQueue`, que reencola en fallo, reintenta con
  backoff y jitter, y vacía con `navigator.sendBeacon` en `visibilitychange` y
  `pagehide` — lo único que sobrevive al cierre de una pestaña en iOS.
- `lesson_completed` fuerza un `flush()` inmediato: terminar una lección es
  justo el momento en que el alumno cierra la pestaña o se va a practicar.
- `LessonBlockObserver` vacía el `dwellMs` acumulado en `visibilitychange`,
  `pagehide` y al desmontar. Sin eso, el tiempo del último bloque de cada sesión
  habría sido el recreo entero.
- Aviso visible de "sin conexión" (`online`/`offline`), con el mensaje correcto:
  quedarse sin red no es un fallo del sistema y no debe parecerlo.

### 3.1 `answer_changed` por pulsación — **CORREGIDO**

Emitir un evento por tecla convertía "1 3/4" en cinco eventos. Con `FLUSH_AT_COUNT
= 20`, treinta tabletas escribiendo a la vez habrían disparado un `POST
/api/events` cada pocas pulsaciones: exactamente lo que la regla 4 de
`@cet/shared/events` prohíbe.

Arreglo: la emisión de `answer_changed` se estrangula a uno cada 750 ms en el
componente. **No se pierde información**: `answer_submitted` lleva la respuesta
final completa y el `changeCount` real, que se sigue contando en la máquina.

**ACEPTADO con matiz**: `changeCount` cuenta ediciones, no "cambios de opinión"
en sentido estricto. Distinguir "corregir una errata" de "cambiar de respuesta"
requiere una heurística que hoy no tiene datos para calibrarse. Queda anotado
para M11.

---

## 4. Accesibilidad

### 4.1 Foco perdido al responder — **CORREGIDO**

Al pulsar *Comprobar*, el campo de respuesta se deshabilita (igual que Y6A). Un
elemento deshabilitado **pierde el foco**, y el foco cae al `<body>`: quien
practica con teclado o lector de pantalla se quedaba huérfano en mitad del bucle
y tenía que tabular desde el principio de la página en cada pregunta. Ahora el
foco salta al botón de acción, que en ese momento ya dice "Siguiente pregunta".
Es lo que hacía el `document.getElementById('btnCheck').focus()` de Y6A.

### 4.2 Doble anuncio del resultado — **CORREGIDO**

`CorrectFeedback` e `IncorrectFeedback` traen `announce = true` por defecto, y
además había una `LiveRegion` propia. Un lector de pantalla anunciaba el
resultado **dos veces**. Se dejó una sola: la `LiveRegion`, porque su mensaje es
más rico ("Casi. La respuesta es 3/4.") que el título del componente.

### 4.3 `<dl>` anidado — **CORREGIDO**

`StatTile` **es** un `<dl>`. La rejilla de estadísticas lo envolvía en otro
`<dl>`, que es marcado inválido y lo señala la regla `definition-list` de axe.
Ahora el contenedor es un `<div>` con `grid`.

### 4.4 "—" leído en voz alta — **CORREGIDO**

El porcentaje de acierto muestra "—" antes de la primera pregunta. Un lector de
pantalla anunciaba "Acierto, raya". Ahora se pasa `valueText` con un texto real
("Aún sin medir" / "Not measured yet").

### 4.5 Falso error en el primer fotograma — **CORREGIDO**

Mientras el efecto de arranque no había corrido, `state.question` era `null` y
la pantalla pintaba **"No hemos podido crear una pregunta"** durante un
fotograma. Ahora hay tres estados distintos y separados: esperando (`Skeleton`
con etiqueta), error (`ErrorState` con reintento) y pregunta.

### 4.6 Lo que ya estaba bien

- Teclado completo: Enter envía desde el campo; Enter en cualquier parte pasa a
  la siguiente cuando ya se ha respondido — **salvo** sobre un `<button>` o un
  `<a>`, para no secuestrar el Enter de "Ver la pista".
- Chips de tema como `<a>` y no `<button>`: cambiar de tema cambia la URL, así
  que funciona el botón "atrás", el clic con el botón central y compartir el
  enlace. Un `<button>` que navega rompe las tres cosas.
- `aria-current="page"` en el chip activo; `<nav aria-label>` en la lista.
- Objetivos táctiles de 44 px (`min-h-11`) y rejillas de una columna en móvil:
  muchos alumnos practican en tableta.
- Figura del generador `shape` con `label` accesible; si faltara el `figureAlt`,
  se marca decorativa en vez de anunciarse como "imagen" sin nombre.

---

## 5. Rendimiento y tamaño del bundle

### 5.1 `"use client"` — dónde está y por qué

| Fichero | ¿Cliente? | Motivo |
|---|---|---|
| `/learn`, `/learn/[lessonId]`, `/practice`, `/practice/[skillCode]` | **No** | Server Components. Los bloques de lección se pintan en el servidor. |
| `PracticeSession.tsx` | Sí | Es el bucle. AD-5 lo exige. |
| `LessonTracking.tsx` | Sí | Tres islas **sin marcado propio**: solo miden. `LessonBlockObserver` recibe los bloques ya renderizados por el servidor como `children`. |
| `UiLocaleProvider.tsx` | Sí | Contexto sin marcado. |
| `block-mapping.ts`, `practice-machine.ts`, `practice-topics.ts`, `dictionary.ts` | N/A | Módulos puros. |

**ACEPTADO**: `PracticeSession` importa `@cet/engine`, así que los nueve
generadores y los correctores viajan al navegador. Es la consecuencia deliberada
de AD-5 y solo afecta a `/practice/[skillCode]`, no a `/learn`.

### 5.2 Consultas

`getStudentCourses()` son cinco consultas planas con `in (...)` sobre índices
existentes (`school_courses` PK, `courses_school_idx`, `lessons_module_ord_idx`,
`skills_course_parent_idx`, `skill_mastery` PK). **No hay N+1**: son cinco
viajes con un curso y con doscientos.

Se prefieren cinco consultas planas a un `select` anidado porque PostgREST
aplica los filtros de relaciones profundas al *embed* y no a la fila padre: un
curso aparecería en la lista con cero lecciones en vez de no aparecer.

### 5.3 Media de mastery

Solo promedia las skills **con datos**. Promediar incluyendo las nunca
practicadas le daría un 4 % a un alumno que domina las tres cosas que ha visto.
Desanimar por un artefacto aritmético es peor que no enseñar el dato.

---

## 6. Tests

`npx vitest run` — 40 tests propios, en dos ficheros:

- `block-mapping.test.ts` (21): un fixture por cada uno de los **once**
  `block_kind`, más una aserción de que el conjunto de fixtures es **exactamente**
  `blockKind.options` (si mañana crece el enum y nadie escribe el fixture, el
  test falla en vez de dejar un hueco en blanco en una lección); saneado con
  HTML malicioso en prosa, pasos, celdas y SVG; casos de descarte.
- `practice-machine.test.ts` (19): racha arriba, racha rota conservando la mejor,
  `practice_streak` solo al subir, blanco que no cuenta, doble submit, pista
  contada y propagada a `answer_submitted`, solución registrada distinguiendo
  antes/después de responder, semilla del cliente en todos los payloads,
  `changeCount`, `question_skipped`, reloj hacia atrás, restauración saneada.

### Limitación conocida: no hay tests de Testing Library

`@testing-library/react` y `jsdom` **no están instalados en `apps/web`** (sí en
`packages/ui`), y el alcance prohíbe `pnpm add`. La respuesta no fue renunciar a
probar el bucle, sino **sacarlo del componente**: `practice-machine.ts` es una
máquina pura `(estado, acción) -> { estado, eventos }`, y el componente se limita
a generar, despachar y encolar. Eso es exactamente lo que Y6A no permitía probar,
porque su `var P={topic,cur,ask,right,streak,best,answered}` vivía dentro de un
`<script>` de 1.400 líneas.

Lo que queda sin cubrir por unidad y hay que cubrir con Playwright al integrar:
el foco tras responder, el atajo de Enter, y el `IntersectionObserver` del dwell.

---

## 7. Deuda anotada (no bloqueante)

1. **Bucket de Storage.** `queries.ts` asume `lesson-media`. No hay migración de
   Storage todavía y el curso Math Y6 sembrado no tiene bloques de imagen ni de
   vídeo, así que hoy no se ejerce. Al crear el bucket, verificar el nombre.
2. **`interactive` solo soporta figuras SVG.** El validador de la DB acepta
   `{ component, props }` genérico. Hoy se renderiza `props.svg` + `props.alt`;
   cualquier otro `component` se omite. Cuando lleguen los "labs" de Y6A habrá
   que registrar los componentes por nombre.
3. **`skillCode` del motor ≠ `skills.code` sembrado** en cuatro casos
   (`math.fractions.operations` vs `math.fractions.arithmetic`, `mixed_numbers`
   vs `mixed`, `metric_conversion` vs `metric`, `word_problems` vs `word`).
   `findPracticeTopic()` acepta las dos formas, así que "Practicar esto" funciona
   igual, pero conviene unificarlo al cablear mastery en M11.
4. **Los diccionarios `learn.*` no están cableados** a `lib/i18n/index.ts`: son
   ficheros compartidos por las cuatro vías. `getLearnDictionary()` los resuelve
   por ahora; subirlos al diccionario principal es mover veinte líneas.
5. **`UiLocaleProvider` se monta por subárbol** y no en `(student)/layout.tsx`
   por la misma razón. Sin él, todo `@cet/ui` cae a inglés.
