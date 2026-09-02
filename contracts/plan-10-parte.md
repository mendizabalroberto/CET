---
id: plan-10-parte
model: reasoner
territory: [apps/web/src/app/api/plan/**, apps/web/src/lib/plan/parte*, apps/web/vercel.json]
forbidden: [apps/web/src/lib/telegram/bot.ts, apps/web/src/lib/supabase/admin.ts, apps/web/src/lib/plan/fecha.ts, apps/web/src/app/api/telegram/webhook/route.ts]
context: [apps/web/src/app/api/telegram/webhook/route.ts, apps/web/src/lib/telegram/bot.ts, apps/web/src/lib/supabase/admin.ts, apps/web/src/lib/plan/fecha.ts, apps/web/vercel.json, supabase/migrations/0086_logro_diario.sql]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/app/api/plan src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/parte src/app/api/plan
rounds: 4
deadline: 4 rondas o 40 min
---

## 1 · El problema

El tutor tiene que saber cada noche si lo planificado ocurrió. Hace falta un
**parte nocturno**: una ruta `/api/plan/parte-diario` que un cron de Vercel
dispara a las 21:00 de Bolivia (`0 1 * * *` UTC), escribe una fila en
`plan_partes` por plan activo y manda un mensaje corto por Telegram. Te toca
la ruta (`apps/web/src/app/api/plan/parte-diario/route.ts` y su
`route.test.ts`), la parte pura (`apps/web/src/lib/plan/parte.ts` +
`parte.test.ts`) y el cron en `apps/web/vercel.json`.

## 2 · La evidencia que ya tenemos

- `apps/web/src/app/api/telegram/webhook/route.ts` (te lo doy) es la forma
  de la casa para una ruta protegida por secreto: `export const dynamic =
  "force-dynamic"; export const runtime = "nodejs";`, secreto comprobado
  ANTES de nada con `igualEnTiempoConstante` de `@/lib/telegram/bot`, y la
  ausencia del secreto en el entorno se trata como fallo, no como «entonces
  no hace falta».
- Vercel llama a un cron con `GET` y la cabecera `Authorization: Bearer
  <CRON_SECRET>`, donde `CRON_SECRET` es una variable de entorno del proyecto.
- `enviarMensaje(chatId: number, texto: string): Promise<boolean>` y
  `telegramDisponible()` están en `@/lib/telegram/bot` (te lo doy).
- `createAdminClient(motivo)` (`@/lib/supabase/admin`, te lo doy) escala a
  `service_role`; aquí no hay sesión, así que es lo que toca, con motivo.
- `hoyEnZona()` y `sumarDias()` en `@/lib/plan/fecha` (te lo doy). La zona
  del plan es `America/La_Paz` (UTC-4, sin horario de verano).
- Tablas: `planes_de_estudio(id, student_id, activo, …)`; `plan_tareas(plan_id,
  student_id, fecha, ord, subject_id, tipo, lesson_id, skill_id, minutos)`;
  `plan_partes(plan_id, student_id, fecha, minutos_previstos, minutos_medidos
  numeric(6,1), items_respondidos, aciertos, enviado_at)` con índice ÚNICO
  `(plan_id, fecha)`: un segundo insert falla con el código `23505`.
  `profiles(id, full_name)`; `subjects(id, code, name jsonb {en, es})`;
  `guardian_students(guardian_id, student_id, revoked_at)`;
  `telegram_de_tutor(guardian_id, chat_id bigint)` (solo `service_role` lee
  `chat_id`); `learning_events(student_id, event_type, lesson_id, skill_id,
  server_ts)`.
- RPC (te doy 0086 como referencia): `informe_alumno_serie_diaria(p_student_id,
  p_desde timestamptz, p_hasta timestamptz)` → `{fecha, minutos_estudio,
  sesiones}[]`; `informe_alumno_logro_diario(...)` → `{fecha, terminadas,
  respondidas, acertadas}[]`. Ventana SEMIABIERTA `[desde, hasta)`. Con
  `service_role` las dos funcionan. Para el día `F` en La Paz, la ventana es
  `F 00:00 -04:00` → `F+1 00:00 -04:00`.
- El texto del parte, corto y sin adjetivos (spec §11):

  > **Leo — miércoles 2 de septiembre**
  > Previsto 45 min · estudiado **12 min**
  > 8 ítems, 5 aciertos
  > Pendiente de hoy: English (25 min)

  Telegram acepta `parse_mode` HTML si `enviarMensaje` lo usa; mira `bot.ts`
  y ajústate a lo que haga (si manda texto plano, sin negritas).

## 3 · El criterio de aceptación

El `verify` sale en 0.

### 3.1 · `parte.ts`, puro y probado

```ts
export interface DatosDelParte { nombre: string; fecha: string /* YYYY-MM-DD */; minutosPrevistos: number; minutosMedidos: number; itemsRespondidos: number; aciertos: number; pendientes: { materia: string; minutos: number }[] }
export function textoDelParte(d: DatosDelParte): string;            // español, formato de arriba; fecha como «miércoles 2 de septiembre» (Intl, es-ES, sin año); minutos medidos redondeados; sin línea «Pendiente» si no hay
export function ventanaDelDia(fecha: string): { desde: string; hasta: string }; // ISO con offset -04:00: "2026-09-02T00:00:00-04:00" → "2026-09-03T00:00:00-04:00"
export function esViolacionDeUnicidad(error: { code?: string | null } | null | undefined): boolean; // code === "23505"
export function pendientesDelDia(tareas: readonly { subjectId: string; materia: string; tipo: "leccion" | "practica"; lessonId: string | null; skillId: string | null; minutos: number }[], eventos: readonly { event_type: string; lesson_id: string | null; skill_id: string | null }[]): { materia: string; minutos: number }[];
```

`pendientesDelDia`: una tarea `leccion` está hecha si hay un
`lesson_completed` con su `lesson_id`; una `practica`, si hay algún
`answer_submitted` con su `skill_id`. Lo no hecho se suma por materia, en el
orden de primera aparición.

### 3.2 · La ruta

`GET`:

1. Sin `CRON_SECRET` en el entorno → `console.error` y `503`. Con cabecera
   ausente o distinta (`igualEnTiempoConstante`) → `401`. **Nada de esto toca
   la base.**
2. `hoy = hoyEnZona()`. Cliente admin con motivo.
3. Planes activos con el nombre del alumno (`profiles.full_name`, nombre de
   pila = primera palabra).
4. Por plan: tareas de hoy con `subjects(code, name)`; `minutos_previstos` =
   suma; eventos de hoy del alumno (`lesson_completed`, `answer_submitted`,
   `server_ts` en la ventana); serie diaria y logro diario con la ventana
   (fila de `hoy` o ceros).
5. Insert en `plan_partes`. Si `esViolacionDeUnicidad` → ese plan cuenta como
   `repetidos` y se pasa al siguiente **sin mandar nada**. Otro error → se
   registra por `code`/`message` y se sigue.
6. Tutores vinculados (`revoked_at is null`) con `chat_id`: `enviarMensaje` a
   cada uno; si al menos uno devuelve `true`, `update plan_partes set
   enviado_at = now()` para esa fila. Sin chat vinculado, el parte se queda
   escrito igual.
7. Respuesta `200` JSON `{ fecha, procesados, enviados, repetidos, errores }`.

### 3.3 · `vercel.json`

Añade `"crons": [{ "path": "/api/plan/parte-diario", "schedule": "0 1 * * *" }]`
conservando las cabeceras que ya hay.

### 3.4 · `route.test.ts`

Con `vi.stubEnv`: sin `CRON_SECRET` → 503; con secreto y cabecera mala → 401;
con cabecera buena y el cliente admin **mockeado** (`vi.mock("@/lib/supabase/admin")`)
para que `from("planes_de_estudio")` devuelva cero planes → 200 con
`procesados: 0`. Sin red y sin base.

`parte.test.ts`: `textoDelParte` con el ejemplo del spec (2026-09-02 es
miércoles) produce exactamente esas cuatro líneas; sin pendientes, tres
líneas; `ventanaDelDia("2026-09-02")`; `esViolacionDeUnicidad` con `23505`,
`23514`, `null`; `pendientesDelDia` con una lección hecha, una no, y una
práctica con respuesta.

## 4 · Qué NO cuenta como resuelto

- Un `if` que evite el insert duplicado consultando antes: la idempotencia la
  da el índice único, y el test del `23505` lo demuestra.
- Comprobar el secreto después de tocar la base, o aceptar la petición si
  `CRON_SECRET` no está definido.
- `fetch` directo (solo `enviarMensaje`, que ya lleva plazo).
- Un parte con adjetivos, brecha en porcentaje o tendencia: cuatro líneas.
- Tocar `bot.ts`, `admin.ts`, `fecha.ts` o el webhook de Telegram.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
