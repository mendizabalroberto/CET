/**
 * Corrector de texto corto.
 *
 * `ignoreDiacritics` no es un adorno: en Espanol "area" y "área" son la misma
 * respuesta y un nino de 11 anos no siempre tiene el teclado con tildes.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { AnswerKey, GradingResult, StudentResponse } from "@cet/shared";
import { isBlank, makeResult, typeMismatch, zeroResult } from "./helpers.js";

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeText(
  value: string,
  options: { caseSensitive: boolean; ignoreDiacritics: boolean },
): string {
  let out = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (options.ignoreDiacritics) out = stripDiacritics(out);
  if (!options.caseSensitive) out = out.toLocaleLowerCase("es");
  return out;
}

export function gradeText(
  response: StudentResponse,
  key: Extract<AnswerKey, { type: "text" }>,
  maxPoints: number,
): GradingResult {
  if (isBlank(response)) return zeroResult(maxPoints, "Sin respuesta.");
  if (response.type !== "text") return typeMismatch("text", response.type, maxPoints);

  const options = { caseSensitive: key.caseSensitive, ignoreDiacritics: key.ignoreDiacritics };
  const given = normalizeText(response.value, options);
  const matched = key.accepted.some((candidate) => normalizeText(candidate, options) === given);

  return makeResult({
    isCorrect: matched,
    partialRatio: matched ? 1 : 0,
    maxPoints,
    rationale: matched
      ? `Coincide con una de las respuestas aceptadas (${key.canonical}).`
      : `"${response.value.trim()}" no está entre las aceptadas. Respuesta esperada: ${key.canonical}.`,
  });
}
