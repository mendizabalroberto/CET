# Plan automático con IA — «subes el boletín y sale el plan»

Fecha: 2026-09-02. Rama: `navegacion/materias` → `main`. Producción: cet-sable.vercel.app.

## 1 · Lo que falla hoy (verificado)

Reproducido en producción con el PDF `apps/web/e2e/__fixtures__/boletin-e2e.pdf`
sobre `/tutor/hijos/81b5ae3d-…/plan`. La subida devuelve HTTP 200 y la pantalla
no cambia. Logs de Vercel (`vercel logs`, 18:02):

```
Warning: Cannot load "@napi-rs/canvas" package: "Error: Cannot find module '@napi-rs/canvas'
Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
[cet] subirBoletin pdfToSpans DOMMatrix is not defined
```

Tres causas, por orden:

1. **`pdfjs-dist` en Node necesita `DOMMatrix` a nivel de módulo**
   (`const SCALE_MATRIX = new DOMMatrix()` en `legacy/build/pdf.mjs`) y lo toma
   de `@napi-rs/canvas`, dependencia opcional que la función de Vercel no
   lleva. Solo lo usa para renderizar; `getTextContent` no lo toca. Arreglo:
   antes de importar pdfjs, `globalThis.DOMMatrix ??= <clase mínima>` en
   `packages/content/src/corpus/pdf.ts`.
2. **Falta `DEEP_SEEK_API` en Vercel (production/preview).** Con la lectura
   arreglada, la extracción caería en `DeepSeekError("sin_clave")`. La clave
   está en `secrets/accounts.env`; el clasificador de esta sesión no deja
   leerla y enviarla. Lo hace Roberto con un comando (ver §6).
3. **El acuse de error se pinta al final de la página**, debajo del histórico
   y del calendario: el tutor pulsa y «no pasa nada». Va arriba, junto al título.

Hallazgo colateral: el cambio sin commitear de `pdf.ts` (`bajoWebpack` con
`typeof globalThis.__webpack_require__`) no detecta webpack (`__webpack_require__`
no es global en el bundle) y deja las dos ramas del `import()` a la vista del
bundler. Se descarta. `next build` empaqueta pdfjs en un chunk **con el worker
inlinado** (`WorkerMessageHandler` está en el chunk), así que el import directo
funciona en `next start`/Vercel; el ENOENT de `vendor-chunks/pdf.worker.mjs`
era de `next dev` y se cubre con `serverExternalPackages` en `next.config.ts`
(se mantiene, no hace daño).

## 2 · El producto que pide Roberto

> subes, y luego dice analyzing y después eso genera el plan recomendado por
> ia automáticamente, luego se puede editar borrar o crear otro

Flujo nuevo, una sola acción tras subir:

```
[Subir PDF] → «Analizando el boletín…»
              1 leer el PDF · 2 interpretar las notas (IA) · 3 proponer el reparto (IA) · 4 crear las tareas
           → Plan actual (creado por la IA), con:
              · notas leídas (editables → «Guardar notas y regenerar»)
              · minutos/día y reparto por materia (editables → «Guardar cambios»)
              · sugerencias, techos de contenido, partes nocturnos
              · [Generar otro plan]  [Borrar el plan]  [Subir otro boletín]
```

Supuestos escritos (no se pregunta):

- La confirmación manual de notas desaparece del camino principal. Las notas
  se confirman solas al extraerlas; el tutor puede corregirlas después y
  regenerar. La regla «sin confirmar no hay plan» se conserva en el servidor:
  la acción confirma antes de proponer.
- «Borrar» = cancelar el plan activo (`cancelarPlan`, ya existe). El boletín no
  se borra: sirve para «Generar otro plan».
- «Editar» = minutos/día y pesos por materia; recomendaciones y modelo se
  conservan del plan que se edita. Cambia el reparto de tareas (se re-fija).
- Un fallo a mitad (p. ej. DeepSeek caído en la propuesta) deja el boletín
  guardado y ofrece «Volver a intentar» sin volver a subir el PDF.

## 3 · Contrato de las acciones (`apps/web/src/lib/plan/acciones.ts`)

Todas: `(prev: PlanState, fd: FormData) => Promise<PlanState>`. `PlanState`
no cambia de forma. Claves nuevas de `successKey`: `planGenerado`,
`planEditado`. Claves de error: las existentes.

