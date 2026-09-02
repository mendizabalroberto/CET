/**
 * El ciclo completo, observable: local → base → borrado de aquí.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo que se fija aquí no es que la cola funcione —eso ya lo cubren
 * `purga-tras-subir` y `deposito`— sino que su estado sea VISIBLE en cada paso.
 * Una tubería invisible que nadie puede observar es indistinguible de una rota:
 * durante meses la ingesta respondió 403 y descartó cada lote en silencio, sin
 * bucle, sin error y sin filas. Nada en la pantalla lo habría delatado.
 *
 * Los cuatro momentos del ciclo, en orden, son los cuatro bloques de abajo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PREFIJO } from "./deposito";
import { TelemetryQueue, type EstadoDeCola } from "./client";

const SESION = "11111111-2222-3333-4444-555555555555";

let almacen: Map<string, string>;

function ventanaFalsa(): Record<string, unknown> {
  return {
    localStorage: {
      get length() {
        return almacen.size;
      },
      key: (i: number) => [...almacen.keys()][i] ?? null,
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => void almacen.set(k, v),
      removeItem: (k: string) => void almacen.delete(k),
      clear: () => almacen.clear(),
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

/** Cuántos eventos hay escritos en el navegador ahora mismo. */
function enElNavegador(): number {
  const crudo = almacen.get(PREFIJO + SESION);
  if (crudo === undefined) return 0;
  return (JSON.parse(crudo) as { eventos: unknown[] }).eventos.length;
}

beforeEach(() => {
  almacen = new Map();
  vi.stubGlobal("window", ventanaFalsa());
  vi.stubGlobal("navigator", { onLine: true });
});

describe("1 · guardado local", () => {
  it("un evento recién emitido está en el navegador y consta como pendiente", () => {
    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });

    expect(enElNavegador()).toBeGreaterThan(0);
    expect(cola.estado().pendientes).toBeGreaterThan(0);
  });

  it("quien se suscribe recibe el estado de entrada, sin esperar a un cambio", () => {
    // Si solo avisara en los cambios, un indicador montado con la cola ya llena
    // -que es lo que pasa al volver de una recarga- no pintaría nada hasta el
    // siguiente evento, y justo entonces es cuando más falta hace.
    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });

    const vistos: EstadoDeCola[] = [];
    cola.suscribir((e) => vistos.push(e));

    expect(vistos).toHaveLength(1);
    expect(vistos[0]!.pendientes).toBeGreaterThan(0);
  });
});

describe("2 · modo sin conexión", () => {
  it("lo dice cuando el navegador dice que no hay red", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const cola = new TelemetryQueue(SESION);
    expect(cola.estado().sinConexion).toBe(true);
  });

  it("y TAMBIÉN cuando el sistema dice que sí la hay pero los envíos fallan", async () => {
    // `navigator.onLine` miente en un sentido: un wifi conectado a un router sin
    // salida da `true`. Es el caso de la tableta en un colegio con la línea
    // caída, que es donde este aviso más falta hace.
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin salida")));

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });
    await cola.flush();

    expect(cola.estado().sinConexion).toBe(true);
    // Y lo pendiente sigue escrito aquí: el aviso y el dato dicen lo mismo.
    expect(enElNavegador()).toBeGreaterThan(0);
  });
});

describe("3 · paso a la base de datos", () => {
  it("al aceptarlo el servidor, se anota el instante y se deja de estar sin conexión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });
    expect(cola.estado().ultimoEnvioMs).toBeNull();

    await cola.flush();

    // «Guardado» solo se puede decir DESPUÉS de que la base lo acepte: enviado
    // lo sabe el navegador, guardado lo sabe el servidor.
    expect(cola.estado().ultimoEnvioMs).not.toBeNull();
    expect(cola.estado().sinConexion).toBe(false);
  });

  it("se recupera solo: tras fallar y volver a funcionar, deja de avisar", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("caida"));
    vi.stubGlobal("fetch", fetchMock);

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });
    await cola.flush();
    expect(cola.estado().sinConexion).toBe(true);

    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    await cola.flush();

    expect(cola.estado().sinConexion).toBe(false);
  });
});

describe("4 · borrado de lo local", () => {
  it("EL CIERRE DEL CICLO: entregado a la base, el navegador queda limpio y sin pendientes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });
    cola.track({ eventType: "lesson_completed", payload: {} });
    expect(enElNavegador()).toBeGreaterThan(0);

    await cola.flush();

    expect(enElNavegador()).toBe(0);
    expect(almacen.has(PREFIJO + SESION)).toBe(false);
    expect(cola.estado().pendientes).toBe(0);
  });

  it("el observador ve los tres pasos en orden: pendiente, en vuelo, limpio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    const cola = new TelemetryQueue(SESION);
    const vistos: EstadoDeCola[] = [];
    cola.suscribir((e) => vistos.push({ ...e }));

    cola.track({ eventType: "lesson_opened", payload: {} });
    await cola.flush();

    expect(vistos.some((e) => e.pendientes > 0 && !e.enviando)).toBe(true);
    expect(vistos.some((e) => e.enviando)).toBe(true);
    // Y el último es el que pinta el indicador: nada pendiente y con sello.
    const ultimo = vistos[vistos.length - 1]!;
    expect(ultimo.pendientes).toBe(0);
    expect(ultimo.ultimoEnvioMs).not.toBeNull();
  });
});
