/**
 * Progreso PERSISTENTE por grupo de práctica, derivado de eventos reales.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * DE DÓNDE SALE EL DATO, Y DE DÓNDE **NO**
 * ===========================================================================
 * De `learning_events`, evento `practice_item_answered`, agrupado por
 * `payload.engineKey`. Ese payload lo escribe `practice-machine.ts` y contiene
 * `{ engineKey, skillCode, isCorrect, pointsAwarded, maxPoints, seed }`.
 * Comprobado contra producción el 27/08/2026: los eventos llegan desde que se
 * arregló la ingesta (migraciones 0023/0024).
 *
 * **NO sale de `skill_mastery`.** Esa tabla existe, tiene RLS, tiene índices y
 * la lee `getStudentCourses()`... y tiene CERO filas en producción, porque
 * NADIE la escribe: no hay proyección, y la RPC `app.recompute_skill_mastery`
 * que promete `modules/analytics/CLAUDE.md` no existe en la base de datos
 * (`pg_proc` no devuelve ninguna función con "mastery" en el nombre). Además
 * `authenticated` solo tiene `select` sobre ella. Construir estos indicadores
 * sobre `skill_mastery` habría producido barras perfectamente creíbles y
 * eternamente vacías, que es justo la familia de fallos que este proyecto
 * persigue. Cuando exista la proyección, este módulo puede pasar a leerla; el
 * contrato de salida (`TopicProgress`) no cambia.
 *
 * ===========================================================================
 * QUÉ ES `recentAccuracy` Y QUÉ NO ES
 * ===========================================================================
 * Es el porcentaje de aciertos en las ÚLTIMAS `WINDOW` respuestas de ese grupo.
 * No es `skill_mastery.mastery` (que pondera dificultad, tiempo y decaimiento);
 * es un proxy declarado. Se usa la VENTANA reciente y no el total histórico a
 * propósito: con el total, un alumno que fallaba en marzo y hoy lo domina sigue
 * viendo "Empezando" durante cientos de preguntas, y eso desanima a quien acaba
 * de mejorar. La ventana hace que mejorar se note hoy.
 *
 * Los umbrales de nivel son los de `masteryLevel()` de `@cet/ui`, importados y
 * no copiados: una sola fuente para el vocabulario que ve el alumno.
 */
import { masteryLevel, type MasteryLevel } from "@cet/ui";

/** Últimas respuestas que cuentan para el nivel de un grupo. */
export const WINDOW = 10;

/**
 * Por debajo de esto no se pinta nivel ninguno.
 *
 * Con una sola respuesta acertada saldría "Dominado", que es mentira y además
 * cruel la segunda vez. Cuatro es el mínimo con el que un 100 % ya no es ruido
 * puro, y es alcanzable en menos de dos minutos.
 */
export const MIN_EVIDENCE = 4;

/** Ventana temporal de la consulta. Ver `getPracticeProgress` en `queries.ts`. */
export const LOOKBACK_DAYS = 90;

/** Tope de filas leídas. Acota el coste pase lo que pase con el histórico. */
export const MAX_EVENT_ROWS = 500;

/** Los cuatro tramos en orden. Duplicar este orden en otro sitio sería un bug. */
const LEVELS: readonly MasteryLevel[] = ["starting", "learning", "solid", "mastered"];

/** Umbral de entrada de cada tramo, tal y como los aplica `masteryLevel()`. */
const ENTRY_THRESHOLD: Readonly<Record<MasteryLevel, number>> = {
  starting: 0,
  learning: 0.3,
  solid: 0.6,
  mastered: 0.85,
};

