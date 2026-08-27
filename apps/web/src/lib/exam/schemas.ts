/**
 * Esquemas Zod de la frontera HTTP del motor de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LO QUE NO ESTÁ AQUÍ ES TAN IMPORTANTE COMO LO QUE ESTÁ
 * ===========================================================================
 * Ningún esquema admite `studentId`, `schoolId`, `attemptNumber`, `seed`,
 * `serverDeadlineAt` ni `submittedBy`. Esos datos salen de la SESIÓN o del
 * SERVIDOR, nunca del cuerpo.
 *
 * `z.object` no estricto DESCARTA lo que no declara, así que un alumno que
 * envíe `{"studentId": "<el de un compañero>"}` no consigue nada: el campo se
 * evapora al parsear y jamás llega a componerse una fila con él. Es el mismo
 * patrón que ya usa `/api/events` con `clientEvent`, y por el mismo motivo.
 */
import { z } from "zod";

export const startAttemptBody = z.object({
  assignmentId: z.string().uuid(),
});
export type StartAttemptBody = z.infer<typeof startAttemptBody>;

export const answerBody = z.object({
  attemptItemId: z.string().uuid(),
  /**
   * `unknown` a propósito: la forma la valida `studentResponse` de @cet/shared
   * dentro de `autosaveAnswer`, para que la regla viva junto a la corrección
   * que la consume y no en dos sitios.
   */
  response: z.unknown(),
  /**
   * Hora del cliente. Se guarda como dato forense y NO decide nada. Se acepta
   * cualquier fecha válida, incluida una adelantada una hora: ese desfase es
   * información, no un error a rechazar.
   */
  clientTs: z.string().datetime().nullable().optional(),
  /**
   * Tope de 24 h: el mismo CHECK que la columna
   * (`attempt_responses_time_sane`). Un valor mayor haría fallar el INSERT con
   * un 500 en vez de con un 400 honesto.
   */
  timeOnItemMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
});
export type AnswerBody = z.infer<typeof answerBody>;

/**
 * El cuerpo de la entrega está VACÍO a propósito.
 *
 * `submitted_by` lo decide el servidor: `timer` si el deadline ya pasó cuando
 * llega la petición, `student` en caso contrario. Si lo eligiera el cliente,
 * cualquier alumno podría marcar su entrega como `timer` y culpar al reloj de
 * haber entregado en blanco.
 */
export const submitBody = z.object({}).passthrough();
