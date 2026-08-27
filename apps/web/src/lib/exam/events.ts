/**
 * Telemetría emitida por el SERVIDOR durante un examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `/api/events` recoge lo que cuenta el navegador. Esto es otra cosa: los
 * hechos que el servidor SABE, y que por tanto no dependen de que el cliente
 * los reporte. `attempt_started`, `answer_changed` y `attempt_submitted` tienen
 * que existir en `learning_events` aunque el alumno cierre el portátil de
 * golpe.
 *
 * DOS DECISIONES QUE MERECEN EXPLICACIÓN
 * ---------------------------------------------------------------------------
 * 1. `session_id = attemptId`. Un examen ES una sesión de uso, y usar el id del
 *    intento garantiza que estos eventos jamás colisionan con los del cliente,
 *    cuyo `sessionId` es un uuid aleatorio distinto.
 * 2. `seq` DETERMINISTA a partir de (ord, revision). `learning_events` ordena
 *    por `seq` dentro de la sesión precisamente para no depender de relojes
 *    (contrato de `events.ts`, regla 3), así que el servidor no puede usar un
 *    contador en memoria: se reinicia con cada instancia serverless. Con
 *    `ord × 100000 + revisión × 2` el orden es correcto y no hay colisiones
 *    (ord ≤ 200 por el CHECK de `item_count`, y ninguna revisión llega a 50.000).
 *
 * BEST EFFORT, SIEMPRE
 * ---------------------------------------------------------------------------
 * Un fallo de telemetría NO puede tumbar un autoguardado. Si el insert falla se
 * registra en el log del servidor y la respuesta del alumno sigue guardada. El
 * dato analítico es valioso; el examen del niño lo es más.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningEventType } from "@cet/shared";

export interface ExamEvent {
  readonly eventType: LearningEventType;
  readonly attemptId: string;
  readonly attemptItemId?: string;
  readonly questionId?: string;
  readonly skillId?: string;
  readonly seq: number;
  readonly payload: Record<string, unknown>;
  /** Lo que dijo el navegador. Dato forense, nunca verdad (DATA_MODEL §0). */
  readonly clientTs?: string | null;
}

export interface ExamEventEmitter {
  emit(schoolId: string, studentId: string, events: readonly ExamEvent[]): Promise<void>;
}

/** `seq` del arranque/reanudación: siempre el primero de la sesión. */
export const SEQ_ATTEMPT_START = 0;
/** `seq` de la entrega: siempre el último. Cabe en `integer` (2^31-1). */
export const SEQ_ATTEMPT_SUBMIT = 2_000_000_000;

/** Ver la nota 2 de la cabecera. `+0` = answer_changed, `+1` = attempt_autosaved. */
export function seqForResponse(ord: number, revision: number, offset: 0 | 1): number {
  return ord * 100_000 + revision * 2 + offset;
}

export function createSupabaseEventEmitter(admin: SupabaseClient): ExamEventEmitter {
  return {
    async emit(schoolId, studentId, events) {
      if (events.length === 0) return;
      try {
        const { error } = await admin.from("learning_events").insert(
          events.map((event) => ({
            school_id: schoolId, // de la sesión, jamás del cuerpo
            student_id: studentId, // de la sesión, jamás del cuerpo
            session_id: event.attemptId,
            seq: event.seq,
            event_type: event.eventType,
            attempt_id: event.attemptId,
            attempt_item_id: event.attemptItemId ?? null,
            question_id: event.questionId ?? null,
            skill_id: event.skillId ?? null,
            payload: event.payload,
            client_ts: event.clientTs ?? null,
            // `server_ts` lo pone el DEFAULT: la hora de Postgres.
          })),
        );
        if (error) {
          console.warn(`[exam] telemetría no guardada (${error.code ?? "?"}): ${error.message}`);
        }
      } catch (cause) {
        console.warn(`[exam] telemetría no guardada: ${String(cause)}`);
      }
    },
  };
}

/** Emisor nulo. Para tests y para cualquier camino donde la telemetría sobre. */
export const noopEventEmitter: ExamEventEmitter = {
  async emit() {
    /* intencionadamente vacío */
  },
};
