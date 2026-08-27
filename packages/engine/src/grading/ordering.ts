/**
 * Corrector de ordenacion.
 *
 * Credito parcial = elementos en su posicion correcta / total. Se eligio la
 * posicion absoluta (y no Kendall-tau ni la subsecuencia comun mas larga) porque
 * es la unica que se le puede explicar a un nino: "acertaste 3 de 5 posiciones".
 * Un profesor puede recalificar a mano si el caso lo pide (M10).
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { isBlank, makeResult, typeMismatch, zeroResult } from "./helpers.js";

export function gradeOrdering(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "ordering" }>,
  maxPoints: number,
): GradingResult {
  if (isBlank(response)) return zeroResult(maxPoints, "Sin respuesta.");
  if (response.type !== "ordering") return typeMismatch("ordering", response.type, maxPoints);

  const total = key.correctOrder.length;
  let inPlace = 0;
  for (let i = 0; i < total; i += 1) {
    if (response.order[i] !== undefined && response.order[i] === key.correctOrder[i]) inPlace += 1;
  }

  const sameLength = response.order.length === total;
  const isCorrect = sameLength && inPlace === total;
  const ratio = total === 0 ? 0 : inPlace / total;

  return makeResult({
    isCorrect,
    partialRatio: isCorrect ? 1 : ratio,
    maxPoints,
    rationale: isCorrect
      ? `Orden exacto (${total} elementos).`
      : `${inPlace} de ${total} elementos en su posición correcta` +
        (sameLength ? "." : ` (se recibieron ${response.order.length} elementos, se esperaban ${total}).`),
  });
}
