/**
 * Corrección autoritativa. Pura: filas dentro, notas fuera.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * M10, regla 1: "nadie corrige dos veces la misma respuesta de dos maneras
 * distintas". El corrector es `gradeUnknown` de @cet/engine — el MISMO que usa
 * la práctica en el navegador (AD-6). Aquí no se corrige nada a mano; aquí se
 * decide QUÉ se corrige, con QUÉ clave y qué se hace con lo que no se puede
 * corregir automáticamente.
 *
 * LAS TRES REGLAS DEL ENCARGO, Y DÓNDE ESTÁN
 * ---------------------------------------------------------------------------
 *  · "Un item sin respuesta puntúa 0, no se salta"  -> `gradeAttempt` recorre
 *    los ITEMS, no las respuestas, y le pasa `{type:"empty"}` a los que no
 *    tienen ninguna. Si recorriera las respuestas, un examen a medias saldría
 *    con `score_max` reducido y una nota inflada.
 *  · "Un item `manual` no se autocalifica"  -> se marca
 *    `requiresManualReview`, se le dan 0 puntos PROVISIONALES y el intento
 *    queda en `grading`. El 0 no es la nota: es el valor mientras el profesor
 *    no la ponga, y `attempt_gradings.points_awarded` es NOT NULL.
 *  · "Una respuesta corrupta no tumba el intento"  -> `gradeUnknown` la trata
 *    como respuesta en blanco. Lo que SÍ lanza es una CLAVE corrupta, y con
 *    razón: eso es un fallo del sistema, no del alumno, y ponerle un cero
 *    silencioso sería lo peor que este módulo podría hacer.
 */
import { gradeUnknown } from "@cet/engine";
import type { AnswerKey, GradingMode } from "@cet/shared";

import { ExamError } from "./errors";
import type { GradingItemRow, ResponseRow } from "./types";

export interface GradedItem {
  readonly attemptItemId: string;
  readonly ord: number;
  readonly pointsAwarded: number;
  readonly maxPoints: number;
  readonly isCorrect: boolean | null;
  readonly partialRatio: number | null;
  readonly rationale: string;
  readonly requiresManualReview: boolean;
  /** La rúbrica congelada, solo para los items manuales. */
  readonly rubricSnapshot: unknown;
}

export interface AttemptGradingResult {
  readonly items: readonly GradedItem[];
  readonly scoreRaw: number;
  readonly scoreMax: number;
  readonly scorePct: number;
  readonly passed: boolean;
  readonly pendingManualReview: number;
  /** `grading` si queda algo para el profesor; `graded` si ya está todo. */
  readonly status: "grading" | "graded";
}

/** `numeric(8,2)` / `numeric(6,2)`: dos decimales o Postgres redondea por su cuenta. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `numeric(4,3)`. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isManual(item: GradingItemRow): boolean {
  if (item.grading_mode === ("manual" satisfies GradingMode)) return true;
  // Segunda vía: la CLAVE CONGELADA. Es la que manda cuando el generador de una
  // pregunta `generated` produjo una clave manual que la versión del banco no
  // declaraba. El `grading_mode` describe la versión; `answer_key` describe
  // ESTE item, y este item es lo que se corrige.
  const key = item.answer_key;
  return typeof key === "object" && key !== null && (key as { type?: unknown }).type === "manual";
}

function rubricOf(item: GradingItemRow): unknown {
  const key = item.answer_key;
  if (typeof key !== "object" || key === null) return null;
  const rubric = (key as { rubric?: unknown }).rubric;
  return rubric ?? null;
}

/**
 * Corrige un intento entero.
 *
 * @param items      TODOS los items del intento, con su clave congelada.
 * @param responses  Las respuestas del intento. Solo se miran las `is_final`.
 * @param passThreshold Porcentaje de aprobado, del `blueprint_snapshot`.
 */
