---
id: plan-8-acciones
model: reasoner
territory: [apps/web/src/lib/plan/acciones*]
forbidden: [apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/plan/boletin.ts, apps/web/src/lib/plan/estratega.ts, apps/web/src/lib/plan/deepseek.ts, apps/web/src/lib/plan/fecha.ts, apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/tutor/actions.ts, apps/web/src/lib/i18n/dictionaries/en.ts, apps/web/src/lib/i18n/dictionaries/es.ts]
context: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/plan/boletin.ts, apps/web/src/lib/plan/estratega.ts, apps/web/src/lib/plan/deepseek.ts, apps/web/src/lib/plan/fecha.ts, apps/web/src/lib/tutor/actions.ts, apps/web/src/lib/tutor/rutas.ts, packages/engine/src/plan/tipos.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/acciones
rounds: 5
deadline: 5 rondas o 45 min
---

## 1 · El problema

Todas las piezas puras existen: leer el PDF, extraer, validar, proponer,
repartir. Falta el camino del tutor que las une (spec §7 y §8): subir el
boletín, confirmar las notas, pedir la propuesta y fijar el plan. Te tocan
**las cuatro Server Actions** de `apps/web/src/lib/plan/acciones.ts` y las
pruebas de su parte pura en `acciones.test.ts`. La pantalla que las llama la
escribe otro agente después, contra las firmas de aquí.

## 2 · La evidencia que ya tenemos

- `apps/web/src/lib/tutor/actions.ts` (te lo doy recortado) es LA forma de la
  casa para una acción: `"use server"`, `requireRole(["guardian"], { onDeny:
  "not-found" })`, Zod sobre el `FormData`, comprobación explícita de que el
  hijo es suyo contra `guardian_students` (copia el `esHijoSuyo` local: no se
  exporta), escritura, y un `TutorState` `{ ok, errorKey?, successKey?,
  values? }` devuelto con `fail()`/`done()`. **Las claves de error son claves
  de diccionario, no frases.** Las tuyas ya existen en `t.tutor.errors`:
  `planPdfInvalido`, `planPdfSinTexto`, `planBoletinRepetido`,
  `planExtraccionInvalida`, `planModeloCaido`, `planSinConfirmar`,
  `planNotaInvalida`, `planSinContenido`, más `notFound` y `generic`.
- Piezas puras (te las doy): `promptDeExtraccion`, `validarExtraccion`,
  `ExtraccionInvalidaError`, `bandaDeNota` (`boletin.ts`);
  `promptDeEstratega`, `validarPropuesta`, `PropuestaInvalidaError`,
  `EntradaEstratega` (`estratega.ts`); `llamarDeepSeek`, `DeepSeekError`
  (`deepseek.ts`); `repartir` y sus tipos desde `@cet/engine`;
  `pdfToSpans` y `PdfSinTextoError` desde `@cet/content/pdf`
  (`pdfToSpans(buf: Buffer): Promise<{ spans: { text: string }[]; pages;
  densidad }>`; el texto plano es `spans.map(s => s.text).join("\n")`).
- Lecturas (te doy `consultas.ts`): `boletinesDeHijo`, `planActivoDeHijo`,
  `inventarioDeContenido`, `leccionesCompletadas`, `masteryDeAlumno`,
  `calendarioDelPlan`, `minutosObservados`, `armarInventarioEstratega`,
  `armarEntradaReparto`, `notaGuardadaSchema`, `repartoGuardadoSchema`.
- `hoyEnZona`, `sumarDias` (`fecha.ts`); `rutasDeHijo(id).plan` es la ruta a
  revalidar (`revalidatePath`).
- Tablas (0091): `boletines`, `planes_de_estudio`, `plan_tareas`,
  `plan_partes` — las columnas están en `consultas.ts`. RLS: el tutor puede
  **insertar** en `boletines` y `planes_de_estudio` con su sesión, pero NO
  actualizar nada ni escribir `plan_tareas`: eso va con `createAdminClient`
  (`@/lib/supabase/admin`, motivo obligatorio), siempre DESPUÉS de comprobar
  que el hijo es suyo. `boletines(student_id, checksum)` es único: un segundo
  insert del mismo PDF falla con `23505`. `planes_uno_activo`: un plan activo
  por alumno.
- Storage: bucket privado `boletines`, ruta `{student_id}/{checksum}.pdf`,
  `application/pdf`, 10 MB. Sube con el cliente admin
  (`admin.storage.from("boletines").upload(ruta, buffer, { contentType:
  "application/pdf", upsert: false })`); si ya existe (error de duplicado),
  no es fallo: el mismo PDF ya está.
- `subjects(id, code)` globales: para pasar de `code` a `subject_id`.
- El hito: de `calendarioDelPlan(año de hoy)`, el primer evento con `desde >
  hoy` de tipo `examenes_finales`, o `hito_cambridge` con `year_levels` nulo.
  Si no hay ninguno, `hasta = hoy + 70 días`. El `titulo` no viene en
  `EventoCalendario`: usa el tipo como nombre del hito.

## 3 · El criterio de aceptación

El `verify` sale en 0. `acciones.ts` exporta exactamente estas cuatro
acciones, todas `(prev: PlanState, fd: FormData) => Promise<PlanState>` con
`PlanState` igual a `TutorState` (defínelo aquí, mismos campos):

