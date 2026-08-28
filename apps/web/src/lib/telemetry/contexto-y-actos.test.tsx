/**
 * El contexto de la sesión y los actos de interfaz.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LAS TRES TRAMPAS QUE ESTE FICHERO VIGILA
 * ===========================================================================
 *   1. `session_context` DOS veces. React monta el provider dos veces en
 *      `StrictMode`, en cada carga de desarrollo, sobre la MISMA instancia de
 *      cola. Un contexto sin guarda saldría duplicado y todo informe que cuente
 *      sesiones contaría el doble. Nada en la pantalla lo delataría.
 *   2. `session_context` sin el `seq` 0. Los efectos de los hijos corren antes
 *      que los del padre: un componente que emita al montarse se adelanta al
 *      `start()` del provider. Si el contexto no se emite también desde
 *      `track()`, deja de ser el primer evento justo en las pantallas que más
 *      eventos emiten.
 *   3. Un `sinceLastMs` negativo. Con `Date.now()`, un ajuste de reloj —o un
 *      niño cambiándole la hora a la tableta— produce un negativo, el esquema
 *      Zod lo rechaza y el servidor devuelve 400 al LOTE ENTERO: se pierden
 *      también los eventos buenos que viajaban con él.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelemetryQueue } from "./client";

const SESION = "11111111-2222-3333-4444-555555555555";

/** Los eventos que la cola ha mandado de verdad, en orden. */
function espiarEnvios() {
  const enviados: Array<{ eventType: string; seq: number; payload: Record<string, unknown> }> = [];
  const espia = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body ?? "{}")) as {
      events?: Array<{ eventType: string; seq: number; payload: Record<string, unknown> }>;
    };
    enviados.push(...(cuerpo.events ?? []));
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", espia);
  return enviados;
}

/**
 * Un reloj monótono bajo control.
 *
 * No se usan los temporizadores falsos de vitest, y por dos motivos concretos:
 * no sustituyen `performance.now()` —así que el tiempo medido no avanzaría y la
 * prueba pasaría midiendo cero— y además congelan el `setTimeout` del que
 * depende `fetchConPlazo`, con lo que el `flush` no llega a enviar nunca. Lo
 * que estas pruebas quieren gobernar es el RELOJ, no el bucle de eventos.
 */
