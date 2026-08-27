/**
 * Puerta única de la revisión: ¿se le puede enseñar la solución a este alumno?
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ESTE FICHERO ES UNA DEFENSA, NO UNA COMODIDAD.
 *
 * La barrera de verdad está en el servidor: con `feedback_mode = 'never'` la
 * ruta `/result` sencillamente no debe devolver `items`. Pero un cliente que
 * pinte lo que le llegue convierte cualquier despiste del servidor en una fuga
 * de respuestas correctas. Así que el cliente vuelve a comprobarlo, y
 * `<ResultView>` es el ÚNICO sitio de la app que lee `correctAnswer`.
 *
 * Ambas comprobaciones se equivocan hacia el mismo lado: si hay duda, no se
 * enseña nada. Un alumno que no ve la corrección pregunta a su profesor; un
 * alumno que la ve antes de tiempo se la pasa a la clase entera.
 */
import type { AttemptStatus, FeedbackMode } from "@cet/shared";

/** Estados en los que la nota ya es definitiva. */
const GRADED_STATUSES: readonly AttemptStatus[] = ["graded"];

/**
 * ¿Se muestra la revisión pregunta a pregunta?
 *
 * - `never`: jamás. Ni corregido, ni con el examen cerrado, ni nunca.
 * - `after_submit` / `immediate`: solo cuando el intento está `graded`. Mientras
 *   está en `grading` la nota todavía se está calculando, y enseñar media
 *   corrección es peor que no enseñar ninguna.
 */
export function shouldShowReview(feedbackMode: FeedbackMode, status: AttemptStatus): boolean {
  if (feedbackMode === "never") return false;
  return GRADED_STATUSES.includes(status);
}

/**
 * ¿Se muestra la nota numérica?
 *
 * Sí incluso con `never`: `feedback_mode` gobierna las SOLUCIONES, no la nota.
 * Un alumno tiene derecho a saber qué ha sacado; lo que el colegio se reserva
 * es cuál era la respuesta buena.
 */
export function shouldShowScore(status: AttemptStatus): boolean {
  return GRADED_STATUSES.includes(status);
}

/**
 * Filtro de último recurso. Si el servidor manda `items` con `feedbackMode:
 * "never"`, aquí se quedan: nunca llegan al árbol de React y por tanto nunca
 * llegan al HTML que se manda al navegador.
 */
export function reviewItemsFor<T>(
  feedbackMode: FeedbackMode,
  status: AttemptStatus,
  items: readonly T[] | null,
): readonly T[] {
  if (!shouldShowReview(feedbackMode, status)) return [];
  return items ?? [];
}
