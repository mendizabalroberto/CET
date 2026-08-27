# REVIEW — Motor de examen autoritativo (`src/lib/exam/**` + `/api/attempts/**`)

> Pasada 2 del protocolo de calidad del `MASTER_PLAN` §7, aplicada a M09
> (`exam-engine`) y a la mitad servidor de M10 (`grading`).
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

La revisión se hizo contra la lista de preguntas del encargo, una por una, y
contra el código de la vía que consume esta API en paralelo
(`src/components/exam-runner/**`). Los hallazgos están corregidos salvo donde se
dice explícitamente lo contrario.

---

## Las preguntas del encargo, respondidas

### ¿Se puede empezar dos veces el mismo examen en dos pestañas?

**No.** Hay dos barreras y la segunda es la que cuenta.

1. `findInProgressAttempt` antes de crear nada. Es el camino rápido y cubre el
   99 % de los casos (recarga, doble clic, red caída).
2. Entre esa consulta y el `INSERT` hay una ventana que **ninguna comprobación
   previa puede cerrar**. La cierra la constraint
   `unique (assignment_id, student_id, attempt_number)`: la pestaña que pierde
   recibe `23505`, se traduce a `UniqueViolation`, y `start.ts` relee y devuelve
   el intento de la ganadora como reanudación.

Cubierto por `start.test.ts`: *"REANUDA: dos llamadas seguidas devuelven el MISMO
intento y no crean otro"*.

Un matiz que estuvo a punto de ser un fallo: la comprobación de `max_attempts`
va **después** de la de reanudación. Al revés, un alumno con `max_attempts = 1`
al que se le cayera la red se quedaría fuera de su propio examen a medias, con
las respuestas ya escritas y sin poder volver. Hay un test específico.

### ¿Se puede responder después del deadline?

**No.** `assertBeforeDeadline` compara `server_deadline_at` contra `serverNow()`,
y **no recibe `clientTs` como argumento** — decisión deliberada: un parámetro que
existe acaba usándose "solo para desempatar".

`clientTs` se persiste (es dato forense: un reloj adelantado también es
información) pero no participa en ninguna decisión. Test:
*"EL DEADLINE DEL SERVIDOR GANA: un clientTs 'a tiempo' no salva una respuesta
tardía"*, con el reloj del cliente adelantado y el del servidor media hora por
delante del vencimiento.

Hay un margen de gracia de **2 s** (`AUTOSAVE_GRACE_MS`) que absorbe la latencia
de la wifi de un colegio. No es generosidad: rechazar una respuesta pulsada a
falta de 300 ms porque tardó 1,2 s en llegar castiga al niño por la red del
centro. Diez segundos ya no son latencia y se rechazan; hay test de los dos
lados. **La entrega no tiene gracia**: el examen se cierra cuando se cierra.

### ¿Se filtra `answer_key` o `item_seed` en alguna respuesta HTTP?

**No**, y por tres caminos independientes:

1. `listStudentItems` consulta la **vista** `attempt_items_student`, que no tiene
   esas columnas. No es que no se seleccionen: no existen ahí. Se eligió la
   vista y no un `select` de columnas seguras sobre `attempt_items` porque un
   `select` es una línea que se edita sin querer.
2. `StudentItemRow` y `GradingItemRow` son **tipos distintos** en `types.ts`, no
   uno con campos opcionales. Con campos opcionales, un `select` de más se
   serializaría sin que el compilador dijera nada.
3. La revisión nunca serializa la clave: `canonicalAnswerText` devuelve una
   **cadena**. Serializar la clave entera regalaría `tolerance`,
   `requireSimplest` o la lista completa de sinónimos aceptados.

Tests: *"NO devuelve answer_key ni item_seed al cliente"* (compara el JSON
serializado, no las propiedades) y *"`never`: ni revisión ni respuesta
canónica"*.

`item_seed` merece su propia frase: `@cet/engine` es **código de cliente** y es
determinista dado `(engine_key, params, seed)`. Publicar la semilla ocultando la
clave sería teatro de seguridad — el alumno regeneraría el item entero con su
respuesta correcta.

