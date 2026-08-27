/**
 * Un generador que siempre devuelve lo mismo es determinista y esta roto.
 * Este test es el contrapeso del guardian del determinismo.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { registry } from "../generators/index.js";
import { seedList } from "./helpers.js";

const SEEDS = seedList(200, 777);
/** Minimo de enunciados distintos sobre 200 semillas. El generador mas pobre
 *  (math.simplify: 15 bases × 8 factores = 120 combinaciones) da ~90 distintos. */
const MIN_DISTINCT_STEMS = 50;

describe("variedad de los generadores", () => {
  for (const generator of registry.all()) {
    it(`${generator.key}: 200 semillas producen al menos ${MIN_DISTINCT_STEMS} enunciados distintos`, () => {
      // math.shape lleva los numeros en la figura, no en el texto: la variedad
      // hay que medirla sobre lo que el alumno ve ENTERO.
      const stems = new Set(
        SEEDS.map((seed) => {
          const body = generator.generate({}, seed).body;
          return `${body.stem}${body.figureSvg ?? ""}`;
        }),
      );
      expect(stems.size).toBeGreaterThanOrEqual(MIN_DISTINCT_STEMS);
    });

    it(`${generator.key}: las respuestas tambien varian`, () => {
      const answers = new Set(
        SEEDS.map((seed) => JSON.stringify(generator.generate({}, seed).answerKey)),
      );
      // math.compare solo tiene tres respuestas posibles (>, <, =): se le exige
      // que las produzca todas, no que produzca muchas.
      // math.simplify solo tiene 15 fracciones objetivo: su variedad esta en el
      // enunciado (que factor hay que descubrir), no en la respuesta.
      const minimum = generator.key === "math.compare" ? 3 : 10;
      expect(answers.size).toBeGreaterThanOrEqual(minimum);
    });
  }

  it("math.compare llega de verdad al caso de igualdad (en Y6A era inalcanzable)", () => {
    const symbols = new Set(
      SEEDS.map((seed) => {
        const key = registry.generate("math.compare", {}, seed).answerKey;
        return key.type === "text" ? key.canonical : "?";
      }),
    );
    expect([...symbols]).toContain("=");
    expect([...symbols]).toContain(">");
    expect([...symbols]).toContain("<");
  });

  it("math.fracop cubre las cuatro operaciones", () => {
    const glyphs = new Set(
      SEEDS.map((seed) => {
        const stem = registry.generate("math.fracop", {}, seed).body.stem;
        return ["+", "−", "×", "÷"].find((glyph) => stem.includes(glyph)) ?? "?";
      }),
    );
    expect([...glyphs].sort()).toEqual(["+", "×", "÷", "−"].sort());
  });

  it("math.word cubre las seis plantillas", () => {
    const stems = new Set<string>();
    for (let template = 1; template <= 6; template += 1) {
      const item = registry.generate("math.word", { template, locale: "en" }, SEEDS[0] ?? 1);
      stems.add(item.body.stem);
    }
    expect(stems.size).toBe(6);
  });

  it("math.mixed produce las dos direcciones", () => {
    const directions = new Set(
      SEEDS.map((seed) => {
        const stem = registry.generate("math.mixed", { locale: "en" }, seed).body.stem;
        return stem.includes("improper fraction") ? "to_improper" : "to_mixed";
      }),
    );
    expect(directions.size).toBe(2);
  });
});
