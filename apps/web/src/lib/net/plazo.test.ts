/**
 * El portero de la red cumple lo que promete.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `peticion-sin-plazo.test.ts` obliga a que TODA la app pase por aquí. Eso solo
 * vale algo si lo de aquí funciona: si `fetchConPlazo` no abortara de verdad, el
 * invariante estaría dando por buena una fila de llamadas igual de colgadas que
 * antes, y con la conciencia más tranquila. De ahí este fichero.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchConPlazo, PlazoAgotadoError } from "./plazo";

/** Un `fetch` que acepta y no contesta, y que rechaza al abortarse como el real. */
function fetchColgado(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchConPlazo", () => {
  it("se rinde al vencer el plazo", async () => {
    vi.useFakeTimers();
    fetchColgado();

    const resultado = fetchConPlazo("/x", {}, 1_000).then(
      () => "resolvió" as const,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(1_100);

    await expect(resultado).resolves.toBeInstanceOf(PlazoAgotadoError);
  });

  it("aborta la petición de verdad, no solo deja de esperarla", async () => {
    // La diferencia importa: una petición que sigue viva consume la conexión de
    // una tableta de colegio y puede llegar al servidor mucho después.
    vi.useFakeTimers();
    let abortada = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              abortada = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );

    const resultado = fetchConPlazo("/x", {}, 500).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(600);
    await resultado;

    expect(abortada).toBe(true);
  });

  it("no toca una respuesta que llega dentro del plazo", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, status: 200 }), 3_000);
          }),
      ),
    );

    const resultado = fetchConPlazo("/x", {}, 10_000);
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(resultado).resolves.toMatchObject({ ok: true });
  });

  it("un aborto de fuera sigue siendo un aborto de fuera, no un plazo agotado", async () => {
    // Quien desmonta un componente espera un `AbortError` para no tocar estado
    // de algo que ya no existe. Convertirlo en `PlazoAgotadoError` haría que la
    // pantalla pintara un aviso de red en una pantalla que ya no está.
    vi.useFakeTimers();
    fetchColgado();
    const externo = new AbortController();

    const resultado = fetchConPlazo("/x", { signal: externo.signal }, 60_000).then(
      () => "resolvió" as const,
      (e: unknown) => e,
    );
    externo.abort();
    await vi.advanceTimersByTimeAsync(10);

    const error = await resultado;
    expect(error).not.toBeInstanceOf(PlazoAgotadoError);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
