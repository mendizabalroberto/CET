/**
 * Corrector numerico.
 *
 * El caso critico del proyecto: 7/4, 1 3/4, 1.75 y 1,75 son LA MISMA respuesta.
 * Se consigue parseando la entrada a fraccion exacta (parseAnswer) y comparando
 * el valor, igual que hacia `parseAns` + `eqNum` en Y6A.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { eqNum, fval } from "../fraction.js";
import { isBlank, makeResult, parseWithUnit, typeMismatch, zeroResult } from "./helpers.js";

/** Tolerancia minima siempre aplicada: absorbe la fuzz binaria, nunca un error real. */
const EPSILON = 1e-9;

export function gradeNumeric(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "numeric" }>,
  maxPoints: number,
): GradingResult {
  if (isBlank(response)) return zeroResult(maxPoints, "Sin respuesta.");
  if (response.type !== "text") return typeMismatch("text", response.type, maxPoints);

  const parsed = parseWithUnit(response.value);
  if (parsed === null) {
    return zeroResult(
      maxPoints,
      `No se pudo interpretar "${response.value.trim()}" como número. Respuesta esperada: ${key.canonical}.`,
    );
  }

  const tolerance = Math.max(key.tolerance, EPSILON);
  const values = parsed.values.map(fval);
  const isCorrect = values.some((value) => eqNum(value, key.value, tolerance));

  return makeResult({
    isCorrect,
    partialRatio: isCorrect ? 1 : 0,
    maxPoints,
    rationale: isCorrect
      ? `Coincide con ${key.canonical}${key.tolerance > 0 ? ` (tolerancia ±${key.tolerance})` : ""}.`
      : `Se leyó ${values.join(" o ")} y la clave es ${key.value} (${key.canonical}).`,
  });
}
