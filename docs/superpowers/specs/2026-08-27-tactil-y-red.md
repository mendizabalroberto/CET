# Táctil y red — inventario medido y plan

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Agente C · 27 de agosto de 2026 · **Documento de medición y plan. No se ha
> tocado ni una línea de código de producto ni de CSS.**

---

## 0 · Qué es esto y qué no es

El encargo del usuario, literal:

> «agregar para que sea 100% touch para celular y alto bandwidth»
> «debe ser muy interactivo nivel niños genios de hoy acostumbrados a PCs»

Esto es lo primero: **medir**. No hay ninguna propuesta estética aquí, y no la
habrá hasta que estén los números. Lo que sigue son medidas tomadas en un
navegador, con la fecha y el método de cada una, y una lista explícita de lo que
**no se ha podido medir** y por qué.

**Por qué no se ejecuta todavía:** el trabajo es transversal —toca todas las
pantallas— y hoy hay otros dos agentes escribiendo en `packages/ui/` y en
`apps/web/src/components/learn/`. Cambiar CSS ahora es chocar con los dos.
Primero se mide, luego se ejecuta en solitario y en el orden de la sección 6.

---

## 1 · Cómo se ha medido (y qué vale cada número)

**Sin credenciales. No se ha entrado en ninguna cuenta.** Las pantallas de
alumno están tras `requireStudent()`, así que se montó un **banco de pruebas
temporal** y se borró al terminar:

| Qué se montó | Dónde vivía | Qué contenía |
|---|---|---|
| Página de práctica | `apps/web/src/app/not-found/harness-tactil/page.tsx` | El marco del layout de alumno **copiado clase por clase** de `(student)/layout.tsx` + `StudentNav` real + `PracticeSession` real + `LocaleSwitcher` real |
| Pantalla de examen | `.../harness-tactil/examen/page.tsx` | `ExamRunner` **real**, con `/api/attempts/*` servido por interceptación de Playwright |
| Medición de la cola colgada | `apps/web/src/components/exam-runner/zz-harness-hang.test.ts` | Vitest con relojes falsos sobre `AutosaveQueue` real |

**Los tres ficheros están borrados.** `git status` no los muestra. El apéndice A
trae el código íntegro para reproducirlos en diez minutos.

Detalle que costó media hora y conviene no repetir: en el App Router **una
carpeta que empieza por `_` es privada y no se enruta**, y `middleware.ts`
deniega por lista blanca todo lo que no esté en `PUBLIC_PREFIXES`. Por eso el
banco de pruebas cuelga de `/not-found/...`, que sí es público.

### Lo que cada número vale

- **Objetivos de toque y desbordes:** Chromium de escritorio con el viewport
  reducido a 360×640 y 768×1024, `getBoundingClientRect()` sobre los elementos
  interactivos reales. Son medidas de CSS px de verdad, no lecturas de clases
  de Tailwind. **No son un dispositivo real**: no hay eventos táctiles, ni
  teclado virtual, ni densidad de píxel de tableta. Ver los huecos, sección 5.
- **Cabecera del alumno:** se midió sobre una **réplica** con las mismas clases
  y los mismos hijos que `(student)/layout.tsx`, porque el layout real exige
  sesión. La geometría de un `<button className="…px-3 py-1.5 text-sm…">` es
  determinista con el mismo CSS, así que la medida es buena; que la réplica sea
  fiel al original se comprueba mirando las dos líneas, y están citadas.
- **Peso:** de la salida de `next build` (tabla de rutas, sin comprimir) y de la
  capa de red del navegador contra **producción** (`cet-sable.vercel.app`), con
  la caché desactivada por CDP, en las páginas públicas.
- **Momento de la medida:** todo el 27/08/2026 entre las 13:00 y las 13:35 hora
  local, contra el **árbol de trabajo tal y como estaba**, con los cambios sin
  commitear de los otros dos agentes dentro. Si `PracticeSession.tsx` o
  `tokens.css` cambian hoy, hay que volver a medir lo de la sección 2.1.

---

## 2 · Inventario medido

### 2.1 · Objetivos de toque por debajo de 44×44

Criterio: WCAG 2.5.5 (AAA) pide 44×44 CSS px; Apple recomienda 44×44 pt y
Google 48×48 dp. Medido a 360×640.

**Lo bueno primero, porque es mucho:** el design system ya lleva el objetivo
puesto. `--cet-touch-min: 44px` existe (`packages/ui/src/tokens.css:105`), el
`Button` lo aplica en sus tres tamaños, y `ChoiceList`, `QuestionNavigator`,
`OrderingList`, `MatchingGrid`, `NumericInput` y `FractionInput` lo respetan.
**Todo lo que hay dentro de la pantalla de examen pasa.** Lo que no pasa está
fuera del design system: son controles escritos a mano en los layouts y en la
landing.

