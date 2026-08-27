/**
 * Corrector "manual": no corrige, marca.
 *
 * Devuelve 0 puntos y `requiresManualReview: true` para que M10 lo encole. Un
 * item manual NO puede quedar puntuado automaticamente ni siquiera con 0 "de
 * momento": la nota provisional que nadie revisa es la peor de las mentiras.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { isBlank, makeResult } from "./helpers.js";
import { resolveI18n } from "@cet/shared";

export function gradeManual(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "manual" }>,
  maxPoints: number,
): GradingResult {
  const blank = isBlank(response);
  return makeResult({
    isCorrect: false,
    partialRatio: 0,
    maxPoints,
    requiresManualReview: !blank,
    rationale: blank
      ? "Sin respuesta: 0 puntos, no hace falta revision humana."
      : `Pendiente de correccion humana. Rubrica: ${resolveI18n(key.rubric, "es")}`,
  });
}
