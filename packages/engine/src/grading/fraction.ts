/**
 * Corrector de fracciones.
 *
 * Igualdad por productos cruzados (feq), asi que 7/4 = 1 3/4 = 1.75 = 1,75.
 * `requireSimplest` juzga la FORMA escrita, no el valor: 2/4 vale lo mismo que
 * 1/2 pero se rechaza cuando la destreza evaluada es simplificar.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { feq, frac, isSimplest } from "../fraction.js";
import { isBlank, makeResult, parseWithUnit, typeMismatch, zeroResult } from "./helpers.js";

export function gradeFraction(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "fraction" }>,
  maxPoints: number,
): GradingResult {
  if (isBlank(response)) return zeroResult(maxPoints, "Sin respuesta.");
  if (response.type !== "text") return typeMismatch("text", response.type, maxPoints);

  const parsed = parseWithUnit(response.value);
  if (parsed === null) {
    return zeroResult(
      maxPoints,
      `No se pudo interpretar "${response.value.trim()}" como fracción, número mixto ni decimal. ` +
        `Respuesta esperada: ${key.canonical}.`,
    );
  }

  const target = frac(key.numerator, key.denominator);
  if (!parsed.values.some((value) => feq(value, target))) {
    return zeroResult(
      maxPoints,
      `Se leyó ${parsed.values.map((v) => `${v.n}/${v.d}`).join(" o ")} y la clave es ` +
        `${target.n}/${target.d} (${key.canonical}).`,
    );
  }

  if (key.requireSimplest && !isSimplest(parsed.literal)) {
    return makeResult({
      isCorrect: false,
      partialRatio: 0,
      maxPoints,
      rationale:
        `El valor es correcto pero la fracción no está simplificada, y este ítem evalúa ` +
        `precisamente eso. Respuesta esperada: ${key.canonical}.`,
    });
  }

  return makeResult({
    isCorrect: true,
    partialRatio: 1,
    maxPoints,
    rationale: `Equivalente a ${key.canonical}.`,
  });
}