| Control | Medida real | Dónde aparece | Fichero |
|---|---|---|---|
| «Español» (selector de idioma) | **62 × 24** | Cabecera de alumno, de staff, de auth y pie de la landing — o sea, en todas | `apps/web/src/components/PreferenceSwitchers.tsx:14` |
| «English» | **59 × 24** | idem | idem |
| «Claro» / «Oscuro» / «Sistema» (tema) | **48 × 24 / 58 × 24 / 62 × 24** | Pie de la landing | idem |
| «Salir» | **53 × 34** | Cabecera de alumno **y de examen en curso** | `apps/web/src/app/(student)/layout.tsx:60` |
| Nombre del alumno → `/account` | 66 × **68** (alto solo porque el texto se parte en tres líneas a 360 px) | Cabecera de alumno | `(student)/layout.tsx:52` |
| Sonido de aviso («Avisos de tiempo: sin sonido») | 131 × **46** ✔ | Examen en curso | `ExamRunner.tsx:625` |
| Enlaces de la nav de la landing («Plataforma», «Materias», «Cómo funciona», «Para colegios») | **≈ 85–110 × 33** | Landing | `components/marketing/SiteChrome.tsx:65` |
| CTA «Entrar» de la cabecera | **70 × 36** | Landing | `SiteChrome.tsx:78` |
| Enlaces del pie («Privacidad», «Términos», «Entrar», «Solicitar acceso») | **37–94 × 19** | Landing | `SiteChrome.tsx` (pie) |
| «← Atrás» | **49 × 19** | `/login/student`, `/login/staff`, `/register` | layout de `(auth)` / formularios |
| «Privacidad» / «Términos» del pie de auth | **54 × 16 / 48 × 16** | Todas las de `(auth)` | `(auth)/layout.tsx` |
| Casilla de consentimiento | **20 × 20** | `/register` | `components/auth/RegisterForm.tsx:121` |

Recuento en la landing: **15 de 19 controles interactivos quedan por debajo de
44 px de alto.** Es la pantalla peor parada de todas, y es la primera que ve
cualquiera.

**Lo que sí pasa, medido:**

| Control | Medida | Pantalla |
|---|---|---|
| Pestañas de la barra inferior | 115 × **64** | Todas menos examen en curso |
| Chips de tema de práctica | 99–193 × **44** | `/practice/[skillCode]` |
| «Comprobar» / «Saltar» | 122 × 44 / 82 × 44 | Práctica |
| Campo de respuesta (`NumericInput`) | 200 × **52** | Práctica y examen |
| «Ver una pista» / «Ver cómo se hace» | 130 × 44 / 163 × 44 | Práctica |
| Botones del navegador de preguntas | **44 × 44** exactos | Examen |
| Opción de respuesta (`ChoiceList`) | 271 × 54; 271 × 130 la de texto largo | Examen |
| «Marcar para revisarla luego» | 187 × 53 | Examen |
| «Pregunta anterior» / «Siguiente» / «Entregar» | 166/177/183 × 44 | Examen |
| Casillas del PIN | **56 × 64** (`h-16 w-14`) | `/login/student` |
| Botones del login de alumno | ancho completo × ≈62 (`py-4 text-lg`) | `/login/student` |

Es decir: **el bucle de aprender y el de examinarse están bien dimensionados; lo
que está mal dimensionado es el marco que los rodea.**

### 2.2 · Qué se rompe de verdad en móvil (360 × 640)

**a) La cabecera del alumno desborda la pantalla.** Medido:
`documentElement.scrollWidth = 392` contra `clientWidth = 345`. El culpable es
uno y está identificado: el `<form>` de «Salir» ocupa de **x = 338 a x = 392**,
o sea **47 px fuera del viewport**. Toda la página gana scroll horizontal.

El origen es una sola línea, `(student)/layout.tsx:47`:

```
<div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
```

`flex` sin `flex-wrap` y con cuatro hijos (marca, nombre, selector de idioma,
botón de salir) más `gap-4`. A 360 px no caben. La marca se parte en tres
líneas, el nombre del alumno también, y el botón se sale.

Captura: `tocheck/tactil/tactil-01-practica-360.png`.

Esto afecta **también a `/exam/<id>/run`**, que hereda el mismo layout: la barra
de pestañas se retira en modo examen, pero la cabecera no.

**b) La barra de pestañas NO tapa contenido.** Medido y hay que decirlo porque
era la sospecha: con la página al final del scroll, la barra ocupa de y=575 a
y=640 y **no hay ni un control interactivo debajo**. El colchón `pb-24` del
`main` y del `footer` (`(student)/layout.tsx:70` y `:76`) hace su trabajo.

