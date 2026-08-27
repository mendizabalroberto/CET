# Revisión crítica — `exam-runner`

> Pasada 2 del protocolo de 3 pasadas (`MASTER_PLAN.md` §7), aplicada al motor de
> examen del lado del alumno.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

Revisión adversarial contra el propio código, hecha después de implementarlo y
antes de darlo por bueno. Cada hallazgo lleva su corrección y dónde está.

---

## Las cuatro preguntas del alcance

### ¿Llega alguna respuesta correcta al DOM o al bundle?

**No, y hay tres barreras encadenadas.**

1. `types.ts` no declara `answerKey` ni `itemSeed`. `normalize.ts` construye el
   ítem campo a campo con una allowlist, así que un `answer_key` que el servidor
   mandara por error **se cae al normalizar**: nunca entra en el estado de React
   y por tanto nunca se serializa en el HTML.
2. `feedback.ts` es la única puerta de la revisión. `reviewItemsFor()` devuelve
   `[]` con `feedbackMode: "never"` **en todos los estados del intento**, y
   también mientras está `grading`.
3. `no-answer-key.test.ts` lee el código fuente del directorio y falla si algún
   fichero que no sea la pantalla de revisión nombra `answerKey`, `item_seed`,
   `correctIds` o `correctAnswer`. Una revisión de código puede dejar pasar ese
   cambio; el test no.

Verificado además contra el servidor: `ItemReviewPayload` expone `correctAnswer`
como texto canónico y nunca la `answer_key` cruda, y `attempt_items_student` no
tiene la columna.

### ¿El cronómetro decide algo que debería decidir el servidor?

**No.** `ExamTimer` recibe `serverDeadlineAt` y `serverNow` — dos instantes del
servidor — y descuenta con `performance.now()`, un reloj monótono. Al llegar a
cero **llama a `/submit`**; no calcula nota, no marca respuestas, no cierra nada.
`clock.test.ts` fija que el tiempo restante es idéntico con el reloj del cliente
adelantado 30 minutos y atrasado dos horas.

Quien decide de verdad es Postgres: `/answer` rechaza con `deadline_passed` y el
propio servidor entrega con `submitted_by = 'timer'`. El `reason` que manda el
cliente en `/submit` **el servidor lo descarta** — comprobado leyendo
`submit/route.ts`, que calcula `submittedBy` con su propio reloj. Correcto: si lo
eligiera el cliente, cualquiera podría culpar al tiempo de una entrega en blanco.

### ¿Se pierde una respuesta si la red cae justo al entregar?

**No, y se corrigieron dos caminos donde sí se habría perdido** (H-5 y H-6).
`doSubmit` vacía la cola **antes** de llamar a `/submit`. Si el envío falla, la
respuesta sigue en `localStorage` y el cerrojo se reabre para reintentar.

### ¿Qué ve un niño si el servidor devuelve 500?

Un `ErrorState` que dice, en este orden: no hemos podido, **no es culpa tuya**,
**no has perdido nada**, vuelve a intentarlo. Sin código HTTP, sin stack trace,
sin la palabra "error" en el cuerpo. Ningún camino acaba en pantalla blanca:
`loading`, `ready`, `empty`, `blocked`, `error` y `submitted` tienen todos su
render.

---

## Hallazgos

### H-1 · `<Card>` de `@cet/ui` revienta en un Server Component — **corregido**

`packages/ui/src/primitives/Card.tsx` llama a `useI18n()` pero **no lleva la
directiva `"use client"`** (a diferencia de `EmptyState`, `ErrorState` y el resto
de componentes de examen, que sí la llevan). Usarlo desde `/exam/page.tsx`, que
es un Server Component puro, habría fallado en tiempo de ejecución — y no en
`tsc`, que es lo que lo hacía peligroso: se habría descubierto en producción.

**Corrección:** en los Server Components se reproducen sus clases sobre un
`<article>`. En los componentes cliente (`ResultView`) se sigue usando `Card`.

**Pendiente fuera de mi alcance:** añadir `"use client"` a `Card.tsx`. No puedo
tocar `packages/**`.

### H-2 · El estado HTTP no distingue nueve errores distintos — **corregido**

El primer diseño mapeaba `409` a un significado fijo por ruta. Al integrar con
`src/lib/exam/errors.ts` resultó que **nueve códigos distintos devuelven 409**:
`window_not_open`, `window_closed`, `max_attempts_reached`, `deadline_passed`,
`attempt_not_in_progress`, `attempt_not_submitted`, `insufficient_pool`,
`blueprint_invalid` y `attempt_starting`.

Consecuencias reales del bug:

- `/result` sobre un examen no entregado (`attempt_not_submitted`) enseñaba
  *"No hemos podido cargar tu nota"* a un niño que sencillamente aún no había
  terminado.
- `/start` sobre un blueprint sin preguntas suficientes decía *"ya entregado"* y
  mandaba a una pantalla de resultado inexistente.