### ¿Confía algún handler en algo del cuerpo que debería venir de la sesión?

**No.** `schemas.ts` no declara `studentId`, `schoolId`, `attemptNumber`, `seed`,
`serverDeadlineAt` ni `submittedBy`; `z.object` no estricto **descarta** lo que
no declara, así que enviarlos no tiene efecto. Es el mismo patrón que
`/api/events` con `clientEvent`.

La identidad sale de `getSessionState()`, que lee `profiles` **con RLS activa** y
no de un claim del JWT: un alumno suspendido hace un minuto seguiría teniendo su
rol en el token hasta el siguiente refresco.

### ¿Puede quedar un intento sin items?

**No.** Tres medidas, en este orden:

1. **Se materializa antes de escribir nada.** `materializeExam` es pura y puede
   lanzar (`InsufficientPoolError`, generador desconocido, `param_spec`
   inválido). Si se hiciera después del `INSERT`, cada banco mal configurado
   dejaría un intento huérfano **consumiendo una oportunidad del alumno**. Test:
   *"POOL INSUFICIENTE: falla explícito y NO deja un intento a medias"* verifica
   que no se llegó ni a llamar a `insertAttempt`.
2. Si el `INSERT` de los items falla igualmente, el intento se **borra**; si el
   borrado falla, se marca `voided` (que al menos lo saca del recuento de
   intentos). Test con fallo inyectado.
3. `buildPayload` lanza `attempt_starting` (409, reintentable) si encuentra un
   intento sin items — la carrera de dos pestañas donde la otra insertó el
   intento y todavía no los items.

### ¿Alguna promesa sin `await`?

Revisado uno a uno. Ninguna. Los tres candidatos naturales están cubiertos:

- `deps.events.emit(...)` — se espera, y su implementación traga sus propios
  errores. Un fallo de telemetría **no puede** tumbar un autoguardado.
- `repo.touchHeartbeat(...)` — se espera dentro de un `try` que solo registra:
  la respuesta ya está guardada cuando se llama.
- La entrega automática desde `/answer` — se espera antes de responder el 409.

---

## Hallazgos con su corrección

### H-1 · La forma del resultado no casaba con la del cliente · **CORREGIDO**

`components/exam-runner/normalize.ts` (otra vía, en paralelo) lee la nota de la
**raíz** (`scoreRaw`, `scoreMax`, `scorePct`, `passed`) y la revisión de
`items`. Esta capa devolvía `score: { … }` anidado y `review: [...]`.

Ninguna de las dos partes está "mal": es un desajuste de contrato entre vías, y
se habría manifestado como **el alumno entrega y ve 0/0 sin revisión** — la peor
forma posible de descubrirlo. Corregido en esta vía, que es la que puede cambiar
sin romper nada más: `AttemptResultPayload` extiende `ScorePayload` (planos en la
raíz) y el array se llama `items`.

Detalle deliberado: `items` es **`null`** cuando no procede enseñar la revisión,
no `[]`. `[]` significaría "un examen de cero preguntas" y el cliente pintaría
una revisión vacía; `null` significa "aquí no hay revisión".

### H-2 · Los items no llevaban `format` · **CORREGIDO**

`attempt_items` no tiene columna `format` (DATA_MODEL §6 no lo contempla) y la
vista tampoco, así que el cliente lo **adivinaba** con `inferFormat()` mirando el
enunciado. Ese apaño no puede distinguir `fraction`, `ordering` ni `matching`:
las tres caían a un campo de texto libre. Un alumno al que se le pide ordenar
cuatro cosas en una caja de texto no puede responder bien aunque sepa hacerlo.

Corregido con `formatsForVersions()`: una consulta a `question_versions` por los
ids de versión del intento. **Queda un hueco conocido** — ver L-1.

### H-3 · Un intento podía quedarse en `submitted` para siempre · **CORREGIDO**

El caso: la petición que gana la carrera muere entre `insertGradings` y
`finishGrading`. Las notas están escritas; los totales no.

