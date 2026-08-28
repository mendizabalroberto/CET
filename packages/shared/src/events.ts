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
  // Interfaz — la secuencia literal de lo que el alumno toca.
  // Se añaden AL FINAL a propósito: el orden de un enum de Postgres es su orden
  // de comparacion, y meter un miembro en medio reescribiria el significado de
  // cualquier `order by event_type` ya escrito.
  "session_context",
  "ui_interaction",
  "nav_route_changed",
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

  /* ---------------------------------------------------------------------- */
  /* Interfaz                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Las condiciones en las que ocurre TODO lo demás de la sesión. Se emite una
   * sola vez, con `seq` 0, al arrancar la cola.
   *
   * Sin esto la secuencia es ilegible: `ui_interaction` cuenta que el alumno
   * pulsó `practica.siguiente` a los 400 ms, pero no si lo hizo con el dedo en
   * una tableta de 360 px o con el teclado en un portatil. La misma secuencia
   * significa cosas distintas según el aparato, y es justo la comparación entre
   * aparatos la que explica la mitad de las rarezas de un panel de conducta.
   *
   * NADA de aquí identifica al alumno más allá de lo que ya sabe el servidor:
   * no se guarda el user-agent completo (es una huella de navegador), sino los
   * ejes que se van a analizar.
   */
  session_context: z.object({
    viewportW: z.number().int().positive(),
    viewportH: z.number().int().positive(),
    /** devicePixelRatio. Distingue una tableta retina de un portátil barato. */
    dpr: z.number().positive(),
    /** `fine` = ratón o lápiz; `coarse` = dedo. De `matchMedia('(pointer:...)')`. */
    pointer: z.enum(["fine", "coarse", "none"]),
    /** Modalidad con la que ARRANCA la sesión; `ui_interaction` trae la de cada acto. */
    modality: z.enum(["touch", "mouse", "keyboard", "pen", "unknown"]),
    theme: z.enum(["light", "dark"]),
    locale: z.string().min(2).max(35),
    /** IANA, p. ej. `America/Santiago`. Ordena los hábitos por la hora REAL del alumno. */
    timezone: z.string().min(1).max(64),
    reducedMotion: z.boolean(),
    /** `navigator.connection.effectiveType`. Ausente en Safari y Firefox. */
    connection: z.enum(["slow-2g", "2g", "3g", "4g", "unknown"]).default("unknown"),
    /** Para no mezclar conductas de dos versiones distintas de la interfaz. */
    appVersion: z.string().max(40).optional(),
  }),

  /**
   * Un acto sobre un control de la interfaz. Es el evento que responde a «qué
   * botones apreté y en qué orden».
   *
   * `control` es un IDENTIFICADOR ESTABLE puesto a mano (`data-cet-id`), nunca
   * el texto del botón ni un selector CSS. La diferencia decide si el análisis
   * sobrevive: el dia que "Siguiente" pase a "Continuar" —o que la lección se
   * traduzca al español, que es lo que acaba de pasar en este repositorio— un
   * análisis por texto se parte en dos series que nadie sabe que eran la misma.
   */
  ui_interaction: z.object({
    /** Jerárquico y estable: `practica.siguiente`, `examen.navegador.p7`. */
    control: z.string().min(1).max(80),
    /** Dónde ocurre: `learn`, `practice`, `exam`, `account`, `nav`. */
    surface: z.string().min(1).max(40),
    action: z.enum(["click", "keydown", "change", "toggle", "open", "close"]),
    /**
     * El valor RESULTANTE cuando el control tiene uno (una pestaña elegida, un
     * conmutador). Números y booleanos tal cual; texto solo si es de un conjunto
     * cerrado. NUNCA texto escrito por el alumno: la respuesta a una pregunta
     * viaja en `answer_submitted`, que es donde se puntúa y donde está pensada
     * la retención.
     */
    value: z.union([z.string().max(120), z.number(), z.boolean()]).optional(),
    /** Cuántos actos de interfaz lleva la sesión. Hueco = evento perdido, no inactividad. */
    ordinal: z.number().int().nonnegative(),
    /** Milisegundos desde el acto ANTERIOR. El ritmo: duda, tanteo o automatismo. */
    sinceLastMs: z.number().int().nonnegative(),
    modality: z.enum(["touch", "mouse", "keyboard", "pen", "unknown"]),
  }),

  /** Cambio de pantalla. `dwellMs` es lo que estuvo en la que deja. */
  nav_route_changed: z.object({
    from: z.string().max(200),
    to: z.string().max(200),
    dwellMs: z.number().int().nonnegative(),
  }),
} as const;

export type EventPayloadFor<T extends keyof typeof eventPayloads> = z.infer<
  (typeof eventPayloads)[T]
>;
