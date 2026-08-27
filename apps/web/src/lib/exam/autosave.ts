/**
 * `POST /api/attempts/[attemptId]/answer` — autoguardado append-only.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * NUNCA UN UPDATE
 * ===========================================================================
 * Cada cambio de respuesta es una FILA NUEVA con `revision = max+1`
 * (DATA_MODEL §6). Así se responde "¿cuántas veces cambió de opinión?" y "¿en
 * qué momento exacto?", que es media reconstrucción forense. Un UPDATE
 * ahorraría una fila y borraría la prueba; el trigger
 * `attempt_responses_guard_update` lo impide de todas formas.
 *
 * ===========================================================================
 * `is_final`: TRABAJAR CON EL ÍNDICE, NO CONTRA ÉL
 * ===========================================================================
 * `attempt_responses_final_uniq` es un índice UNIQUE PARCIAL `where is_final`:
 * dos finales para el mismo item son literalmente imposibles. El orden correcto
 * es por tanto DESMARCAR la anterior y DESPUÉS insertar la nueva. Al revés se
 * violaría el índice siempre.
 *
 * Entre esas dos operaciones hay una ventana (PostgREST no da transacciones
 * entre llamadas) en la que dos pestañas pueden colisionar. No se intenta
 * evitar la colisión: se REINTENTA. El modelo aguanta porque es append-only —
 * gana la última revisión, nada se pierde, y el forense ve las dos escrituras.
 *
 * ===========================================================================
 * EL DEADLINE
 * ===========================================================================
 * Se compara contra `serverNow`, jamás contra `clientTs`. Este es el punto
 * exacto donde adelantar el reloj del portátil deja de servir de nada: el
 * `clientTs` se guarda —es información, y que un alumno tenga la hora
 * adelantada también lo es— pero no participa en ninguna decisión.
 */
import { studentResponse } from "@cet/shared";

import { ExamError } from "./errors";
import { seqForResponse, type ExamEventEmitter } from "./events";
import {
  assertAttemptBelongsToStudent,
  assertBeforeDeadline,
  assertInProgress,
  AUTOSAVE_GRACE_MS,
  remainingMs,
} from "./guards";
import { UniqueViolation, type ExamRepository } from "./repository";
import type { AutosavePayload } from "./types";

export interface AutosaveInput {
  readonly attemptId: string;
  readonly attemptItemId: string;
  /** Se valida con `studentResponse` de @cet/shared antes de tocar la base de datos. */
  readonly response: unknown;
  readonly clientTs: string | null;
  readonly timeOnItemMs: number | null;
  /** SIEMPRE de la sesión. */
  readonly studentId: string;
  readonly schoolId: string;
  readonly source?: "typed" | "selected" | "autosave" | "restored";
}

export interface AutosaveDeps {
  readonly repo: ExamRepository;
  readonly events: ExamEventEmitter;
  readonly now: Date;
}

/** Tres vueltas bastan: la colisión exige dos escrituras en el mismo milisegundo. */
const MAX_REVISION_RETRIES = 3;

