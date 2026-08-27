/**
 * Cola de autoguardado del examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * LA MITAD DEL VALOR DEL MÓDULO ESTÁ AQUÍ. Un niño que pierde media hora de
 * examen porque el wifi del colegio parpadeó no vuelve a confiar en la
 * plataforma, y tiene razón.
 *
 * GARANTÍAS
 *  1. **Nada se pierde por un fallo de red.** Una respuesta que no llega al
 *     servidor se queda en la cola y se reintenta con backoff exponencial. La
 *     cola se persiste en `localStorage` en cada cambio, así que sobrevive a
 *     una recarga, a un cierre de pestaña y a que se apague la tableta.
 *  2. **Debounce, no throttle.** Mientras el alumno teclea no se manda nada
 *     (800 ms de silencio). Al cambiar de pregunta y cada 20 s se fuerza el
 *     envío. Sin debounce, escribir "12.75" generaría cinco revisiones en
 *     `attempt_responses` y el análisis forense contaría cinco cambios de
 *     opinión que no existieron.
 *  3. **Una respuesta por ítem en vuelo.** Si el alumno cambia el ítem 4
 *     mientras se está enviando el ítem 4, el envío en curso NO marca el ítem
 *     como limpio: gana siempre lo último que escribió.
 *  4. **"Guardado" solo lo dice el servidor.** El estado `saved` se pone cuando
 *     el POST responde 200, nunca antes. Mentir aquí es mentir sobre lo único
 *     que el alumno necesita creer.
 *
 * POR QUÉ `localStorage` Y NO IndexedDB (el contrato del módulo sugería IDB):
 * la cola son unas pocas decenas de objetos JSON diminutos, y `localStorage` es
 * SÍNCRONO. En `pagehide` — cuando iOS descarta la pestaña de una tableta
 * compartida — una escritura asíncrona a IndexedDB se queda a medias y se
 * pierde; una síncrona ya está en disco. Se cambia el tamaño máximo por la
 * durabilidad en el único instante que importa.
 *
 * Este fichero no importa React ni toca el DOM: se testea con relojes falsos.
 */
import type { StudentResponse } from "@cet/shared";

import { ApiError } from "./types";

export type AutosaveState = "idle" | "saving" | "saved" | "offline" | "retrying";

export const DEBOUNCE_MS = 800;
export const PERIODIC_FLUSH_MS = 20_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;

export interface PendingAnswer {
  readonly attemptItemId: string;
  readonly response: StudentResponse;
  /** ISO. Dato forense: el servidor guarda `client_ts` y NO lo usa para puntuar. */
  readonly clientTs: string;
  readonly timeOnItemMs: number;
}

/** Mínimo que la cola necesita de `localStorage`. Se inyecta para poder testear. */
export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AutosaveDeps {
  /** Envía al servidor. Debe lanzar `ApiError` para que la cola distinga los casos. */
  readonly send: (pending: PendingAnswer) => Promise<{ revision: number }>;
  readonly onStateChange: (state: AutosaveState, lastSavedAt: Date | null) => void;
  /** El servidor dijo 409: el deadline ya pasó. La cola se detiene y avisa. */
  readonly onDeadlinePassed: () => void;
  /** Confirmación por ítem, para pintar el navegador de preguntas. */
  readonly onSaved?: ((attemptItemId: string, revision: number) => void) | undefined;
  readonly storage?: QueueStorage | null | undefined;
  readonly now?: (() => number) | undefined;
}

interface QueueEntry extends PendingAnswer {
  /** Cambia en cada `queue()`. Evita marcar como limpio un envío obsoleto. */
  readonly token: number;
}

const STORAGE_PREFIX = "cet.exam.queue.";

export class AutosaveQueue {
  private readonly attemptId: string;
  private readonly deps: AutosaveDeps;
  private readonly storageKey: string;

  private pending = new Map<string, QueueEntry>();
  private inFlight: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private state: AutosaveState = "idle";
  private lastSavedAt: Date | null = null;
  private stopped = false;
  private tokenCounter = 0;

  constructor(attemptId: string, deps: AutosaveDeps) {
    this.attemptId = attemptId;
    this.deps = deps;
    this.storageKey = `${STORAGE_PREFIX}${attemptId}`;
    this.restore();
  }

  /** Arranca el barrido periódico. Separado del constructor para poder testear sin timers. */
  start(): void {
    if (this.periodicTimer || this.stopped) return;
    this.periodicTimer = setInterval(() => void this.flush(), PERIODIC_FLUSH_MS);
    // Si la cola venía llena de una sesión anterior (se cerró la tableta con
    // respuestas sin enviar), se intenta vaciarla de inmediato.
    if (this.pending.size > 0) void this.flush();
  }

  getState(): AutosaveState {
    return this.state;
  }