| Acción | Campos del FormData | Hace | Éxito (`values`) |
|---|---|---|---|
| `generarPlan` | `studentId`, `archivo` (PDF) | sube+extrae → confirma → propone → fija | `planGenerado` `{boletinId, planId, tareas, techos}` |
| `regenerarPlan` | `studentId`, `boletinId`, opcional `nota:<i>` | si vienen notas, las guarda (y re-banda); confirma si estaba `extraido`; propone → fija (sustituye al activo) | `planGenerado` `{boletinId, planId, tareas, techos}` |
| `editarPlan` | `studentId`, `planId`, `minutosPorDia`, `pesos` (JSON) | re-fija con el mismo boletín, mismas recomendaciones/modelo/tokens | `planEditado` `{planId, tareas, techos}` |
| `cancelarPlan` | `planId`, `studentId` | sin cambios | `planCancelado` |
| `descartarBoletin` | `boletinId`, `studentId` | sin cambios | `boletinDescartado` |

Si `generarPlan` falla después de guardar el boletín, el `PlanState` de error
lleva `values.boletinId` para que la interfaz ofrezca «Volver a intentar»
(`regenerarPlan`). `subirBoletin`, `confirmarBoletin`, `proponerPlan` y
`fijarPlan` dejan de exportarse: su cuerpo pasa a helpers internos
(`extraerBoletin`, `confirmarNotas`, `proponer`, `fijar`).

`page.tsx` del plan exporta `maxDuration = 300` (dos llamadas a DeepSeek de
hasta 60 s cada una más el PDF).

## 4 · Reparto

| Territorio | Ficheros | Quién |
|---|---|---|
| A · Acciones | `lib/plan/acciones.ts`, `acciones.puras.ts` (+`leerPesosEditados` que acepta porcentajes enteros que suman 100), `acciones.test.ts`, `page.tsx` (`maxDuration`) | agente Sonnet (fichero >500 líneas: no DeepSeek) |
| B · Pantalla | `components/tutor/PlanDeEstudio.tsx`, `i18n/dictionaries/{en,es}.ts`, `i18n/claves-del-plan.test.ts`, `app/dev/plan-preview/page.tsx` | agente Sonnet |
| C · E2E | `e2e/plan.spec.ts` (mock sin cambios) | agente Sonnet |
| D · pdfjs + infra | `packages/content/src/corpus/pdf.ts` + test sin canvas, `next.config.ts`, `.env.example`, Vercel | yo |

A y B se coordinan solo por §3. C se escribe contra §2/§3 y contra los textos
de §5.

## 5 · Textos (es / en) que B añade y C usa

- `uploadButton`: «Generar el plan con IA» / "Generate the plan with AI"
- `analyzingTitle`: «Analizando el boletín…» / "Analysing the report card…"
- `analyzingSteps`: 4 pasos de §2
- `analyzingHelp`: «Suele tardar entre medio minuto y dos.» / "Usually takes between half a minute and two."
- `success.planGenerado`: «Plan creado por el asistente. {name} lo verá en «Hoy».» / "Plan created by the assistant. {name} will see it in “Today”."
- `success.planEditado`: «Cambios guardados.» / "Changes saved."
- `editButton` «Editar el plan» / "Edit the plan"; `editSave` «Guardar cambios» / "Save changes"; `editCancel` «Dejarlo como está» / "Leave it as it is"
- `deleteTitle` «Borrar este plan» (sustituye a `cancelTitle` en la interfaz; `cancel*` se conservan como claves)
- `regenerateButton` «Generar otro plan» / "Generate another plan"; `regenerating` «Generando…»
- `retryButton` «Volver a intentar» / "Try again"
- `gradesSave` «Guardar notas y regenerar el plan» / "Save grades and regenerate the plan"
- `weightsSum` «Los porcentajes tienen que sumar 100.» / "The percentages must add up to 100."
- `uploadAnotherTitle` «Subir otro boletín» / "Upload another report card"

## 6 · Cierre

1. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `next build`.
2. Vista previa en `/dev/plan-preview` con `next dev` (Playwright): sin plan,
   analizando, con plan (editar / borrar / regenerar). Sin cuentas reales.
3. Commit en `navegacion/materias`, merge a `main`, `vercel --prod`.
4. Roberto pone la clave (una vez; el clasificador no me deja):
   ```
   ! grep '^DEEP_SEEK_API=' secrets/accounts.env | cut -d= -f2- | npx vercel env add DEEP_SEEK_API production --sensitive
   ! grep '^DEEP_SEEK_API=' secrets/accounts.env | cut -d= -f2- | npx vercel env add DEEP_SEEK_API preview --sensitive
   ```
   y se redespliega (`vercel --prod`) para que la función la lea.
5. Verificación final en producción con la sesión del tutor ya abierta en
   Chrome: subir `boletin-e2e.pdf` → «Analizando…» → plan. Logs limpios.
