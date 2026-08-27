/**
 * Qué significan los códigos de error de la API de examen, en español.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El tipo lo fija `exam-api.en.ts` (`Record<ExamErrorCode, string>`): añadir un
 * código allí y olvidarlo aquí es un error de compilación, no una cadena en
 * inglés delante de una clase de niños de once años.
 *
 * Mismo criterio que en inglés: cada mensaje dice qué ha pasado y qué hacer
 * ahora, ninguno culpa al alumno y ninguno sugiere que se ha perdido trabajo
 * que no se ha perdido.
 */
import type { ExamErrorCode } from "@/lib/exam/errors";

export const examApiEs: Record<ExamErrorCode, string> = {
  unauthenticated: "Se ha cerrado tu sesión. Vuelve a entrar y tu examen te estará esperando.",
  forbidden: "Esta página es para los alumnos que están haciendo un examen.",
  not_found: "No hemos encontrado ese examen.",
  invalid_request: "Algo ha fallado al enviar tu respuesta. Lo intentamos otra vez solos.",
  window_not_open: "Este examen todavía no ha empezado. Vuelve cuando te lo diga tu profe.",
  window_closed: "Este examen ya está cerrado.",
  max_attempts_reached: "Ya has usado todos tus intentos en este examen.",
  deadline_passed: "Se ha acabado el tiempo. Hemos entregado tu examen con todo lo que respondiste.",
  attempt_not_in_progress: "Este examen ya está entregado.",
  attempt_not_submitted: "Este examen todavía no se ha entregado, así que aún no hay nota.",
  insufficient_pool: "Este examen aún no está listo. Avisa a tu profe: no es culpa tuya.",
  blueprint_invalid: "Este examen no está bien preparado. Avisa a tu profe: no es culpa tuya.",
  attempt_starting: "Tu examen se está abriendo. Espera un momento y vuelve a probar.",
  rate_limited: "Han sido muchos clics seguidos. Espera un momento y vuelve a probar.",
  internal: "No hemos podido guardar. Sigue respondiendo, lo intentamos otra vez solos.",
};

/** Respaldo para un código que esta versión todavía no conoce. */
export const examApiFallbackEs = "Algo ha fallado. Sigue respondiendo, lo intentamos otra vez solos.";
