/**
 * Corrector de opciones (mcq_single, mcq_multi, true_false).
 *
 * Credito parcial REAL en multi-respuesta: (aciertos − fallos) / total_correctas,
 * recortado a [0,1]. Marcarlo todo no da nota — que es justo lo que hay que evitar.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { isBlank, makeResult, typeMismatch, zeroResult } from "./helpers.js";

export function gradeChoice(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "choice" }>,
  maxPoints: number,
): GradingResult {
  if (isBlank(response)) return zeroResult(maxPoints, "Sin respuesta.");
  if (response.type !== "choice") return typeMismatch("choice", response.type, maxPoints);

  const correct = new Set(key.correctIds);
  const selected = new Set(response.selectedIds);

  let hits = 0;
  let misses = 0;
  for (const id of selected) {
    if (correct.has(id)) hits += 1;
    else misses += 1;
  }

  const total = correct.size;
  const ratio = total === 0 ? 0 : Math.max(0, (hits - misses) / total);
  const isCorrect = hits === total && misses === 0;

  return makeResult({
    isCorrect,
    partialRatio: isCorrect ? 1 : ratio,
    maxPoints,
    rationale: isCorrect
      ? `Selección exacta (${hits}/${total}).`
      : `${hits} de ${total} correctas y ${misses} incorrecta(s) marcada(s).`,
  });
}
