/**
 * El cableado de la telemetría: que un evento emitido SALGA.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTE FICHERO EXISTE
 * ===========================================================================
 * `client.test.ts` prueba la cola en Node: sin `window`, `flush()` sale sin
 * hacer nada y ningún test podía ver una petición. Es decir: había 1002 tests
 * en verde y NINGUNO comprobaba lo único que la telemetría tiene que hacer.
 *
 * Estas pruebas son de FAMILIA, no del caso concreto:
 *
 *   1. Una cola parada y vuelta a arrancar no traga eventos en silencio. Es la
 *      trampa que dejaba `dispose()`: ponía `disposed = true` para siempre y
 *      `start()` salía por la primera línea. Un solo ciclo
 *      montar → desmontar → montar del provider —lo que hace React en
 *      `StrictMode` en CADA carga de desarrollo— mataba la telemetría entera
 *      de la sesión.
 *   2. Cualquier consumidor de `useTelemetry()` fuera del provider falla a
 *      gritos. No "LessonOpened": cualquiera.
 */
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

import { TelemetryQueue } from "./client";
import { TelemetryProvider, useTelemetry } from "./provider";

/** Un consumidor cualquiera. Emite en cuanto se monta y no hace nada más. */
function Consumidor() {
  const { track } = useTelemetry();
  useEffect(() => {
    track({ eventType: "lesson_opened", payload: {} });
  }, [track]);
  return null;
}

function fetchEspia() {
  // Los parámetros se declaran aunque no se usen: sin ellos el tipo de
  // `mock.calls` es la tupla vacía y no se puede afirmar contra la URL.
  const espia = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", espia);
  return espia;
}

/** Deja pasar un ciclo completo de vaciado (`FLUSH_INTERVAL_MS` = 5 s). */
async function pasaUnVaciado(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6_000);
  });
}

describe("la cola sobrevive a un ciclo de vida completo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Los dos tests que siguen miran el INCREMENTO de la cola, no su tamaño.
  // Antes comparaban contra un número exacto y eso los ataba a que
  // `lesson_opened` fuese el único evento que podía haber ahí dentro. En cuanto
  // la cola empezó a emitir `session_context` al arrancar —un evento que nadie
  // pide y que tiene que estar— los dos se pusieron rojos sin que nada se
  // hubiera roto. Lo que estos tests protegen es si el evento ENTRA o se traga,
  // y eso se mide restando.
  it("una cola dispuesta y vuelta a arrancar NO traga eventos en silencio", () => {
    const cola = new TelemetryQueue("11111111-2222-3333-4444-555555555555");
    cola.start();
    cola.dispose();
    cola.start();

    const antes = cola.pending;
    cola.track({ eventType: "lesson_opened", payload: {} });

    // Antes esto no crecía y nadie se enteraba: `disposed` era una puerta de un
    // solo sentido.
    expect(cola.pending).toBe(antes + 1);
  });

  it("si la cola sigue desmontada, el evento descartado deja rastro en la consola", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cola = new TelemetryQueue("11111111-2222-3333-4444-555555555555");
    cola.start();
    cola.dispose();

    const antes = cola.pending;
    cola.track({ eventType: "lesson_opened", payload: {} });

    expect(cola.pending).toBe(antes);
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toContain("descartado");
  });

  it("un evento emitido al montar acaba en una petición a /api/events", async () => {
    const espia = fetchEspia();

    render(
      <TelemetryProvider>
        <Consumidor />
      </TelemetryProvider>,
    );
    await pasaUnVaciado();

    expect(espia).toHaveBeenCalledOnce();
    expect(espia.mock.calls[0]?.[0]).toBe("/api/events");
  });

  it("también bajo StrictMode, que es como corre el desarrollo entero", async () => {
    // El doble montaje de StrictMode dejaba la cola muerta para siempre: cero
    // peticiones en toda la sesión, sin un solo mensaje.
    const espia = fetchEspia();

    render(
      <StrictMode>
        <TelemetryProvider>
          <Consumidor />
        </TelemetryProvider>
      </StrictMode>,
    );
    await pasaUnVaciado();

    expect(espia.mock.calls.length).toBeGreaterThan(0);
  });

  it("y después de que el layout se desmonte y se vuelva a montar", async () => {
    const espia = fetchEspia();
    const arbol = (
      <TelemetryProvider>
        <Consumidor />
      </TelemetryProvider>
    );

    const vista = render(arbol);
    await pasaUnVaciado();
    vista.unmount();
    espia.mockClear();

    render(arbol);
    await pasaUnVaciado();

    expect(espia.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("sin provider, useTelemetry() hace ruido", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("en desarrollo lanza, para que se arregle antes de desplegarlo", () => {
    vi.stubEnv("NODE_ENV", "development");
    // React imprime el error del render aunque el test lo capture; se silencia
    // para que la salida de la suite no parezca rota.
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumidor />)).toThrow(/TelemetryProvider/);
  });

  it("en producción avisa por consola y no tira la pantalla del alumno", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumidor />)).not.toThrow();
    expect(error).toHaveBeenCalled();
    expect(error.mock.calls.map((args) => String(args[0])).join("\n")).toContain("[telemetry]");
  });
});
