/**
 * Las comprobaciones que hacen que el cliente no pueda mentir.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Todo lo de aquí es puro: recibe filas y un instante, devuelve o lanza. Sin
 * red, sin base de datos, sin `Date.now()` escondido. Ese es exactamente el
 * motivo de que se pueda probar el caso "el alumno adelanta el reloj una hora"
 * sin tocar un servidor.
 *
 * ===========================================================================
 * EL RELOJ
 * ===========================================================================
 * `clientTs` se guarda como dato forense y NO decide nada (DATA_MODEL §0). El
 * instante que manda lo produce `serverNow()`, que es el reloj del proceso de
 * servidor.
 *
 * Matiz honesto: DATA_MODEL dice "now() de Postgres". El proceso de Node y
 * Postgres son dos máquinas distintas, ambas sincronizadas por NTP, con un
 * desfase típico de milisegundos. Lo que importa para la seguridad es que
 * NINGUNO de los dos es el portátil del alumno: adelantar el reloj del cliente
 * no mueve ni un milisegundo de `server_deadline_at`, que se calculó y se
 * persistió en el servidor.
 *
 * Cuando exista `app.server_now()` como RPC (hoy no está en las migraciones y
 * este módulo no puede añadirla), `serverNow()` se sustituye por una llamada a
 * ella sin tocar ni una línea de la lógica: por eso es una función y no
 * `new Date()` esparcido por el código. Anotado en REVIEW.md.
 */
import type { AttemptRow, AssignmentRow } from "./types";
import { ExamError } from "./errors";

/** El instante autoritativo. Único punto del módulo que lee un reloj. */
export function serverNow(): Date {
  return new Date();
}

/**
 * Margen de gracia sobre el deadline para el autoguardado.
 *
 * No es generosidad: es latencia. Una respuesta que el alumno pulsó a falta de
 * 300 ms puede tardar 1,2 s en llegar por la wifi del colegio, y rechazarla
 * castigaría al niño por la red del centro. Dos segundos cubren eso y no dan
 * tiempo a leer, decidir y teclear nada.
 *
 * La ENTREGA no tiene gracia: el examen se cierra cuando se cierra.
 */
export const AUTOSAVE_GRACE_MS = 2_000;

function toTime(iso: string, label: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new ExamError("internal", `[exam] ${label} no es una fecha válida: ${iso}`);
  }
  return ms;
}

/* -------------------------------------------------------------------------- */
/* Ventana de la asignación                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `[opens_at, closes_at)`. Cerrado por la izquierda y abierto por la derecha:
 * a la hora exacta de cierre el examen ya NO se puede arrancar, que es lo que
 * significa "cierra a las 10:00".
 */
export function assertWithinWindow(assignment: AssignmentRow, now: Date): void {
  const opens = toTime(assignment.opens_at, "opens_at");
  const closes = toTime(assignment.closes_at, "closes_at");
  const t = now.getTime();

  if (t < opens) {
    throw new ExamError("window_not_open", "El examen todavía no ha abierto", {
      opensAt: assignment.opens_at,
      closesAt: assignment.closes_at,
      serverNow: now.toISOString(),
    });
  }
  if (t >= closes) {
    throw new ExamError("window_closed", "La ventana del examen ya se ha cerrado", {
      opensAt: assignment.opens_at,
      closesAt: assignment.closes_at,
      serverNow: now.toISOString(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Propiedad del intento                                                      */
/* -------------------------------------------------------------------------- */

/**
 * El intento tiene que ser DEL alumno de la sesión y DE su colegio.
 *
 * Se comprueban las dos cosas aunque `student_id` ya implique el colegio: el
 * `school_id` de `exam_attempts` está denormalizado (DATA_MODEL §6) y esta es
 * la última red antes de servir datos. Si algún día divergieran, el fallo debe
 * ser "no se ve" y no "se ve el del colegio equivocado".
 *
 * Siempre 404. Un 403 confirmaría que el intento existe.
 */
export function assertAttemptBelongsToStudent(
  attempt: AttemptRow | null,
  studentId: string,
  schoolId: string,
): AttemptRow {
  if (!attempt || attempt.student_id !== studentId || attempt.school_id !== schoolId) {
    throw new ExamError("not_found", "El intento no existe o no pertenece a este alumno");
  }
  return attempt;
}

/** El intento sigue abierto. Un intento entregado, anulado o abandonado no admite escrituras. */
export function assertInProgress(attempt: AttemptRow): void {
  if (attempt.status !== "in_progress") {
    throw new ExamError("attempt_not_in_progress", `El intento está en estado ${attempt.status}`, {
      attemptId: attempt.id,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Deadline                                                                   */
/* -------------------------------------------------------------------------- */

export function remainingMs(attempt: AttemptRow, now: Date): number {
  return Math.max(0, toTime(attempt.server_deadline_at, "server_deadline_at") - now.getTime());
}

/** `true` cuando el tiempo se ha agotado según el servidor. `graceMs` solo aplica al autosave. */
export function isExpired(attempt: AttemptRow, now: Date, graceMs = 0): boolean {
  return now.getTime() > toTime(attempt.server_deadline_at, "server_deadline_at") + graceMs;
}

/**
 * La línea que hace inútil adelantar el reloj del portátil.
 *
 * No recibe `clientTs` a propósito: si lo recibiera, tarde o temprano alguien
 * lo usaría "solo para desempatar" y el examen pasaría a durar lo que el
 * alumno quisiera.
 */
export function assertBeforeDeadline(attempt: AttemptRow, now: Date, graceMs = 0): void {
  if (isExpired(attempt, now, graceMs)) {
    throw new ExamError("deadline_passed", "El tiempo del examen ya se ha agotado", {
      attemptId: attempt.id,
      serverNow: now.toISOString(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Intentos disponibles                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `max_attempts` lo manda la ASIGNACIÓN, no el blueprint: el profesor que pone
 * el examen es quien decide cuántas oportunidades da a esta clase concreta.
 */
export function assertAttemptsAvailable(used: number, maxAttempts: number): void {
  if (used >= maxAttempts) {
    throw new ExamError("max_attempts_reached", "No quedan intentos disponibles", {
      attemptsUsed: used,
      maxAttempts,
    });
  }
}