**c) La landing no desborda.** `scrollWidth == clientWidth == 345`. La sub-nav
que sí se sale (392 px) vive dentro de un `overflow-x-auto` deliberado
(`SiteChrome.tsx:89`): es una tira que se desliza, no una rotura.

**d) Nada se solapa** en ninguna de las pantallas medidas.

### 2.3 · Qué se rompe en tableta (768 × 1024)

**El raíl lateral tapa la marca.** A partir de `md` (768 px exactos) la barra
pasa a raíl (`fixed inset-y-0 left-0 w-56`, `StudentNav.tsx:118-124`) con
`z-40`, y ocupa de y=0 a y=1024. La cabecera va de x=0 a x=753 y **no lleva
`md:pl-56`**, al contrario que el `main` y el `footer`, que sí lo llevan.

Medido con `elementFromPoint` sobre el centro del texto «Cambridge Exam
Trainer» (rect 16,16 → 192,42): devuelve el **`<nav>`**, no el texto. La marca
está literalmente detrás del raíl.

Captura: `tocheck/tactil/tactil-02-practica-768.png` — se ve la cabecera
empezando a mitad de pantalla y el hueco blanco a la izquierda.

No hay solape de controles: el nombre, el idioma y «Salir» están a la derecha y
se salvan.

### 2.4 · Gestos, teclado y ratón

Inventario por lectura de código, comprobado con `grep` sobre `apps/web/src` y
`packages/ui/src`:

| Interacción | Estado |
|---|---|
| **Contenido que solo aparece al pasar el ratón** | **No existe.** El único `group-hover` del repo es una barra decorativa de 1 px en la landing (`(marketing)/page.tsx:180`). Ningún tooltip, ningún `title=`, ningún menú por hover. |
| **Arrastrar y soltar** | **No existe, y es deliberado.** `OrderingList` ordena con dos botones de 44×44 por fila y lo documenta en su cabecera; `MatchingGrid` empareja con un `<select>` nativo. Es exactamente lo que hay que hacer en una tableta. |
| **Enter para pasar de pregunta** (práctica) | Es un **acelerador, no el único camino**: el mismo botón dice «Comprobar» y luego «Siguiente pregunta», y está medido a 122×44. `PracticeSession.tsx:311-325`. |
| **Enter para comprobar** (`NumericInput`, `FractionInput`) | Acelerador. El botón existe. |
| **`/` en el numerador salta al denominador** (`FractionInput`) | Solo teclado. Sin equivalente táctil, pero tampoco hace falta: se puede tocar el segundo campo. |
| **Flechas / Inicio / Fin en `ChoiceList`** | Patrón ARIA de `radiogroup` completo. En táctil se toca la fila entera (271 px de ancho). |
| **Rueda del ratón sobre el campo numérico** | Neutralizada a propósito con `type="text"` + `inputMode="decimal"`. |
| **Teclado numérico del sistema** | Se levanta con `inputMode` en los campos de respuesta y en el PIN. |

**Lo que NO existe y un niño de hoy espera:** deslizar entre preguntas del
examen, pulsación larga para nada, doble toque para ampliar una figura, pellizco
para ampliar una figura SVG del enunciado (el zoom del navegador sí funciona:
`maximumScale` no se fija, `app/layout.tsx`), y ninguna respuesta háptica ni
sonora al acertar salvo el «ding» opcional del temporizador.

### 2.5 · Comportamiento con la red mala — la parte importante

Tres escenarios, medidos sobre el `ExamRunner` real.

#### A · Red caída del todo (petición rechazada) — **funciona bien**

Secuencia medida, escribiendo una respuesta y cortando la red:

| Momento | Lo que ve el alumno | Cola en `localStorage` |
|---|---|---|
| Con red | «Guardado 01:24 p.m.» | 0 entradas |
| +2,5 s sin red | «Sin conexión. Seguimos guardando en este dispositivo.» | **1 entrada** |
| +7 s | «Reintentando guardar» + aviso: «No llegamos a internet. Sigue respondiendo. Tu trabajo está a salvo en este aparato y seguimos intentando enviarlo.» | 1 entrada |
| Vuelve la red, +10 s | «Guardado 01:24 p.m.» | **0 entradas** |

Cuatro reintentos con backoff durante el corte, y el quinto envío ya con red
entró solo. **Nada se perdió.** Captura:
`tocheck/tactil/tactil-04-examen-sin-red.png`.

Esta es la mitad del módulo que el comentario de `autosave.ts` promete, y la
promesa se cumple.

#### B · Red que acepta la conexión y no contesta nunca — **se rompe en silencio**

