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

import { fetchConPlazo, PLAZO_TELEMETRIA_MS } from "@/lib/net/plazo";
import { guardar, rescatar } from "./deposito";

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

/** Con qué está usando el aparato el alumno AHORA, no de qué es capaz. */
export type Modality = "touch" | "mouse" | "keyboard" | "pen" | "unknown";

/** Lo que rellena quien emite un acto de interfaz. El resto lo pone la cola. */
export interface UiInput {
  readonly control: string;
  readonly surface: string;
  readonly action: "click" | "keydown" | "change" | "toggle" | "open" | "close";
  readonly value?: string | number | boolean | undefined;
}

/**
 * Las condiciones de la sesión, recogidas DEFENSIVAMENTE.
 *
 * Cada `try` de aquí protege lo mismo: que una API ausente no impida arrancar la
 * cola. `matchMedia` no existe en jsdom, `navigator.connection` no existe en
 * Safari ni en Firefox, y `Intl.DateTimeFormat().resolvedOptions()` puede lanzar
 * en entornos empotrados. Una excepción aquí no dejaría un campo a `unknown`:
 * dejaría la sesión entera sin telemetría, que es infinitamente peor.
 */
function contextoDeSesion(): Record<string, unknown> {
  const medio = (consulta: string): boolean => {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia(consulta).matches;
    } catch {
      return false;
    }
  };

  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* se queda en UTC */
  }

  const conexion = (navigator as { connection?: { effectiveType?: string } }).connection;
  const efectiva = conexion?.effectiveType;
  const conocidas = ["slow-2g", "2g", "3g", "4g"];

  return {
    viewportW: Math.max(1, window.innerWidth),
    viewportH: Math.max(1, window.innerHeight),
    dpr: window.devicePixelRatio || 1,
    pointer: medio("(pointer: coarse)") ? "coarse" : medio("(pointer: fine)") ? "fine" : "none",
    // Al arrancar todavía no ha tocado nada: la modalidad real la traerá cada
    // `ui_interaction`. Decir aquí "touch" porque el aparato es táctil sería
    // afirmar algo que no ha ocurrido.
    modality: "unknown",
    theme: medio("(prefers-color-scheme: dark)") ? "dark" : "light",
    locale: navigator.language || "en",
    timezone,
    reducedMotion: medio("(prefers-reduced-motion: reduce)"),
    connection: efectiva && conocidas.includes(efectiva) ? efectiva : "unknown",
    ...(process.env.NEXT_PUBLIC_APP_VERSION
      ? { appVersion: process.env.NEXT_PUBLIC_APP_VERSION }
      : {}),
  };
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
  /** Evita treinta avisos idénticos al cerrar la pestaña. Se rearma en `start()`. */
  private warnedAfterDispose = false;

  /** El contexto de sesión se emite UNA vez por instancia, y no se rearma. */
  private contextoEmitido = false;
  /** Cuenta solo actos de interfaz. NO es `seq`: ver `trackUi`. */
  private uiOrdinal = 0;
  private ultimoActoMs: number | null = null;
  private ultimaNavegacionMs: number | null = null;
  private modalidad: Modality = "unknown";

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

  /**
   * Arranca (o REARRANCA) la cola.
   *
   * `start()` levanta el flag de `dispose()` a propósito. Antes no lo hacía y
   * `disposed` era una puerta de un solo sentido: bastaba un ciclo
   * montar → desmontar → montar del provider —que es lo que hace React en
   * `StrictMode`, en CADA carga de desarrollo— para que la cola quedara muerta
   * para siempre. `track()` seguía aceptando llamadas y devolviéndolas al vacío
   * sin una sola señal. Medido: cero peticiones en toda la sesión.
   *
   * Una cola que se puede parar y no se puede volver a arrancar no es una cola:
   * es una trampa.
   */
  start(): void {
    if (typeof window === "undefined" || this.timer) return;

    this.disposed = false;
    this.warnedAfterDispose = false;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);

    // RESCATE DE LO QUE MURIO SIN ENVIARSE. Va a la CABEZA de la cola, delante
    // de lo que se genere ahora: son eventos mas antiguos y el orden es lo que
    // hace legible una reconstruccion. Conservan su `sessionId` y su `seq`
    // originales, asi que no se mezclan con la sesion nueva.
    const pendientes = rescatar(this.sessionId);
    if (pendientes.length > 0) {
      this.queue = [...pendientes, ...this.queue].slice(-MAX_QUEUE);
      this.persistir();
    }

    // Volver la red es la mejor senal que hay para reintentar: mejor que esperar
    // al siguiente tick de 5 s, y mucho mejor que el backoff, que en ese momento
    // puede estar en un plazo largo tras varios fallos.
    window.addEventListener("online", this.onOnline);

    // `visibilitychange` es el único evento fiable en móvil: `beforeunload` y
    // `unload` no se disparan cuando iOS descarta una pestaña en segundo plano.
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);

    // La modalidad se OBSERVA. `matchMedia('(pointer: coarse)')` diría de qué es
    // capaz el aparato, no con qué lo está usando el niño: un portátil con
    // pantalla táctil da `coarse` mientras teclea, y la mitad del análisis de
    // ritmo se apoyaría en una etiqueta falsa.
    document.addEventListener("pointerdown", this.onPointerDown, true);
    document.addEventListener("keydown", this.onKeyDown, true);

    this.emitirContexto();
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
      document.removeEventListener("pointerdown", this.onPointerDown, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
      window.removeEventListener("online", this.onOnline);
    }
    this.flushWithBeacon();
    // DESPUES del beacon: `flushWithBeacon` vacia lo que consigue entregar, asi
    // que lo que quede aqui es exactamente lo que no salio. Persistirlo antes
    // guardaria tambien lo ya entregado y se duplicaria en el proximo arranque.
    this.persistir();
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.flushWithBeacon();
  };

  private readonly onPageHide = (): void => {
    this.flushWithBeacon();
  };

  private readonly onPointerDown = (event: Event): void => {
    const tipo = (event as PointerEvent).pointerType;
    this.modalidad = tipo === "touch" || tipo === "pen" || tipo === "mouse" ? tipo : "unknown";
  };

  private readonly onKeyDown = (): void => {
    this.modalidad = "keyboard";
  };

  /**
   * Emite `session_context` una sola vez, y lo hace en `seq` 0.
   *
   * Se llama desde `start()` Y desde `track()`, y las dos llamadas hacen falta.
   * En React los efectos de los HIJOS corren antes que el del padre: un
   * componente que emita en su `useEffect` se adelantaría al `start()` del
   * provider y se llevaría el `seq` 0. El contexto dejaría de ser el primer
   * evento de la sesión justo en las pantallas que más eventos emiten.
   *
   * Ser idempotente es lo que permite llamarlo desde los dos sitios sin pensar.
   */
  private emitirContexto(): void {
    if (this.contextoEmitido || typeof window === "undefined") return;
    // Se marca ANTES de emitir: `track()` vuelve a llamar aquí, y sin la marca
    // previa serían dos llamadas mutuamente recursivas.
    this.contextoEmitido = true;
    this.track({ eventType: "session_context", payload: contextoDeSesion() });
  }

  track(input: TrackInput): void {
    // Antes que nada, y antes de la guarda de `disposed`: si el primer evento de
    // la sesión llega antes de `start()`, el contexto tiene que ir delante.
    if (input.eventType !== "session_context") this.emitirContexto();

    if (this.disposed) {
      // Se descarta —la cola está desmontada y nadie la va a vaciar— pero NO en
      // silencio. Un evento de aprendizaje que se pierde sin dejar rastro es
      // justo el fallo que costó un día entero de diagnóstico. Una vez por
      // ciclo de vida: en un cierre de pestaña pueden llegar varios seguidos y
      // treinta líneas iguales no informan más que una.
      if (!this.warnedAfterDispose) {
        this.warnedAfterDispose = true;
        console.error(
          `[telemetry] evento '${input.eventType}' descartado: la cola está desmontada. ` +
            "Si esto ocurre fuera del cierre de la página, hay eventos perdiéndose.",
        );
      }
      return;
    }

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

    this.persistir();

    if (this.queue.length >= FLUSH_AT_COUNT) void this.flush();
  }

  /**
   * Un acto sobre un control de la interfaz.
   *
   * `ordinal` es un contador PROPIO y no `seq`. Son dos cosas distintas y
   * confundirlas cuesta el único dato de pérdida que tiene el análisis: `seq`
   * cuenta todos los eventos de la sesión, así que un hueco en él puede ser un
   * `idle_start` cualquiera. Un hueco en `ordinal` solo puede significar una
   * cosa: se perdió un acto de interfaz.
   */
  trackUi(entrada: UiInput): void {
    const ahora = this.ahoraMs();
    const desdeElUltimo = this.ultimoActoMs === null ? 0 : Math.max(0, ahora - this.ultimoActoMs);
    this.ultimoActoMs = ahora;

    this.track({
      eventType: "ui_interaction",
      payload: {
        control: entrada.control,
        surface: entrada.surface,
        action: entrada.action,
        ...(entrada.value === undefined ? {} : { value: entrada.value }),
        ordinal: this.uiOrdinal++,
        sinceLastMs: Math.round(desdeElUltimo),
        modality: this.modalidad,
      },
    });
  }

  /** Cambio de pantalla, con lo que duró la anterior. */
  trackNav(desde: string, hacia: string): void {
    const ahora = this.ahoraMs();
    const permanencia =
      this.ultimaNavegacionMs === null ? 0 : Math.max(0, ahora - this.ultimaNavegacionMs);
    this.ultimaNavegacionMs = ahora;

    this.track({
      eventType: "nav_route_changed",
      payload: { from: desde, to: hacia, dwellMs: Math.round(permanencia) },
    });
  }

  /**
   * Reloj MONÓTONO. `Date.now()` salta cuando el sistema ajusta la hora —o
   * cuando un niño le cambia la hora a la tableta— y un salto hacia atrás daría
   * un `sinceLastMs` negativo. El esquema Zod lo declara `nonnegative`, así que
   * el servidor rechazaría el lote ENTERO con un 400 y se perderían también los
   * eventos buenos que viajaban con él.
   */
  private ahoraMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * Vuelca a `localStorage` lo que aun no se ha entregado.
   *
   * Se llama en CADA cambio de la cola. Parece mucho, y no lo es: la cola se
   * vacia cada 5 s o cada 20 eventos, asi que en la practica se escriben unos
   * pocos kilobytes por tick. La alternativa —persistir solo al ocultarse la
   * pestana— deja fuera justo el caso que motivo todo esto: el navegador que
   * mata la pestana en segundo plano sin avisar a nadie.
   */
  private persistir(): void {
    guardar(this.sessionId, this.queue);
  }

  /**
   * Ha vuelto la red. Se reintenta YA y se cancela el backoff en curso, que en
   * ese momento puede estar esperando hasta un minuto por fallos anteriores.
   * Sin esto, el niño recupera el wifi y su telemetria se queda parada mirando
   * un temporizador que ya no tiene sentido.
   */
  private readonly onOnline = (): void => {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.consecutiveFailures = 0;
    void this.flush();
  };

  /**
   * Envío normal, con reintento y backoff exponencial.
   * Los eventos NO se pierden en un fallo: vuelven al principio de la cola.
   */
  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0 || typeof window === "undefined") return;

    const batch = this.queue.splice(0, MAX_EVENT_BATCH);
    this.sending = true;

    try {
      const respuesta = await fetchConPlazo(
        ENDPOINT,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ events: batch }),
          // La sesión va en cookie; sin credenciales el servidor no sabría de
          // quién son los eventos y los rechazaría.
          credentials: "same-origin",
          keepalive: true,
          cache: "no-store",
        },
        PLAZO_TELEMETRIA_MS,
      );

      if (respuesta.status === 401 || respuesta.status === 403) {
        // Sin sesión: reintentar no arregla nada y reencolar haría crecer la
        // cola sin fin. Se descarta el lote.
        this.consecutiveFailures = 0;
        // Y se descarta TAMBIEN del deposito. Sin esto, un lote que el servidor
        // rechaza por falta de sesion volveria en cada arranque a intentar
        // entrar por una puerta que le seguira estando cerrada.
        this.persistir();
        return;
      }

      if (respuesta.status === 400) {
        // Lote malformado: reintentarlo daría 400 para siempre. Se descarta y
        // se deja constancia: es un bug nuestro, no un problema de red.
         
        console.error("[telemetry] lote rechazado por el servidor (400)");
        this.consecutiveFailures = 0;
        // Igual que arriba: un lote malformado daria 400 para siempre, y
        // resucitarlo en cada arranque solo repetiria el error eternamente.
        this.persistir();
        return;
      }

      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

      this.consecutiveFailures = 0;
      // Entregado: el deposito deja de guardarlo. Si no se actualizara aqui, el
      // proximo arranque rescataria eventos YA guardados en la base y los
      // duplicaria, que es peor que perderlos: un informe con el doble de
      // tiempo de estudio no se nota roto, solo se lee mal.
      this.persistir();
    } catch {
      // Red caída o 5xx: los eventos vuelven a la cabeza de la cola, en su
      // orden original, y se reintenta con backoff.
      this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
      // Y de vuelta al deposito: este es EL caso que justifica el fichero. Si la
      // pestana muere ahora —sin red, que es cuando mas probable es— esto es lo
      // unico que queda del rato del nino.
      this.persistir();
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
