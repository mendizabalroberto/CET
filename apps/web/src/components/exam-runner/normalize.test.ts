/**
 * Normalización tolerante: el servidor puede cambiar de forma sin dejar a un
 * niño delante de una pantalla en blanco.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { inferFormat, normalizeAttemptItem, normalizeResult, normalizeStartResponse } from "./normalize";

const ITEM = {
  id: "item-1",
  ord: 1,
  rendered_body: { stem: "¿Cuánto es 3/4 + 1/4?" },
  max_points: "2.0",
  format: "numeric",
};

describe("normalizeAttemptItem", () => {
  it("acepta snake_case y camelCase indistintamente", () => {
    const snake = normalizeAttemptItem(ITEM, 1);
    const camel = normalizeAttemptItem(
      { id: "item-1", ord: 1, renderedBody: { stem: "x" }, maxPoints: 2, format: "numeric" },
      1,
    );
    expect(snake?.maxPoints).toBe(2);
    expect(camel?.maxPoints).toBe(2);
  });

  it("convierte los `numeric` que PostgREST devuelve como cadena", () => {
    // Sin esto, `max_points: "2.0"` acabaría en un "NaN / NaN" en pantalla.
    expect(normalizeAttemptItem(ITEM, 1)?.maxPoints).toBe(2);
  });

  it("descarta un ítem sin id o sin enunciado en vez de pintar un hueco", () => {
    expect(normalizeAttemptItem({ ord: 1, rendered_body: { stem: "x" } }, 1)).toBeNull();
    expect(normalizeAttemptItem({ id: "a", rendered_body: {} }, 1)).toBeNull();
  });

  it("NUNCA expone answerKey ni itemSeed aunque el servidor los mande", () => {
    const item = normalizeAttemptItem(
      { ...ITEM, answer_key: { type: "numeric", value: 1 }, item_seed: 99 },
      1,
    );
    expect(item).not.toBeNull();
    expect(JSON.stringify(item)).not.toContain("answer_key");
    expect(JSON.stringify(item)).not.toContain("answerKey");
    expect(JSON.stringify(item)).not.toContain("99");
  });

  it("restaura la respuesta guardada del alumno bajo cualquiera de sus nombres", () => {
    const a = normalizeAttemptItem({ ...ITEM, saved_response: { type: "text", value: "1" } }, 1);
    const b = normalizeAttemptItem({ ...ITEM, response: { type: "text", value: "1" } }, 1);
    expect(a?.savedResponse).toEqual({ type: "text", value: "1" });
    expect(b?.savedResponse).toEqual({ type: "text", value: "1" });
  });

  it("una respuesta guardada ilegible se trata como ausente, no como a medias", () => {
    const item = normalizeAttemptItem({ ...ITEM, response: { type: "marciano" } }, 1);
    expect(item?.savedResponse).toBeNull();
  });
});

describe("inferFormat", () => {
  it("deduce elección múltiple cuando hay opciones", () => {
    expect(inferFormat({ stem: "x", options: [{ id: "a", html: "1" }, { id: "b", html: "2" }] })).toBe("mcq_single");
  });

  it("deduce verdadero/falso", () => {
    expect(
      inferFormat({ stem: "x", options: [{ id: "a", html: "True" }, { id: "b", html: "False" }] }),
    ).toBe("true_false");
  });

  it("cae a texto libre cuando no hay nada que deducir: siempre se puede responder", () => {
    expect(inferFormat({ stem: "x" })).toBe("short_text");
    expect(inferFormat({ stem: "x", unit: "cm" })).toBe("numeric");
  });
});

describe("normalizeStartResponse", () => {
  it("ordena por `ord` y no por el orden del array", () => {
    const parsed = normalizeStartResponse({
      attemptId: "a1",
      serverDeadlineAt: "2026-05-04T10:25:00.000Z",
      serverNow: "2026-05-04T10:00:00.000Z",
      items: [
        { ...ITEM, id: "b", ord: 2 },
        { ...ITEM, id: "a", ord: 1 },
      ],
    });
    expect(parsed?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("descarta los ítems rotos y conserva el resto: perder el examen entero por una pregunta es peor", () => {
    const parsed = normalizeStartResponse({
      attemptId: "a1",
      serverDeadlineAt: "2026-05-04T10:25:00.000Z",
      serverNow: "2026-05-04T10:00:00.000Z",
      items: [ITEM, { ord: 2 }, { ...ITEM, id: "c", ord: 3 }],
    });
    expect(parsed?.items).toHaveLength(2);
  });

  it("devuelve null sin las dos fechas del servidor: sin ellas no hay cronómetro honesto", () => {
    expect(normalizeStartResponse({ attemptId: "a1", items: [] })).toBeNull();
  });

  it("`allowBack` por defecto es true y `feedbackMode` por defecto es never", () => {
    const parsed = normalizeStartResponse({
      attemptId: "a1",
      serverDeadlineAt: "2026-05-04T10:25:00.000Z",
      serverNow: "2026-05-04T10:00:00.000Z",
      items: [ITEM],
    });
    expect(parsed?.allowBack).toBe(true);
    expect(parsed?.feedbackMode).toBe("never");
  });
});

describe("normalizeResult", () => {
  it("acepta un resultado sin items (el caso `never`)", () => {
    const parsed = normalizeResult({ status: "graded", scoreRaw: 8, scoreMax: 10, passed: true });
    expect(parsed?.items).toBeNull();
    expect(parsed?.feedbackMode).toBe("never");
  });

  it("lee la forma REAL del servidor: `score` anidado y `review` en vez de `items`", () => {
    // Es el `AttemptResultPayload` de `src/lib/exam/types.ts`. Leerlo plano
    // daría un "0 / 0" a un niño que ha sacado un 18: el peor bug posible de
    // esta pantalla, y silencioso.
    const parsed = normalizeResult({
      attemptId: "at-1",
      status: "graded",
      feedbackMode: "after_submit",
      score: { scoreRaw: 18, scoreMax: 20, scorePct: 90, passed: true },
      review: [
        { attemptItemId: "b", ord: 2, isCorrect: false, pointsAwarded: 0, maxPoints: 1 },
        { attemptItemId: "a", ord: 1, isCorrect: true, pointsAwarded: 1, maxPoints: 1, correctAnswer: "7/4" },
      ],
    });

    expect(parsed?.scoreRaw).toBe(18);
    expect(parsed?.scoreMax).toBe(20);
    expect(parsed?.scorePct).toBe(90);
    expect(parsed?.passed).toBe(true);
    expect(parsed?.attemptId).toBe("at-1");
    expect(parsed?.items?.map((i) => i.ord)).toEqual([1, 2]);
  });

  it("`score: null` (todavía sin corregir) no se convierte en un cero", () => {
    const parsed = normalizeResult({ status: "grading", score: null, review: [] });
    expect(parsed?.scoreRaw).toBeNull();
    expect(parsed?.passed).toBeNull();
  });

  it("normaliza los items de revisión y los ordena", () => {
    const parsed = normalizeResult({
      status: "graded",
      feedback_mode: "after_submit",
      items: [
        { attempt_item_id: "b", ord: 2, is_correct: false, points_awarded: 0, max_points: 1 },
        { attempt_item_id: "a", ord: 1, is_correct: true, points_awarded: 1, max_points: 1, correct_answer: "7/4" },
      ],
    });
    expect(parsed?.items?.map((i) => i.ord)).toEqual([1, 2]);
    expect(parsed?.items?.[0]?.correctAnswer).toBe("7/4");
  });
});
