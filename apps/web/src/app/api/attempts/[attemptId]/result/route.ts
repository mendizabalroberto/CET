/**
 * GET /api/attempts/[attemptId]/result — la nota y, si procede, la revisión.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo que devuelve depende de DOS cosas, ninguna de ellas del cliente:
 *   · `feedback_mode` del `blueprint_snapshot` del intento (no del blueprint
 *     vivo, que el profesor puede haber editado desde entonces).
 *   · El estado del intento: la revisión pregunta a pregunta solo existe
 *     cuando está `graded`.
 *
 * Con `feedback_mode = 'never'` el alumno ve su nota y nada más. No es una
 * decisión de interfaz: un examen que se reutiliza en tres clases a lo largo de
 * la semana se filtra entero si la primera puede exportar la revisión.
 */
import type { NextResponse } from "next/server";

import { getAttemptResult, jsonOk, methodNotAllowed, toResponse } from "@/lib/exam";

import { requireStudentContext, requireUuid } from "../../_context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ attemptId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { attemptId } = await context.params;
    requireUuid(attemptId);

    const session = await requireStudentContext();

    const payload = await getAttemptResult(
      {
        attemptId,
        // De la SESIÓN.
        studentId: session.studentId,
        schoolId: session.schoolId,
      },
      { repo: session.repo },
    );

    return jsonOk(payload);
  } catch (cause) {
    return toResponse(cause);
  }
}

export function POST(): NextResponse {
  return methodNotAllowed("GET");
}
