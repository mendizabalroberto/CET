/**
 * El PRNG. Si esto no es determinista, nada lo es.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { createRng } from "../rng.js";
import { EngineError } from "../errors.js";

describe("createRng", () => {
  it("la misma semilla da la misma secuencia", () => {
    const a = createRng(123456789);
    const b = createRng(123456789);
    for (let i = 0; i < 1000; i += 1) {
      expect(b.nextUint32()).toBe(a.nextUint32());
    }
  });

  it("semillas distintas dan secuencias distintas", () => {
    const a = createRng(1);
    const b = createRng(2);
    const sameCount = Array.from({ length: 100 }, () => (a.nextUint32() === b.nextUint32() ? 1 : 0)).reduce<number>(
      (x, y) => x + y,
      0,
    );
    expect(sameCount).toBeLessThan(3);
  });

  it("la semilla 0 no es un punto fijo", () => {
    const rng = createRng(0);
    const values = new Set(Array.from({ length: 50 }, () => rng.nextUint32()));
    expect(values.size).toBeGreaterThan(40);
  });

  it("nextFloat vive en [0,1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i += 1) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int cubre todo el rango, extremos incluidos", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i += 1) seen.add(rng.int(1, 6));
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("int(n, n) devuelve n sin consumir sesgo", () => {
    const rng = createRng(5);
    expect(rng.int(4, 4)).toBe(4);
  });

  it("int reparte de forma razonablemente uniforme", () => {
    const rng = createRng(2026);
    const counts = new Array<number>(10).fill(0);
    const draws = 100000;
    for (let i = 0; i < draws; i += 1) {
      const index = rng.int(0, 9);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(draws / 10 - draws / 50);
      expect(count).toBeLessThan(draws / 10 + draws / 50);
    }
  });

  it("rechaza rangos y semillas invalidos", () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 1)).toThrow(EngineError);
    expect(() => rng.int(1.5, 3)).toThrow(EngineError);
    expect(() => rng.pick([])).toThrow(EngineError);
    expect(() => createRng(-1)).toThrow(EngineError);
    expect(() => createRng(1.5)).toThrow(EngineError);
    expect(() => createRng(Number.MAX_SAFE_INTEGER + 2)).toThrow(EngineError);
  });

  it("shuffle no muta la entrada y es una permutacion", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = createRng(31337);
    const shuffled = rng.shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });

  it("shuffle con la misma semilla da el mismo orden", () => {
    const source = ["a", "b", "c", "d", "e"];
    expect(createRng(42).shuffle(source)).toEqual(createRng(42).shuffle(source));
    expect(createRng(42).shuffle(source)).not.toEqual(createRng(43).shuffle(source));
  });

  it("permutation cubre todos los indices", () => {
    const permutation = createRng(8).permutation(6);
    expect([...permutation].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(createRng(8).permutation(0)).toEqual([]);
  });

  it("sample devuelve elementos distintos y falla si pide de mas", () => {
    const rng = createRng(11);
    const picked = rng.sample([1, 2, 3, 4, 5], 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(() => rng.sample([1, 2], 3)).toThrow(EngineError);
  });

  it("weighted respeta los pesos", () => {
    const rng = createRng(4242);
    let heavy = 0;
    for (let i = 0; i < 10000; i += 1) {
      const value = rng.weighted([
        { value: "heavy", weight: 9 },
        { value: "light", weight: 1 },
      ]);
      if (value === "heavy") heavy += 1;
    }
    expect(heavy).toBeGreaterThan(8500);
    expect(heavy).toBeLessThan(9500);
  });

  it("chance con 0 y 1 no consume azar", () => {
    const rng = createRng(1);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  });
});
