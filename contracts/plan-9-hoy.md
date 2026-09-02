---
id: plan-9-hoy
model: reasoner
territory: [apps/web/src/app/(student)/learn/hoy/**]
forbidden: [apps/web/src/lib/i18n/dictionaries/learn.en.ts, apps/web/src/lib/i18n/dictionaries/learn.es.ts, apps/web/src/lib/routes.ts, apps/web/src/lib/plan/fecha.ts, packages/ui/src/index.ts]
context: [apps/web/src/app/(student)/learn/page.tsx, apps/web/src/components/learn/dictionary.ts, apps/web/src/lib/i18n/dictionaries/learn.en.ts, apps/web/src/lib/plan/fecha.ts, apps/web/src/lib/auth/session.ts, packages/ui/src/navigation/LessonTile.tsx, packages/ui/src/navigation/SubjectIcon.tsx]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint "src/app/(student)/learn/hoy" && pnpm --filter @cet/web exec vitest run "src/app/(student)/learn/hoy"
rounds: 4
deadline: 4 rondas o 40 min
---

## 1 · El problema

El niño entra a `/learn` y elige materia por intuición. Con un plan de estudio
activo, tiene que poder ver **qué le toca hoy**: la ruta nueva `/learn/hoy`.
Te toca la carpeta `apps/web/src/app/(student)/learn/hoy/`: `page.tsx`
(Server Component), `consulta.ts` (la lectura) y `presentar.ts` +
`presentar.test.ts` (la parte pura: de filas a tarjetas). El enlace desde
`/learn` lo añade el supervisor.

## 2 · La evidencia que ya tenemos

- `apps/web/src/app/(student)/learn/page.tsx` (te lo doy) es la forma de la
  casa para una pantalla de alumno: `requireStudent()`, `resolveLocale()`,
  `getLearnDictionary(locale)`, `UiLocaleProvider`, componentes de `@cet/ui`
  (`EmptyState`, `ErrorState`, `SubjectIcon`, `LessonTile`…), sin JavaScript
  propio.
- Las cadenas ya existen en `learn.en.ts`/`learn.es.ts` bajo `today` (te doy
  el inglés): `title`, `subtitle`, `noPlanTitle`, `noPlanBody`,
  `freeDayTitle`, `freeDayBody`, `errorTitle`, `errorBody`, `minutes`
  (`{count} min`), `lesson`, `practice`, `open`, `taskOf` (`Tarea {n} de
  {total}`), `backToLessons`. `interpolate` está en `@/lib/i18n`. **No añadas
  claves**: los diccionarios están fuera de tu territorio.
- `ROUTES.studentToday === "/learn/hoy"` ya existe en `@/lib/routes`.
- `hoyEnZona()` (`@/lib/plan/fecha`) devuelve el `YYYY-MM-DD` de hoy en la
  zona del plan. Úsalo; no `new Date().toISOString()`.
- La tabla `plan_tareas(id, plan_id, student_id, fecha, ord, subject_id,
  tipo 'leccion'|'practica', lesson_id, skill_id, minutos)`. RLS: el alumno ve
  sus filas (`student_id = auth.uid()`), sin filtro de fecha en la política.
  **El alumno NO puede leer `planes_de_estudio`**: para saber si tiene plan,
  mira si existe alguna `plan_tareas` suya (de cualquier fecha). Los FK
  permiten embeber: `subjects(code, name)`, `lessons(title)`,
  `skills(code, name)`. `name`/`title` son `I18nText` (`{en, es}`); resuélvelos
  con `resolveI18n` de `@cet/shared` como hace `learn/page.tsx`.
- Destinos: una tarea `leccion` enlaza a `/learn/${lessonId}`; una `practica`,
  a `/practice/${skillCode}` (el `code` de la skill, no su id).

## 3 · El criterio de aceptación

`pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint "src/app/(student)/learn/hoy" && pnpm --filter @cet/web exec vitest run "src/app/(student)/learn/hoy"` sale en 0.

- `consulta.ts`: `export async function tareasDeHoy(): Promise<{ estado: "ok"; hayPlan: boolean; filas: FilaTarea[] } | { estado: "error" }>` con el cliente de sesión (`createClient` de `@/lib/supabase/server`). Dos consultas: las tareas de `hoyEnZona()` ordenadas por `ord` con los embebidos, y un `head`/`count` de si existe alguna tarea del alumno. Filtra por `student_id` explícito además de la RLS. Nunca lanza.
- `presentar.ts`: `export function presentarTareas(filas: readonly unknown[], locale: Locale): TareaDeHoy[]` — valida cada fila (descarta las raras), resuelve nombres al idioma, construye `href`, `subjectCode`, `tipo`, `minutos`, `titulo`. Pura.
- `page.tsx`: tres estados, sin lista vacía jamás: sin plan → `EmptyState` con `noPlan*`; con plan y sin tareas hoy → `EmptyState` con `freeDay*`; error → `ErrorState`. Con tareas: cabecera (`title`, `subtitle`), y una lista `<ol>` de tarjetas, cada una un enlace real con `SubjectIcon` de la materia, el título, `lesson`/`practice`, `minutes` y `taskOf`. Un enlace a `ROUTES.studentHome` con `backToLessons`. **Ni una cifra de brecha, tendencia o atraso**: el niño ve sus tareas de hoy y nada más.
- `presentar.test.ts`: una fila de lección y una de práctica salen con sus `href` correctos y sus títulos en `es`; una fila sin `subjects` se descarta; el orden de `ord` se respeta.

## 4 · Qué NO cuenta como resuelto

- Texto de cara al usuario escrito a mano en el componente: todo sale del diccionario (AD-7).
- Mostrar cuánto lleva atrasado, la brecha o una tendencia.
- Tocar los diccionarios, `routes.ts`, `fecha.ts` o `learn/page.tsx`.
- `"use client"` en la página: es un Server Component sin interacción.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