Es el caso del túnel, del portal cautivo del hotel y del wifi del colegio que
sigue asociado pero ya no encamina. El `fetch` no falla: **se queda colgado**.

Medido en el navegador, con la petición de `/answer` sin respuesta:

- Tras **13 segundos**: el indicador dice **«Guardando»**. No «sin conexión», no
  «reintentando». Una sola petición lanzada. La cola tiene 1 entrada pendiente.
  El reloj del examen sigue bajando. Captura:
  `tocheck/tactil/tactil-05-examen-red-colgada.png`.
- Medido con relojes falsos sobre `AutosaveQueue` (apéndice A.3): tras
  **diez minutos simulados**, `envios === 1`, último estado `"saving"`,
  `hasPending === true`. **Ni un reintento. Ni un aviso.**

La causa son dos líneas concretas:

1. `apps/web/src/components/exam-runner/api.ts` — el `RequestInit` de `request()`
   **no lleva ningún `AbortSignal` con timeout**. Solo se pasa el `signal` que
   llega de fuera, y quien llama desde la cola no pasa ninguno. Un `fetch` sin
   timeout puede tardar lo que quiera.
2. `autosave.ts` — `flush()` sale por la primera línea mientras
   `inFlight !== null`, y `inFlight` solo se libera en el `finally` del `await`.
   Con la promesa colgada, **la cola entera queda bloqueada por una respuesta**.

#### C · Entregar el examen con la red colgada — **el peor fallo del producto**

Medido, y es el hallazgo número uno:

1. El alumno pulsa «Entregar mi examen» → se abre el diálogo.
2. Pulsa «Sí, entregar».
3. `doSubmit` llama a `queue.flush()` (que vuelve enseguida, porque hay algo en
   vuelo) y luego a `submitAttempt()`, que **se cuelga igual, y sin timeout**.
4. Estado medido a los 6 segundos y estable a partir de ahí:
   - botón principal: **«Entregando…», deshabilitado**;
   - botón del diálogo: **«Entregando», deshabilitado**;
   - botón «Volver y revisarlas»: **deshabilitado**;
   - ningún mensaje de error;
   - el reloj del examen **sigue corriendo** (24:28 en la captura).

Captura: `tocheck/tactil/tactil-06-entrega-red-colgada.png`.

El niño se queda encerrado en un diálogo con los tres botones muertos, sin
texto que le diga nada, mientras el cronómetro corre. Y cuando el temporizador
llegue a cero, `onExpired()` llamará a `doSubmit("timer")`, que sale por
`if (guardRef.current.busy) return` sin hacer nada.

**Matiz importante y comprobado:** *no se pierde ningún dato*. La respuesta
sigue en `localStorage` (`cet.exam.queue.<attemptId>`), el `beforeunload`
avisa antes de salir —lo disparó de verdad durante las pruebas— y al volver a
entrar, `startAttempt` es idempotente y `recoverResponses` devuelve lo pendiente
a la pantalla. **El fallo es de interfaz: se le quita la salida al alumno y no
se le dice nada.** Eso sigue siendo, para un niño con el reloj corriendo,
indistinguible de haber perdido el examen.

#### Lo que NO se midió aquí

- **El «Slow 3G» literal de DevTools.** Se simularon el corte y el cuelgue por
  interceptación, que es más determinista y cubre los dos extremos, pero **no**
  se midió una red lenta-pero-viva (respuestas de 2–5 s). Falta saber si el
  debounce de 800 ms + una latencia de 3 s produce colas de dos o tres
  respuestas y qué se ve mientras.
- **El comportamiento del servidor real** bajo esas condiciones. Todo lo de
  arriba se midió contra respuestas simuladas: mide el cliente, no el motor.

### 2.6 · Peso real

**Build de producción del 27/08 (`next build`, tabla de rutas, JavaScript sin
comprimir):**

| Ruta de alumno | JS de la ruta | **First Load JS** |
|---|---|---|
| `/learn/[lessonId]` | 2,79 kB | **199 kB** |
| `/learn` | 488 B | **197 kB** |
| `/exam` | 365 B | **197 kB** |
| `/exam/[assignmentId]/run` | 8,79 kB | **168 kB** |
| `/practice/[skillCode]` | 27,6 kB | **165 kB** |
| `/exam/[assignmentId]/result` | 7,07 kB | 141 kB |
| `/exam/[assignmentId]` | 4,94 kB | 139 kB |
| `/account/pin` | 2,15 kB | 132 kB |
| `/practice` | 185 B | **106 kB** |
| `/account` | 185 B | 106 kB |
| Compartido por todas | — | 102 kB |

