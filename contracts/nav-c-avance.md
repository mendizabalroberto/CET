---
id: nav-c-avance
model: claude
territory:
  - apps/web/src/components/learn/lesson-progress.ts
  - apps/web/src/components/learn/lesson-progress.test.ts
  - apps/web/src/components/learn/progreso-de-lecciones-tiene-fuente-viva.test.ts
forbidden:
  - packages/ui/**
  - apps/web/src/components/learn/queries.ts
  - apps/web/src/components/learn/practice-progress.ts
  - apps/web/src/app/**
context:
  - apps/web/src/components/learn/practice-progress.ts
  - apps/web/src/components/learn/queries.ts
  - apps/web/src/components/learn/progreso-tiene-fuente-viva.test.ts
  - packages/shared/src/events.ts
  - supabase/migrations/0010_telemetry.sql
  - docs/superpowers/specs/2026-08-28-navegacion-visual-materias-design.md
verify: cd apps/web && pnpm vitest run src/components/learn/lesson-progress.test.ts src/components/learn/progreso-de-lecciones-tiene-fuente-viva.test.ts && pnpm typecheck
setup: ninguno
rounds: 5
---

## 1 · El problema

Las tarjetas de materia de `/learn` tienen que decir cuántas lecciones lleva el
alumno terminadas y cuántas tiene empezadas. Ese dato no existe todavía como
función. Te toca **la reducción de eventos a avance por lección**.

Otros dos agentes hacen los componentes visuales en `packages/ui`. Tú no tocas
nada de `packages/ui`.

## 2 · De dónde sale el dato, y de dónde NO

De `learning_events`. Dos tipos de evento, los dos **se emiten de verdad hoy**,
comprobado en el árbol:

- `lesson_opened` — lo emite `LessonOpened` de `components/learn/LessonTracking.tsx`
  al abrir la lección;
- `lesson_completed` — lo emite `LessonCompleteButton`, montado en
  `app/(student)/learn/[lessonId]/page.tsx`.

Ambos traen `lesson_id` en su columna (no en el `payload`): ver
`supabase/migrations/0010_telemetry.sql`.

**NO sale de `skill_mastery`.** Esa tabla tiene CERO filas en producción y nadie
la escribe. Ya hubo un medidor colgado de ella en esta misma pantalla, y llevaba
desde siempre pintando vacío sin que se pudiera distinguir «este alumno no ha
practicado» de «esta tabla no la rellena nadie». Lee la cabecera de
`practice-progress.ts`: es la misma disciplina, y tu módulo es su hermano.

## 3 · Qué escribes

`apps/web/src/components/learn/lesson-progress.ts`, con la misma forma que
`practice-progress.ts`: **la reducción es pura y exportada**, separada de la
consulta. Eso es lo que hace que se pueda probar sin base de datos, y es la
razón de que `practice-progress.ts` esté partido así.

```ts
export type LessonState = "started" | "completed";

/** Una fila de learning_events ya reducida a lo que importa. */
export interface LessonEvent {
  readonly lessonId: string;
  readonly type: "lesson_opened" | "lesson_completed";
}

/** Convierte filas crudas de PostgREST en eventos utiles, descartando sin ruido. */
export function readLessonEvents(rows: readonly unknown[]): LessonEvent[];

/** lessonId -> estado. `completed` gana siempre sobre `started`. */
export function summariseLessonEvents(events: readonly LessonEvent[]): Map<string, LessonState>;

/** Cuenta {completed, started} de una lista de ids de leccion. */
export function countLessons(
  lessonIds: readonly string[],
  progress: ReadonlyMap<string, LessonState>,
): { readonly completed: number; readonly started: number };
```

Reutiliza las constantes de ventana que ya existen y **no las copies**:
`LOOKBACK_DAYS` y `MAX_EVENT_ROWS` están exportadas por `practice-progress.ts`.
Dos ventanas distintas para el mismo alumno en la misma pantalla serían un bug
silencioso.

## 4 · Las decisiones que tienes que respetar

1. **`completed` gana sobre `started`, siempre y en cualquier orden de llegada.**
   Los eventos llegan en lote y desordenados: un `lesson_opened` posterior a un
   `lesson_completed` no degrada la lección. Si tu reducción depende del orden,
   está mal.
2. **Una fila con forma rara se descarta sin ruido y sin contar.** El `payload`
   es `jsonb` y la base no garantiza su forma; un `lesson_id` que no sea una
   cadena, o un `event_type` de otra familia, no puede contaminar un contador ni
   hacer saltar una excepción en la pantalla de un niño.
3. **`countLessons` cuenta sobre los ids que le dan, no sobre el mapa.** Una
   lección despublicada sigue teniendo eventos; si contaras el mapa, la materia
   diría «13 de 12».
4. **Nada de `throw`.** Este fichero se lee desde un Server Component; una
   excepción aquí es la pantalla roja de `app/error.tsx` por un evento viejo.

## 5 · El criterio de aceptación

```
cd apps/web && pnpm vitest run src/components/learn/lesson-progress.test.ts src/components/learn/progreso-de-lecciones-tiene-fuente-viva.test.ts && pnpm typecheck
```

`lesson-progress.test.ts` debe cubrir, como mínimo:

- `completed` gana sobre `started` **en los dos órdenes de llegada**;
- filas basura (sin `lesson_id`, con `lesson_id` numérico, con `event_type`
  desconocido, `null`, cadena suelta) se descartan y no cuentan;
- `countLessons` sobre ids que no están en el mapa da ceros, y **nunca** cuenta
  entradas del mapa que no estén en la lista de ids;
- una lección con sólo `lesson_opened` cuenta como `started` y **no** como
  `completed`.

`progreso-de-lecciones-tiene-fuente-viva.test.ts` es un test de invariante, a
imagen de `progreso-tiene-fuente-viva.test.ts` que ya existe (léelo): comprueba
por código que el fichero **no menciona `skill_mastery`** y que los tipos de
evento que usa son exactamente los dos que la aplicación emite. Si mañana
alguien cuelga esto de una tabla muerta, se pone rojo.

## 6 · Qué NO cuenta como resuelto

- Leer `skill_mastery`, aunque sea «por si acaso» o como respaldo.
- Duplicar `LOOKBACK_DAYS` / `MAX_EVENT_ROWS` en vez de importarlas.
- Una reducción que dependa del orden de los eventos.
- Un `throw` en cualquier camino.
- Escribir la consulta a Supabase: `queries.ts` está en tu `forbidden` y lo
  integra el supervisor. Tú entregas la reducción pura y sus pruebas.
