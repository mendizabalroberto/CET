/**
 * POST /api/attempts/[attemptId]/answer — autoguardado.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL DEADLINE Y LA ENTREGA AUTOMÁTICA
 * ===========================================================================
 * Si el tiempo se agotó, la respuesta NO se acepta (409 `deadline_passed`) y
 * **acto seguido se entrega el examen** con `submitted_by = 'timer'`.
 *
 * Ese segundo paso es el que hace que el sistema no dependa de que el navegador
 * colabore: aunque el cronómetro del cliente esté parado, adelantado o el
 * alumno haya cerrado la pestaña, el primer autoguardado tardío cierra y
 * califica el intento. El barrido periódico sigue haciendo falta para el que ni
 * siquiera llega a mandar una petición tardía, pero este camino cubre el caso
 * habitual sin esperar al cron.
 *
 * La entrega automática se hace ANTES de responder, y su fallo no cambia la
 * respuesta: el alumno recibe igualmente el 409, porque lo que le importa es
 * que su respuesta tardía no cuenta.
 */
import type { NextResponse } from "next/server";

import {
  answerBody,
  autosaveAnswer,
  ExamError,
  isExamError,
  jsonOk,
  methodNotAllowed,
  readJsonBody,
  serverNow,
  submitAttempt,
  toResponse,
} from "@/lib/exam";
import { rateLimit } from "@/lib/security/rate-limit";

import { requireStudentContext, requireUuid } from "../../_context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ attemptId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { attemptId } = await context.params;
    requireUuid(attemptId);

    const body = await readJsonBody(request);
    const parsed = answerBody.safeParse(body);
    if (!parsed.success) {
      throw new ExamError(
        "invalid_request",
        `Cuerpo inválido: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }

    const session = await requireStudentContext();

    // 240 autoguardados por minuto: cuatro por segundo. El cliente hace
    // debounce a ~800 ms, así que ni tecleando sin parar se acerca — pero
    // acota una cola atascada reintentando en bucle, que es el caso real.
    const limited = rateLimit(`attempt-answer:${attemptId}`, 240, 60_000);
    if (!limited.allowed) {
      throw new ExamError("rate_limited", "Demasiados autoguardados seguidos");
    }

    const now = serverNow();
    const deps = { repo: session.repo, events: session.events, now };

    try {
      const payload = await autosaveAnswer(
        {
          attemptId,
          attemptItemId: parsed.data.attemptItemId,
          response: parsed.data.response,
          clientTs: parsed.data.clientTs ?? null,
          timeOnItemMs: parsed.data.timeOnItemMs ?? null,
          // De la SESIÓN.
          studentId: session.studentId,
          schoolId: session.schoolId,
          source: "autosave",
        },
        deps,
      );
      return jsonOk(payload);
    } catch (cause) {
      if (isExamError(cause) && cause.code === "deadline_passed") {
        // Se acabó el tiempo: se cierra el examen aquí mismo.
        // `submittedBy: "timer"` lo decide el SERVIDOR — si lo eligiera el
        // cliente, cualquiera podría culpar al reloj de su entrega en blanco.
        try {
          await submitAttempt(
            {
              attemptId,
              studentId: session.studentId,
              schoolId: session.schoolId,
              submittedBy: "timer",
            },
            deps,
          );
        } catch (submitCause) {
          console.error(`[exam] entrega automática de ${attemptId} falló`, submitCause);
        }
      }
      throw cause;
    }
  } catch (cause) {
    return toResponse(cause);
  }
}

export function GET(): NextResponse {
  return methodNotAllowed("POST");
}