**CSS:** un único fichero, **51 917 bytes sin comprimir (50,7 KiB)**, y por el
cable en producción con brotli **10 930 bytes**. Es el mismo para todas las
pantallas: no hay CSS por ruta.

**Por el cable, contra producción, con la caché desactivada (medido por CDP):**

| Página pública | Documento | JS | CSS | **Total** |
|---|---|---|---|---|
| Landing `/` | 11 484 B | 141 748 B (11 ficheros) | 10 930 B | **165 791 B** |
| `/login/student` | 12 815 B | 147 476 B (12 ficheros) | 10 956 B | **172 714 B** |

**El hallazgo de peso, y tiene nombre.** Compárense dos índices que hacen lo
mismo —una lista de enlaces, cero interacción, ambos Server Components dentro
del mismo layout—:

- `/practice` → **106 kB**. No importa nada de `@cet/ui`.
- `/learn` → **197 kB**. Importa `{ EmptyState, ErrorState } from "@cet/ui"`
  (`(student)/learn/page.tsx:27`).
- `/exam` → **197 kB**. Importa `{ Badge, EmptyState, ErrorState }`
  (`(student)/exam/page.tsx:13`).

**Delta medido: 91 kB de JavaScript de primera carga por importar dos
componentes de la barra de exportación.** `packages/ui/src/index.ts` reexporta
63 símbolos desde un solo módulo, incluido `cetPreset` (¡el preset de
Tailwind!), y arrastra el árbol entero.

La cabecera de `/learn/page.tsx` dice, en el fichero, «no lleva un solo byte de
JavaScript propio». Es verdad y a la vez la pantalla se lleva 91 kB de más. Es
otra vez el patrón del `VERIFICATION_PLAN §2`: código que no hace lo que dice
hacer, con salida perfectamente creíble.

**Lo que no se midió:** el peso **por el cable** de las pantallas de alumno.
Requiere sesión. Las cifras de la tabla de rutas son de compilación, sin
comprimir. Sabiendo que en las públicas el JS comprime a ≈1/3, `/learn`
rondaría los 65 kB por el cable — **eso es una estimación, no un dato, y por eso
no aparece en ninguna tabla de este documento.**

---

## 3 · Priorizado

### P0 — rompe el uso

| # | Qué | Evidencia |
|---|---|---|
| 1 | **Entregar el examen con la red colgada deja al alumno encerrado**: tres botones deshabilitados, sin mensaje, con el reloj corriendo y sin salida. | §2.5.C, captura 06 |
| 2 | **El autoguardado se cuelga sin decirlo**: una petición sin respuesta bloquea la cola para siempre y el indicador sigue diciendo «Guardando». Diez minutos simulados, un solo envío. | §2.5.B, captura 05, test del apéndice A.3 |
| 3 | **La cabecera del alumno desborda 47 px a 360 px** y deja «Salir» medio fuera de la pantalla, con scroll horizontal en toda la app. Pasa en todas las pantallas de alumno, examen incluido. | §2.2.a, captura 01 |

### P1 — incómodo, cuesta toques, no impide terminar

| # | Qué | Evidencia |
|---|---|---|
| 4 | Idioma, tema y «Salir» miden 24–36 px de alto y están **en todas las pantallas**. | §2.1 |
| 5 | A 768 px el raíl tapa la marca de la cabecera. | §2.3, captura 02 |
| 6 | La landing tiene **15 de 19 controles** por debajo de 44 px; el pie, a 19 px. | §2.1 |
| 7 | La casilla de consentimiento del registro mide 20×20 (mitiga que la etiqueta esté asociada y también alterne). | §2.1 |
| 8 | No hay ningún gesto propio de táctil: ni deslizar entre preguntas, ni ampliar una figura con doble toque. | §2.4 |

### P2 — peso

| # | Qué | Evidencia |
|---|---|---|
| 9 | **91 kB de JS de más** en `/learn` y `/exam` por la barra de `@cet/ui`. | §2.6 |
| 10 | Un solo CSS de 50,7 KiB (10,9 KiB por el cable) para todas las pantallas. Es asumible; queda anotado, no propuesto. | §2.6 |

---

## 4 · Lo que hay que dejar en paz

Sale de la medición y merece decirse, porque el impulso de «hacerlo todo táctil»
va a querer tocarlo:

- **El diseño sin arrastrar y soltar.** `OrderingList` y `MatchingGrid` ya son
  la solución correcta para una tableta. No se toca.
- **Los 44 px del design system.** Ya están puestos y se cumplen.
- **`ExamRunner` en modo sobrio.** Nada parpadea durante un examen. Cualquier
  «interactividad de niños genios» que se añada va en aprender y practicar,
  **no en el examen**.
