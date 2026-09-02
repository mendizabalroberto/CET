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

---

## 7 · Segunda ronda: el estratega ve el detalle y dice qué leer y qué practicar

Pedido de Roberto (misma tarde): «hay que darle contexto a DeepSeek de las
prácticas disponibles, de lo último que estudió, así puede establecer
claramente qué debe leer y qué debe practicar y crearlo en la DB, como un
plan real con tiempo por día, lecciones, todo en función a las notas».

Hoy el modelo recibe por materia solo cuatro totales (lecciones publicadas,
completadas, minutos, preguntas) y devuelve pesos; el repartidor elige las
lecciones por índice y las prácticas por dominio. El plan real (día, lección
o práctica, minutos) YA se crea en `plan_tareas`; lo que falta es que la
elección de QUÉ leer y QUÉ practicar la informe el modelo con el detalle.

Frontera que se conserva (spec §8): el modelo PRIORIZA, el código PLANIFICA.
Ningún id que no exista en el inventario entra en el plan: las prioridades se
validan contra el catálogo y lo desconocido se descarta.

### 7.1 · Entrada del estratega (`EntradaEstratega`, nuevo detalle)

Por materia con contenido (`inventarioDetallado`):
```
{ code, lecciones: [{ id, titulo, modulo, minutos, completada }],
  skills:    [{ id, code, nombre, preguntas, mastery (0..1|null), ultimaPractica (YYYY-MM-DD|null) }],
  reciente:  { minutos, items, porcentajeAcierto, leccionesCompletadas }   // 28 días, RPC informe_alumno_resumen_por_materia
}
```
Más `ultimasLecciones: [{ titulo, code, fecha }]` (las 5 últimas
`lesson_completed` de `learning_events`). Títulos y nombres: el `es` del
I18nText (fallback `en`). Los totales de antes (`InventarioDeMateria`) se
sustituyen por esto.

### 7.2 · Salida del estratega (`Propuesta.prioridades`)

```
{ minutos_por_dia, reparto: {...}, recomendaciones: [...],
  prioridades: { math: { lecciones: ["<lessonId>", ...], skills: ["<skillId>", ...], por_que: "frase" }, ... } }
```
`validarPropuesta(salida, inventarioDetallado)` filtra ids que no estén en el
inventario de esa materia y lecciones ya completadas; como máximo 8 lecciones
y 6 skills por materia; `por_que` ≤ 200 caracteres. `prioridades` puede
faltar (el modelo no lo dio): el repartidor sigue como hoy.

### 7.3 · Repartidor (`@cet/engine`)

`MateriaDelPlan` gana `prioridadLecciones?: readonly string[]` y
`prioridadSkills?: readonly string[]`. `crearEstado`: las lecciones
priorizadas van primero, EN ESE ORDEN, y después el resto por módulo/orden
como hoy; las skills priorizadas primero, en ese orden, y después el resto por
dominio como hoy. Ids desconocidos se ignoran. Determinista; tests nuevos.

### 7.4 · Persistencia y lectura

`planes_de_estudio.reparto` = `{ pesos, techos, prioridades? }` (mismo JSON;
sin migración). `RepartoGuardado.prioridades?` con la forma de 7.2 pero en
camelCase (`porQue`). `PlanResumen` gana
`prioridades: { code, porQue, lecciones: { lessonId, titulo }[], skills: { skillId, nombre }[] }[]`
resuelto en `planActivoDeHijo` (títulos desde `lessons.title` / `skills.name`).
`editarPlan` conserva las prioridades del plan que edita.

### 7.5 · Pantalla

En «Plan actual», bloque «Qué leer y qué practicar primero»: por materia, el
`porQue` y dos listas cortas (lecciones, prácticas). Claves nuevas:
`prioritiesTitle`, `prioritiesRead`, `prioritiesPractice`.

### 7.6 · Reparto

| Territorio | Ficheros | Quién |
|---|---|---|
| E · Motor | `packages/engine/src/plan/{tipos,repartir,repartir.test}.ts` | agente |
| F · Datos y prompt | `apps/web/src/lib/plan/{tipos,estratega,estratega.test,consultas,consultas.test,acciones}.ts` | agente |
| G · Pantalla | `PlanDeEstudio.tsx` (+test), diccionarios, `plan-preview` | yo |

## 8 · Tercera ronda: los exámenes del alumno, y el idioma

Pedido: «el plan de estudios debe considerar el calendario de exámenes; es un
documento que también debe poder subirse o al menos indicar por escrito qué
fecha tiene exámenes» y «además debe mantener el lenguaje del alumno».

### 8.1 · Tabla `examenes_del_alumno` (migración 0095)

`id, student_id, subject_id (null = general), fecha, titulo, origen
('tutor' | 'documento'), creado_por, created_at`. RLS solo para el tutor
vinculado (`guardian_students`, `revoked_at is null`): select, insert
(`creado_por = auth.uid()`) y delete. Índice `(student_id, fecha)`; único
`(student_id, fecha, coalesce(subject_id, cero), lower(titulo))` para que
una extracción repetida del mismo documento no duplique. pgTAP en
`supabase/tests/examenes_del_alumno.sql`.

### 8.2 · Pantalla y acciones (`lib/plan/examenes.ts`, nuevo fichero)

Tarjeta «Exámenes» en la pestaña del plan: lista (fecha · materia · título ·
borrar), formulario «Añadir examen» (fecha, materia o «General», título
opcional) y «Subir el calendario de exámenes (PDF)»: `pdfToSpans` +
DeepSeek con `promptDeExtraccionDeExamenes` → `[{fecha, materia, titulo}]`
validado (fechas reales, materia mapeada con el mismo mapa de sinónimos del
boletín o null) → insert con la sesión del tutor. Acciones: `anadirExamen`,
`borrarExamen`, `subirCalendarioDeExamenes`. Consulta `examenesDeAlumno`.
Solo exámenes desde hoy hacia delante se pasan al plan.

### 8.3 · Motor y estratega

`EntradaReparto.examenes` (motor): 7 días de empuje antes de cada examen,
×1.25 de intensidad, y la materia deja de competir tras su examen. La ventana
del plan (`hitoMasCercano`) se estira hasta el último examen si cae después.
El estratega recibe `examenes: [{fecha, code|null, titulo}]` y `idioma`
(`es`|`en`, el del tutor en la app) y escribe recomendaciones y `por_que` en
ese idioma.
