/**
 * INVARIANTE: lo que ya está en la base NO se queda en el navegador.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTO MERECE SU PROPIO FICHERO
 * ===========================================================================
 * El depósito local existe para que la sesión sobreviva a una caída de red. Ese
 * mismo depósito, si no se limpia, es la forma más rápida de arruinar los
 * informes: cada arranque volvería a subir lo mismo, y el tiempo de estudio de
 * un niño se multiplicaría solo.
 *
 * Y esa avería NO SE VE. Una tabla vacía se nota; una tabla con el doble de
 * minutos se lee tan tranquila, y el tutor toma decisiones sobre su hijo con
 * ella. Por eso la purga se comprueba contra la COLA de verdad y no contra el
 * depósito aislado: lo que importa no es que `guardar([])` borre la clave, es
 * que la cola LLAME a guardar con lo que queda, en los tres caminos por los que
 * un evento sale de ella.
 *
 * Los tres caminos son: envío normal correcto, envío fallido, y beacon de
 * cierre. Los tres están aquí.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PREFIJO } from "./deposito";
import { TelemetryQueue } from "./client";

const SESION = "11111111-2222-3333-4444-555555555555";
const CLAVE = PREFIJO + SESION;

let almacen: Map<string, string>;

/**
 * `window` con lo que la cola le pide: el almacen y las escuchas. `dispose()`
 * quita la de `online`, que es la que reintenta al volver la red.
 */
function ventanaFalsa(): Record<string, unknown> {
  return {
    localStorage: localStorageFalso(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

function localStorageFalso(): Storage {
  return {
    get length() {
      return almacen.size;
    },
    key: (i: number) => [...almacen.keys()][i] ?? null,
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k),
    clear: () => almacen.clear(),
  } as unknown as Storage;
}

/**
 * `dispose()` quita sus escuchas de `document`. Sin este doble, la prueba falla
 * con «document is not defined» por un motivo que no tiene nada que ver con lo
 * que se quiere vigilar.
 */
function documentoFalso(): void {
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

/** Cuántos eventos hay guardados en el navegador ahora mismo. */
function guardados(): number {
  const crudo = almacen.get(CLAVE);
  if (crudo === undefined) return 0;
  return (JSON.parse(crudo) as { eventos: unknown[] }).eventos.length;
}

beforeEach(() => {
  almacen = new Map();
  vi.stubGlobal("window", ventanaFalsa());
});

describe("purga del depósito local tras subir a la base", () => {
  it("EL INVARIANTE: un lote entregado deja de ocupar el navegador", async () => {
    vi.stubGlobal("window", ventanaFalsa());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });
    cola.track({ eventType: "lesson_block_viewed", payload: {} });

    // Encolados y persistidos: si la pestaña muriera ahora, se recuperarían.
    // Se mide relativo y no en absoluto: la cola emite ademas un
    // `session_context` propio al primer evento, y clavar el numero aqui haria
    // que esta prueba fallara el dia que se anada otro evento automatico, sin
    // que la purga —que es lo que vigila— hubiera cambiado.
    expect(guardados()).toBeGreaterThan(0);

    await cola.flush();

    // Entregados. El navegador ya no tiene por qué guardarlos, y si los
    // guardara los subiría OTRA VEZ en el próximo arranque.
    expect(guardados()).toBe(0);
    expect(almacen.has(CLAVE)).toBe(false);
  });

  it("un lote que NO llegó se queda: es el caso que justifica el depósito", async () => {
    vi.stubGlobal("window", ventanaFalsa());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red caida")));

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });

    await cola.flush();

    // Sigue guardado: se cayó el wifi y esto es lo único que queda del rato.
    expect(guardados()).toBeGreaterThan(0);
  });

  it("un 403 purga igual: no se guarda para siempre algo que nunca va a entrar", async () => {
    // Sin sesión el servidor rechaza y reintentar no arregla nada. Si se
    // quedara en el navegador, cada arranque volvería a llamar a una puerta que
    // le seguirá estando cerrada, y la cuota se llenaría de basura inmortal.
    vi.stubGlobal("window", ventanaFalsa());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });

    await cola.flush();

    expect(guardados()).toBe(0);
  });

  it("el beacon de cierre también purga lo que consiguió entregar", () => {
    // `dispose()` intenta el último envío con `sendBeacon` y DESPUES persiste.
    // El orden importa: al reves guardaria tambien lo que el beacon acaba de
    // entregar, y se duplicaria en el arranque siguiente.
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("window", ventanaFalsa());
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("Blob", class {});

    documentoFalso();
    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });
    expect(guardados()).toBeGreaterThan(0);

    cola.dispose();

    expect(sendBeacon).toHaveBeenCalled();
    expect(guardados()).toBe(0);
  });

  it("si el beacon NO sale, lo que iba dentro se conserva", () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", ventanaFalsa());
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("Blob", class {});

    documentoFalso();
    const cola = new TelemetryQueue(SESION);
    cola.track({ eventType: "lesson_opened", payload: {} });

    cola.dispose();

    expect(guardados()).toBeGreaterThan(0);
  });
});