- **La cola de autoguardado con red caída.** Funciona y está bien contada al
  alumno. Lo que falta es el caso colgado, no el caso caído.
- **El zoom.** `maximumScale` no se fija a propósito. Que siga así.

---

## 5 · Huecos declarados — lo que NO se ha medido

Sin adornos. Una tabla con un hueco declarado vale más que una estimación con
pinta de dato.

| Hueco | Por qué | Cómo se cierra |
|---|---|---|
| **El teclado virtual tapando el campo de respuesta** | No se puede emular en Chromium de escritorio. **No hay ni una línea de `visualViewport` en todo el repo** (grep), así que nadie ha pensado el caso. | Un iPad o un Android reales, en `/practice/[skillCode]` y en la última pregunta del examen |
| **Dispositivo táctil real** | Todo se midió con viewport reducido: sin `touchstart`, sin retraso de toque, sin densidad de tableta | Igual que arriba |
| **Slow 3G real de DevTools** | Se midió corte y cuelgue, no lentitud viva | Repetir el banco de pruebas con `Network.emulateNetworkConditions` |
| **Peso por el cable de las pantallas de alumno** | Requiere sesión | Con el usuario delante, una carga con la pestaña Red abierta |
| **`/learn/[lessonId]` con contenido real** | No hay lección accesible sin sesión. Los bloques largos, las tablas y los SVG del enunciado son justo lo que desborda a 360 px, y **`globals.css` no tiene ni una regla de `overflow-x` para `table` o `pre`** | Abrir una lección real a 360 px |
| **`/exam/[id]/result` y `/account`** | Requieren sesión y no se replicaron | Réplica o sesión |
| **Pantallas de staff (`/teach`, `/admin`)** | Fuera del encargo, que habla de móvil para el alumno. Se ve de lejos que `AdminPanel` tiene controles de 30 px y un `window.confirm` | Otro encargo |
| **La cabecera de alumno REAL** | Se midió una réplica con las mismas clases (§1) | Una carga con sesión confirma los 392 px en diez segundos |
| **Orientación apaisada de tableta (1024×768)** | No medida | Añadir el viewport al banco de pruebas |

---

## 6 · Plan de ejecución

Cinco pasos. Cada uno dice **qué ficheros toca**, y están agrupados
precisamente para que dos personas puedan repartírselos sin pisarse. El paso 1
no toca CSS: puede empezar hoy aunque los otros agentes sigan en `packages/ui/`.

### Paso 1 · La red que no contesta (P0-1, P0-2) — **el primero, y solo**

Ficheros: `apps/web/src/components/exam-runner/api.ts`,
`.../autosave.ts`, `.../ExamRunner.tsx`, y sus tests hermanos
(`api.test.ts`, `autosave.test.ts`).
**No toca CSS ni `packages/ui/`. Cero colisión.**

1. Timeout explícito en `request()` de `api.ts`, combinando el `signal` que
   llega con un `AbortSignal.timeout(...)`. Un `fetch` sin fecha de caducidad es
   un fallo silencioso esperando su turno.
2. Que la cola trate el timeout como lo que es —un fallo de red reintentable—
   y pase a `offline` / `retrying`, que ya están escritos y ya funcionan
   (§2.5.A lo demuestra).
3. Que `doSubmit` no pueda quedarse en `submitting` para siempre: al vencer el
   plazo, `submitFailed` y botones vivos otra vez. Ya existe esa rama y ya dice
   lo correcto; lo único que falta es poder llegar a ella.
4. Tests de familia, no del caso: *ninguna llamada de red del examen se hace sin
   plazo* y *ningún estado de «ocupado» de esta pantalla puede durar más que su
   petición*. Cazan a los hermanos del fallo, no solo a él.

**Antes de escribir nada, decidir la pregunta 2 de la sección 7.**

### Paso 2 · La cabecera (P0-3, P1-4, P1-5)

Ficheros: `apps/web/src/app/(student)/layout.tsx`,
`apps/web/src/app/(staff)/layout.tsx`,
`apps/web/src/components/PreferenceSwitchers.tsx`.
Toca CSS de layout: **esperar a que los otros dos agentes cierren.**

- Que la fila de la cabecera pueda envolver, o que a `sm` se recojan idioma y
  tema (pregunta 6).
- `md:pl-56` en la cabecera de alumno, igual que ya lo llevan el `main` y el
  `footer`.
- 44 px en los botones de idioma, tema y salir. Es cambiar `py-1` por la clase
  de toque que ya existe en el preset.
- Test de invariante: *ninguna pantalla de alumno desborda a 360 px*. Es un
  Playwright de cuatro líneas comparando `scrollWidth` con `clientWidth`, y
  cierra la familia entera.

### Paso 3 · Salidas del examen (P1, decisión de producto)

