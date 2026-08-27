/**
 * POST /api/attempts/[attemptId]/submit — entregar y calificar.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cuerpo vacío. `submitted_by` lo decide el SERVIDOR comparando el deadline
 * contra su propio reloj: si el tiempo ya se agotó, la entrega es del
 * temporizador aunque la haya disparado un clic; si no, es del alumno. El
 * cliente no puede elegirlo, porque entonces un alumno que entrega en blanco
 * podría marcarlo como `timer` y culpar al sistema.
 *
 * Idempotente: dos peticiones simultáneas producen UNA calificación. Ver el
 * encabezado de `src/lib/exam/submit.ts` para el mecanismo.
 */
import type { NextResponse } from "next/server";

import {
  ExamError,
  jsonOk,
  methodNotAllowed,
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

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { attemptId } = await context.params;
    requireUuid(attemptId);

    const session = await requireStudentContext();

    // 20 por minuto. El doble clic real ya lo absorbe la idempotencia; esto
    // corta un bucle de reintentos, no al alumno.
    const limited = rateLimit(`attempt-submit:${attemptId}`, 20, 60_000);
    if (!limited.allowed) {
      throw new ExamError("rate_limited", "Demasiadas entregas seguidas");
    }

    const now = serverNow();

    const payload = await submitAttempt(
      {
        attemptId,
        // De la SESIÓN.
        studentId: session.studentId,
        schoolId: session.schoolId,
        // El SERVIDOR decide si esto lo cerró el alumno o el temporizador:
        // `submitAttempt` lo reevalúa contra el deadline después de comprobar
        // la propiedad del intento. Aquí solo se declara la intención.
        submittedBy: "student",
      },
      { repo: session.repo, events: session.events, now },
    );

    return jsonOk(payload);
  } catch (cause) {
    return toResponse(cause);
  }
}

export function GET(): NextResponse {
  return methodNotAllowed("POST");
}
