/**
 * El caso critico del proyecto: 7/4, 1 3/4, 1.75 y 1,75 son LA MISMA respuesta.
 * Y, igual de importante, la tabla de lo que NO debe aceptarse.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import type { AnswerKey } from "@cet/shared";
import { grade } from "../grading/index.js";

const SEVEN_QUARTERS: AnswerKey = {
  type: "fraction",
  numerator: 7,
  denominator: 4,
  requireSimplest: false,
  canonical: "1 3/4",
};

const THREE_QUARTERS_STRICT: AnswerKey = {
  type: "fraction",
  numerator: 3,
  denominator: 4,
  requireSimplest: true,
  canonical: "3/4",
};

const NUMERIC_1_75: AnswerKey = {
  type: "numeric",
  value: 1.75,
  tolerance: 0,
  canonical: "1.75",
};

function isRight(key: AnswerKey, value: string): boolean {
  return grade({ type: "text", value }, key, 1).isCorrect;
}

describe("7/4 = 1 3/4 = 1.75 = 1,75", () => {
  const ACCEPTED = [
    "7/4",
    "7 / 4",
    " 7/4 ",
    "1 3/4",
    "1  3/4",
    "1 3 / 4",
    "1.75",
    "1,75",
    "1.750",
    "1.7500000",
    "14/8",
    "175/100",
    "1 3/4",
    "7⁄4",
  ];

  for (const value of ACCEPTED) {
    it(`acepta "${value}" contra la clave 7/4`, () => {
      expect(isRight(SEVEN_QUARTERS, value)).toBe(true);
    });
    it(`acepta "${value}" contra la clave numerica 1.75`, () => {
      expect(isRight(NUMERIC_1_75, value)).toBe(true);
    });
  }

  const REJECTED = [
    "",
    "   ",
    "4/7",
    "1.7",
    "1.751",
    "7/5",
    "1 4/4",
    "uno y tres cuartos",
    "1,75,0",
    "7//4",
    "7/0",
    "0/0",
    "7/",
    "/4",
    "NaN",
    "Infinity",
    "1e0",
    "<script>alert(1)</script>",
    "1.75; DROP TABLE attempts",
    "9".repeat(400),
  ];

  for (const value of REJECTED) {
    it(`rechaza ${JSON.stringify(value)} contra la clave 7/4`, () => {
      expect(isRight(SEVEN_QUARTERS, value)).toBe(false);
    });
  }

  it("el signo + no se interpreta como numero (la entrada tiene que ser inequivoca)", () => {
    expect(isRight(NUMERIC_1_75, "+1.75")).toBe(false);
  });
});

describe("requireSimplest", () => {
  it("acepta la fraccion irreducible", () => {
    expect(isRight(THREE_QUARTERS_STRICT, "3/4")).toBe(true);
  });

  it("rechaza 6/8 aunque valga lo mismo", () => {
    const result = grade({ type: "text", value: "6/8" }, THREE_QUARTERS_STRICT, 1);
    expect(result.isCorrect).toBe(false);
    expect(result.pointsAwarded).toBe(0);
    expect(result.rationale ?? "").toContain("simplificada");
  });

  it("rechaza tambien la parte fraccionaria sin simplificar de un mixto", () => {
    const key: AnswerKey = {
      type: "fraction",
      numerator: 7,
      denominator: 4,
      requireSimplest: true,
      canonical: "1 3/4",
    };
    expect(isRight(key, "1 3/4")).toBe(true);
    expect(isRight(key, "1 6/8")).toBe(false);
  });

  it("no penaliza el decimal equivalente: no hay nada que simplificar en 0.75", () => {
    expect(isRight(THREE_QUARTERS_STRICT, "0.75")).toBe(true);
  });
});

describe("unidades escritas por el alumno", () => {
  const key: AnswerKey = { type: "numeric", value: 120, tolerance: 0, canonical: "120 cm" };

  it("acepta el numero con la unidad pegada o separada", () => {
    expect(isRight(key, "120")).toBe(true);
    expect(isRight(key, "120 cm")).toBe(true);
    expect(isRight(key, "120cm")).toBe(true);
    expect(isRight(key, "1,20 m".replace(",", "."))).toBe(false); // 1.20 no es 120
  });

  it("no acepta un numero equivocado por llevar la unidad correcta", () => {
    expect(isRight(key, "12 cm")).toBe(false);
  });
});

describe("separadores en los dos idiomas (AD-7)", () => {
  const key41000: AnswerKey = { type: "numeric", value: 41000, tolerance: 0, canonical: "41.000 m" };
  const key41: AnswerKey = { type: "numeric", value: 41, tolerance: 0, canonical: "41" };
  const key1234_5: AnswerKey = { type: "numeric", value: 1234.5, tolerance: 0, canonical: "1,234.5" };

  it("el alumno espanol teclea la clave tal cual la ve y acierta", () => {
    expect(isRight(key41000, "41.000")).toBe(true);
    expect(isRight(key41000, "41000")).toBe(true);
    expect(isRight(key41000, "41,000")).toBe(true); // formato ingles
  });

  it("la lectura decimal de la misma cadena tambien vale cuando es la correcta", () => {
    expect(isRight(key41, "41.000")).toBe(true);
    expect(isRight(key41, "41,000")).toBe(true);
  });

  it("una cadena ambigua no acierta una clave que no es ninguna de sus lecturas", () => {
    expect(isRight(key41000, "410")).toBe(false);
    expect(isRight(key41, "410")).toBe(false);
  });

  it("los formatos completos no son ambiguos", () => {
    expect(isRight(key1234_5, "1,234.5")).toBe(true);
    expect(isRight(key1234_5, "1.234,5")).toBe(true);
    expect(isRight(key1234_5, "1234.5")).toBe(true);
    expect(isRight(key1234_5, "1234,5")).toBe(true);
  });
});

describe("tolerancia", () => {
  const key: AnswerKey = { type: "numeric", value: 3.14159, tolerance: 0.01, canonical: "3.14" };

  it("acepta dentro de la tolerancia", () => {
    expect(isRight(key, "3.14")).toBe(true);
    expect(isRight(key, "3.15")).toBe(true);
  });

  it("rechaza fuera de la tolerancia", () => {
    expect(isRight(key, "3.2")).toBe(false);
  });
});
