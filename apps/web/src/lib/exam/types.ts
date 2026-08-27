/**
 * Formas de fila y contratos de salida del motor de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Las interfaces `*Row` describen columnas de Postgres, así que usan snake_case
 * a propósito: son el eco literal del `select`. Todo lo que sale hacia el
 * cliente usa camelCase y vive en las interfaces `*Payload`.
 *
 * INVARIANTE DE ESTE FICHERO: ninguna interfaz que se serialice hacia el
 * cliente puede declarar `answerKey`, `answer_key`, `itemSeed` ni `item_seed`.
 * Esa es la razón de que `StudentItemRow` y `GradingItemRow` sean tipos
 * DISTINTOS y no uno con campos opcionales: con campos opcionales, un `select`
 * de más se serializaría sin que el compilador dijera nada.
 */
import type { AttemptStatus, FeedbackMode, GradingMode, SubmittedBy } from "@cet/shared";

/* -------------------------------------------------------------------------- */
/* Filas de la base de datos                                                  */
/* -------------------------------------------------------------------------- */

export interface AssignmentRow {
  readonly id: string;
  readonly blueprint_id: string;
  readonly blueprint_version: number;
  readonly school_id: string;
  readonly section_id: string | null;
  readonly opens_at: string;
  readonly closes_at: string;
  readonly max_attempts: number;
  readonly time_limit_override_seconds: number | null;
}

export interface BlueprintRow {
  readonly id: string;
  readonly course_id: string;
  readonly school_id: string | null;
  readonly title: unknown;
  readonly duration_seconds: number;
  readonly shuffle_questions: boolean;
  readonly shuffle_options: boolean;
  readonly allow_back: boolean;
  readonly feedback_mode: FeedbackMode;
  readonly pass_threshold: number;
  readonly max_attempts: number;
  readonly version: number;
}

export interface BlueprintSectionRow {
  readonly ord: number;
  readonly title: unknown;
  readonly item_count: number;
  readonly selection: unknown;
  readonly source: "bank" | "generated" | "mixed";
  readonly points_per_item: number;
}

/** Pregunta del banco tal cual sale del join questions × question_versions. */
export interface PoolRow {
  readonly question_id: string;
  readonly kind: "static" | "generated";
  readonly skill_id: string;
  readonly version_id: string;
  readonly format: string;
  readonly body: unknown;
  readonly answer_spec: unknown;
  readonly difficulty: number;
  readonly max_points: number;
  readonly grading_mode: GradingMode;
}

export interface AttemptRow {
  readonly id: string;
  readonly assignment_id: string;
  readonly student_id: string;
  readonly school_id: string;
  readonly attempt_number: number;
  readonly blueprint_snapshot: unknown;
  readonly seed: number;
  readonly status: AttemptStatus;
  readonly started_at: string;
  readonly server_deadline_at: string;
  readonly submitted_at: string | null;
  readonly graded_at: string | null;
  readonly submitted_by: SubmittedBy | null;
  readonly score_raw: number | null;
  readonly score_max: number | null;
  readonly score_pct: number | null;
  readonly passed: boolean | null;
}

/**
 * Item tal como lo devuelve la VISTA `attempt_items_student`.
 * La vista no tiene `answer_key` ni `item_seed`: no es que no se seleccionen,
 * es que no existen ahí (DATA_MODEL §9, capa 3).
 */
export interface StudentItemRow {
  readonly id: string;
  readonly attempt_id: string;
  readonly ord: number;
  readonly section_ord: number | null;
  readonly question_id: string;
  readonly question_version_id: string;
  readonly rendered_body: unknown;
  readonly option_order: number[] | null;
  readonly skill_id: string | null;
  readonly difficulty: number | null;
  readonly max_points: number;
}

/** Item con su clave. SOLO se construye dentro de la corrección del servidor. */
export interface GradingItemRow {
  readonly id: string;
  readonly ord: number;
  readonly answer_key: unknown;
  readonly max_points: number;
  readonly grading_mode: GradingMode;
}

export interface ResponseRow {
  readonly id: string;
  readonly attempt_item_id: string;
  readonly revision: number;
  readonly response: unknown;
  readonly is_final: boolean;
  readonly server_ts: string;
}

export interface GradingRow {
  readonly attempt_item_id: string;
  readonly points_awarded: number;
  readonly max_points: number;
  readonly is_correct: boolean | null;
  readonly partial_ratio: number | null;
  readonly rationale: string | null;
  readonly graded_by: "auto" | "manual";
}

/* -------------------------------------------------------------------------- */
/* Contratos de salida — lo que SÍ cruza al cliente                           */
/* -------------------------------------------------------------------------- */

