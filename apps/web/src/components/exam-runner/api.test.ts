/**
 * La capa de red traduce lo que dice el servidor, no lo que parece decir.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El motor devuelve **409 para nueve situaciones distintas**. Estos tests fijan
 * que cada una acaba en el `kind` correcto: confundir "ya has entregado" con
 * "no hay preguntas suficientes" manda al alumno a una pantalla de resultado
 * que no existe.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchResult, saveAnswer, startAttempt, submitAttempt } from "./api";
import { ApiError } from "./types";

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

const START_OK = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  serverNow: "2026-05-04T10:00:00.000Z",
  serverDeadlineAt: "2026-05-04T10:25:00.000Z",
  allowBack: true,
  feedbackMode: "after_submit",
  resumed: false,
  items: [{ id: "i1", ord: 1, renderedBody: { stem: "3/4 + 1/4" }, maxPoints: 1 }],
};

afterEach(() => vi.unstubAllGlobals());

describe("los nueve 409 no son el mismo error", () => {
  const cases: readonly [string, string][] = [
    ["deadline_passed", "deadline_passed"],
    ["attempt_not_in_progress", "already_submitted"],
    ["attempt_not_submitted", "not_submitted"],
    ["window_closed", "unavailable"],
    ["window_not_open", "unavailable"],
    ["max_attempts_reached", "unavailable"],
    ["insufficient_pool", "not_ready"],
    ["blueprint_invalid", "not_ready"],
  ];

  for (const [code, kind] of cases) {
    it(`\`${code}\` -> \`${kind}\``, async () => {
      mockFetch(409, { error: code });
      await expect(startAttempt("a1", { retryOnStarting: false })).rejects.toMatchObject({ kind, code });
    });
  }

  it("`attempt_starting` se reintenta solo una vez antes de rendirse", async () => {
    // Es una carrera de milisegundos entre dos recargas rápidas. Hacer que el
    // alumno pulse otra vez por eso sería absurdo.
    const fetchMock = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "attempt_starting" }) }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startAttempt("a1")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("clasificación general", () => {
  it("un fallo de red es `offline` y nunca culpa al alumno", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchResult("at-1")).rejects.toMatchObject({ kind: "offline", status: 0 });
  });

  it("un 500 sin cuerpo legible es `server`, no `offline`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("no es json");
        },
      })),
    );
    await expect(fetchResult("at-1")).rejects.toMatchObject({ kind: "server", status: 500 });
  });

  it("401 y 403 son `unauthorized` aunque no venga código", async () => {
    mockFetch(401, null);
    await expect(fetchResult("at-1")).rejects.toMatchObject({ kind: "unauthorized" });
  });
});

describe("startAttempt", () => {
  it("acepta el 201 de un intento nuevo", async () => {
    mockFetch(201, START_OK);
    const started = await startAttempt("a1");
    expect(started.attemptId).toBe(START_OK.attemptId);
    expect(started.items).toHaveLength(1);
    expect(started.resumed).toBe(false);
  });

  it("acepta el 200 de un intento reanudado", async () => {
    mockFetch(200, { ...START_OK, resumed: true });
    expect((await startAttempt("a1")).resumed).toBe(true);
  });

  it("un cuerpo ilegible es `server`, no una pantalla en blanco", async () => {
    mockFetch(200, { nada: "que ver" });
    await expect(startAttempt("a1")).rejects.toMatchObject({ kind: "server" });
  });
});

describe("saveAnswer", () => {
  it("devuelve la revisión del SERVIDOR y su reloj para resincronizar", async () => {
    mockFetch(200, {
      attemptItemId: "i1",
      revision: 4,
      serverTs: "2026-05-04T10:05:00.000Z",
      serverNow: "2026-05-04T10:05:00.000Z",
      serverDeadlineAt: "2026-05-04T10:25:00.000Z",
      remainingMs: 1_200_000,
    });

    const saved = await saveAnswer("at-1", {
      attemptItemId: "i1",
      response: { type: "text", value: "1" },
      clientTs: "2026-05-04T10:05:00.000Z",
      timeOnItemMs: 900,
    });

    expect(saved.revision).toBe(4);
    expect(saved.clock).toEqual({
      serverNow: "2026-05-04T10:05:00.000Z",
      serverDeadlineAt: "2026-05-04T10:25:00.000Z",
    });
  });

  it("sin reloj en la respuesta, `clock` es null y no se resincroniza nada", async () => {
    mockFetch(200, { revision: 1 });
    const saved = await saveAnswer("at-1", {
      attemptItemId: "i1",
      response: { type: "empty" },
      clientTs: "2026-05-04T10:05:00.000Z",
      timeOnItemMs: 1,
    });
    expect(saved.clock).toBeNull();
  });
});

describe("submitAttempt", () => {
  it("lee la nota de la forma anidada del servidor", async () => {
    mockFetch(200, {
      attemptId: "at-1",
      status: "graded",
      feedbackMode: "after_submit",
      score: { scoreRaw: 18, scoreMax: 20, scorePct: 90, passed: true },
      review: [],
    });

    const result = await submitAttempt("at-1", "student");
    expect(result.scoreRaw).toBe(18);
    expect(result.passed).toBe(true);
  });

  it("una segunda entrega devuelve `already_submitted`, que no es un error que enseñar", async () => {
    mockFetch(409, { error: "attempt_not_in_progress" });
    await expect(submitAttempt("at-1", "student")).rejects.toMatchObject({ kind: "already_submitted" });
  });
});