1. **`subirBoletin`**. `fd`: `studentId` (uuid), `archivo` (`File`, tipo
   `application/pdf`, ≤ 10 MB; si no → `planPdfInvalido`). Pasos: hijo suyo;
   `Buffer` del fichero; sha256 hex (`node:crypto`); subir a Storage; texto
   con `pdfToSpans` (`PdfSinTextoError` → `planPdfSinTexto`);
   `llamarDeepSeek(promptDeExtraccion(texto))` (`DeepSeekError` →
   `planModeloCaido`); `validarExtraccion(texto, json)`
   (`ExtraccionInvalidaError` → `planExtraccionInvalida`); notas →
   `NotaGuardada[]` resolviendo `subject_id` por `code`; insert en
   `boletines` con la sesión (`school_id` = el del alumno en `profiles`, que
   puede ser null; `modelo`, `tokens_in`, `tokens_out` de la respuesta);
   `23505` → `planBoletinRepetido`. `revalidatePath` y
   `done("planBoletinExtraido", { boletinId })`.
2. **`confirmarBoletin`**. `fd`: `studentId`, `boletinId`, y por cada fila
   `nota:<índice>` (entero 0..100; si alguna falla → `planNotaInvalida`).
   Hijo suyo; boletín del alumno (con la sesión); rehace `notas` con las
   notas corregidas y `banda = bandaDeNota(nota)`; con admin: `update
   boletines set notas, estado = 'confirmado', confirmado_at = now()`.
   `done("planBoletinConfirmado")`.
3. **`proponerPlan`**. `fd`: `studentId`, `boletinId`. Hijo suyo; el boletín
   tiene que estar `confirmado` (si no → `planSinConfirmar`); si ninguna nota
   tiene `code` → `planSinContenido`. Arma `EntradaEstratega` (nombre de pila
   del alumno desde `profiles.full_name`, notas, inventario con
   `armarInventarioEstratega`, ventana `{ desde: hoy, hasta: hito, hito }`,
   `minutosObservados`). `llamarDeepSeek(promptDeEstratega(entrada))`
   (`DeepSeekError` → `planModeloCaido`); `validarPropuesta`
   (`PropuestaInvalidaError` → `planModeloCaido`). **No escribe nada.**
   `done("planPropuesto", { minutosPorDia, pesos: JSON.stringify(reparto),
   recomendaciones: JSON.stringify(recomendaciones), modelo, tokensIn,
   tokensOut, desde, hasta, hito })`.
4. **`fijarPlan`**. `fd`: `studentId`, `boletinId`, `minutosPorDia` (entero
   10..180: lo que el tutor confirmó o cambió), `pesos` (JSON; se revalida con
   `repartoGuardadoSchema.shape`-equivalente: solo claves de materia, suma 1
   ± 0,01), `recomendaciones` (JSON, ≤ 6 cadenas), `modelo`, `tokensIn`,
   `tokensOut`, `desde`, `hasta`. Hijo suyo; boletín confirmado. Arma
   `EntradaReparto` con `armarEntradaReparto` (inventario, completadas,
   mastery, calendario) y llama a `repartir`. Si no produce tareas →
   `planSinContenido`. Con admin y **en este orden**: `update
   planes_de_estudio set activo = false where student_id = … and activo`;
   insert del plan (`reparto = { pesos, techos }`, `recomendaciones`,
   `creado_por`, `modelo`, tokens); insert de `plan_tareas` en lotes de 200
   (`plan_id`, `student_id`, `fecha`, `ord`, `subject_id`, `tipo`,
   `lesson_id`, `skill_id`, `minutos`). Si el insert de tareas falla, borra
   el plan recién creado (cascade) y devuelve `generic`. `revalidatePath` y
   `done("planCreado", { planId, tareas: n, techos: JSON.stringify(techos) })`.

Puro y probado (`acciones.test.ts`, sin base ni red): exporta
`hitoMasCercano(calendario, hoy): { hasta: string; hito: string }`,
`leerNotasCorregidas(fd, notasActuales): NotaGuardada[] | null` (null si
alguna nota no es entero 0..100), `leerPesos(texto): Partial<Record<CodigoMateria, number>> | null`
y pruébalos: hito = finales del 13-11 para hoy 2026-09-02 con el calendario
de la spec; sin eventos → hoy + 70; notas corregidas recalculan la banda;
`leerPesos` rechaza `{ art: 1 }` y una suma de 1,2.

**Ningún `console.*` recibe el texto del PDF, el prompt ni la respuesta**:
son datos de un menor. Los errores se registran por `code`/`message`.

## 4 · Qué NO cuenta como resuelto

- Escalar a admin antes de comprobar que el hijo es suyo, o hacerlo para lo
  que la sesión ya puede (leer el boletín, insertarlo).
- Un `fetch` directo (solo `llamarDeepSeek`).
- Reimplementar la extracción, la validación o el reparto: se importan.
- Devolver frases en vez de claves de diccionario.
- Un plan nuevo sin desactivar el anterior (el índice único lo rechazaría, y
  el error `23505` no es el mensaje que merece el tutor).
- Tocar cualquier fichero fuera de `acciones*`.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
