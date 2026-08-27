/**
 * Punto de entrada de la correccion.
 *
 * `grade` es puro y determinista, y cumple el tipo `Grader` del contrato. Corre
 * igual en el navegador (practica, feedback inmediato) que en la Edge Function
 * (examen, la clave nunca sale de la DB). Una sola implementacion: si estas dos
 * rutas divergen, el sistema le miente al alumno (AD-5/AD-6).
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import {
  answerKey as answerKeySchema,
  studentResponse as studentResponseSchema,
  type AnswerKey,
  type Grader,
  type GradingResult,
  type StudentResponse,
} from "@cet/shared";
import { EngineError } from "../errors.js";
import { gradeChoice } from "./choice.js";
import { gradeNumeric } from "./numeric.js";
import { gradeFraction } from "./fraction.js";
import { gradeText } from "./text.js";
import { gradeOrdering } from "./ordering.js";
import { gradeMatching } from "./matching.js";
import { gradeManual } from "./manual.js";

export { gradeChoice, gradeNumeric, gradeFraction, gradeText, gradeOrdering, gradeMatching, gradeManual };
export { normalizeText, stripDiacritics } from "./text.js";
export { parseWithUnit, roundPoints } from "./helpers.js";

export const grade: Grader = (
  response: StudentResponse,
  key: AnswerKey,
  maxPoints: number,
): GradingResult => {
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
    throw new EngineError(
      "invalid_max_points",
      `maxPoints debe ser un numero positivo; se recibio ${String(maxPoints)}`,
    );
  }

  switch (key.type) {
    case "choice":
      return gradeChoice(response, key, maxPoints);
    case "numeric":
      return gradeNumeric(response, key, maxPoints);
    case "fraction":
      return gradeFraction(response, key, maxPoints);
    case "text":
      return gradeText(response, key, maxPoints);
    case "ordering":
      return gradeOrdering(response, key, maxPoints);
    case "matching":
      return gradeMatching(response, key, maxPoints);
    case "manual":
      return gradeManual(response, key, maxPoints);
    default: {
      // Inalcanzable mientras el union del contrato este cubierto. Si alguien
      // anade una variante y olvida el corrector, esto lo hace explotar en el acto.
      const exhaustive: never = key;
      throw new EngineError(
        "unsupported_answer_key",
        `Tipo de clave sin corrector: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
};

/**
 * Variante defensiva para la frontera servidor: valida con zod lo que viene de
 * la DB y del cliente antes de corregir. En el servidor NADA se da por bueno.
 */
export function gradeUnknown(
  rawResponse: unknown,
  rawKey: unknown,
  maxPoints: number,
): GradingResult {
  const parsedKey = answerKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    throw new EngineError(
      "invalid_answer_key",
      `answer_key corrupta: ${parsedKey.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  const parsedResponse = studentResponseSchema.safeParse(rawResponse);
  if (!parsedResponse.success) {
    // Una respuesta ilegible no puede tumbar la correccion del intento entero.
    return grade({ type: "empty" }, parsedKey.data, maxPoints);
  }
  return grade(parsedResponse.data, parsedKey.data, maxPoints);
}
