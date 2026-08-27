/**
 * Cola de telemetría del cliente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Implementa las reglas duras de `@cet/shared/events`:
 *
 *   1. Envío SIEMPRE en lote: cada 5 s o cada 20 eventos. Un round-trip por
 *      evento saturaría la red de un colegio con 30 niños practicando a la vez
 *      y arruinaría el bucle de feedback <50 ms.
 *   2. `seq` monótono por sesión. Es lo que permite ordenar los eventos aunque
 *      el reloj del navegador esté mal y aunque los lotes lleguen desordenados.
 *   3. `clientTs` se envía como dato, nunca como verdad: el `server_ts` lo pone
 *      la base de datos.
 *   4. Al ocultarse la pestaña se hace `flush` con `navigator.sendBeacon`, que
 *      es lo único que sobrevive al cierre de la pestaña. Sin esto se pierden
 *      justo los eventos más interesantes: los del final de un examen.
 *
 * Este módulo NO deriva `school_id` ni `student_id`. No los conoce y no debe
 * conocerlos: los pone el servidor desde la sesión (ver `/api/events`).
 */
import { MAX_EVENT_BATCH, type ClientEvent, type LearningEventType } from "@cet/shared";

export const FLUSH_INTERVAL_MS = 5_000;
export const FLUSH_AT_COUNT = 20;
const ENDPOINT = "/api/events";

/** Tope de la cola en memoria. Si se supera, se descartan los MÁS ANTIGUOS. */
const MAX_QUEUE = 500;

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1_000;

/** Campos que el emisor rellena; `sessionId`, `seq` y `clientTs` los pone la cola. */
export type TrackInput = Omit<ClientEvent, "sessionId" | "seq" | "clientTs"> & {
  eventType: LearningEventType;
};

function newSessionId(): string {
  // Se toma una referencia tipada como opcional en vez de comprobar el global
  // directamente: `"randomUUID" in crypto` estrecha el tipo a `never` en la rama
  // de fallback, porque en lib.dom todo `Crypto` declara randomUUID. El fallback
  // existe para contextos NO seguros (http), donde el objeto real no la trae.
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new Error("Web Crypto no disponible: no se puede identificar la sesion de telemetria.");
  }
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class TelemetryQueue {
  private readonly sessionId: string;
  private seq = 0;
  private queue: ClientEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private sending = false;
  private disposed = false;

  constructor(sessionId: string = newSessionId()) {
    this.sessionId = sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  /** Solo para tests: estado observable sin exponer la cola. */
  get pending(): number {
    return this.queue.length;
  }

  start(): void {
    if (typeof window === "undefined" || this.timer || this.disposed) return;

    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);

    // `visibilitychange` es el único evento fiable en móvil: `beforeunload` y
    // `unload` no se disparan cuando iOS descarta una pestaña en segundo plano.
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
    if (typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener("pagehide", this.onPageHide);
    }
    this.flushWithBeacon();
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.flushWithBeacon();
  };

  private readonly onPageHide = (): void => {
    this.flushWithBeacon();
  };

  track(input: TrackInput): void {
    if (this.disposed) return;

    const event: ClientEvent = {
      ...input,
      sessionId: this.sessionId,
      seq: this.seq++,
      // Se envía tal cual lo dice el navegador. El servidor lo guarda como
      // `client_ts` y NO lo usa para nada que puntúe.
      clientTs: new Date().toISOString(),
      payload: input.payload ?? {},
    };

    this.queue.push(event);

    if (this.queue.length > MAX_QUEUE) {
      // Se tiran los antiguos y no los nuevos: en una sesión larga sin red, lo
      // reciente describe mejor lo que está pasando. La pérdida es visible
      // porque `seq` deja un hueco — el análisis puede contarla en vez de
      // asumir que no ocurrió nada.
      this.queue = this.queue.slice(-MAX_QUEUE);
    }

    if (this.queue.length >= FLUSH_AT_COUNT) void this.flush();
  }

  /**
   * Envío normal, con reintento y backoff exponencial.
   * Los eventos NO se pierden en un fallo: vuelven al principio de la cola.
   */
  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0 || typeof window === "undefined") return;

    const batch = this.queue.splice(0, MAX_EVENT_BATCH);
    this.sending = true;

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
        // La sesión va en cookie; sin credenciales el servidor no sabría de
        // quién son los eventos y los rechazaría.
        credentials: "same-origin",
        keepalive: true,
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        // Sin sesión: reintentar no arregla nada y reencolar haría crecer la
        // cola sin fin. Se descarta el lote.
        this.consecutiveFailures = 0;
        return;
      }

      if (response.status === 400) {
        // Lote malformado: reintentarlo daría 400 para siempre. Se descarta y
        // se deja constancia: es un bug nuestro, no un problema de red.
         
        console.error("[telemetry] lote rechazado por el servidor (400)");
        this.consecutiveFailures = 0;
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      this.consecutiveFailures = 0;
    } catch {
      // Red caída o 5xx: los eventos vuelven a la cabeza de la cola, en su
      // orden original, y se reintenta con backoff.
      this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
      this.consecutiveFailures += 1;
      this.scheduleRetry();
    } finally {
      this.sending = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return;
    if (this.consecutiveFailures > MAX_RETRIES) {
      // Se deja de insistir hasta el siguiente tick del intervalo normal: en
      // una red de colegio caída, reintentar sin fin solo empeora la congestión.
      this.consecutiveFailures = 0;
      return;
    }

    // Backoff exponencial con jitter. El jitter evita que treinta tabletas
    // reintenten en el mismo milisegundo al volver el wifi.
    const exponential = BASE_BACKOFF_MS * 2 ** (this.consecutiveFailures - 1);
    const jitter = Math.random() * BASE_BACKOFF_MS;
    const delay = Math.min(exponential + jitter, 60_000);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  /**
   * Envío de última oportunidad. `sendBeacon` encola la petición en el proceso
   * del navegador y sobrevive al cierre de la pestaña; `fetch` no.
   */
  flushWithBeacon(): void {
    if (this.queue.length === 0 || typeof navigator === "undefined") return;

    const batch = this.queue.splice(0, MAX_EVENT_BATCH);
    const body = JSON.stringify({ events: batch });

    // sendBeacon manda las cookies del mismo origen automáticamente.
    const sent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));

    if (!sent) {
      // Si el beacon falla (cuota agotada, navegador antiguo), se reencola: si
      // la pestaña sobrevive, el siguiente flush lo recogerá.
      this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
    }
  }
}
