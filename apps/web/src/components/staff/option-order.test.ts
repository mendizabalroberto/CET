/**
 * `option_order` → texto legible. El test que impide invertir el índice.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Las permutaciones de prueba son DELIBERADAMENTE no triviales: `[1,0]` pasa
 * igual leída al derecho que al revés (es su propia inversa), así que no prueba
 * nada sobre la dirección. `[2,0,1]` sí: su inversa es `[1,2,0]`, distinta.
 */
import { describe, expect, it } from "vitest";

import {
  invertPermutation,
  isPermutationOf,
  positionLabel,
  presentOptions,
  selectedIdsFromResponse,
  type RenderedOption,
} from "./option-order";

/**
 * Banco canónico. `rendered_body.options` NUNCA es esto: es esto reordenado.
 */
const BANK: readonly RenderedOption[] = [
  { id: "a", html: "1/2" },
  { id: "b", html: "2/3" },
  { id: "c", html: "3/4" },
];

/**
 * Aplica una permutación igual que `applyOptionShuffle` de @cet/engine:
 * `mostradas[posición] = banco[order[posición]]`. Si esta línea y la de
 * `blueprint.ts` divergen, todo el test miente, así que se copia literalmente.
 */
function shown(order: readonly number[]): RenderedOption[] {
  return order.map((bankIndex) => {
    const option = BANK[bankIndex];
    if (option === undefined) throw new Error("permutación fuera de rango en el propio test");
    return option;
  });
}

describe("positionLabel", () => {
  it("etiqueta A, B, C desde el índice 0", () => {
    expect(positionLabel(0)).toBe("A");
    expect(positionLabel(1)).toBe("B");
    expect(positionLabel(25)).toBe("Z");
  });

  it("se desborda a dos letras en vez de repetir la A", () => {
    expect(positionLabel(26)).toBe("AA");
    expect(positionLabel(27)).toBe("AB");
    expect(positionLabel(51)).toBe("AZ");
    expect(positionLabel(52)).toBe("BA");
  });

  it("no inventa etiqueta para un índice imposible", () => {
    expect(positionLabel(-1)).toBe("?");
    expect(positionLabel(1.5)).toBe("?");
  });
});

describe("isPermutationOf", () => {
  it("acepta una permutación válida de la longitud correcta", () => {
    expect(isPermutationOf([2, 0, 1], 3)).toBe(true);
    expect(isPermutationOf([0], 1)).toBe(true);
  });

  it("rechaza longitud distinta, repetidos, huecos y fuera de rango", () => {
    expect(isPermutationOf([0, 1], 3)).toBe(false);
    expect(isPermutationOf([0, 0, 1], 3)).toBe(false);
    expect(isPermutationOf([0, 1, 3], 3)).toBe(false);
    expect(isPermutationOf([-1, 0, 1], 3)).toBe(false);
    expect(isPermutationOf(null, 3)).toBe(false);
    expect(isPermutationOf(undefined, 3)).toBe(false);
  });
});

describe("invertPermutation", () => {
  it("invierte una permutación no simétrica", () => {
    // order[posición] = índiceBanco  →  inversa[índiceBanco] = posición
    // [2,0,1]: pos0←banco2, pos1←banco0, pos2←banco1
    //          banco0→pos1, banco1→pos2, banco2→pos0
    expect(invertPermutation([2, 0, 1])).toEqual([1, 2, 0]);
  });

  it("aplicada dos veces devuelve la original", () => {
    for (const order of [
      [0, 1, 2, 3],
      [3, 1, 0, 2],
      [1, 3, 2, 0],
      [2, 0, 1],
    ]) {
      expect(invertPermutation(invertPermutation(order))).toEqual(order);
    }
  });

  it("la identidad es su propia inversa", () => {
    expect(invertPermutation([0, 1, 2])).toEqual([0, 1, 2]);
  });
});

