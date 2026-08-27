/**
 * Recuperación: el alumno no pierde nada.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { recoverResponses } from "./recovery";
import type { PendingAnswer } from "./autosave";
import type { AttemptItemStudent } from "./types";

function item(id: string, ord: number, saved: AttemptItemStudent["savedResponse"] = null): AttemptItemStudent {
  return {
    id,
    ord,
    sectionOrd: null,
    questionId: null,
    questionVersionId: null,
    renderedBody: { stem: `pregunta ${ord}` },
    skillId: null,
    difficulty: null,
    maxPoints: 1,
    format: "numeric",
    savedResponse: saved,
    savedRevision: saved ? 1 : null,
    matchLeft: null,
    matchRight: null,
  };
}

describe("recoverResponses", () => {
  it("restaura desde el servidor lo que el alumno ya había respondido", () => {
    const items = [
      item("a", 1, { type: "text", value: "12" }),
      item("b", 2),
      item("c", 3, { type: "choice", selectedIds: ["o2"] }),
    ];

    const recovered = recoverResponses(items, []);

    expect(recovered.responses["a"]).toEqual({ type: "text", value: "12" });
    expect(recovered.responses["c"]).toEqual({ type: "choice", selectedIds: ["o2"] });
    expect(recovered.restoredFromServer).toBe(2);
  });

  it("da a cada ítem sin responder el valor vacío de SU formato", () => {
    // Si arrancara en `undefined`, React saltaría de input no controlado a
    // controlado en el primer teclazo, y eso borra lo que el alumno escribió.
    const recovered = recoverResponses([item("a", 1)], []);
    expect(recovered.responses["a"]).toEqual({ type: "text", value: "" });
  });

  it("la cola local gana: lo que nunca llegó al servidor no se pierde", () => {
    const items = [item("a", 1, { type: "text", value: "viejo" })];
    const queued: PendingAnswer[] = [
      { attemptItemId: "a", response: { type: "text", value: "lo último que escribí" }, clientTs: "2026-05-04T10:10:00.000Z", timeOnItemMs: 3 },
    ];

    const recovered = recoverResponses(items, queued);

    expect(recovered.responses["a"]).toEqual({ type: "text", value: "lo último que escribí" });
    expect(recovered.unsentItemIds).toEqual(["a"]);
  });

  it("cede ante el servidor si este tiene algo ESTRICTAMENTE más nuevo (la otra pestaña)", () => {
    const items = [item("a", 1, { type: "text", value: "desde la otra pestaña" })];
    const queued: PendingAnswer[] = [
      { attemptItemId: "a", response: { type: "text", value: "viejo local" }, clientTs: "2026-05-04T10:00:00.000Z", timeOnItemMs: 3 },
    ];

    const recovered = recoverResponses(items, queued, { a: "2026-05-04T10:05:00.000Z" });

    expect(recovered.responses["a"]).toEqual({ type: "text", value: "desde la otra pestaña" });
    expect(recovered.unsentItemIds).toEqual([]);
  });

  it("en empate de fechas gana lo local, que es lo no enviado", () => {
    const same = "2026-05-04T10:00:00.000Z";
    const items = [item("a", 1, { type: "text", value: "servidor" })];
    const queued: PendingAnswer[] = [
      { attemptItemId: "a", response: { type: "text", value: "local" }, clientTs: same, timeOnItemMs: 3 },
    ];

    expect(recoverResponses(items, queued, { a: same }).responses["a"]).toEqual({ type: "text", value: "local" });
  });

  it("descarta entradas de la cola que no son de este intento", () => {
    // Ocurre con dos exámenes empezados: enviarla escribiría en el intento
    // equivocado, que es peor que perderla.
    const recovered = recoverResponses([item("a", 1)], [
      { attemptItemId: "de-otro-examen", response: { type: "text", value: "x" }, clientTs: "2026-05-04T10:00:00.000Z", timeOnItemMs: 1 },
    ]);

    expect(recovered.responses["de-otro-examen"]).toBeUndefined();
    expect(recovered.unsentItemIds).toEqual([]);
  });
});
