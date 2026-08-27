/**
 * Correccion: credito parcial real, respuestas en blanco, tipos cruzados y
 * la frontera defensiva del servidor.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import type { AnswerKey, StudentResponse } from "@cet/shared";
import { grade, gradeUnknown } from "../grading/index.js";

const MULTI: AnswerKey = { type: "choice", correctIds: ["a", "c", "d"] };
const SINGLE: AnswerKey = { type: "choice", correctIds: ["b"] };

function choice(...ids: string[]): StudentResponse {
  return { type: "choice", selectedIds: ids };
}

describe("opcion multiple", () => {
  it("seleccion exacta: nota completa", () => {
    const r = grade(choice("a", "c", "d"), MULTI, 3);
    expect(r.isCorrect).toBe(true);
    expect(r.pointsAwarded).toBe(3);
    expect(r.partialRatio).toBe(1);
  });

  it("credito parcial de verdad: 2 de 3 sin fallos", () => {
    const r = grade(choice("a", "c"), MULTI, 3);
    expect(r.isCorrect).toBe(false);
    expect(r.partialRatio).toBeCloseTo(2 / 3, 6);
    expect(r.pointsAwarded).toBeCloseTo(2, 6);
  });

  it("un fallo descuenta un acierto", () => {
    const r = grade(choice("a", "c", "b"), MULTI, 3);
    expect(r.partialRatio).toBeCloseTo(1 / 3, 6);
  });

  it("marcarlo todo no da la nota completa y penaliza cada fallo", () => {
    const all = grade(choice("a", "b", "c", "d", "e"), MULTI, 3);
    const clean = grade(choice("a", "c", "d"), MULTI, 3);
    expect(all.isCorrect).toBe(false);
    expect(all.pointsAwarded).toBeLessThan(clean.pointsAwarded);
    // 3 aciertos - 2 fallos sobre 3 correctas = 1/3.
    expect(all.partialRatio).toBeCloseTo(1 / 3, 6);
  });

  it("marcarlo todo da CERO cuando hay tantas incorrectas como correctas", () => {
    const key: AnswerKey = { type: "choice", correctIds: ["a", "b"] };
    const r = grade(choice("a", "b", "c", "d"), key, 2);
    expect(r.pointsAwarded).toBe(0);
    expect(r.isCorrect).toBe(false);
  });

  it("respuesta unica: marcar dos opciones no es medio acierto", () => {
    expect(grade(choice("b", "a"), SINGLE, 1).pointsAwarded).toBe(0);
    expect(grade(choice("b"), SINGLE, 1).isCorrect).toBe(true);
  });

  it("ids repetidos no suman dos veces", () => {
    const r = grade(choice("a", "a", "a"), MULTI, 3);
    expect(r.partialRatio).toBeCloseTo(1 / 3, 6);
  });

  it("sin seleccion es 0 y no es un error de tipo", () => {
    const r = grade(choice(), MULTI, 3);
    expect(r.pointsAwarded).toBe(0);
    expect(r.rationale).toContain("Sin respuesta");
  });
});

describe("ordenacion", () => {
  const key: AnswerKey = { type: "ordering", correctOrder: ["1", "2", "3", "4"] };

  it("orden exacto", () => {
    const r = grade({ type: "ordering", order: ["1", "2", "3", "4"] }, key, 4);
    expect(r.isCorrect).toBe(true);
    expect(r.pointsAwarded).toBe(4);
  });

  it("credito parcial por posiciones acertadas", () => {
    const r = grade({ type: "ordering", order: ["1", "2", "4", "3"] }, key, 4);
    expect(r.partialRatio).toBeCloseTo(0.5, 6);
    expect(r.isCorrect).toBe(false);
  });

  it("orden completamente invertido", () => {
    const r = grade({ type: "ordering", order: ["4", "3", "2", "1"] }, key, 4);
    expect(r.partialRatio).toBe(0);
  });

  it("lista mas corta no se considera correcta aunque encaje el prefijo", () => {
    const r = grade({ type: "ordering", order: ["1", "2"] }, key, 4);
    expect(r.isCorrect).toBe(false);
    expect(r.partialRatio).toBeCloseTo(0.5, 6);
  });
});

describe("emparejamiento", () => {
  const key: AnswerKey = {
    type: "matching",
    pairs: [
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ],
  };

  it("todas correctas", () => {
    const r = grade(
      {
        type: "matching",
        pairs: [
          ["a", "1"],
          ["b", "2"],
          ["c", "3"],
        ],
      },
      key,
      3,
    );
    expect(r.isCorrect).toBe(true);
    expect(r.pointsAwarded).toBe(3);
  });

  it("credito parcial por pareja", () => {
    const r = grade(
      {
        type: "matching",
        pairs: [
          ["a", "1"],
          ["b", "3"],
          ["c", "2"],
        ],
      },
      key,
      3,
    );
    expect(r.partialRatio).toBeCloseTo(1 / 3, 6);
  });

  it("emparejar todo con todo no da el 100 %", () => {
    const r = grade(
      {
        type: "matching",
        pairs: [
          ["a", "1"],
          ["a", "2"],
          ["a", "3"],
          ["b", "1"],
          ["b", "2"],
          ["c", "3"],
        ],
      },
      key,
      3,
    );
    expect(r.isCorrect).toBe(false);
    expect(r.partialRatio).toBeLessThan(1);
  });
});

describe("texto", () => {
  const key: AnswerKey = {
    type: "text",
    accepted: ["área", "superficie"],
    caseSensitive: false,
    ignoreDiacritics: true,
    canonical: "área",
  };

  it("ignora tildes y mayusculas cuando se le pide", () => {
    expect(grade({ type: "text", value: "AREA" }, key, 1).isCorrect).toBe(true);
    expect(grade({ type: "text", value: "  area  " }, key, 1).isCorrect).toBe(true);
    expect(grade({ type: "text", value: "Superficie" }, key, 1).isCorrect).toBe(true);
  });

  it("respeta caseSensitive cuando se activa", () => {
    const strict: AnswerKey = {
      type: "text",
      accepted: ["NaCl"],
      caseSensitive: true,
      ignoreDiacritics: false,
      canonical: "NaCl",
    };
    expect(grade({ type: "text", value: "NaCl" }, strict, 1).isCorrect).toBe(true);
    expect(grade({ type: "text", value: "nacl" }, strict, 1).isCorrect).toBe(false);
  });

  it("no acepta una respuesta parecida", () => {
    expect(grade({ type: "text", value: "areas" }, key, 1).isCorrect).toBe(false);
  });
});

describe("manual", () => {
  const key: AnswerKey = { type: "manual", rubric: { es: "Valorar el razonamiento", en: "Assess reasoning" } };

  it("una respuesta con contenido queda pendiente de profesor", () => {
    const r = grade({ type: "text", value: "Porque el area crece al cuadrado" }, key, 5);
    expect(r.requiresManualReview).toBe(true);
    expect(r.pointsAwarded).toBe(0);
    expect(r.isCorrect).toBe(false);
  });

  it("un blanco no ocupa la cola de correccion humana", () => {
    const r = grade({ type: "empty" }, key, 5);
    expect(r.requiresManualReview).toBe(false);
  });
});

describe("robustez de la frontera", () => {
  it("una respuesta del tipo equivocado puntua 0 y lo explica, no lanza", () => {
    const r = grade(choice("a"), { type: "numeric", value: 1, tolerance: 0, canonical: "1" }, 1);
    expect(r.pointsAwarded).toBe(0);
    expect(r.rationale).toContain("choice");
  });

  it("maxPoints invalido si lanza: es un bug de quien llama, no del alumno", () => {
    expect(() => grade({ type: "empty" }, SINGLE, 0)).toThrow();
    expect(() => grade({ type: "empty" }, SINGLE, Number.NaN)).toThrow();
  });

  it("gradeUnknown valida la clave que viene de la base de datos", () => {
    expect(() => gradeUnknown({ type: "empty" }, { type: "no_existe" }, 1)).toThrow();
  });

  it("gradeUnknown trata una respuesta corrupta como respuesta en blanco", () => {
    const r = gradeUnknown({ type: "choice", selectedIds: "no-es-un-array" }, MULTI, 3);
    expect(r.pointsAwarded).toBe(0);
    expect(r.isCorrect).toBe(false);
  });

  it("nunca devuelve mas puntos que maxPoints ni menos de 0", () => {
    const responses: StudentResponse[] = [
      choice("a", "c", "d"),
      choice("a"),
      choice(),
      { type: "empty" },
      { type: "text", value: "x" },
    ];
    for (const response of responses) {
      const r = grade(response, MULTI, 2.5);
      expect(r.pointsAwarded).toBeGreaterThanOrEqual(0);
      expect(r.pointsAwarded).toBeLessThanOrEqual(2.5);
      expect(r.partialRatio).toBeGreaterThanOrEqual(0);
      expect(r.partialRatio).toBeLessThanOrEqual(1);
    }
  });
});