  getLastSavedAt(): Date | null {
    return this.lastSavedAt;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  /** Respuestas de esta cola que aún no han llegado al servidor. Para el merge al recuperar. */
  snapshot(): readonly PendingAnswer[] {
    return [...this.pending.values()].map(({ token: _token, ...rest }) => rest);
  }

  /**
   * Encola un cambio. NO envía todavía: espera a que el alumno deje de escribir.
   */
  queue(pending: PendingAnswer): void {
    if (this.stopped) return;
    this.tokenCounter += 1;
    this.pending.set(pending.attemptItemId, { ...pending, token: this.tokenCounter });
    this.persist();
    this.setState("saving");
    this.scheduleDebounce();
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /**
   * Fuerza el envío de todo lo pendiente. Se llama al cambiar de pregunta, al
   * ocultarse la pestaña y antes de entregar.
   *
   * Secuencial a propósito: en la red de un colegio, treinta tabletas abriendo
   * veinte conexiones cada una a la vez es peor que esperar 200 ms.
   */
  async flush(): Promise<void> {
    if (this.stopped || this.inFlight !== null || this.pending.size === 0) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const entries = [...this.pending.values()];
    this.setState("saving");

    for (const entry of entries) {
      if (this.stopped) return;
      this.inFlight = entry.attemptItemId;
      try {
        const { revision } = await this.deps.send({
          attemptItemId: entry.attemptItemId,
          response: entry.response,
          clientTs: entry.clientTs,
          timeOnItemMs: entry.timeOnItemMs,
        });

        // Solo se limpia si el alumno NO ha vuelto a tocar este ítem mientras
        // viajaba la petición. Si lo tocó, el token cambió y lo pendiente sigue
        // pendiente: gana lo último que escribió.
        const current = this.pending.get(entry.attemptItemId);
        if (current && current.token === entry.token) {
          this.pending.delete(entry.attemptItemId);
          this.persist();
        }
        this.consecutiveFailures = 0;
        this.lastSavedAt = new Date(this.deps.now?.() ?? Date.now());
        this.deps.onSaved?.(entry.attemptItemId, revision);
      } catch (error) {
        this.inFlight = null;

        if (error instanceof ApiError && error.kind === "deadline_passed") {
          // El servidor ha dicho que el tiempo terminó. Insistir es inútil y
          // ruidoso: se para la cola y se avisa para que la UI entregue.
          this.stop();
          this.deps.onDeadlinePassed();
          return;
        }

        if (error instanceof ApiError && error.kind === "unauthorized") {
          // La sesión se ha caído. Reintentar en bucle no la recupera; se
          // conserva la cola en disco para cuando vuelva a entrar.
          this.setState("offline");
          return;
        }

        // Red caída o 5xx: la entrada sigue en `pending`, ya persistida.
        this.consecutiveFailures += 1;
        this.setState(this.consecutiveFailures === 1 ? "offline" : "retrying");
        this.scheduleRetry();
        return;
      } finally {
        if (this.inFlight === entry.attemptItemId) this.inFlight = null;
      }
    }

    this.setState(this.pending.size === 0 ? "saved" : "saving");
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.stopped) return;
    // Backoff exponencial con jitter. El jitter evita que treinta tabletas
    // reintenten en el mismo milisegundo cuando vuelve el wifi.
    const exponential = BASE_BACKOFF_MS * 2 ** Math.min(this.consecutiveFailures - 1, 6);
    const jitter = Math.random() * BASE_BACKOFF_MS;
    const delay = Math.min(exponential + jitter, MAX_BACKOFF_MS);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  /**
   * Para la cola en seco. Lo pendiente se queda en disco: nada se tira.
   * Se usa cuando el servidor dice que el intento ya terminó — insistir ahí
   * solo genera ruido.
   */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
  }

  /**
   * Cierre ordenado: se INTENTA vaciar antes de soltar los temporizadores.
   *
   * Es lo que se llama al desmontar el componente, y la diferencia con `stop()`
   * importa: el alumno que pulsa "volver a mis exámenes" a mitad de una
   * pregunta tiene una respuesta recién escrita en la cola. `stop()` la dejaría
   * en disco hasta que volviera a entrar; esto la manda ya, con `keepalive`, de
   * forma que llega aunque la navegación se lleve la página por delante.
   *
   * No se marca `stopped`: si se marcara, el `flush` que acabamos de lanzar
   * saldría por la primera comprobación sin enviar nada.
   */
  dispose(): void {
    if (this.pending.size > 0) void this.flush();
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
    this.periodicTimer = null;
  }

  /**
   * El intento se ha entregado con éxito: la cola ya no significa nada y se
   * borra del disco. Es el ÚNICO sitio donde se borra.
   */
  clearPersisted(): void {
    this.pending.clear();
    this.deps.storage?.removeItem(this.storageKey);
  }

  private setState(next: AutosaveState): void {
    if (this.state === next) return;
    this.state = next;
    this.deps.onStateChange(next, this.lastSavedAt);
  }

  private persist(): void {
    const storage = this.deps.storage;
    if (!storage) return;
    try {
      if (this.pending.size === 0) {
        storage.removeItem(this.storageKey);
        return;
      }
      storage.setItem(this.storageKey, JSON.stringify({ attemptId: this.attemptId, entries: this.snapshot() }));
    } catch {
      // Cuota agotada o modo privado. La cola en memoria sigue funcionando:
      // se pierde la resistencia a la recarga, no las respuestas de esta sesión.
      // No se avisa al alumno de algo que no puede arreglar.
    }
  }

  private restore(): void {
    const storage = this.deps.storage;
    if (!storage) return;
    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return;
      const entries = (parsed as { entries?: unknown }).entries;
      if (!Array.isArray(entries)) return;

      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as Partial<PendingAnswer>;
        if (typeof e.attemptItemId !== "string" || typeof e.clientTs !== "string") continue;
        if (typeof e.response !== "object" || e.response === null) continue;
        this.tokenCounter += 1;
        this.pending.set(e.attemptItemId, {
          attemptItemId: e.attemptItemId,
          response: e.response,
          clientTs: e.clientTs,
          timeOnItemMs: typeof e.timeOnItemMs === "number" ? e.timeOnItemMs : 0,
          token: this.tokenCounter,
        });
      }
    } catch {
      // JSON corrupto. Se ignora en vez de lanzar: una cola ilegible no puede
      // impedir que el alumno entre al examen.
    }
  }
}

/** Adaptador real. `null` en SSR y en navegadores con el almacenamiento bloqueado. */
export function browserStorage(): QueueStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "cet.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}
