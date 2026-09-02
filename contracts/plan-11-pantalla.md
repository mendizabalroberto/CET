---
id: plan-11-pantalla
model: reasoner
territory: [apps/web/src/app/(tutor)/tutor/hijos/[id]/plan/**, apps/web/src/components/tutor/PlanDeEstudio*]
forbidden: [apps/web/src/lib/plan/acciones.ts, apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/i18n/dictionaries/en.ts, apps/web/src/lib/i18n/dictionaries/es.ts, apps/web/src/components/tutor/Telegram.tsx, packages/ui/src/index.ts]
context: [apps/web/src/lib/plan/acciones.ts, apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/plan/tipos.ts, apps/web/src/components/tutor/Telegram.tsx, apps/web/src/app/(tutor)/tutor/hijos/[id]/page.tsx, apps/web/src/app/(tutor)/tutor/hijos/[id]/practica/page.tsx, apps/web/src/lib/i18n/dictionaries/en.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint "src/app/(tutor)/tutor/hijos/[id]/plan" src/components/tutor && pnpm --filter @cet/web exec vitest run src/components/tutor/PlanDeEstudio
rounds: 5
deadline: 5 rondas o 45 min
---

## 1 · El problema

Las cuatro acciones del plan existen (`acciones.ts`) y las lecturas también
(`consultas.ts`). Falta la pantalla del tutor: la pestaña **«Su plan»** en
`/tutor/hijos/[id]/plan`, ya enlazada desde la navegación del hijo. Te tocan
`apps/web/src/app/(tutor)/tutor/hijos/[id]/plan/page.tsx` (Server Component
que lee) y `apps/web/src/components/tutor/PlanDeEstudio.tsx` (Client
Component que llama a las acciones), con `PlanDeEstudio.test.tsx` para el
cableado.

## 2 · La evidencia que ya tenemos

- `Telegram.tsx` (te lo doy) es la forma de la casa para un componente de
  tutor: `"use client"`, `useActionState(accion, { ok: false })`,
  `useI18n()` → `{ t, fmt, locale }`, error por `t.tutor.errors[errorKey] ??
  generic` con `role="alert"`, formularios con `<form action={…}>`, botones
  con `disabled={pending}`, clases Tailwind de la casa (`rounded-2xl border-2
  border-line bg-card p-5`, `bg-brand text-on-brand`, `text-muted`,
  `text-ink`, `border-danger`).
- `page.tsx` de la ficha y `practica/page.tsx` (te los doy) muestran cómo una
  pantalla del hijo lee con la sesión y renderiza; el `h1`, el «volver» y las
  pestañas los pone el layout: **no los repitas**.
- Acciones (te doy `acciones.ts`): `subirBoletin`, `confirmarBoletin`,
  `proponerPlan`, `fijarPlan`, todas `(prev, fd) => Promise<PlanState>` con
  `{ ok, errorKey?, successKey?, values? }`. Los `values` de `proponerPlan`
  traen `minutosPorDia`, `pesos` (JSON), `recomendaciones` (JSON), `modelo`,
  `tokensIn`, `tokensOut`, `desde`, `hasta`, `hito`. Los campos que cada
  acción espera en el `FormData` están en su cabecera.
- Lecturas (te doy `consultas.ts`): `boletinesDeHijo(studentId)` →
  `BoletinResumen[]` (más reciente primero; `notas: NotaGuardada[]` con
  `materia, code, subject_id, nota, banda`); `planActivoDeHijo(studentId)` →
  `PlanResumen | null` con `reparto: { pesos, techos }`, `recomendaciones`,
  `tareas`, `partes`.
- Textos: TODOS en `t.tutor.child.plan` (te doy `en.ts`; mira el bloque
  `plan:` y `bands:`) y los errores en `t.tutor.errors`. **No añadas claves**
  ni escribas una sola frase a mano en el componente (AD-7). Los nombres de
  materia se muestran con el `materia` literal del boletín.
- `fmt(plantilla, valores)` de `useI18n` interpola `{name}`; en el servidor,
  `interpolate` de `@/lib/i18n`. Fechas: `toLocaleDateString(locale === "es"
  ? "es-ES" : "en-GB")`.

## 3 · El criterio de aceptación

El `verify` sale en 0.

`page.tsx`: `requireRole` lo hace el layout; aquí lee `boletinesDeHijo` y
`planActivoDeHijo` en paralelo y pinta `<PlanDeEstudio studentId boletin={el
más reciente o null} plan={…} nombre={nombre de pila} />`. `generateMetadata`
con `plan.cardTitle`.

`PlanDeEstudio.tsx`, cuatro bloques de arriba abajo, cada uno una `section`
con `h2`:

1. **El boletín.** `intro`. Formulario con `input type="file"
   accept="application/pdf" name="archivo"` + `studentId` oculto + botón
   `uploadButton`/`uploading`, y `uploadHelp`. Si ya hay boletín, el
   formulario sigue visible (se puede subir otro trimestre) debajo de la
   tabla.
2. **Lo leído.** Si hay boletín: `term`/`termUnknown`, tabla con
   `colSubject`/`colGrade`/`colBand`; cada fila: `materia`, un `input
   type="number" min=0 max=100 name="nota:<índice>"` con la nota (editable
   solo mientras `estado === "extraido"`), la banda traducida
   (`bands[banda]`), y en las filas con `code === null` el texto `notPlanned`
   en `text-muted`. Estado `extraido`: botón `confirmButton` (`confirmarBoletin`)
   y `extractedHelp`. Estado `confirmado`: `confirmed` con la fecha, sin
   inputs.
3. **La propuesta.** Solo con boletín confirmado. Botón `proposeButton`
   (`proponerPlan`). Cuando la acción devuelve `ok` con `values`: muestra
   `proposalTitle`, `windowLine`, un `input type="number" name="minutosPorDia"
   min=10 max=180` precargado con la propuesta (`minutesLabel`,
   `minutesHelp`), `weightsTitle` con una lista `materia → %` de `pesos`,
   `recommendationsTitle` + `recommendationsNote` + la lista (como máximo 6),
   `replaceWarning` si ya hay plan activo, y el botón `createButton`
   (`fijarPlan`) con los demás valores en inputs ocultos (`pesos`,
   `recomendaciones`, `modelo`, `tokensIn`, `tokensOut`, `desde`, `hasta`,
   `boletinId`, `studentId`).
4. **El plan actual.** Si `plan` no es null: `activeTitle`, `activeRange`,
   `activeMinutes`, `activeTasks`; si `reparto.techos` no está vacío,
   `ceilingsTitle` y una `ceilingLine` por techo (`subject` = `code`,
   `available` = `minutosDisponibles`, `requested` = `minutosPedidos`);
   `recommendationsTitle` con las del plan; `reportsTitle` con una
   `reportLine` por parte o `reportsEmpty`. Si es null: `noPlanTitle` /
   `noPlanBody`, o `noReportCard` cuando tampoco hay boletín. Tras un
   `fijarPlan` en `ok`, muestra los `techos` que trae `values.techos` (JSON)
   en el mismo formato: el tutor los ve en el acto (spec §8.2).

Errores: un solo `role="alert"` con el mensaje del último `errorKey` de
cualquiera de las cuatro acciones.

`PlanDeEstudio.test.tsx` (jsdom, `@testing-library/react`, con las cuatro
acciones **mockeadas** vía `vi.mock("@/lib/plan/acciones")` y el proveedor de
i18n de la app): sin boletín → aparece `noReportCard` y el formulario de
subida; con boletín `extraido` de dos filas (una con `code: null`) → dos
inputs `nota:0`/`nota:1`, el texto `notPlanned` una vez, el botón de
confirmar; con boletín `confirmado` → sin inputs de nota y con el botón de
proponer; con plan activo con un techo → `ceilingsTitle` visible. Mira cómo
montan el proveedor de i18n los `.test.tsx` que ya existen en
`src/components/` antes de inventar uno.

## 4 · Qué NO cuenta como resuelto

- Texto de cara al usuario escrito a mano, o claves nuevas en el diccionario.
- Mostrar minutos «medidos» que no vengan de `partes`: la pantalla no calcula
  nada, enseña lo que la base ya midió.
- Un `fetch`, un `useEffect` para cargar datos o un estado global: las
  lecturas van en la página, las escrituras en las acciones.
- Repetir el `h1`, el «volver» o las pestañas del layout.
- Tocar `acciones.ts`, `consultas.ts`, los diccionarios o `Telegram.tsx`.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