function relojControlado() {
  let ahora = 1_000;
  vi.stubGlobal("performance", { now: () => ahora });
  return { avanzar: (ms: number) => (ahora += ms) };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("session_context", () => {
  it("sale una sola vez y con el seq 0, aunque se arranque dos veces", async () => {
    const enviados = espiarEnvios();
    const cola = new TelemetryQueue(SESION);

    // Lo que hace React en StrictMode, sobre la misma instancia.
    cola.start();
    cola.start();
    await cola.flush();

    const contextos = enviados.filter((e) => e.eventType === "session_context");
    expect(contextos).toHaveLength(1);
    expect(contextos[0]?.seq).toBe(0);
  });

  it("sigue saliendo una sola vez tras un ciclo completo de vida", async () => {
    const enviados = espiarEnvios();
    const cola = new TelemetryQueue(SESION);

    cola.start();
    cola.dispose();
    cola.start();
    cola.track({ eventType: "lesson_opened", payload: {} });
    await cola.flush();

    expect(enviados.filter((e) => e.eventType === "session_context")).toHaveLength(1);
  });

  it("se adelanta al primer evento aunque llegue antes de start()", async () => {
    const enviados = espiarEnvios();
    const cola = new TelemetryQueue(SESION);

    // Un hijo que emite en su useEffect: corre ANTES que el del provider.
    cola.track({ eventType: "lesson_opened", payload: {} });
    cola.start();
    await cola.flush();

    expect(enviados[0]?.eventType).toBe("session_context");
    expect(enviados[0]?.seq).toBe(0);
    expect(enviados[1]?.eventType).toBe("lesson_opened");
  });

  it("no lanza cuando el navegador no trae connection ni matchMedia", async () => {
    const enviados = espiarEnvios();
    // jsdom no implementa `navigator.connection`, y aquí se le quita también
    // `matchMedia`: es el navegador más pobre que puede tocarle a un colegio.
    vi.stubGlobal("matchMedia", undefined);

    const cola = new TelemetryQueue(SESION);
    expect(() => cola.start()).not.toThrow();
    await cola.flush();

    const contexto = enviados.find((e) => e.eventType === "session_context");
    expect(contexto?.payload.connection).toBe("unknown");
    expect(contexto?.payload.pointer).toBe("none");
    expect(contexto?.payload.timezone).toEqual(expect.any(String));
  });
});

describe("ui_interaction", () => {
  it("numera los actos con un ordinal propio, no con seq", async () => {
    const enviados = espiarEnvios();
    const cola = new TelemetryQueue(SESION);
    cola.start();

    cola.trackUi({ control: "practica.comprobar", surface: "practice", action: "click" });
    // Un evento de OTRO tipo por medio: mueve `seq` y no debe mover `ordinal`.
    cola.track({ eventType: "idle_start", payload: {} });
    cola.trackUi({ control: "practica.siguiente", surface: "practice", action: "click" });
    await cola.flush();

    const actos = enviados.filter((e) => e.eventType === "ui_interaction");
    expect(actos.map((e) => e.payload.ordinal)).toEqual([0, 1]);
    // Y `seq` sí ha saltado: son dos contadores distintos, y ahí está la gracia.
    expect(actos[1]!.seq - actos[0]!.seq).toBe(2);
  });

  it("mide el tiempo entre actos y nunca lo devuelve negativo", async () => {
    const enviados = espiarEnvios();
    const reloj = relojControlado();
    const cola = new TelemetryQueue(SESION);
    cola.start();

    cola.trackUi({ control: "practica.comprobar", surface: "practice", action: "click" });
    reloj.avanzar(2_500);
    cola.trackUi({ control: "practica.siguiente", surface: "practice", action: "click" });
    // El reloj hacia ATRÁS: es lo que hace un ajuste de hora del sistema, y con
    // `Date.now()` daría un negativo que el esquema Zod rechaza, tirando el lote
    // entero con un 400.
    reloj.avanzar(-10_000);
    cola.trackUi({ control: "practica.saltar", surface: "practice", action: "click" });
    await cola.flush();

    const actos = enviados.filter((e) => e.eventType === "ui_interaction");
    expect(actos[0]?.payload.sinceLastMs).toBe(0);
    expect(actos[1]?.payload.sinceLastMs).toBe(2_500);
    expect(actos[2]?.payload.sinceLastMs).toBe(0);
  });

  it("observa la modalidad en vez de deducirla del aparato", async () => {
    const enviados = espiarEnvios();
    const cola = new TelemetryQueue(SESION);
    cola.start();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    cola.trackUi({ control: "practica.comprobar", surface: "practice", action: "click" });

    const dedo = new Event("pointerdown", { bubbles: true }) as Event & { pointerType?: string };
    dedo.pointerType = "touch";
    document.dispatchEvent(dedo);
    cola.trackUi({ control: "practica.siguiente", surface: "practice", action: "click" });

    await cola.flush();

    const actos = enviados.filter((e) => e.eventType === "ui_interaction");
    expect(actos[0]?.payload.modality).toBe("keyboard");
    expect(actos[1]?.payload.modality).toBe("touch");
  });

  it("omite el valor cuando el control no tiene ninguno", async () => {
    const enviados = espiarEnvios();
    const cola = new TelemetryQueue(SESION);
    cola.start();

    cola.trackUi({ control: "examen.entregar", surface: "exam", action: "click" });
    await cola.flush();

    const acto = enviados.find((e) => e.eventType === "ui_interaction");
    expect(acto?.payload).not.toHaveProperty("value");
  });
});

describe("nav_route_changed", () => {
  it("mide lo que duró la pantalla anterior", async () => {
    const enviados = espiarEnvios();
    const reloj = relojControlado();
    const cola = new TelemetryQueue(SESION);
    cola.start();

    cola.trackNav("/learn", "/practice");
    reloj.avanzar(9_000);
    cola.trackNav("/practice", "/exam");
    await cola.flush();

    const navegaciones = enviados.filter((e) => e.eventType === "nav_route_changed");
    expect(navegaciones[0]?.payload).toMatchObject({ from: "/learn", to: "/practice", dwellMs: 0 });
    expect(navegaciones[1]?.payload).toMatchObject({ from: "/practice", to: "/exam", dwellMs: 9_000 });
  });
});