**Corrección:** `api.ts` lee el campo `error` del cuerpo — identificador estable
por contrato — y lo traduce con `ERROR_CODE_TO_KIND`. El estado HTTP solo se usa
como respaldo cuando el cuerpo no trae código. `api.test.ts` fija los ocho
mapeos.

### H-3 · `RenderedBody` no sabe representar `fraction`, `ordering` ni `matching` — **mitigado, contrato pendiente**

`StudentItemPayload` **no incluye `format`**, y `RenderedBody` de `@cet/shared`
solo modela `stem` + `options`. De ahí no se puede deducir si una pregunta es una
fracción, una ordenación o un emparejamiento, ni cuáles son las dos columnas de
este último.

**Mitigación:** `inferFormat()` deduce lo deducible (elección, verdadero/falso,
numérica con unidad) y **todo lo demás cae a un campo de texto libre**, que
acepta cualquier respuesta. `AnswerInput` nunca deja a un alumno sin forma de
responder — un input incómodo se corrige, un cero injusto no. `matchLeft` /
`matchRight` se leen si el servidor los manda.

**Lo que hace falta y no es mío:** que `StudentItemPayload` incluya `format`
(no es secreto: saber que algo es una fracción no ayuda a acertarla) y que
`RenderedBody` gane las columnas de `matching`. Hasta entonces, `FractionInput`,
`OrderingList` y `MatchingGrid` solo se usan en los casos en que la información
llega.

### H-4 · `/exam` no está en `PROTECTED_AREAS` — **reportado, no corregido**

`src/lib/routes.ts` protege `/exams` (plural). Mis rutas cuelgan de `/exam`
(singular, el que pide el alcance), así que **no casan con ningún área**: quedan
protegidas por el fallo seguro (toda ruta no pública exige sesión) pero **sin
filtro de rol**, de modo que un profesor podría abrir `/exam`.

No es una fuga de datos — `requireStudent()` en cada página corta igual, y RLS
detrás — pero es una capa menos de las tres que el fichero promete.

**No lo corrijo yo:** `routes.ts` es compartido y hay tres vías tocando
`apps/web` en paralelo. La corrección es una línea:

```ts
{ prefix: "/exam", allow: ["student"], onDeny: "home" },
```

### H-5 · La cola de autoguardado moría con respuestas dentro al desmontar — **corregido**

La limpieza del efecto llamaba a `stop()`, que congela la cola. Un alumno que
pulsara *"volver a mis exámenes"* con una respuesta recién escrita la dejaba en
disco hasta que volviera a entrar — y si no volvía, se perdía.

**Corrección:** `AutosaveQueue.dispose()` lanza un `flush()` **antes** de soltar
los temporizadores y sin marcar `stopped` (marcarlo habría hecho que ese mismo
flush saliera por la primera comprobación sin enviar nada). `stop()` se reserva
para cuando el servidor dice que el intento terminó, donde insistir sería ruido.

### H-6 · Un `fetch` normal no sobrevive al cierre de la pestaña — **corregido**

El flush disparado en `visibilitychange: hidden` o en `dispose()` usaba `fetch`
sin `keepalive`. En una tableta, "oculta" suele ser el paso previo a "descartada
por el sistema": el navegador cancelaba la petición y se perdía exactamente la
última respuesta del examen.

**Corrección:** `keepalive: true` en todos los POST. El límite de 64 KB sobra
para cualquier cuerpo de este módulo.

### H-7 · `doSubmit` capturaba el intento del primer render — **corregido**

`onDeadlinePassed` de la cola se crea dentro del efecto de arranque, que corre
**una sola vez**. Capturaba el `doSubmit` de ese render, cuyo `attempt` todavía
era `null`, así que un `deadline_passed` del servidor **no habría entregado
nada**: el alumno se quedaba con el examen abierto y sin poder guardar.

**Corrección:** `attemptIdRef`, `doSubmitRef` y `noteActivityRef`. El mismo fallo
afectaba a la telemetría de `answer_changed`, `question_shown` e `idle_*`, que
emitían `attemptId: ""`.

### H-8 · `aria-labelledby` apuntaba a un id inexistente — **corregido**

`AnswerInput` recibía un `labelledBy` que yo generaba (`cet-stem-${id}`) y que
**no existe en el DOM**: `QuestionCard` genera el suyo con `useId()`. Un
`aria-labelledby` roto es peor que no ponerlo — el lector de pantalla anuncia el
grupo sin nombre.

**Corrección:** se elimina la prop. `QuestionCard` ya envuelve los controles en
`role="group" aria-labelledby={stemId}` con el id correcto.

### H-9 · Ítems sin ordenar por `ord` — **corregido**

`normalizeStartResponse` ordenaba por la posición del array. Si el servidor
cambia la consulta y deja de ordenar, el alumno vería las preguntas en un orden
distinto del que quedó grabado en `attempt_items.ord`, y **la reconstrucción
forense diría otra cosa que la pantalla** — que es el principio rector roto.
Ahora se ordena explícitamente por `ord`.