Fichero: `apps/web/src/app/(student)/layout.tsx` (y `esModoExamen` de
`components/nav/StudentNav.tsx`, que ya existe y ya está probada).

Hoy la barra de pestañas desaparece durante el examen por integridad, pero
**«Salir» sigue en la cabecera**. La puerta que se cerró con llave tiene la
ventana abierta al lado. Ver pregunta 5.

### Paso 4 · La landing y el registro (P1-6, P1-7)

Ficheros: `apps/web/src/components/marketing/SiteChrome.tsx`,
`apps/web/src/app/(marketing)/page.tsx`,
`apps/web/src/components/auth/RegisterForm.tsx`.
Aislado del resto: se puede hacer en paralelo con el paso 2.

### Paso 5 · Peso (P2-9)

Ficheros: `packages/ui/src/index.ts` (o los `import` de las tres páginas que lo
usan), `apps/web/src/app/(student)/learn/page.tsx`,
`apps/web/src/app/(student)/exam/page.tsx`,
`apps/web/src/app/(student)/learn/[lessonId]/page.tsx`.

Dos caminos, y hay que medir cuál gana antes de elegir: importar por ruta
profunda (`@cet/ui/data/EmptyState`) o sacar `cetPreset` y los módulos de
cliente de la barra. **La medida es la tabla de `next build` antes y después**,
que es exactamente como se encontró el problema.

---

## 7 · Preguntas abiertas al usuario

**1. ¿Qué significa «alto bandwidth»?**
Es ambiguo y no se ha aclarado. Puede querer decir «aprovechar la buena conexión
de casa» o «aguantar la mala del colegio». Las dos lecturas piden cosas
distintas: vídeo y figuras ricas la primera; austeridad la segunda.
**Recomendación:** disolver la ambigüedad en vez de elegir. **Todo el apoyo
visual en SVG y CSS generados en el cliente, sin imágenes pesadas.** Un SVG de
una fracción pesa cientos de bytes, se ve nítido en cualquier pantalla, se anima
con CSS y funciona igual con la red caída. Así la pantalla es rica donde hay
buena red y sigue siendo barata donde no la hay, sin dos versiones que mantener.
Con un presupuesto por pantalla —propongo **150 kB de JS por el cable**, contra
la tabla de `next build`— para que la decisión sea comprobable y no una
intención.

**2. ¿Cuántos segundos aguanta una petición antes de darla por perdida?**
Hace falta el número para el paso 1.
**Recomendación:** 12 s para guardar una respuesta (se reintenta sola, el coste
de equivocarse es cero) y 25 s para entregar, con reintento automático y luego
botón vivo. Nunca infinito, que es lo que hay hoy.

**3. Si la entrega no llega antes de que expire el reloj, ¿qué se le dice al
niño?** Hoy: nada, botón muerto. El servidor cierra el intento por su cuenta,
así que el examen **no** se pierde.
**Recomendación:** «Seguimos intentando entregarlo. Tus respuestas están
guardadas en este aparato», con reintento manual siempre disponible, y jamás un
botón deshabilitado sin mensaje.

**4. ¿44 px o 48 px de objetivo mínimo?** WCAG pide 44; Google recomienda 48; el
dedo de un niño de once años es más pequeño pero su puntería es peor.
**Recomendación:** 44 px como mínimo absoluto y **48 px en las acciones
primarias del alumno** («Comprobar», «Siguiente», «Entregar», las pestañas). El
token `--cet-touch-comfy` ya vale 52 px y ya se usa en el campo de respuesta y
en las opciones.

**5. ¿Se puede cerrar sesión desde dentro de un examen en curso?** Hoy sí, con
un botón de 53×34 en la cabecera, mientras la barra de pestañas se retira por
integridad.
**Recomendación:** ocultarlo en `/exam/*/run`, con la misma función
`esModoExamen()` que ya se escribió y ya tiene tests. La salida del examen debe
ser una sola y explícita.

**6. A 360 px no caben cuatro cosas en la cabecera. ¿Qué se sacrifica?**
**Recomendación:** que idioma y tema se muden a `/account` y en la cabecera
queden solo la marca y el nombre del alumno. Un niño cambia el idioma una vez
en su vida; el botón le estorba todos los días. (Ojo: el selector de idioma es
hoy un Server Component sin JavaScript, y moverlo no debe convertirlo en una
isla de cliente.)

**7. ¿Se quiere un «modo dedo» con objetivos de 56 px como preferencia del
alumno?**
**Recomendación:** no. Un solo diseño, bien dimensionado. Una preferencia más
es una matriz de estados más que probar, y la ganancia se la come el paso 4.

