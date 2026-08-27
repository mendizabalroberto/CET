/**
 * Cadena de recalificación: orden y nota vigente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import {
  effectiveGrading,
  orderGradingChain,
  regradeCount,
  totalEffectivePoints,
  type GradingRow,
} from "./grading-chain";

function grading(over: Partial<GradingRow> & { id: string }): GradingRow {
  return {
    points_awarded: 1,
    max_points: 2,
    is_correct: null,
    partial_ratio: null,
    graded_by: "auto",
    grader_id: null,
    rationale: null,
    graded_at: "2026-05-01T10:00:00.000Z",
    supersedes_id: null,
    ...over,
  };
}

describe("orderGradingChain", () => {
  it("sin filas devuelve una cadena vacía", () => {
    expect(orderGradingChain([])).toEqual([]);
  });

  it("una única nota es raíz y hoja a la vez", () => {
    const chain = orderGradingChain([grading({ id: "g1" })]);
    expect(chain).toHaveLength(1);
    expect(chain[0]?.step).toBe(1);
    expect(chain[0]?.effective).toBe(true);
    expect(chain[0]?.superseded).toBe(false);
    expect(chain[0]?.detached).toBe(false);
  });

  it("ordena raíz → recalificación 1 → recalificación 2", () => {
    const rows = [
      grading({ id: "g3", supersedes_id: "g2", graded_at: "2026-05-03T10:00:00.000Z" }),
      grading({ id: "g1", supersedes_id: null, graded_at: "2026-05-01T10:00:00.000Z" }),
      grading({ id: "g2", supersedes_id: "g1", graded_at: "2026-05-02T10:00:00.000Z" }),
    ];
    const chain = orderGradingChain(rows);

    expect(chain.map((e) => e.row.id)).toEqual(["g1", "g2", "g3"]);
    expect(chain.map((e) => e.step)).toEqual([1, 2, 3]);
    expect(chain.map((e) => e.superseded)).toEqual([true, true, false]);
    expect(chain.map((e) => e.effective)).toEqual([false, false, true]);
  });

  it("la nota VIGENTE es la hoja, no la raíz — el error que este módulo existe para evitar", () => {
    const rows = [
      grading({ id: "auto", supersedes_id: null, points_awarded: 0, graded_by: "auto" }),
      grading({
        id: "manual",
        supersedes_id: "auto",
        points_awarded: 2,
        graded_by: "manual",
        grader_id: "teacher-1",
        graded_at: "2026-05-02T10:00:00.000Z",
      }),
    ];

    // `supersedes_id is null` es la RAÍZ (la nota automática de 0 puntos).
    expect(rows.find((r) => r.supersedes_id === null)?.points_awarded).toBe(0);
    // La vigente es la manual de 2 puntos.
    expect(effectiveGrading(rows)?.id).toBe("manual");
    expect(effectiveGrading(rows)?.points_awarded).toBe(2);
  });

  it("no se cuelga con un ciclo y no pierde ninguna fila", () => {
    const rows = [
      grading({ id: "a", supersedes_id: "b" }),
      grading({ id: "b", supersedes_id: "a", graded_at: "2026-05-02T10:00:00.000Z" }),
    ];
    const chain = orderGradingChain(rows);
    expect(chain).toHaveLength(2);
    expect(new Set(chain.map((e) => e.row.id))).toEqual(new Set(["a", "b"]));
  });

  it("una fila cuyo supersedes_id apunta a una ausente se trata como raíz", () => {
    const rows = [
      grading({ id: "g1", supersedes_id: null }),
      grading({ id: "g9", supersedes_id: "desaparecida", graded_at: "2026-05-05T10:00:00.000Z" }),
    ];
    const chain = orderGradingChain(rows);
    expect(chain).toHaveLength(2);
    // La cadena principal arranca en la raíz más antigua: g1.
    expect(chain.find((e) => e.row.id === "g1")?.detached).toBe(false);
    expect(chain.find((e) => e.row.id === "g9")?.detached).toBe(true);
    expect(effectiveGrading(rows)?.id).toBe("g1");
  });

  it("desempata por id cuando dos notas comparten graded_at", () => {
    const rows = [
      grading({ id: "bbb", supersedes_id: null }),
      grading({ id: "aaa", supersedes_id: null }),
    ];
    const chain = orderGradingChain(rows);
    expect(chain.map((e) => e.row.id)).toEqual(["aaa", "bbb"]);
  });

  it("el orden de entrada no cambia el resultado", () => {
    const g1 = grading({ id: "g1", graded_at: "2026-05-01T10:00:00.000Z" });
    const g2 = grading({ id: "g2", supersedes_id: "g1", graded_at: "2026-05-02T10:00:00.000Z" });
    const g3 = grading({ id: "g3", supersedes_id: "g2", graded_at: "2026-05-03T10:00:00.000Z" });

    for (const rows of [
      [g1, g2, g3],
      [g3, g2, g1],
      [g2, g3, g1],
    ]) {
      expect(orderGradingChain(rows).map((e) => e.row.id)).toEqual(["g1", "g2", "g3"]);
    }
  });
});

describe("regradeCount", () => {
  it("cuenta 0 para una nota original sin tocar", () => {
    expect(regradeCount([grading({ id: "g1" })])).toBe(0);
  });

  it("cuenta 2 tras dos recalificaciones encadenadas", () => {
    expect(
      regradeCount([
        grading({ id: "g1" }),
        grading({ id: "g2", supersedes_id: "g1", graded_at: "2026-05-02T10:00:00.000Z" }),
        grading({ id: "g3", supersedes_id: "g2", graded_at: "2026-05-03T10:00:00.000Z" }),
      ]),
    ).toBe(2);
  });

  it("cuenta 0 sin ninguna nota", () => {
    expect(regradeCount([])).toBe(0);
  });
});

describe("totalEffectivePoints", () => {
  it("suma solo la nota vigente de cada item", () => {
    const map = new Map<string, readonly GradingRow[]>([
      [
        "item-1",
        [
          grading({ id: "a1", points_awarded: 0, max_points: 2 }),
          grading({
            id: "a2",
            supersedes_id: "a1",
            points_awarded: 2,
            max_points: 2,
            graded_at: "2026-05-02T10:00:00.000Z",
          }),
        ],
      ],
      ["item-2", [grading({ id: "b1", points_awarded: 1, max_points: 3 })]],
    ]);

    expect(totalEffectivePoints(map)).toEqual({ awarded: 3, max: 5, gradedItems: 2 });
  });

  it("devuelve null si ningún item tiene nota — cero no es lo mismo que sin calificar", () => {
    const map = new Map<string, readonly GradingRow[]>([
      ["item-1", []],
      ["item-2", []],
    ]);
    expect(totalEffectivePoints(map)).toBeNull();
  });

  it("un intento a medio corregir suma solo lo corregido", () => {
    const map = new Map<string, readonly GradingRow[]>([
      ["item-1", [grading({ id: "a", points_awarded: 1, max_points: 1 })]],
      ["item-2", []],
    ]);
    expect(totalEffectivePoints(map)).toEqual({ awarded: 1, max: 1, gradedItems: 1 });
  });
});
