/**
 * Contrato del cliente con el motor de examen del servidor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * AD-5 EN UNA FRASE: aquí NO hay `answerKey` ni `itemSeed`, y no los habrá.
 * Si algún día alguien añade uno de esos dos campos a este fichero, el examen
 * deja de ser auditable, porque la respuesta correcta viaja en el bundle y
 * cualquier alumno con el inspector abierto la lee. El test
 * `no-answer-key.test.ts` vigila precisamente eso.
 *
 * El cliente tampoco decide NADA que puntúe:
 *  - no calcula la nota,
 *  - no decide cuándo se acaba el examen (solo pide al servidor que lo cierre),
 *  - no asigna el número de revisión de una respuesta.
 */
import type {
  AttemptStatus,
  FeedbackMode,
  QuestionFormat,
  RenderedBody,
  StudentResponse,
} from "@cet/shared";

/**
 * Una fila de la vista `attempt_items_student` (DATA_MODEL §9), más dos campos
 * que el servidor añade y que NO son secretos:
 *
 *  - `format`: qué input pintar. Saberlo no ayuda a acertar.
 *  - `savedResponse`: la última revisión guardada del propio alumno. Es SUYA;
 *    devolvérsela es exactamente lo que hace posible la recuperación tras una
 *    recarga o una caída de red.
 */
export interface AttemptItemStudent {
  /** `attempt_items.id`. Es el `attemptItemId` que espera `/answer`. */
  readonly id: string;
  /** Orden real de presentación, base 1. */
  readonly ord: number;
  readonly sectionOrd: number | null;
  readonly questionId: string | null;
  readonly questionVersionId: string | null;
  readonly renderedBody: RenderedBody;
  readonly skillId: string | null;
  readonly difficulty: number | null;
  readonly maxPoints: number;
  readonly format: QuestionFormat;
  /** Última respuesta guardada por el servidor. `null` = nunca respondió. */
  readonly savedResponse: StudentResponse | null;
  readonly savedRevision: number | null;
  /**
   * Columnas de una pregunta de emparejar.
   *
   * HUECO DEL CONTRATO, documentado en REVIEW.md (H-3): `RenderedBody` de
   * `@cet/shared` no sabe representar las dos columnas de un `matching`, y ese
   * fichero pertenece a otra vía. Mientras tanto se leen de dos campos
   * hermanos opcionales del ítem. Si no vienen, `<AnswerInput>` degrada a un
   * campo de texto: una pregunta contestable de forma incómoda es mucho mejor
   * que una pregunta imposible de contestar.
   */
  readonly matchLeft: readonly { readonly id: string; readonly html: string }[] | null;
  readonly matchRight: readonly { readonly id: string; readonly html: string }[] | null;
}

export interface StartAttemptResponse {
  readonly attemptId: string;
  readonly items: readonly AttemptItemStudent[];
  /** ISO. Única verdad temporal del examen (DATA_MODEL §6). */
  readonly serverDeadlineAt: string;
  /** ISO. Hora del servidor en el instante de ESTA respuesta. */
  readonly serverNow: string;
  readonly allowBack: boolean;
  readonly feedbackMode: FeedbackMode;
  /** Presente si el servidor devolvió un intento ya en curso (recuperación). */
  readonly resumed: boolean;
}

export interface AnswerAccepted {
  readonly ok: true;
  /** Lo asigna el SERVIDOR. El cliente nunca lo inventa. */
  readonly revision: number;
}

/**
 * Revisión de un ítem. Solo llega cuando `feedbackMode` lo permite Y el intento
 * está corregido. Con `never`, `items` no viene, y aunque viniera
 * `shouldShowReview()` lo descarta antes de llegar al DOM.
 */
export interface AttemptResultItem {
  readonly attemptItemId: string;
  readonly ord: number;
  readonly isCorrect: boolean | null;
  readonly pointsAwarded: number;
  readonly maxPoints: number;
  /** Texto canónico de la respuesta correcta. Solo tras corregir. */
  readonly correctAnswer: string | null;
  readonly response: StudentResponse | null;
  readonly rationale: string | null;
}

export interface AttemptResult {
  readonly status: AttemptStatus;
  readonly attemptId: string | null;
  readonly scoreRaw: number | null;
  readonly scoreMax: number | null;
  readonly scorePct: number | null;
  readonly passed: boolean | null;
  readonly feedbackMode: FeedbackMode;
  readonly items: readonly AttemptResultItem[] | null;
}

export type SubmitReason = "student" | "timer";

/**
 * Error tipado de la capa de red. La UI decide el tono a partir de `kind`.
 *
 * NO se deduce del código HTTP. El motor del servidor devuelve **409 para nueve
 * situaciones distintas** — ventana cerrada, intentos agotados, deadline
 * vencido, intento ya entregado, banco insuficiente, materialización en
 * curso... — así que mirar el número daría el mensaje equivocado la mitad de
 * las veces. Lo que se lee es el campo `error` del cuerpo, que es un
 * identificador estable por contrato (`src/lib/exam/errors.ts`).
 */
export type ApiErrorKind =
  /** Sin red, DNS caído, servidor inalcanzable. NO es culpa del alumno. */
  | "offline"
  /** El deadline del servidor ya había pasado. El servidor ya entregó por timer. */
  | "deadline_passed"
  /** El intento ya no está `in_progress`. Para `/submit` significa: ya entregado. */
  | "already_submitted"
  /** Se pidió el resultado de un intento que todavía no se ha entregado. */
  | "not_submitted"
  /** La ventana del examen no está abierta, o no quedan intentos. */
  | "unavailable"
  /**
   * El examen no se ha podido preparar: banco insuficiente, blueprint inválido,
   * o hay otra materialización en curso. Reintentable salvo el segundo caso.
   */
  | "not_ready"
  /** Sesión caída o el alumno no tiene acceso. */
  | "unauthorized"
  /** No existe, o existe y no es suyo. El servidor los hace indistinguibles. */
  | "not_found"
  /** Demasiadas peticiones. */
  | "rate_limited"
  /** Cualquier otra cosa. */
  | "server";

/** `error` del cuerpo -> `kind`. Lo que no esté aquí cae a `server`. */
export const ERROR_CODE_TO_KIND: Readonly<Record<string, ApiErrorKind>> = {
  unauthenticated: "unauthorized",
  forbidden: "unauthorized",
  not_found: "not_found",
  window_not_open: "unavailable",
  window_closed: "unavailable",
  max_attempts_reached: "unavailable",
  deadline_passed: "deadline_passed",
  attempt_not_in_progress: "already_submitted",
  attempt_not_submitted: "not_submitted",
  insufficient_pool: "not_ready",
  blueprint_invalid: "not_ready",
  attempt_starting: "not_ready",
  rate_limited: "rate_limited",
  internal: "server",
  invalid_request: "server",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  /** Código estable del servidor, si lo mandó. Para telemetría, no para la UI. */
  readonly code: string | null;
  /** Cuerpo de la respuesta de error, cuando trae algo aprovechable. */
  readonly payload: unknown;

  constructor(kind: ApiErrorKind, status: number, message?: string, code: string | null = null, payload: unknown = undefined) {
    super(message ?? kind);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}
