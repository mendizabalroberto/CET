/**
 * Tiempo del examen. Puro y sin `Date.now()` implícito.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * AD-5, literal: **la única verdad temporal es `exam_attempts.server_deadline_at`.**
 * El reloj de pared del navegador no participa en ninguna decisión. Todo lo que
 * hay aquí se calcula a partir de dos instantes que vienen AMBOS del servidor
 * (`serverDeadlineAt` y `serverNow`) y de un reloj MONÓTONO local, que mide
 * intervalos y no fechas.
 *
 * Consecuencia práctica: adelantar el reloj del sistema media hora no quita ni
 * regala un segundo, porque la diferencia `deadline - serverNow` se calcula una
 * sola vez con dos valores del servidor y a partir de ahí solo se descuentan
 * intervalos medidos con `performance.now()`.
 *
 * Y aunque alguien manipulara esto: el cronómetro solo MUESTRA. Quien cierra el
 * intento y quien rechaza una respuesta tardía es Postgres, comparando contra
 * su propio `now()`.
 */

/**
 * Milisegundos de examen que quedaban en el instante `serverNow`.
 * `NaN` si alguna de las dos fechas es ilegible — el llamante decide qué hacer,
 * pero nunca se devuelve un número inventado.
 */
export function initialRemainingMs(serverDeadlineAt: string | Date, serverNow: string | Date): number {
  const deadline = toMillis(serverDeadlineAt);
  const now = toMillis(serverNow);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return Number.NaN;
  return deadline - now;
}

/**
 * Tiempo restante ahora mismo, descontando el intervalo MONÓTONO transcurrido
 * desde que se recibió la referencia del servidor.
 *
 * @param elapsedMonotonicMs `performance.now()` de ahora menos el de entonces.
 *   Se pasa como argumento en vez de leerlo dentro para que esta función sea
 *   pura y comprobable.
 */
export function remainingMs(initialRemaining: number, elapsedMonotonicMs: number): number {
  if (!Number.isFinite(initialRemaining)) return Number.NaN;
  return Math.max(0, initialRemaining - Math.max(0, elapsedMonotonicMs));
}

/**
 * Desfase del reloj del alumno respecto del servidor. **No se usa para nada que
 * puntúe**: se emite como telemetría porque un desfase grande es información
 * (una tableta mal configurada, o alguien probando suerte), y porque explica
 * después por qué un `client_ts` de `attempt_responses` parece del futuro.
 */
export function clientClockSkewMs(serverNow: string | Date, clientNowMs: number): number {
  const server = toMillis(serverNow);
  if (!Number.isFinite(server)) return 0;
  return clientNowMs - server;
}

/** Umbral a partir del cual el desfase merece un evento de telemetría: 2 minutos. */
export const NOTABLE_SKEW_MS = 120_000;

function toMillis(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** Reloj monótono. Inmune a que se cambie la hora del sistema a mitad del examen. */
export function monotonicNow(): number {
  const perf = globalThis.performance as Performance | undefined;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
}