### H-10 · La nota llegaba anidada y se leía plana — **corregido**

`AttemptResultPayload` trae `score: { scoreRaw, scoreMax, scorePct, passed }` y
llama `review` a la lista de items. `normalizeResult` los leía planos y como
`items`, de modo que un alumno con un 18/20 habría visto **"0 / 0"**. Silencioso,
plausible y devastador. Corregido y fijado en `normalize.test.ts`.

### H-11 · `crypto.randomUUID` no existe en contexto no seguro — **corregido**

La red de un colegio puede servir la app por `http://`. Ahí `randomUUID` es
`undefined` y la excepción **impedía entrar al examen**. `newTabId()` cae a un
identificador aleatorio no-UUID: para desempatar dos pestañas basta con que sea
distinto.

---

## Accesibilidad y tono

- **Teclado completo.** Todo control es un `<button>`, un `<input>` o viene de
  `@cet/ui`, que ya resuelve foco visible, tamaño táctil de 44 px y orden de
  tabulación. No hay `div` con `onClick`, no hay `tabindex` positivos y no hay
  atajos que pisen los del navegador.
- **El color nunca es el único canal.** El estado de cada pregunta va escrito en
  el nombre accesible del navegador; el de cada examen, en la tarjeta.
- **Urgencia sin pánico.** El aviso de 5 y de 1 minuto usa tono `info`, no
  `warning`: que quede tiempo justo es información, no peligro. Nada parpadea
  (WCAG 2.3.1) y el sonido está **apagado por defecto**, es un seno suave de
  180 ms generado con WebAudio y se recuerda por dispositivo.
- **Sin conexión no es un error.** `AutosaveIndicator` lo pinta en ámbar y el
  mensaje dice que el trabajo está a salvo y que siga respondiendo. Un niño que
  lee "Error al guardar" a mitad de un examen deja de hacer el examen.
- **Ningún mensaje culpa al alumno ni enseña nada técnico.** Ni un código HTTP,
  ni un nombre de tabla, ni la palabra "excepción".

---

## Los casos límite, uno por uno

| Caso | Qué pasa |
|---|---|
| Recarga a mitad | `/run` vuelve a llamar a `/start`, que es idempotente y devuelve el mismo intento con los mismos ítems. Se hidrata desde `savedResponse` y se fusiona la cola local. Se retoma **en la primera pregunta sin responder**, no en la 1. |
| Red caída 2 min y vuelve | Las respuestas se acumulan en la cola persistida, con backoff y jitter. Al volver, se vacía sola. `autosave.test.ts` lo ejerce con 120 s de reloj falso. |
| Dos pestañas | `/start` devuelve el mismo intento (no hay dos exámenes). `BroadcastChannel` elige líder; la otra pasa a solo lectura con un botón para tomar el mando. Si el líder deja de latir 9 s, la seguidora se lo queda: nadie se queda atrapado. |
| Deadline pasa respondiendo | `/answer` devuelve `deadline_passed`; la cola se detiene y dispara `/submit`. El servidor además ya ha entregado por su cuenta con `submitted_by = 'timer'`. |
| `/submit` dice que ya estaba entregado | `already_submitted` **no es un error**: se cierra el cerrojo, se limpia la cola y se navega al resultado. |
| 0 items | `phase: "empty"` con un mensaje que dice que fue un fallo al preparar el examen, que no es culpa suya, que **no cuenta en su contra** y que avise a su profesor. |
| Doble clic en entregar | `SubmitGuard` devuelve la misma promesa al segundo clic. Tres capas: cerrojo síncrono, botón deshabilitado, `FOR UPDATE` en el servidor. Solo la tercera garantiza; las otras dos evitan el ruido. |

---

## Decisiones que merecen ser discutidas

**`localStorage` en vez de IndexedDB.** El contrato del módulo sugería IDB. La
cola son unas decenas de objetos JSON diminutos y `localStorage` es **síncrono**:
en `pagehide`, cuando iOS descarta la pestaña de una tableta compartida, una
escritura asíncrona a IDB se queda a medias. Se cambia capacidad por durabilidad
en el único instante en que importa.

**Sin tests de renderizado.** `@testing-library/react` está en el monorepo pero
**no en las dependencias de `apps/web`**, y tengo prohibido `pnpm add`. En vez de
no probar, se extrajo toda la lógica que importa a módulos puros —
`clock`, `autosave`, `recovery`, `responses`, `feedback`, `submit-guard`,
`normalize`, `api` — que se prueban con relojes y `fetch` falsos: **82 tests**.
Es mejor arquitectura de todos modos; lo que falta cubrir es el cableado JSX, que
corresponde a los e2e de Playwright ya listados en el contrato del módulo.

**El cronómetro se resincroniza en cada autoguardado.** `/answer` devuelve
`serverNow` y `serverDeadlineAt`. Usarlos es gratis y corrige cualquier deriva a
lo largo de 25 minutos, siempre con datos del servidor.