/** Un item tal como lo ve el alumno durante el examen. */
export interface StudentItemPayload {
  readonly id: string;
  readonly ord: number;
  readonly sectionOrd: number | null;
  readonly maxPoints: number;
  readonly difficulty: number | null;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly skillId: string | null;
  /**
   * Qué widget de entrada pintar. Sale de `question_versions.format`.
   *
   * Se envía porque sin él el cliente tiene que ADIVINARLO mirando el enunciado
   * (`inferFormat` en `components/exam-runner/normalize.ts`), y `fraction`,
   * `ordering` y `matching` no son inferibles: caerían a un campo de texto
   * libre. Un alumno al que se le pide ordenar cuatro cosas en una caja de
   * texto no puede responder bien aunque sepa hacerlo.
   */
  readonly format: string | null;
  /** `RenderedBody` de @cet/shared, ya saneado por el motor al materializar. */
  readonly renderedBody: unknown;
  /**
   * La permutación aplicada. Se envía porque la UI la necesita para reconstruir
   * el mismo orden al recargar; no filtra nada, porque las opciones ya llegan
   * barajadas en `renderedBody` y `option_order` sin la clave no dice cuál es
   * la buena.
   */
  readonly optionOrder: number[] | null;
  /** Última respuesta guardada, para hidratar tras una recarga. `null` si no ha respondido. */
  readonly savedResponse: unknown;
  readonly savedRevision: number | null;
}

export interface AttemptClockPayload {
  /** Reloj del SERVIDOR en el momento de responder. El cliente calcula su desfase con esto. */
  readonly serverNow: string;
  /** La única verdad temporal (DATA_MODEL §6). */
  readonly serverDeadlineAt: string;
  /** Milisegundos restantes según el servidor. Redundante, pero evita que el cliente reste mal. */
  readonly remainingMs: number;
}

export interface StartAttemptPayload extends AttemptClockPayload {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly startedAt: string;
  /** `true` cuando se ha devuelto un intento ya existente (red caída, segunda pestaña). */
  readonly resumed: boolean;
  readonly allowBack: boolean;
  readonly feedbackMode: FeedbackMode;
  readonly durationSeconds: number;
  readonly items: readonly StudentItemPayload[];
}

export interface AutosavePayload extends AttemptClockPayload {
  readonly attemptItemId: string;
  readonly revision: number;
  /** Hora de servidor de la fila insertada. `client_ts` se guarda, pero no manda. */
  readonly serverTs: string;
}

/**
 * Los cuatro números de la nota, PLANOS en la raíz del resultado.
 *
 * No anidados bajo `score`: el cliente del examen
 * (`components/exam-runner/normalize.ts`) los lee de la raíz, y una diferencia
 * de forma entre las dos vías se manifestaría como "el alumno entrega y ve
 * 0/0", que es la peor forma posible de descubrir un desajuste de contrato.
 */
export interface ScorePayload {
  readonly scoreRaw: number | null;
  readonly scoreMax: number | null;
  readonly scorePct: number | null;
  readonly passed: boolean | null;
}

/** Revisión de un item. Solo se emite si `feedback_mode` lo permite Y el intento está `graded`. */
export interface ItemReviewPayload {
  readonly attemptItemId: string;
  readonly ord: number;
  readonly renderedBody: unknown;
  readonly optionOrder: number[] | null;
  readonly response: unknown;
  readonly pointsAwarded: number;
  readonly maxPoints: number;
  readonly isCorrect: boolean | null;
  readonly partialRatio: number | null;
  readonly rationale: string | null;
  /** Respuesta canónica en texto. NUNCA la `answer_key` cruda. */
  readonly correctAnswer: string | null;
  readonly requiresManualReview: boolean;
}

export interface AttemptResultPayload extends ScorePayload {
  readonly attemptId: string;
  readonly status: AttemptStatus;
  readonly submittedAt: string | null;
  readonly submittedBy: SubmittedBy | null;
  readonly gradedAt: string | null;
  readonly feedbackMode: FeedbackMode;
  /** Cuántos items esperan corrección humana. */
  readonly pendingManualReview: number;
  /**
   * La revisión pregunta a pregunta. `null` —y no `[]`— cuando NO procede
   * enseñarla (`feedback_mode = 'never'`, o el intento aún sin calificar).
   *
   * La distinción importa: `[]` significaría "un examen de cero preguntas" y el
   * cliente pintaría una revisión vacía; `null` significa "aquí no hay revisión
   * que enseñar" y el cliente enseña solo la nota.
   */
  readonly items: readonly ItemReviewPayload[] | null;
}
