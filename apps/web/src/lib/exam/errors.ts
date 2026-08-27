/**
 * Errores del motor de examen autoritativo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * REGLA: la lógica de negocio LANZA `ExamError`; la Route Handler lo traduce a
 * HTTP. Así `src/lib/exam/**` se puede testear sin montar una petición, y el
 * código de estado no se decide en quince sitios distintos.
 *
 * SOBRE LOS CÓDIGOS QUE SE DEVUELVEN AL CLIENTE
 * ---------------------------------------------------------------------------
 * `code` es un identificador estable y NO un mensaje: la UI lo traduce con
 * `dictionaries/exam-api.*.ts`. Nunca se devuelve `message` al cliente — los
 * mensajes están escritos para el log del servidor y describen el modelo de
 * datos con más detalle del que un alumno necesita (o debe) conocer.
 *
 * SOBRE 404 vs 403
 * ---------------------------------------------------------------------------
 * Todo lo que no es tuyo responde 404, nunca 403. Un 403 sobre el intento de
 * otro alumno confirma que ese intento existe, y con eso se enumera la base de
 * datos a fuerza de probar UUIDs. `not_found` cubre: asignación inexistente,
 * asignación de otra clase, intento ajeno e intento de otro colegio.
 */

export type ExamErrorCode =
  /** No hay sesión válida. */
  | "unauthenticated"
  /** La sesión existe pero no es de un alumno activo. */
  | "forbidden"
  /** No existe, o existe y no es tuyo. Deliberadamente indistinguibles. */
  | "not_found"
  /** El cuerpo de la petición no cumple el esquema Zod. */
  | "invalid_request"
  /** La ventana del examen aún no ha abierto. */
  | "window_not_open"
  /** La ventana del examen ya se cerró. */
  | "window_closed"
  /** Ya se han consumido todos los intentos permitidos. */
  | "max_attempts_reached"
  /** El `server_deadline_at` ya pasó. La entrega automática ya se ha disparado. */
  | "deadline_passed"
  /** El intento no está `in_progress` (entregado, anulado o abandonado). */
  | "attempt_not_in_progress"
  /** El intento aún no se ha entregado: todavía no hay resultado que enseñar. */
  | "attempt_not_submitted"
  /** El banco no tiene preguntas suficientes para alguna sección. */
  | "insufficient_pool"
  /** El blueprint no se puede materializar (0 secciones, selección corrupta...). */
  | "blueprint_invalid"
  /** Otro proceso está materializando este mismo intento. Reintentable. */
  | "attempt_starting"
  /** Demasiadas peticiones. */
  | "rate_limited"
  /** Fallo del servidor. Nunca se detalla al cliente. */
  | "internal";

const STATUS_BY_CODE: Record<ExamErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  window_not_open: 409,
  window_closed: 409,
  max_attempts_reached: 409,
  deadline_passed: 409,
  attempt_not_in_progress: 409,
  attempt_not_submitted: 409,
  insufficient_pool: 409,
  blueprint_invalid: 409,
  attempt_starting: 409,
  rate_limited: 429,
  internal: 500,
};

/**
 * Datos que SÍ se pueden devolver al cliente junto al código.
 *
 * Se tipa explícitamente en vez de admitir un `Record<string, unknown>`: así es
 * imposible que alguien adjunte por comodidad la fila entera del intento —
 * `answer_key` incluida — a un cuerpo de error.
 */
export interface ExamErrorPublicDetails {
  /** El intento afectado, cuando el cliente necesita navegar a él (p. ej. tras `deadline_passed`). */
  readonly attemptId?: string;
  /** Cuándo vuelve a abrir la ventana / cuándo cerró. ISO-8601. */
  readonly opensAt?: string;
  readonly closesAt?: string;
  /** Reloj del servidor en el momento del rechazo. El cliente lo usa para resincronizar. */
  readonly serverNow?: string;
  /** Intentos consumidos y permitidos, para poder decirlo en la UI. */
  readonly attemptsUsed?: number;
  readonly maxAttempts?: number;
}

export class ExamError extends Error {
  readonly code: ExamErrorCode;
  readonly httpStatus: number;
  readonly publicDetails: ExamErrorPublicDetails;

  constructor(code: ExamErrorCode, message: string, publicDetails: ExamErrorPublicDetails = {}) {
    super(message);
    this.name = "ExamError";
    this.code = code;
    this.httpStatus = STATUS_BY_CODE[code];
    this.publicDetails = publicDetails;
  }
}

export function isExamError(value: unknown): value is ExamError {
  return value instanceof ExamError;
}

/**
 * Error de infraestructura (la consulta a Postgres falló).
 *
 * Se envuelve en un `internal` en vez de dejar escapar el mensaje de PostgREST:
 * esos mensajes citan nombres de tabla, de columna y de constraint, que es un
 * mapa gratuito del modelo de datos para quien esté probando la API.
 */
export function dbFailure(operation: string, detail: string): ExamError {
  return new ExamError("internal", `[exam] ${operation} falló: ${detail}`);
}
