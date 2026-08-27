/**
 * Piezas comunes de los correctores.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { gradingResult, type GradingResult, type StudentResponse } from "@cet/shared";
import { parseAnswerReadings, type Frac } from "../fraction.js";

/** Redondeo del credito a 4 decimales: evita 0.33333333333 en la nota persistida. */
export function roundPoints(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function makeResult(args: {
  isCorrect: boolean;
  partialRatio: number;
  maxPoints: number;
  rationale?: string;
  requiresManualReview?: boolean;
}): GradingResult {
  const ratio = Number.isFinite(args.partialRatio) ? Math.min(1, Math.max(0, args.partialRatio)) : 0;
  return gradingResult.parse({
    isCorrect: args.isCorrect,
    pointsAwarded: roundPoints(args.maxPoints * ratio),
    maxPoints: args.maxPoints,
    partialRatio: ratio,
    ...(args.rationale === undefined ? {} : { rationale: args.rationale }),
    requiresManualReview: args.requiresManualReview ?? false,
  });
}

export function zeroResult(maxPoints: number, rationale: string): GradingResult {
  return makeResult({ isCorrect: false, partialRatio: 0, maxPoints, rationale });
}

/** true cuando el alumno no contesto nada. Un blanco no es un error de tipo. */
export function isBlank(response: StudentResponse): boolean {
  if (response.type === "empty") return true;
  if (response.type === "text") return response.value.trim().length === 0;
  if (response.type === "choice") return response.selectedIds.length === 0;
  if (response.type === "ordering") return response.order.length === 0;
  return response.pairs.length === 0;
}

const TRAILING_UNIT = /\s*[A-Za-zµ°Ω][A-Za-z]*[²³]?\.?$/u;

/**
 * DECISION (el contrato no lo cubre): el alumno escribe "120 cm" cuando el
 * enunciado pide centimetros. `AnswerKey` de tipo numeric/fraction NO lleva la
 * unidad esperada, asi que el corrector no puede validarla; lo que hace es
 * quitar el sufijo cuando estorba al parseo. La unidad se sigue exigiendo
 * pedagogicamente en el enunciado y en la solucion, pero no puntua.
 */
export function parseWithUnit(raw: string): { values: Frac[]; literal: string } | null {
  const direct = parseAnswerReadings(raw);
  if (direct.length > 0) return { values: direct, literal: raw.trim() };

  const stripped = raw.trim().replace(TRAILING_UNIT, "");
  if (stripped.length === 0 || stripped === raw.trim()) return null;
  const retry = parseAnswerReadings(stripped);
  return retry.length === 0 ? null : { values: retry, literal: stripped };
}

export function typeMismatch(
  expected: string,
  got: StudentResponse["type"],
  maxPoints: number,
): GradingResult {
  return zeroResult(
    maxPoints,
    `La respuesta llegó como "${got}" y la clave espera "${expected}". ` +
      `Se puntúa 0 y se deja constancia en lugar de lanzar: un intento nunca se queda sin corregir.`,
  );
}
