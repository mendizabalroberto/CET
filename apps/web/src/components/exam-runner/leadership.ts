/**
 * Elección de pestaña líder.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * EL CASO REAL: el alumno abre el examen, cambia de pestaña, se pierde, vuelve
 * a entrar por el enlace del aula virtual y acaba con el mismo examen abierto
 * dos veces.
 *
 * El modelo aguanta sin ayuda: `/start` es idempotente (las dos pestañas ven el
 * MISMO intento y los MISMOS ítems), `attempt_responses` es append-only y gana
 * la última revisión, y `/submit` es idempotente. Nada se corrompe.
 *
 * Lo que sí pasa sin esta pieza es que las dos pestañas se pisen la respuesta:
 * el alumno responde en la pestaña A, se va a la B — que tiene en pantalla un
 * estado viejo — toca cualquier cosa y su autosave sobrescribe lo bueno. La
 * base de datos lo registra todo, pero él ha perdido una respuesta.
 *
 * Por eso una sola pestaña escribe. La otra pasa a solo lectura con un aviso
 * claro y un botón para tomar el control — nunca se le deja atrapado sin salida:
 * si la pestaña líder está en un portátil que se cerró, la de aquí tiene que
 * poder seguir el examen.
 *
 * `BroadcastChannel` no existe en SSR ni en navegadores antiguos. En ese caso
 * `create()` devuelve `null` y la pestaña se comporta como líder: mejor dos
 * pestañas escribiendo (que el modelo tolera) que un examen que no se puede
 * responder.
 */

export type LeadershipRole = "leader" | "follower";

type Message =
  | { readonly kind: "claim"; readonly tabId: string; readonly at: number }
  | { readonly kind: "heartbeat"; readonly tabId: string; readonly at: number }
  | { readonly kind: "release"; readonly tabId: string };

export interface LeadershipDeps {
  readonly onRoleChange: (role: LeadershipRole) => void;
  readonly channelFactory?: ((name: string) => BroadcastChannel) | undefined;
  readonly now?: (() => number) | undefined;
}

const HEARTBEAT_MS = 3_000;
/** Sin latido en este plazo, el líder se da por muerto y esta pestaña puede tomar el mando. */
const STALE_AFTER_MS = 9_000;

export class TabLeadership {
  private readonly channel: BroadcastChannel | null;
  private readonly deps: LeadershipDeps;
  private readonly tabId: string;
  private role: LeadershipRole = "leader";
  private lastForeignHeartbeat = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(attemptId: string, tabId: string, deps: LeadershipDeps) {
    this.deps = deps;
    this.tabId = tabId;
    this.channel = TabLeadership.create(`cet.exam.${attemptId}`, deps.channelFactory);

    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<Message>) => this.onMessage(event.data);
    }
  }

  private static create(
    name: string,
    factory: ((name: string) => BroadcastChannel) | undefined,
  ): BroadcastChannel | null {
    if (factory) return factory(name);
    if (typeof BroadcastChannel === "undefined") return null;
    try {
      return new BroadcastChannel(name);
    } catch {
      return null;
    }
  }

  getRole(): LeadershipRole {
    return this.role;
  }

  /** Reclama el liderazgo y empieza a latir. */
  start(): void {
    if (this.disposed) return;
    this.claim();
    this.timer = setInterval(() => this.tick(), HEARTBEAT_MS);
  }

  /** El alumno ha pulsado "responder aquí". Esta pestaña se impone. */
  claim(): void {
    this.post({ kind: "claim", tabId: this.tabId, at: this.now() });
    this.setRole("leader");
  }

  private tick(): void {
    if (this.role === "leader") {
      this.post({ kind: "heartbeat", tabId: this.tabId, at: this.now() });
      return;
    }
    // Seguidor: si el líder lleva demasiado sin latir, ha muerto (pestaña
    // cerrada, portátil apagado). Se toma el mando en vez de dejar al alumno
    // mirando una pantalla de solo lectura que ya no tiene dueño.
    if (this.now() - this.lastForeignHeartbeat > STALE_AFTER_MS) this.claim();
  }

  private onMessage(message: Message | undefined): void {
    if (!message || message.tabId === this.tabId) return;

    switch (message.kind) {
      case "claim":
        // Otra pestaña se ha impuesto. La última reclamación gana: es siempre
        // la pestaña que el alumno tiene delante ahora mismo.
        this.lastForeignHeartbeat = this.now();
        this.setRole("follower");
        return;
      case "heartbeat":
        this.lastForeignHeartbeat = this.now();
        if (this.role === "leader") {
          // Dos líderes a la vez: desempate estable por id, para que las dos
          // pestañas lleguen a la MISMA conclusión sin negociar.
          if (message.tabId > this.tabId) this.setRole("follower");
        }
        return;
      case "release":
        this.claim();
        return;
      default:
        return;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.role === "leader") this.post({ kind: "release", tabId: this.tabId });
    try {
      this.channel?.close();
    } catch {
      // Un canal ya cerrado no es un problema que el alumno deba conocer.
    }
  }

  private setRole(next: LeadershipRole): void {
    if (this.role === next) return;
    this.role = next;
    this.deps.onRoleChange(next);
  }

  private post(message: Message): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // Canal cerrado a mitad de un `dispose` de otra pestaña. Sin efecto.
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}
