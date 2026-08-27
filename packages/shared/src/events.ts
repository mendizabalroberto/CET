/**
 * CONTRATO DE TELEMETRÍA — learning_events.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Esta es la capa que hace posible el aprendizaje adaptativo, la detección de
 * debilidades y el análisis con IA. Todo lo que el alumno hace pasa por aquí.
 *
 * REGLAS DURAS
 *  1. Append-only. Un evento nunca se actualiza ni se borra.
 *  2. `clientTs` es lo que dijo el navegador; `server_ts` lo pone la base de datos.
 *     Nada que puntúe usa `clientTs` — el reloj del cliente es manipulable.
 *  3. `seq` ordena los eventos dentro de una sesión aunque los relojes mientan
 *     y aunque los lotes lleguen desordenados.
 *  4. Ingesta SIEMPRE en lote (cada 5 s o 20 eventos). Un round-trip por evento
 *     saturaría la red del colegio y arruinaría el bucle de práctica.
 */

import { z } from "zod";

export const learningEventType = z.enum([
  // Ciclo de vida del intento
  "attempt_started",
  "attempt_resumed",
  "attempt_paused",
  "attempt_autosaved",
  "attempt_submitted",
  // Interacción con la pregunta
  "question_shown",
  "question_skipped",
  "question_revisited",
  "answer_changed",
  "answer_submitted",
  "answer_cleared",
  // Ayuda
  "hint_requested",
  "solution_viewed",
  // Atención
  "idle_start",
  "idle_end",
  "focus_lost",
  "focus_gained",
  // Contenido
  "lesson_opened",
  "lesson_block_viewed",
  "lesson_completed",
  "video_started",
  "video_progress",
  "video_completed",
  // Práctica y juegos
  "practice_started",
  "practice_item_answered",
  "practice_streak",
  "game_started",
  "game_completed",
  // Cuenta
  "login_success",
  "login_failed",
  "pin_changed",
]);
export type LearningEventType = z.infer<typeof learningEventType>;

/**
 * Evento tal como lo emite el cliente. El servidor añade school_id, student_id
 * y server_ts a partir de la sesión autenticada — el cliente NUNCA los declara,
 * porque entonces podría escribir eventos en nombre de otro alumno.
 */
export const clientEvent = z.object({
  sessionId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  eventType: learningEventType,

  attemptId: z.string().uuid().optional(),
  attemptItemId: z.string().uuid().optional(),
  lessonId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),

  payload: z.record(z.unknown()).default({}),
  clientTs: z.string().datetime(),
});
export type ClientEvent = z.infer<typeof clientEvent>;

/** Tamaño máximo de lote. Protege la Route Handler de ingesta. */
export const MAX_EVENT_BATCH = 100;

export const eventBatch = z.object({
  events: z.array(clientEvent).min(1).max(MAX_EVENT_BATCH),
});
export type EventBatch = z.infer<typeof eventBatch>;

/* -------------------------------------------------------------------------- */
/* Payloads tipados por evento                                                */
/* -------------------------------------------------------------------------- */

/**
 * `payload` es un record abierto en la frontera para que un evento nuevo no
 * rompa clientes antiguos, pero cada tipo tiene su forma esperada. Los consumidores
 * de analítica parsean con estos esquemas; lo que no valide se cuenta como
 * malformado en vez de contaminar las métricas silenciosamente.
 */
export const eventPayloads = {
  question_shown: z.object({
    ord: z.number().int(),
    difficulty: z.number().int().min(1).max(5).optional(),
  }),
  answer_changed: z.object({
    revision: z.number().int().nonnegative(),
    /** Cuántas veces ha cambiado ya de opinión en este item. */
    changeCount: z.number().int().nonnegative(),
    timeOnItemMs: z.number().int().nonnegative(),
  }),
  answer_submitted: z.object({
    timeOnItemMs: z.number().int().nonnegative(),
    changeCount: z.number().int().nonnegative(),
    hintsUsed: z.number().int().nonnegative(),
    isCorrect: z.boolean().optional(), // solo en práctica; en examen lo decide el servidor
  }),
  hint_requested: z.object({
    hintIndex: z.number().int().nonnegative(),
    timeBeforeHintMs: z.number().int().nonnegative(),
  }),
  question_skipped: z.object({
    ord: z.number().int(),
    timeOnItemMs: z.number().int().nonnegative(),
  }),
  idle_end: z.object({
    idleMs: z.number().int().nonnegative(),
  }),
  focus_gained: z.object({
    awayMs: z.number().int().nonnegative(),
  }),
  lesson_block_viewed: z.object({
    blockId: z.string().uuid(),
    kind: z.string(),
    dwellMs: z.number().int().nonnegative(),
  }),
  video_progress: z.object({
    positionSeconds: z.number().nonnegative(),
    durationSeconds: z.number().positive(),
  }),
  practice_streak: z.object({
    streak: z.number().int().nonnegative(),
  }),
  login_failed: z.object({
    reason: z.enum(["bad_pin", "locked", "unknown_code", "school_suspended"]),
  }),
} as const;

export type EventPayloadFor<T extends keyof typeof eventPayloads> = z.infer<
  (typeof eventPayloads)[T]
>;
