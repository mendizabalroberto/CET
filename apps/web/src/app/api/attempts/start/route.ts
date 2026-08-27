/**
 * POST /api/attempts/start — arrancar o reanudar un intento.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cuerpo: `{ assignmentId }`. Nada más. La identidad viene de la sesión.
 *
 * La ruta es deliberadamente fina: valida, compone el contexto y delega en
 * `startAttempt`. Toda la lógica interesante (reanudación, ventana, deadline,
 * materialización) vive en `src/lib/exam/start.ts`, que se prueba sin HTTP.
 */
import type { NextResponse } from "next/server";

import {
  ExamError,
  jsonOk,
  methodNotAllowed,
  readJsonBody,
  serverNow,
  startAttempt,
  startAttemptBody,
  toResponse,
} from "@/lib/exam";
import { rateLimit } from "@/lib/security/rate-limit";

import { hashIp, readUserAgent, requireStudentContext } from "../_context";

/** Necesita cookies de sesión: ni se cachea ni se prerenderiza. */
export const dynamic = "force-dynamic";
/** `node:crypto` para el hash de IP y la semilla. No es una ruta de borde. */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonBody(request);
    const parsed = startAttemptBody.safeParse(body);
    if (!parsed.success) {
      throw new ExamError("invalid_request", "assignmentId ausente o con forma inválida");
    }

    const context = await requireStudentContext();

    // 10 arranques por minuto y alumno. Arrancar es la operación más cara del
    // módulo (materializa un examen entero); un bucle de recargas no puede
    // convertirse en veinte materializaciones por segundo. Diez deja margen de
    // sobra para recargar tras una caída de red.
    const limited = rateLimit(`attempt-start:${context.studentId}`, 10, 60_000);
    if (!limited.allowed) {
      throw new ExamError("rate_limited", "Demasiados arranques seguidos");
    }

    const payload = await startAttempt(
      {
        assignmentId: parsed.data.assignmentId,
        // De la SESIÓN. El cuerpo ni siquiera admite estos campos.
        studentId: context.studentId,
        schoolId: context.schoolId,
        userAgent: readUserAgent(request.headers),
        ipHash: hashIp(request.headers),
        locale: context.locale,
      },
      { repo: context.repo, events: context.events, now: serverNow() },
    );

    return jsonOk(payload, payload.resumed ? 200 : 201);
  } catch (cause) {
    return toResponse(cause);
  }
}

export function GET(): NextResponse {
  return methodNotAllowed("POST");
}