El código anterior, al reintentar, chocaba con
`attempt_gradings_current_uniq`, salía por el atajo "otro ya corrigió, devuelvo
lo que hay"… y devolvía un intento sin nota. **Cada** reintento hacía lo mismo:
el alumno entregaba y no recibía nota jamás, sin ningún error visible.

Corregido con `finishFromExistingGradings`, que recalcula los totales desde
`attempt_gradings` —la fuente autoritativa de la nota de cada item (M10 §3)— sin
volver a corregir. Volver a corregir podría dar un resultado distinto del que ya
está persistido. Test: *"HALLAZGO P2: recupera un intento con notas escritas
pero SIN totales"*.

### H-4 · La ruta de entrega leía un intento ajeno antes de saber si era suyo · **CORREGIDO**

`/submit` llamaba a `findAttempt` **con service_role** solo para mirar el
deadline y decidir `submitted_by`, es decir, cargaba en memoria la fila de un
alumno cualquiera antes de comprobar la propiedad. No filtraba nada (el valor
nunca se devolvía), pero es exactamente el patrón que un día filtra.

Corregido moviendo la decisión a `submitAttempt`, **después** de
`assertAttemptBelongsToStudent`. Beneficio de paso: la regla pasa a estar en la
capa que tiene tests.

### H-5 · Interpolación sin validar en un filtro de PostgREST · **CORREGIDO**

`listPool` compone `.or("school_id.is.null,school_id.eq.<id>")`. Eso es una
**cadena de filtro**, no un parámetro ligado: una coma o un paréntesis en el
valor cambiarían la consulta. Hoy `schoolId` viene de `profiles.school_id`
(columna uuid) y es seguro, pero se añade una comprobación de forma uuid antes
de interpolar. El día que alguien llame a esto con otra cosa, el fallo será "no
se ve" y no "se ve el banco de otro colegio".

### H-6 · `question_shown` emitido al arrancar · **CORREGIDO**

La primera versión emitía un `question_shown` por item en el arranque. Está mal:
"mostrada" es un hecho del **navegador** y el alumno puede no llegar nunca a la
pregunta 20. Habría inflado el tiempo de exposición de cada pregunta y
contaminado el mastery con veinte vistas que no ocurrieron. Ese evento lo manda
el cliente por `/api/events`; aquí solo se emiten hechos que el servidor **sabe**.

---

## Decisiones que se apartan del encargo (y por qué)

### D-1 · El deadline se RECORTA al cierre de la ventana

El encargo dice `server_deadline_at = now() + duración`. Se implementa
`min(now + duración, closes_at)`.

Sin recorte, un alumno que arranca a las 09:59 un examen de 60 minutos lo tiene
abierto hasta las 10:59 — una hora después de que la ventana cerrara. La ventana
dejaría de significar nada, y con ella la garantía de que todos hacen el examen
en el mismo intervalo.

Consecuencia: arrancar muy tarde daría un examen de segundos. Por eso
`MIN_START_WINDOW_MS = 60_000`: a falta de menos de un minuto se responde
`window_closed`, que es más honesto que un examen de tres segundos y una nota
de 0. **Ambas cosas son política y admiten discusión**; están en constantes con
nombre y con test, no enterradas.

### D-2 · `serverNow()` es el reloj de Node, no `now()` de Postgres

DATA_MODEL §0 dice "el servidor nunca confía en el reloj del cliente" y el
contrato del módulo cita `now()` de Postgres. Hoy no existe ninguna RPC
`app.server_now()` en las migraciones y este módulo **no puede añadirla**
(`supabase/**` es de otra vía).

Se usa el reloj del proceso de Node, aislado en **una sola función**
(`guards.ts`, `serverNow()`) precisamente para que la sustitución sea de una
línea. Lo que importa para la seguridad se mantiene intacto: ninguno de los dos
relojes es el portátil del alumno, y `server_deadline_at` se calculó y persistió
en el servidor.

