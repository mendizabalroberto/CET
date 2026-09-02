---
id: rev-1-cancelar-plan
model: chat
territory: [apps/web/src/lib/plan/acciones.ts, apps/web/src/lib/plan/acciones.puras.ts, apps/web/src/lib/plan/acciones.test.ts, apps/web/src/lib/plan/tipos.ts]
forbidden: [apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/i18n/dictionaries/es.ts, apps/web/src/lib/i18n/dictionaries/en.ts, apps/web/src/components/tutor/PlanDeEstudio.tsx, supabase/migrations, packages/ui/src/index.ts]
context: [apps/web/src/lib/plan/acciones.ts, apps/web/src/lib/plan/acciones.puras.ts, apps/web/src/lib/plan/acciones.test.ts, apps/web/src/lib/plan/tipos.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

Un plan de estudio no se puede cancelar: las cuatro acciones de `acciones.ts`
crean y nunca quitan. Y `fijarPlan` desactiva el plan anterior ANTES de insertar
el nuevo; si falla el insert de `plan_tareas`, borra el nuevo (línea ~555) y
deja al alumno sin ningún plan activo.

Hacen falta dos acciones nuevas —`cancelarPlan` y `descartarBoletin`— y que el
rollback de `fijarPlan` reactive lo que desactivó.

## 2 · La evidencia que ya tenemos

- Todas las acciones tienen la misma forma: `(prev: PlanState, fd: FormData) =>
  Promise<PlanState>`, `requireRole(["guardian"], { onDeny: "not-found" })`,
  `esHijoSuyo(tutor.id, studentId)` (línea 103), escrituras con
  `createAdminClient("motivo")` porque la RLS del tutor solo cubre lecturas, y
  `revalidatePath(rutasDeHijo(studentId).plan)` al terminar (líneas 294, 333, 566).
- `fail(errorKey)` y `done(successKey)` (líneas 59-65). Las claves de éxito ya
  se usan: `planBoletinExtraido`, `planBoletinConfirmado`, `planPropuesto`,
  `planCreado`. Las claves nuevas las añade otro contrato al diccionario; aquí
  solo se devuelven los nombres.
- `confirmarBoletin` (línea 298) enseña cómo leer un boletín por id y comprobar
  su `estado`. Los estados son `extraido` y `confirmado`.
- `planes_de_estudio` tiene `id`, `student_id`, `activo`. `plan_tareas` tiene
  `plan_id`. No hay columna `cancelado_at`: NO se añade (las migraciones están
  fuera del territorio). Cancelar = `activo=false`.
- `acciones.test.ts` prueba las funciones puras de `acciones.puras.ts`
  (`hitoMasCercano`, `leerNotasCorregidas`, `leerPesos`). El patrón: la lectura
  del `FormData` va en una función pura y probada, y la acción solo la llama.

## 3 · El criterio de aceptación

El `verify` sale en 0. Además:

1. `export async function cancelarPlan(_prev: PlanState, fd: FormData)`:
   lee `planId` y `studentId` del `FormData` con un helper puro
   `leerIdsDeCancelacion(fd): { planId: string; studentId: string } | null`
   en `acciones.puras.ts` (UUID válidos, o `null`). Sin sesión de tutor o si
   el alumno no es suyo: `fail("notFound")`. Con admin client:
   `update planes_de_estudio set activo=false where id=planId and
   student_id=studentId and activo=true`, pidiendo `.select("id")` para saber
   si tocó una fila. Cero filas → `fail("planNoActivo")`. Error →
   `fail("generic")` con `console.error("[cet] cancelarPlan ...")`. Éxito →
   `revalidatePath` y `done("planCancelado")`. Las `plan_tareas` NO se borran.
2. `export async function descartarBoletin(_prev: PlanState, fd: FormData)`:
   lee `boletinId` y `studentId` con `leerIdsDeDescarte(fd)` (mismo patrón).
   Lee el boletín (`id, student_id, estado`); si no existe o no es del alumno
   → `fail("notFound")`; si `estado !== "extraido"` →
   `fail("planBoletinConfirmadoNoSeDescarta")`. Borra la fila con admin client
   (el PDF de Storage se queda: es idempotente por checksum). Éxito →
   `revalidatePath` y `done("boletinDescartado")`.
3. En `fijarPlan`: antes del `update ... set activo=false`, obtén los `id` de
   los planes activos del alumno (`select id where student_id and activo`).
   En el bloque de rollback de `plan_tareas`, tras borrar el plan nuevo,
   vuelve a poner `activo=true` a esos ids (si hay alguno), y registra con
   `console.error` si esa reactivación falla. El camino feliz no cambia.
4. Tests nuevos en `acciones.test.ts` para `leerIdsDeCancelacion` y
   `leerIdsDeDescarte`: con dos UUID válidos devuelve el par; con uno vacío,
   con un id que no es UUID, o sin el campo, devuelve `null`.

## 4 · Qué NO cuenta como resuelto

- Tocar `consultas.ts`, diccionarios, el componente o las migraciones.
- Borrar `plan_tareas` al cancelar, o borrar un boletín `confirmado`.
- Un `window.confirm` o cualquier interfaz: esto es solo servidor.
- Usar `createClient` (RLS del tutor) para escribir: no tiene permiso, y el
  fallo sería silencioso. Las escrituras van por `createAdminClient` con motivo.
- Saltarse `esHijoSuyo`: un tutor solo cancela lo de sus hijos.
- Añadir claves a `t.tutor.errors` o inventar textos de cara al usuario.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
