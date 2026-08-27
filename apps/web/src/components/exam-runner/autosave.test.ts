/**
 * La cola de autoguardado: debounce, reintento y no perder nada.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutosaveQueue, DEBOUNCE_MS, type PendingAnswer, type QueueStorage } from "./autosave";
import { ApiError } from "./types";

type SendResult = { revision: number };

/**
 * Promesa que se resuelve a mano. Se escribe así, y no con una variable
 * capturada en el ejecutor, porque TypeScript estrecha esa variable a `never`
 * (no ve que el ejecutor corre de forma síncrona) y el test deja de compilar.
 */
function deferred(): { promise: Promise<SendResult>; resolve: (v: SendResult) => void } {
  let resolve!: (v: SendResult) => void;
  const promise = new Promise<SendResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function memoryStorage(): QueueStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const RESPONSE = { type: "text" as const, value: "42" };

function makeQueue(
  send: (p: PendingAnswer) => Promise<SendResult>,
  storage: QueueStorage | null = null,
) {
  const states: string[] = [];
  const deadlinePassed = vi.fn();
  const queue = new AutosaveQueue("attempt-1", {
    send,
    onStateChange: (s) => void states.push(s),
    onDeadlinePassed: deadlinePassed,
    storage,
  });
  return { queue, states, deadlinePassed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("debounce", () => {
  it("no envía nada mientras el alumno sigue escribiendo", async () => {
    // El parámetro se declara aunque no se use: sin él, el tipo de
    // `send.mock.calls` sería una tupla vacía y no se podría inspeccionar lo
    // que se envió, que es justamente lo que este test comprueba.
    const send = vi.fn(async (_pending: PendingAnswer) => ({ revision: 1 }));
    const { queue } = makeQueue(send);

    for (const value of ["1", "12", "12.", "12.7", "12.75"]) {
      queue.queue({ attemptItemId: "i1", response: { type: "text", value }, clientTs: new Date().toISOString(), timeOnItemMs: 10 });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100);
    }
    expect(send).not.toHaveBeenCalled();

    // Al parar de escribir, UNA sola petición con el valor final. Cinco
    // revisiones por escribir un número harían que el forense contara cinco
    // cambios de opinión que no existieron.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ response: { type: "text", value: "12.75" } });
  });
});

describe("reintento", () => {
  it("mantiene la respuesta y la reintenta cuando vuelve la red", async () => {
    let online = false;
    const send = vi.fn(async (): Promise<SendResult> => {
      if (!online) throw new ApiError("offline", 0);
      return { revision: 3 };
    });
    const { queue, states } = makeQueue(send);

    queue.queue({ attemptItemId: "i1", response: RESPONSE, clientTs: new Date().toISOString(), timeOnItemMs: 5 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);

    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.hasPending).toBe(true);
    expect(states).toContain("offline");

    // Dos minutos sin red: sigue reintentando y sigue sin perder la respuesta.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(queue.hasPending).toBe(true);
    expect(send.mock.calls.length).toBeGreaterThan(1);

    online = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(queue.hasPending).toBe(false);
    expect(queue.getState()).toBe("saved");
  });

  it('nunca dice "guardado" antes de que conteste el servidor', async () => {
    const gate = deferred();
    const send = vi.fn(() => gate.promise);
    const { queue } = makeQueue(send);

    queue.queue({ attemptItemId: "i1", response: RESPONSE, clientTs: new Date().toISOString(), timeOnItemMs: 5 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);

    expect(queue.getState()).toBe("saving");
    gate.resolve({ revision: 1 });
    await vi.advanceTimersByTimeAsync(1);
    expect(queue.getState()).toBe("saved");
  });

  it("para la cola y avisa cuando el servidor dice que el deadline pasó", async () => {
    const send = vi.fn(async () => {
      throw new ApiError("deadline_passed", 409);
    });
    const { queue, deadlinePassed } = makeQueue(send);

    queue.queue({ attemptItemId: "i1", response: RESPONSE, clientTs: new Date().toISOString(), timeOnItemMs: 5 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);

    expect(deadlinePassed).toHaveBeenCalledTimes(1);
    // Y no insiste: quien decide es el servidor, no la cola.
    const callsAfterStop = send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send.mock.calls.length).toBe(callsAfterStop);
  });
});

describe("lo último que escribió gana", () => {
  it("no marca como limpio un ítem que cambió mientras viajaba la petición", async () => {
    const gate = deferred();
    const send = vi.fn(() => gate.promise);
    const { queue } = makeQueue(send);

    queue.queue({ attemptItemId: "i1", response: { type: "text", value: "viejo" }, clientTs: "2026-01-01T00:00:00.000Z", timeOnItemMs: 5 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);

    // Cambia de opinión con la petición en vuelo.
    queue.queue({ attemptItemId: "i1", response: { type: "text", value: "nuevo" }, clientTs: "2026-01-01T00:00:01.000Z", timeOnItemMs: 9 });
    gate.resolve({ revision: 1 });
    await vi.advanceTimersByTimeAsync(1);

    expect(queue.hasPending).toBe(true);
    expect(queue.snapshot()[0]?.response).toEqual({ type: "text", value: "nuevo" });
  });
});

describe("persistencia", () => {
  it("sobrevive a cerrar la pestaña: la cola se recupera del almacenamiento", async () => {
    const storage = memoryStorage();
    const failing = vi.fn(async () => {
      throw new ApiError("offline", 0);
    });
    const first = makeQueue(failing, storage);
    first.queue.queue({ attemptItemId: "i7", response: RESPONSE, clientTs: "2026-01-01T00:00:00.000Z", timeOnItemMs: 1 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    first.queue.stop();

    expect(storage.map.size).toBe(1);

    // Nueva pestaña, nueva cola, mismo intento: la respuesta sigue ahí.
    const send = vi.fn(async () => ({ revision: 1 }));
    const second = makeQueue(send, storage);
    expect(second.queue.hasPending).toBe(true);
    expect(second.queue.snapshot()[0]?.attemptItemId).toBe("i7");

    await second.queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.map.size).toBe(0);
  });

  it("`dispose` intenta enviar lo pendiente antes de morir; `stop` no", async () => {
    // Es la diferencia entre el alumno que pulsa "volver a mis exámenes" con una
    // respuesta recién escrita (se manda) y el servidor diciendo que el intento
    // ya terminó (no se insiste).
    const send = vi.fn(async () => ({ revision: 1 }));
    const disposed = makeQueue(send, memoryStorage());
    disposed.queue.queue({ attemptItemId: "i1", response: RESPONSE, clientTs: "2026-01-01T00:00:00.000Z", timeOnItemMs: 1 });
    disposed.queue.dispose();
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledTimes(1);

    const stopSend = vi.fn(async () => ({ revision: 1 }));
    const stopped = makeQueue(stopSend, memoryStorage());
    stopped.queue.queue({ attemptItemId: "i1", response: RESPONSE, clientTs: "2026-01-01T00:00:00.000Z", timeOnItemMs: 1 });
    stopped.queue.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stopSend).not.toHaveBeenCalled();
  });

  it("una cola corrupta no impide entrar al examen", () => {
    const storage = memoryStorage();
    storage.map.set("cet.exam.queue.attempt-1", "{no es json");
    const { queue } = makeQueue(async () => ({ revision: 1 }), storage);
    expect(queue.hasPending).toBe(false);
  });
});