describe("presentOptions — la dirección de option_order", () => {
  it("mapea cada posición vista al índice CANÓNICO, no al revés", () => {
    const order = [2, 0, 1];
    const result = presentOptions(shown(order), order);

    expect(result.integrity).toBe("ok");
    // El alumno vio primero "3/4", que en el banco es la tercera (índice 2).
    expect(result.options.map((o) => o.html)).toEqual(["3/4", "1/2", "2/3"]);
    expect(result.options.map((o) => o.bankIndex)).toEqual([2, 0, 1]);
    expect(result.options.map((o) => o.displayLabel)).toEqual(["A", "B", "C"]);
    expect(result.options.map((o) => o.bankLabel)).toEqual(["C", "A", "B"]);
  });

  it("si se invirtiera el índice, el resultado sería OTRO — este test lo detecta", () => {
    const order = [2, 0, 1];
    const inverted = invertPermutation(order); // [1, 2, 0]
    const correct = presentOptions(shown(order), order);
    const wrong = presentOptions(shown(order), inverted);

    expect(correct.options.map((o) => o.bankIndex)).not.toEqual(
      wrong.options.map((o) => o.bankIndex),
    );
  });

  it('responde "eligió la 2.ª de las que vio, que era 1/2"', () => {
    const order = [2, 0, 1]; // vistas: 3/4, 1/2, 2/3
    const result = presentOptions(shown(order), order, ["a"]); // "a" = 1/2

    expect(result.chosen).toHaveLength(1);
    const chosen = result.chosen[0];
    expect(chosen?.displayPosition).toBe(2);
    expect(chosen?.displayLabel).toBe("B");
    expect(chosen?.html).toBe("1/2");
    // Y en el banco esa misma opción es la primera.
    expect(chosen?.bankIndex).toBe(0);
  });

  it("con una permutación de 4 elementos, cada posición apunta a su opción", () => {
    const four: readonly RenderedOption[] = [
      { id: "w", html: "10" },
      { id: "x", html: "20" },
      { id: "y", html: "30" },
      { id: "z", html: "40" },
    ];
    const order = [3, 1, 0, 2];
    const displayed = order.map((i) => {
      const o = four[i];
      if (o === undefined) throw new Error("índice fuera de rango");
      return o;
    });

    const result = presentOptions(displayed, order, ["y"]); // "y" = 30, banco índice 2
    expect(displayed.map((o) => o.html)).toEqual(["40", "20", "10", "30"]);

    const chosen = result.chosen[0];
    expect(chosen?.displayPosition).toBe(4); // la vio la última
    expect(chosen?.bankIndex).toBe(2); // pero en el banco es la tercera
  });

  it("varias opciones elegidas salen en el orden en que se vieron", () => {
    const order = [2, 0, 1];
    const result = presentOptions(shown(order), order, ["b", "c"]); // 2/3 y 3/4
    expect(result.chosen.map((o) => o.displayPosition)).toEqual([1, 3]);
    expect(result.chosen.map((o) => o.html)).toEqual(["3/4", "2/3"]);
  });

  it("sin selección, no hay ninguna elegida y nada queda sin emparejar", () => {
    const result = presentOptions(shown([1, 2, 0]), [1, 2, 0], []);
    expect(result.chosen).toHaveLength(0);
    expect(result.unmatchedSelectedIds).toHaveLength(0);
  });

  it("marca `missing` cuando hay opciones pero no se guardó permutación", () => {
    const result = presentOptions(BANK, null);
    expect(result.integrity).toBe("missing");
    expect(result.options.every((o) => o.bankIndex === null)).toBe(true);
    // Las posiciones vistas siguen siendo válidas: el rendered_body es literal.
    expect(result.options.map((o) => o.displayPosition)).toEqual([1, 2, 3]);
  });

  it("marca `invalid` cuando la permutación no encaja con las opciones", () => {
    expect(presentOptions(BANK, [0, 1]).integrity).toBe("invalid");
    expect(presentOptions(BANK, [0, 0, 1]).integrity).toBe("invalid");
    expect(presentOptions(BANK, [0, 1, 5]).integrity).toBe("invalid");
  });

  it("marca `not-applicable` en una pregunta sin opciones", () => {
    expect(presentOptions(undefined, null).integrity).toBe("not-applicable");
    expect(presentOptions([], null).integrity).toBe("not-applicable");
  });

  it("delata un id guardado que no corresponde a ninguna opción mostrada", () => {
    const result = presentOptions(shown([0, 1, 2]), [0, 1, 2], ["a", "zz"]);
    expect(result.chosen.map((o) => o.id)).toEqual(["a"]);
    expect(result.unmatchedSelectedIds).toEqual(["zz"]);
  });
});

describe("selectedIdsFromResponse", () => {
  it("extrae los ids de una respuesta de tipo choice", () => {
    expect(selectedIdsFromResponse({ type: "choice", selectedIds: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("una respuesta choice sin selección es una lista vacía, no null", () => {
    expect(selectedIdsFromResponse({ type: "choice", selectedIds: [] })).toEqual([]);
  });

  it("devuelve null si la respuesta no es de opciones", () => {
    expect(selectedIdsFromResponse({ type: "text", value: "3/4" })).toBeNull();
    expect(selectedIdsFromResponse({ type: "empty" })).toBeNull();
    expect(selectedIdsFromResponse(null)).toBeNull();
    expect(selectedIdsFromResponse("choice")).toBeNull();
  });

  it("ignora entradas que no son cadenas en lugar de romperse", () => {
    expect(selectedIdsFromResponse({ type: "choice", selectedIds: ["a", 7, null] })).toEqual(["a"]);
  });
});
