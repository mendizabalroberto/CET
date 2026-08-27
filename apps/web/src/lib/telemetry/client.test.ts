/**
 * La cola de telemetría: orden, lotes y no perder eventos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { FLUSH_AT_COUNT, TelemetryQueue } from "./client";

function makeQueue(): TelemetryQueue {
  return new TelemetryQueue("11111111-2222-3333-4444-555555555555");
}

describe("TelemetryQueue", () => {
  it("encola en orden de entrada", () => {
    const queue = makeQueue();
    const seen: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      queue.track({ eventType: "question_shown", payload: { ord: i } });
      seen.push(queue.pending);
    }

    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("mantiene el mismo sessionId durante toda la sesión", () => {
    const queue = makeQueue();
    expect(queue.getSessionId()).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("acumula sin enviar mientras no haya navegador", () => {
    // En Node no hay `window`: `flush()` sale sin hacer nada y los eventos se
    // quedan en la cola. Es lo que garantiza que un render en el servidor no
    // dispare peticiones de telemetría.
    const queue = makeQueue();
    for (let i = 0; i < FLUSH_AT_COUNT + 5; i += 1) {
      queue.track({ eventType: "answer_changed", payload: {} });
    }
    expect(queue.pending).toBe(FLUSH_AT_COUNT + 5);
  });

  it("descarta los eventos MÁS ANTIGUOS al desbordar, no los recientes", () => {
    const queue = makeQueue();
    for (let i = 0; i < 600; i += 1) {
      queue.track({ eventType: "focus_lost", payload: { i } });
    }
    // Tope duro de 500: una sesión sin red no puede agotar la memoria de una
    // tableta del aula.
    expect(queue.pending).toBe(500);
  });

  it("no encola nada después de dispose()", () => {
    const queue = makeQueue();
    queue.dispose();
    queue.track({ eventType: "lesson_opened", payload: {} });
    expect(queue.pending).toBe(0);
  });
});
