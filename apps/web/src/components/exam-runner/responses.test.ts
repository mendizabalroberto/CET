/**
 * Qué cuenta como respondido, y cuándo un cambio no es un cambio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { emptyResponseFor, isAnswered, responsesEqual, unansweredOrdinals } from "./responses";

describe("isAnswered", () => {
  it("una cadena de solo espacios NO cuenta como respondida", () => {
    // Un niño que roza la barra espaciadora no debe ver la pregunta marcada
    // como hecha y saltársela.
    expect(isAnswered({ type: "text", value: "   " })).toBe(false);
    expect(isAnswered({ type: "text", value: "0" })).toBe(true);
  });

  it("distingue vacío de respondido en cada formato", () => {
    expect(isAnswered({ type: "choice", selectedIds: [] })).toBe(false);
    expect(isAnswered({ type: "choice", selectedIds: ["a"] })).toBe(true);
    expect(isAnswered({ type: "ordering", order: [] })).toBe(false);
    expect(isAnswered({ type: "matching", pairs: [] })).toBe(false);
    expect(isAnswered({ type: "empty" })).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
  });
});

describe("responsesEqual", () => {
  it("el orden de selección no es información en una múltiple", () => {
    expect(
      responsesEqual({ type: "choice", selectedIds: ["a", "b"] }, { type: "choice", selectedIds: ["b", "a"] }),
    ).toBe(true);
  });

  it("en un `ordering` el orden SÍ es la respuesta", () => {
    expect(
      responsesEqual({ type: "ordering", order: ["a", "b"] }, { type: "ordering", order: ["b", "a"] }),
    ).toBe(false);
  });

  it("detecta el cambio real de un texto", () => {
    expect(responsesEqual({ type: "text", value: "12" }, { type: "text", value: "12" })).toBe(true);
    expect(responsesEqual({ type: "text", value: "12" }, { type: "text", value: "13" })).toBe(false);
  });

  it("tipos distintos nunca son iguales", () => {
    expect(responsesEqual({ type: "text", value: "" }, { type: "empty" })).toBe(false);
  });
});

describe("emptyResponseFor", () => {
  it("da a cada formato el envoltorio que su control espera", () => {
    expect(emptyResponseFor("mcq_multi")).toEqual({ type: "choice", selectedIds: [] });
    expect(emptyResponseFor("ordering")).toEqual({ type: "ordering", order: [] });
    expect(emptyResponseFor("matching")).toEqual({ type: "matching", pairs: [] });
    expect(emptyResponseFor("fraction")).toEqual({ type: "text", value: "" });
  });
});

describe("unansweredOrdinals", () => {
  it("es la lista que lee el diálogo de entrega", () => {
    const items = [
      { id: "a", ord: 1 },
      { id: "b", ord: 2 },
      { id: "c", ord: 3 },
    ];
    const responses = {
      a: { type: "text" as const, value: "1" },
      b: { type: "text" as const, value: "  " },
      c: { type: "choice" as const, selectedIds: [] },
    };
    expect(unansweredOrdinals(items, responses)).toEqual([2, 3]);
  });
});