/**
 * El siguiente objetivo del alumno. Tres formas, y ninguna es un porcentaje.
 *
 *  - `need_evidence`: aún no sabemos su nivel. Le falta responder N preguntas
 *    (N <= MIN_EVIDENCE). Es la única forma que aparece antes de tener nivel.
 *  - `to_next_level`: le faltan N aciertos para subir un peldaño. N está acotado
 *    por WINDOW por construcción (con la ventana llena de aciertos el ratio es
 *    1.0, que supera cualquier umbral), así que NUNCA puede salir un número
 *    grande. Es la defensa contra "te faltan 200 preguntas".
 *  - `mastered`: no falta nada. No se inventa un objetivo donde no lo hay.
 */
export type NextStep =
  | { readonly kind: "need_evidence"; readonly questions: number }
  | { readonly kind: "to_next_level"; readonly correct: number; readonly level: MasteryLevel }
  | { readonly kind: "mastered" };

export interface TopicProgress {
  /** `engineKey` del generador: `math.compare`. Es la identidad del grupo. */
  readonly engineKey: string;
  /** Respuestas en la ventana reciente (<= WINDOW). */
  readonly windowAnswered: number;
  /** Aciertos dentro de esa ventana. */
  readonly windowCorrect: number;
  /** Respuestas totales leídas en los últimos LOOKBACK_DAYS días. */
  readonly totalAnswered: number;
  /** Aciertos totales en ese mismo periodo. */
  readonly totalCorrect: number;
  /** Aciertos / respuestas en la ventana. `null` si no hay evidencia suficiente. */
  readonly recentAccuracy: number | null;
  /** Nivel derivado. `null` si no hay evidencia suficiente: NO se pinta nada. */
  readonly level: MasteryLevel | null;
  readonly nextStep: NextStep;
}

/** Una fila de `learning_events` ya reducida a lo que importa aquí. */
export interface AnsweredEvent {
  readonly engineKey: string;
  readonly isCorrect: boolean;
}

/**
 * Convierte las filas crudas de PostgREST en eventos útiles.
 *
 * Descarta sin ruido lo que no tenga `engineKey` de texto o `isCorrect` booleano:
 * el payload es `jsonb` y la base no puede garantizar su forma, así que un evento
 * viejo con otro esquema no puede contaminar un contador. Un evento descartado
 * no cuenta ni como acierto ni como fallo.
 */
export function readAnsweredEvents(rows: readonly unknown[]): AnsweredEvent[] {
  const out: AnsweredEvent[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const payload = (row as { payload?: unknown }).payload;
    if (typeof payload !== "object" || payload === null) continue;
    const p = payload as Record<string, unknown>;
    const engineKey = p.engineKey;
    const isCorrect = p.isCorrect;
    if (typeof engineKey !== "string" || engineKey.length === 0) continue;
    if (typeof isCorrect !== "boolean") continue;
    out.push({ engineKey, isCorrect });
  }
  return out;
}

/**
 * Cuántos aciertos SEGUIDOS hacen falta para alcanzar `threshold` en la ventana.
 *
 * Simula: cada acierto entra en la ventana y, si estaba llena, empuja al más
 * viejo fuera. Devuelve `null` si no se alcanza en WINDOW intentos — que no
 * puede pasar con estos umbrales, pero se declara en vez de asumirse.
 */
export function correctsToReach(
  windowAnswered: number,
  windowCorrect: number,
  threshold: number,
): number | null {
  let answered = windowAnswered;
  let correct = windowCorrect;
  for (let k = 1; k <= WINDOW; k += 1) {
    if (answered >= WINDOW) {
      // La ventana está llena: el nuevo acierto expulsa a la respuesta más
      // antigua. En el peor caso la expulsada era un acierto, y asumir eso es
      // lo prudente: prometer menos esfuerzo del real sería mentir.
      correct = Math.max(0, correct - (correct >= answered ? 1 : 0)) + 1;
    } else {
      answered += 1;
      correct += 1;
    }
    if (correct / answered >= threshold) return k;
  }
  return null;
}

