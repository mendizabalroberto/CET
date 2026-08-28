/**
 * Avance por LECCIÓN, derivado de eventos reales.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * DE DÓNDE SALE EL DATO, Y DE DÓNDE **NO**
 * ===========================================================================
 * De `learning_events`, con dos tipos de evento y sólo dos:
 *
 *   · `lesson_opened`    — lo emite `LessonOpened` (`learn/LessonTracking.tsx`)
 *                          al montarse la lección;
 *   · `lesson_completed` — lo emite `LessonCompleteButton` (mismo fichero),
 *                          montado en `app/(student)/learn/[lessonId]/page.tsx`.
 *
 * Los dos se emiten HOY, no son un contrato aspiracional. Y los dos traen la
 * lección en la COLUMNA `lesson_id`, no dentro del `payload` (ver
 * `supabase/migrations/0010_telemetry.sql`): por eso aquí se lee la columna. Un
 * lector que fuera al payload compilaría igual y contaría cero para siempre.
 *
 * **NO sale de `skill_mastery`.** Esa tabla tiene CERO filas en producción y
 * NADIE la escribe: ni proyección, ni RPC, ni política de escritura, ni grant.
 * Ya hubo un medidor colgado de ella en esta misma pantalla, y llevaba desde
 * siempre pintando vacío sin que se pudiera distinguir «este alumno no ha
 * empezado» de «esta tabla no la rellena nadie». Ese fallo se quitó, no se
 * maquilló, y `progreso-de-lecciones-tiene-fuente-viva.test.ts` impide que
 * vuelva por esta puerta. Es la misma disciplina de `practice-progress.ts`:
 * este módulo es su hermano.
 *
 * ===========================================================================
 * POR QUÉ LA REDUCCIÓN ES PURA Y VIVE APARTE DE LA CONSULTA
 * ===========================================================================
 * Igual que en `practice-progress.ts`: la consulta (`queries.ts`) necesita
 * Supabase, sesión y red; la reducción no necesita nada. Partirlo así es lo que
 * permite probar sin base de datos las reglas que de verdad se pueden romper
 * —el orden de llegada, la fila con forma rara, el denominador— en vez de
 * probar que un mock devuelve lo que le hemos metido.
 *
 * La ventana temporal y el tope de filas se IMPORTAN de `practice-progress.ts`
 * y no se copian. Dos ventanas distintas para el mismo alumno en la misma
 * pantalla serían un bug silencioso: la práctica diría «90 días» y las lecciones
 * otra cosa, y nadie lo vería hasta que un alumno se quejara de que su avance
 * «se ha borrado».
 *
 * ===========================================================================
 * NADA DE `throw`
 * ===========================================================================
 * Esto se lee desde un Server Component. Una excepción aquí no es un fallo de
 * datos: es la pantalla roja de `app/error.tsx` en el portátil de un niño, por
 * culpa de un evento viejo con una forma que ya nadie recuerda. Todo lo que no
 * encaja se descarta en silencio y no cuenta.
 */

// Reexportadas a propósito para que quien lea este módulo vea la ventana con la
// que trabaja sin ir a buscarla, pero SIN declararla dos veces.
export { LOOKBACK_DAYS, MAX_EVENT_ROWS } from "./practice-progress";

/**
 * Lo que se le puede decir a un alumno de una lección.
 *
 * No hay un tercer estado «no empezada»: la ausencia en el mapa ES ese estado.
 * Materializarlo obligaría a inventar una entrada por cada lección publicada y
 * a mantenerla sincronizada con el catálogo, que es justo el trabajo que hace
 * `countLessons` con los ids que le dan.
 */
export type LessonState = "started" | "completed";

/** Una fila de `learning_events` ya reducida a lo que importa aquí. */
export interface LessonEvent {
  readonly lessonId: string;
  readonly type: "lesson_opened" | "lesson_completed";
}

/** Los únicos dos tipos que esta reducción entiende. Cualquier otro se descarta. */
const TIPOS: Readonly<Record<string, LessonEvent["type"]>> = {
  lesson_opened: "lesson_opened",
  lesson_completed: "lesson_completed",
};

/**
 * Convierte las filas crudas de PostgREST en eventos útiles.
 *
 * Descarta sin ruido todo lo que no traiga un `lesson_id` de texto no vacío y
 * un `event_type` de esta familia. `lesson_id` es `uuid` en la base y llega
 * como cadena; si llegara un número, una fecha o un `null` es que la fila no es
 * lo que creemos, y contarla sería peor que perderla. Una fila descartada no
 * cuenta ni como empezada ni como terminada.
 */
export function readLessonEvents(rows: readonly unknown[]): LessonEvent[] {
  const out: LessonEvent[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const lessonId = r.lesson_id;
    const eventType = r.event_type;
    if (typeof lessonId !== "string" || lessonId.length === 0) continue;
    if (typeof eventType !== "string") continue;
    const type = TIPOS[eventType];
    if (type === undefined) continue;
    out.push({ lessonId, type });
  }
  return out;
}

/**
 * `lessonId` -> estado. **`completed` gana siempre sobre `started`**, llegue
 * como llegue.
 *
 * Los eventos vienen en lote y desordenados (regla 3 de `packages/shared/src/
 * events.ts`: los relojes mienten y los lotes se reintentan), así que la
 * reducción NO puede ser «el último gana». Un `lesson_opened` posterior a un
 * `lesson_completed` no es una lección que se haya des-terminado: es un alumno
 * que ha vuelto a leerla. Degradarla ahí le borraría el logro por repasar, que
 * es exactamente lo contrario de lo que queremos premiar.
 */
export function summariseLessonEvents(
  events: readonly LessonEvent[],
): Map<string, LessonState> {
  const out = new Map<string, LessonState>();
  for (const event of events) {
    if (event.type === "lesson_completed") {
      out.set(event.lessonId, "completed");
      continue;
    }
    // `started` sólo escribe donde no hay nada: nunca pisa un `completed`.
    if (!out.has(event.lessonId)) out.set(event.lessonId, "started");
  }
  return out;
}

/**
 * Cuenta terminadas y empezadas **sobre los ids que le dan**, no sobre el mapa.
 *
 * La diferencia no es un detalle de estilo. Una lección despublicada, movida a
 * otro módulo o borrada del catálogo sigue teniendo sus eventos en
 * `learning_events` —son hechos históricos y no se borran—, así que contar las
 * entradas del mapa haría que una materia dijese «13 de 12 terminadas». El
 * catálogo manda sobre el denominador Y sobre el numerador.
 *
 * `started` es «empezada y no terminada»: son dos rótulos que se enseñan a la
 * vez («3 de 12 terminadas · 2 en marcha») y sumarían dos veces la misma
 * lección si `completed` contara también como empezada.
 */
export function countLessons(
  lessonIds: readonly string[],
  progress: ReadonlyMap<string, LessonState>,
): { readonly completed: number; readonly started: number } {
  let completed = 0;
  let started = 0;
  for (const id of lessonIds) {
    const state = progress.get(id);
    if (state === "completed") completed += 1;
    else if (state === "started") started += 1;
  }
  return { completed, started };
}
