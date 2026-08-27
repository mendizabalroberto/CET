/**
 * Corrector de emparejamiento.
 *
 * Credito parcial = parejas correctas / parejas de la clave. Si el alumno asigna
 * dos veces el mismo elemento de la izquierda solo cuenta la primera asignacion:
 * de lo contrario bastaria con emparejar todo con todo para llegar al 100 %.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { isBlank, makeResult, typeMismatch, zeroResult } from "./helpers.js";

export function gradeMatching(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "matching" }>,
  maxPoints: number,
): GradingResult {
  if (isBlank(response)) return zeroResult(maxPoints, "Sin respuesta.");
  if (response.type !== "matching") return typeMismatch("matching", response.type, maxPoints);

  const given = new Map<string, string>();
  let duplicates = 0;
  for (const [left, right] of response.pairs) {
    if (given.has(left)) {
      duplicates += 1;
      continue;
    }
    given.set(left, right);
  }

  const total = key.pairs.length;
  let matched = 0;
  for (const [left, right] of key.pairs) {
    if (given.get(left) === right) matched += 1;
  }

  const extras = Math.max(0, given.size - total);
  const isCorrect = matched === total && extras === 0 && duplicates === 0;
  const ratio = total === 0 ? 0 : matched / total;

  return makeResult({
    isCorrect,
    partialRatio: isCorrect ? 1 : ratio,
    maxPoints,
    rationale: isCorrect
      ? `Las ${total} parejas son correctas.`
      : `${matched} de ${total} parejas correctas` +
        (duplicates > 0 ? `; ${duplicates} asignación(es) duplicada(s) ignorada(s)` : "") +
        (extras > 0 ? `; ${extras} pareja(s) sobrante(s)` : "") +
        ".",
  });
}