**8. ¿Entra la tableta apaisada (1024×768) en el alcance?** No se ha medido.
**Recomendación:** sí, y medirla en el paso 2, que es cuando se toca el marco.
Añadir un viewport al banco de pruebas cuesta una línea.

**9. ¿Se aprueba probar en un dispositivo real antes de dar el trabajo por
hecho?** Los huecos de la sección 5 no se cierran de otra manera; el del teclado
virtual, desde luego, no.
**Recomendación:** sí, y que sea el propio usuario con su tableta y su móvil,
sobre el despliegue de producción, con un guion de cinco pasos que le
prepararemos. Nadie más va a tocar esas pantallas con un dedo de verdad.

---

## Apéndice A · Cómo reproducir las medidas

Los tres ficheros están **borrados**. Esto es lo que había, para volver a
montarlo cuando haga falta.

### A.1 · Reglas que hay que conocer antes

- Una carpeta que empieza por `_` **no se enruta** en el App Router.
- `middleware.ts` deniega por lista blanca: la página de pruebas tiene que
  colgar de un prefijo de `PUBLIC_PREFIXES` (`routes.ts:38`). `/not-found/...`
  sirve y no obliga a tocar nada.
- `useTelemetry()` **lanza en desarrollo** si no hay `TelemetryProvider` encima
  (alguien lo arregló hoy, y bien): hay que montarlo.
- El servidor de desarrollo comparte `.next` con cualquier `next build` que
  lance otro agente. Si aparecen 404 y 500 intermitentes, es eso. Levantarlo en
  un puerto propio (`npx next dev -p 3210`) no basta; hay que no compilar a la
  vez.

### A.2 · Página de pruebas

`apps/web/src/app/not-found/harness-tactil/page.tsx`: copia el marco de
`(student)/layout.tsx` (cabecera con `LocaleSwitcher` y «Salir», `main` con
`pb-24 md:pb-8 md:pl-60`, `footer`, `StudentNav`), lo envuelve en
`LocaleProvider` + `TelemetryProvider` y mete dentro `<UiLocaleProvider>` con un
`<PracticeSession topicId={…} locale="es" />` real.

`.../examen/page.tsx`: el mismo marco sin barra, con
`<ExamRunner assignmentId="harness" locale="es" resultHref="…" />`. Las
respuestas de `/api/attempts/*` se sirven desde Playwright con `page.route`
—**una sola ruta `**/api/**` que discrimine por URL**, porque Playwright evalúa
los manejadores en orden inverso al de registro y un `**/api/attempts/**`
registrado después se come al de `/start`—.

### A.3 · La medición de la cola colgada

```ts
// apps/web/src/components/exam-runner/zz-harness-hang.test.ts  (temporal)
import { describe, expect, it, vi } from "vitest";
import { AutosaveQueue, type AutosaveState } from "./autosave";

describe("MEDICION: peticion que no responde nunca", () => {
  it("la cola se queda en 'saving' para siempre, sin reintento y sin aviso", async () => {
    vi.useFakeTimers();
    const estados: AutosaveState[] = [];
    let envios = 0;

    const queue = new AutosaveQueue("medicion", {
      send: () => { envios += 1; return new Promise(() => {}); },  // nunca resuelve
      onStateChange: (state) => estados.push(state),
      onDeadlinePassed: () => undefined,
      storage: null,
    });
    queue.start();
    queue.queue({
      attemptItemId: "item-1",
      response: { type: "text", value: "100" },
      clientTs: new Date().toISOString(),
      timeOnItemMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(600_000);   // diez minutos de examen

    expect(envios).toBe(1);
    expect(estados[estados.length - 1]).toBe("saving");
    expect(queue.hasPending).toBe(true);
    vi.useRealTimers();
  });
});
```

Salida literal del 27/08 a las 13:27:

```
 ✓ src/components/exam-runner/zz-harness-hang.test.ts (1 test) 3ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### A.4 · Capturas

En `tocheck/tactil/`:

| Fichero | Qué demuestra |
|---|---|
| `tactil-01-practica-360.png` | Cabecera partida en tres líneas y «Salir» fuera del viewport |
| `tactil-02-practica-768.png` | El raíl tapando la marca en tableta |
| `tactil-03-examen-360.png` | El examen a 360 px: todo pasa los 44 px, sin desborde |
| `tactil-04-examen-sin-red.png` | El buen comportamiento con la red caída |
| `tactil-05-examen-red-colgada.png` | «Guardando» eterno con la red colgada |
| `tactil-06-entrega-red-colgada.png` | **El peor fallo:** los tres botones muertos con el reloj corriendo |

El círculo negro con la «N» que aparece en algunas capturas es el indicador de
desarrollo de Next.js. No sale en producción.