export function gradeAttempt(
  items: readonly GradingItemRow[],
  responses: readonly ResponseRow[],
  passThreshold: number,
): AttemptGradingResult {
  if (items.length === 0) {
    // Imposible por construcción: `start` rechaza un blueprint sin secciones y
    // nunca inserta un intento sin items. Si pasara, `score_max = 0` violaría
    // el CHECK `exam_attempts_scores_sane` y el intento quedaría a medias. Se
    // corta con un mensaje que dice exactamente qué mirar.
    throw new ExamError("internal", "[exam] El intento no tiene items: no se puede calificar");
  }

  const finalByItem = new Map<string, ResponseRow>();
  for (const response of responses) {
    if (response.is_final) finalByItem.set(response.attempt_item_id, response);
  }

  const graded: GradedItem[] = [];
  let scoreRaw = 0;
  let scoreMax = 0;
  let pendingManualReview = 0;

  for (const item of items) {
    const maxPoints = Number(item.max_points);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      throw new ExamError(
        "internal",
        `[exam] El item ${item.id} tiene max_points inválido (${String(item.max_points)})`,
      );
    }
    scoreMax += maxPoints;

    const final = finalByItem.get(item.id);
    // Sin fila final => el alumno no respondió. NO se salta el item: se corrige
    // como respuesta vacía y suma 0 al numerador y `maxPoints` al denominador.
    const response = final ? final.response : { type: "empty" };

    if (isManual(item)) {
      pendingManualReview += 1;
      graded.push({
        attemptItemId: item.id,
        ord: item.ord,
        pointsAwarded: 0,
        maxPoints: round2(maxPoints),
        isCorrect: null,
        partialRatio: null,
        rationale: "Pendiente de corrección manual: esta pregunta la califica un profesor.",
        requiresManualReview: true,
        rubricSnapshot: rubricOf(item),
      });
      continue;
    }

    const result = gradeUnknown(response, item.answer_key, maxPoints);
    const points = round2(Math.min(Math.max(result.pointsAwarded, 0), maxPoints));
    scoreRaw += points;

    graded.push({
      attemptItemId: item.id,
      ord: item.ord,
      pointsAwarded: points,
      maxPoints: round2(maxPoints),
      isCorrect: result.isCorrect,
      partialRatio: round3(result.partialRatio),
      rationale: result.rationale ?? "",
      requiresManualReview: false,
      rubricSnapshot: null,
    });
  }

  scoreRaw = round2(scoreRaw);
  scoreMax = round2(scoreMax);
  const scorePct = scoreMax > 0 ? round2((scoreRaw / scoreMax) * 100) : 0;

  return {
    items: graded,
    scoreRaw,
    scoreMax,
    scorePct,
    // Con items pendientes de un humano, `passed` es provisional: se recalcula
    // entero cuando el profesor termine (M10 §3, "nunca se ajustan a mano").
    passed: scorePct >= passThreshold,
    pendingManualReview,
    status: pendingManualReview > 0 ? "grading" : "graded",
  };
}

/* -------------------------------------------------------------------------- */
/* La respuesta canónica para la revisión                                     */
/* -------------------------------------------------------------------------- */

/**
 * Texto legible de la respuesta correcta, para la pantalla de revisión.
 *
 * NO devuelve la `answer_key`: devuelve una CADENA. La diferencia importa —
 * serializar la clave entera regalaría `tolerance`, `requireSimplest` o la
 * lista completa de sinónimos aceptados, que es material para adivinar la
 * siguiente pregunta. Solo se llama cuando `feedback_mode` lo permite Y el
 * intento está `graded`.
 */
export function canonicalAnswerText(rawKey: unknown): string | null {
  if (typeof rawKey !== "object" || rawKey === null) return null;
  const key = rawKey as Partial<AnswerKey> & { type?: string };

  switch (key.type) {
    case "choice": {
      const ids = (key as { correctIds?: unknown }).correctIds;
      return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string").join(", ") : null;
    }
    case "numeric":
    case "fraction":
    case "text": {
      const canonical = (key as { canonical?: unknown }).canonical;
      return typeof canonical === "string" ? canonical : null;
    }
    case "ordering": {
      const order = (key as { correctOrder?: unknown }).correctOrder;
      return Array.isArray(order) ? order.filter((i): i is string => typeof i === "string").join(" → ") : null;
    }
    case "matching": {
      const pairs = (key as { pairs?: unknown }).pairs;
      if (!Array.isArray(pairs)) return null;
      return pairs
        .filter((p): p is [string, string] => Array.isArray(p) && p.length === 2)
        .map(([left, right]) => `${left} → ${right}`)
        .join(", ");
    }
    case "manual":
      // La rúbrica es para el profesor, no para el alumno.
      return null;
    default:
      return null;
  }
}