export async function autosaveAnswer(
  input: AutosaveInput,
  deps: AutosaveDeps,
): Promise<AutosavePayload> {
  const { repo, now } = deps;

  // --- 1. La respuesta, validada ANTES de nada ----------------------------
  // Una respuesta que no cumple `StudentResponse` no se guarda: guardarla
  // significaría que la corrección la trataría como blanco más adelante, sin
  // que nadie se entere. Mejor decir 400 y que el cliente lo arregle.
  const parsed = studentResponse.safeParse(input.response);
  if (!parsed.success) {
    throw new ExamError(
      "invalid_request",
      `[exam] Respuesta con forma inválida: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // --- 2. Propiedad y estado ----------------------------------------------
  const attempt = assertAttemptBelongsToStudent(
    await repo.findAttempt(input.attemptId),
    input.studentId,
    input.schoolId,
  );
  assertInProgress(attempt);

  // --- 3. El deadline del SERVIDOR ----------------------------------------
  // Con margen de gracia solo para absorber la latencia de la red del colegio
  // (ver `AUTOSAVE_GRACE_MS`). Pasado eso: 409 y el llamante dispara la entrega
  // automática. La respuesta tardía NO se guarda.
  assertBeforeDeadline(attempt, now, AUTOSAVE_GRACE_MS);

  // --- 4. El item es de ESTE intento --------------------------------------
  // Sin esta comprobación, un alumno podría autoguardar sobre el item de otro
  // enviando un `attemptItemId` ajeno. El trigger `attempt_responses_validate_item`
  // también lo bloquea, pero un 404 aquí es mejor que un 500 desde Postgres.
  const item = await repo.findAttemptItem(input.attemptItemId);
  if (!item || item.attempt_id !== attempt.id) {
    throw new ExamError("not_found", "El item no pertenece a este intento");
  }

  // --- 5. Revisión nueva ---------------------------------------------------
  let inserted: Awaited<ReturnType<ExamRepository["insertResponse"]>> | null = null;
  let lastError: unknown = null;

  for (let attemptNo = 0; attemptNo < MAX_REVISION_RETRIES; attemptNo += 1) {
    const currentMax = await repo.maxRevision(input.attemptItemId);
    const revision = (currentMax ?? -1) + 1;

    // Primero se desmarca la final anterior. El índice parcial UNIQUE hace
    // imposible el estado "dos finales", así que este orden es obligatorio.
    await repo.clearFinalFlag(input.attemptItemId);

    try {
      inserted = await repo.insertResponse({
        attemptId: attempt.id,
        attemptItemId: input.attemptItemId,
        revision,
        response: parsed.data,
        // Se guarda tal cual lo mandó el cliente. Es un dato forense, no una
        // fuente de verdad: si va adelantado una hora, eso también se registra.
        clientTs: input.clientTs,
        timeOnItemMs: input.timeOnItemMs,
        source: input.source ?? "autosave",
      });
      break;
    } catch (cause) {
      lastError = cause;
      // `attempt_responses_revision_uniq` o `attempt_responses_final_uniq`: otra
      // pestaña se adelantó. Se recalcula el máximo y se vuelve a intentar.
      if (cause instanceof UniqueViolation) continue;
      throw cause;
    }
  }

  if (!inserted) {
    throw new ExamError(
      "internal",
      `[exam] No se pudo asignar revisión tras ${MAX_REVISION_RETRIES} intentos: ${String(lastError)}`,
    );
  }

  // --- 6. Heartbeat --------------------------------------------------------
  // Lo usa la recuperación de sesión y el barrido de intentos abandonados. Un
  // fallo aquí no puede perder la respuesta que YA está guardada.
  try {
    await repo.touchHeartbeat(attempt.id, now.toISOString());
  } catch (cause) {
    console.warn(`[exam] heartbeat no actualizado para ${attempt.id}: ${String(cause)}`);
  }

  // --- 7. Telemetría (best effort) ----------------------------------------
  await deps.events.emit(input.schoolId, input.studentId, [
    {
      eventType: "answer_changed",
      attemptId: attempt.id,
      attemptItemId: input.attemptItemId,
      seq: seqForResponse(item.ord, inserted.revision, 0),
      payload: {
        revision: inserted.revision,
        changeCount: inserted.revision,
        timeOnItemMs: input.timeOnItemMs ?? 0,
      },
      clientTs: input.clientTs,
    },
    {
      eventType: "attempt_autosaved",
      attemptId: attempt.id,
      attemptItemId: input.attemptItemId,
      seq: seqForResponse(item.ord, inserted.revision, 1),
      payload: { ord: item.ord, revision: inserted.revision },
      clientTs: input.clientTs,
    },
  ]);

  return {
    attemptItemId: input.attemptItemId,
    revision: inserted.revision,
    serverTs: inserted.server_ts,
    serverNow: now.toISOString(),
    serverDeadlineAt: attempt.server_deadline_at,
    remainingMs: remainingMs(attempt, now),
  };
}