Desfase esperado entre Vercel y Supabase: milisegundos (ambos por NTP), muy por
debajo del margen de gracia de 2 s. Los `server_ts` de `attempt_responses` y los
`created_at` siguen siendo de Postgres, que es donde de verdad importa para la
reconstrucción forense.

**Petición a la vía A:** una función `app.server_now()` (`stable`,
`security definer`, `set search_path = ''`, `execute` para `authenticated` y
`service_role`) cerraría este punto del todo.

---

## Huecos conocidos, para quien venga detrás

### L-1 · `attempt_items` no guarda el `format` del item materializado

`materializeExam` devuelve `item.format`, y para una pregunta **generada** ese
formato lo decide el generador y **puede diferir** del `question_versions.format`
declarado en el banco (el propio `blueprint.ts` lo comenta: *"el formato real lo
manda el generador"*). Como la tabla no tiene columna donde guardarlo, ese dato
se pierde al persistir y H-2 lo recupera desde la versión, que es lo mejor
disponible pero no siempre lo exacto.

Consecuencia práctica hoy: baja (el banco Y6 es casi todo estático). La solución
correcta es una columna `attempt_items.format` — territorio de la vía A.

### L-2 · El barrido de intentos abandonados no existe todavía

`/answer` cierra el intento vencido en cuanto llega la primera petición tardía,
que cubre el caso habitual sin esperar al cron. Pero el alumno que **cierra el
portátil y no vuelve** deja un intento `in_progress` para siempre. El contrato
del módulo pide un job de barrido (`submitted_by = 'timer'`); el índice parcial
`exam_attempts_open_deadline_idx` ya está puesto para servirlo. No es de esta
vía (es un cron / Edge Function).

### L-3 · El rate limiting es en memoria

`rateLimit` vive en la memoria de una instancia serverless y su propia cabecera
lo advierte. Para este módulo es un amortiguador suficiente —el ataque real
contra un examen es el doble submit, y ese lo para la base de datos, no el
contador— pero no cuenta como defensa.

### L-4 · `submitBody` está declarado y no se usa

Es deliberado y se deja como documentación ejecutable de que **el cuerpo de
`/submit` se ignora a propósito**: si `submitted_by` lo eligiera el cliente,
cualquier alumno podría marcar su entrega en blanco como `timer` y culpar al
sistema.

### L-5 · La telemetría del servidor usa `seq` derivado, no un contador

`learning_events` ordena por `(session_id, seq)` para no depender de relojes,
así que el servidor no puede llevar un contador en memoria (se reinicia con cada
instancia). Se usa `ord × 100.000 + revisión × 2 + offset`, con
`session_id = attempt_id`. Es correcto y no colisiona con los eventos del
cliente (cuyo `sessionId` es un uuid distinto), pero es una convención: está
documentada en la cabecera de `events.ts`.

---

## Casos límite del encargo — dónde está cada uno

| Caso | Dónde | Test |
|---|---|---|
| Examen expirado a mitad de respuesta | `autosave.ts` → 409 + entrega automática | `autosave.test.ts` |
| Doble submit simultáneo | `claimSubmission` (UPDATE condicional) | `submit.test.ts` |
| Dos pestañas autoguardando | reintento sobre `UniqueViolation` | `autosave.test.ts` |
| Red caída y reanudación | `findInProgressAttempt` + `savedResponse` | `start.test.ts` |
| Pool con menos preguntas que `item_count` | `InsufficientPoolError` → 409, sin escribir | `start.test.ts` |
| Blueprint con 0 secciones | `buildSnapshot` → `blueprint_invalid` | `unit.test.ts` |
| Reloj del cliente adelantado una hora | `assertBeforeDeadline` sin `clientTs` | `autosave.test.ts` |
| Intento de otro alumno | `assertAttemptBelongsToStudent` → 404 | los tres |
| Intento de otro colegio | idem, comprueba `school_id` aparte | los tres |
| Asignación fuera de ventana | `assertWithinWindow`, `[opens, closes)` | `start.test.ts`, `unit.test.ts` |
| `attemptId` que no existe | 404, indistinguible de "no es tuyo" | los tres |