/** El objetivo siguiente a partir de la ventana. Ver `NextStep`. */
export function nextStepFor(windowAnswered: number, windowCorrect: number): NextStep {
  if (windowAnswered < MIN_EVIDENCE) {
    return { kind: "need_evidence", questions: MIN_EVIDENCE - windowAnswered };
  }
  const level = masteryLevel(windowCorrect / windowAnswered);
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  if (nextLevel === undefined) return { kind: "mastered" };

  const needed = correctsToReach(windowAnswered, windowCorrect, ENTRY_THRESHOLD[nextLevel]);
  // Inalcanzable en una ventana: se degrada a "sigue practicando" en forma de un
  // solo acierto pedido. Nunca a un número grande. Ver la cabecera de NextStep.
  return { kind: "to_next_level", correct: needed ?? 1, level: nextLevel };
}

/**
 * Agrega los eventos por grupo. **`rows` tiene que venir del MÁS RECIENTE al
 * más antiguo**: la ventana son los `WINDOW` primeros de cada grupo.
 *
 * Se agrupa por `engineKey` y no por `topicId` porque `topicId` vale `"mix"` en
 * las sesiones mezcladas: una respuesta acertada de fracciones dentro de una
 * mezcla es progreso de fracciones, y contarla en un grupo llamado "Mezcla"
 * sería perder el dato. Por eso el chip `mix` nunca tiene barra: no es un grupo,
 * es un sorteo entre los demás.
 */
export function summarisePracticeEvents(
  rows: readonly AnsweredEvent[],
): Map<string, TopicProgress> {
  const acc = new Map<
    string,
    { windowAnswered: number; windowCorrect: number; total: number; totalCorrect: number }
  >();

  for (const event of rows) {
    const current = acc.get(event.engineKey) ?? {
      windowAnswered: 0,
      windowCorrect: 0,
      total: 0,
      totalCorrect: 0,
    };
    current.total += 1;
    if (event.isCorrect) current.totalCorrect += 1;
    if (current.windowAnswered < WINDOW) {
      current.windowAnswered += 1;
      if (event.isCorrect) current.windowCorrect += 1;
    }
    acc.set(event.engineKey, current);
  }

  const out = new Map<string, TopicProgress>();
  for (const [engineKey, c] of acc) {
    const enough = c.windowAnswered >= MIN_EVIDENCE;
    const accuracy = enough ? c.windowCorrect / c.windowAnswered : null;
    out.set(engineKey, {
      engineKey,
      windowAnswered: c.windowAnswered,
      windowCorrect: c.windowCorrect,
      totalAnswered: c.total,
      totalCorrect: c.totalCorrect,
      recentAccuracy: accuracy,
      level: accuracy === null ? null : masteryLevel(accuracy),
      nextStep: nextStepFor(c.windowAnswered, c.windowCorrect),
    });
  }
  return out;
}

/**
 * Los niveles de todos los grupos, en el orden de la parrilla, para la vista de
 * conjunto (`MasteryOverview`).
 *
 * Es una PROYECCIÓN, no un cálculo nuevo: cada elemento es el mismo `level` que
 * ya pinta la escalera de esa tarjeta. Que la vista de conjunto y las tarjetas
 * salgan del mismo `TopicProgress` es lo que impide que digan cosas distintas —
 * el fallo clásico de un resumen es tener su propia fuente y desincronizarse.
 *
 * `progress === null` es «la consulta falló», y entonces devuelve una lista
 * VACÍA: con ella `MasteryOverview` no pinta nada. Una consulta caída no puede
 * parecer un alumno que aún no ha empezado, ni al revés.
 *
 * `engineKeys` NO debe incluir `mix`: no es un grupo, es un sorteo entre los
 * demás, y contarlo como un tema más inflaría el denominador con algo que nunca
 * se puede medir. Ver la cabecera de `summarisePracticeEvents`.
 */
export function overviewLevels(
  engineKeys: readonly string[],
  progress: ReadonlyMap<string, TopicProgress> | null,
): (MasteryLevel | null)[] {
  if (progress === null) return [];
  return engineKeys.map((key) => progress.get(key)?.level ?? null);
}
