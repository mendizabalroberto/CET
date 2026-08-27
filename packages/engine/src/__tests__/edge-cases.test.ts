/**
 * Casos limite de la libreria de fracciones y del formato.
 * Regla dura: parseAnswer NUNCA lanza. Devuelve null.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import {
  eqNum,
  fadd,
  fdiv,
  feq,
  fmul,
  frac,
  fstr,
  fsub,
  fval,
  gcd,
  isSimplest,
  mixStr,
  parseAnswer,
  parseAnswerReadings,
} from "../fraction.js";
import { nf, scaled, scaledDivInt, scaledShift, scaledValue } from "../format.js";
import { EngineError } from "../errors.js";

describe("parseAnswer nunca lanza", () => {
  const GARBAGE: unknown[] = [
    undefined,
    null,
    "",
    " ",
    "\t\n",
    "abc",
    "1/2/3",
    "--5",
    "1..5",
    ".",
    "/",
    "//",
    "1 2 3",
    "1/0",
    "0/0",
    "-0/0",
    "1e300",
    "Infinity",
    "-Infinity",
    "NaN",
    "0x10",
    "½",
    "1,2,3",
    "9".repeat(1000),
    "1".repeat(60) + "/2",
    {},
    [],
    123,
    Symbol("x").toString(),
    "<img src=x onerror=alert(1)>",
    "'; DROP TABLE attempt_items; --",
  ];

  for (const value of GARBAGE) {
    it(`no lanza con ${JSON.stringify(String(value)).slice(0, 40)}`, () => {
      expect(() => parseAnswer(value)).not.toThrow();
    });
  }

  it("devuelve null para todo lo que no es un numero valido", () => {
    for (const value of GARBAGE) {
      if (value === "½") continue; // NFKC lo convierte en 1/2: se comprueba aparte
      expect(parseAnswer(value)).toBeNull();
    }
  });

  it("NFKC convierte ½ en una fraccion legitima", () => {
    const parsed = parseAnswer("½");
    expect(parsed === null || feq(parsed, frac(1, 2))).toBe(true);
  });

  it("rechaza magnitudes fuera del entero seguro en vez de dar un resultado falso", () => {
    expect(parseAnswer("99999999999999999999/7")).toBeNull();
    expect(parseAnswer("1000000000000000000")).toBeNull();
  });

  it("trunca decimales absurdos en vez de perder precision en silencio", () => {
    const parsed = parseAnswer(`0.${"3".repeat(30)}`);
    expect(parsed).not.toBeNull();
    expect(fval(parsed ?? frac(0))).toBeCloseTo(1 / 3, 10);
  });

  it("acepta negativos", () => {
    expect(feq(parseAnswer("-3/4") ?? frac(0), frac(-3, 4))).toBe(true);
    expect(feq(parseAnswer("-1 1/2") ?? frac(0), frac(-3, 2))).toBe(true);
    expect(feq(parseAnswer("-1.5") ?? frac(0), frac(-3, 2))).toBe(true);
    expect(feq(parseAnswer("−1.5") ?? frac(0), frac(-3, 2))).toBe(true); // menos unicode
  });

  it("acepta el separador de miles que produce nf()", () => {
    expect(fval(parseAnswer("1,234") ?? frac(0))).toBe(1234);
    expect(fval(parseAnswer("1,234.5") ?? frac(0))).toBe(1234.5);
    expect(fval(parseAnswer("12,345,678") ?? frac(0))).toBe(12345678);
  });
});

describe("lecturas ambiguas de separadores", () => {
  const values = (input: string) => parseAnswerReadings(input).map(fval).sort((a, b) => a - b);

  it("devuelve las dos lecturas cuando la cadena es ambigua", () => {
    expect(values("1,234")).toEqual([1.234, 1234]);
    expect(values("41.000")).toEqual([41, 41000]);
  });

  it("no inventa lecturas cuando la cadena es inequivoca", () => {
    expect(values("1,234.5")).toEqual([1234.5]);
    expect(values("1.234,5")).toEqual([1234.5]);
    expect(values("1.75")).toEqual([1.75]);
    expect(values("1,75")).toEqual([1.75]);
    expect(values("3/4")).toEqual([0.75]);
  });

  it("devuelve vacio ante basura, nunca lanza", () => {
    expect(parseAnswerReadings("1,2,3")).toEqual([]);
    expect(parseAnswerReadings(null)).toEqual([]);
  });
});

describe("aritmetica de fracciones", () => {
  it("reduce siempre y pone el signo en el numerador", () => {
    expect(frac(2, 4)).toEqual({ n: 1, d: 2 });
    expect(frac(-2, 4)).toEqual({ n: -1, d: 2 });
    expect(frac(2, -4)).toEqual({ n: -1, d: 2 });
    expect(frac(0, 5)).toEqual({ n: 0, d: 1 });
  });

  it("denominador 0 lanza en voz alta: es un bug del generador, no del alumno", () => {
    expect(() => frac(1, 0)).toThrow(EngineError);
    expect(() => fdiv(frac(1, 2), frac(0, 5))).toThrow(EngineError);
  });

  it("las cuatro operaciones", () => {
    expect(fadd(frac(1, 2), frac(1, 3))).toEqual({ n: 5, d: 6 });
    expect(fsub(frac(1, 2), frac(1, 3))).toEqual({ n: 1, d: 6 });
    expect(fmul(frac(2, 3), frac(3, 4))).toEqual({ n: 1, d: 2 });
    expect(fdiv(frac(1, 2), frac(3, 4))).toEqual({ n: 2, d: 3 });
  });

  it("gcd es estable con 0 y negativos", () => {
    expect(gcd(0, 0)).toBe(1);
    expect(gcd(0, 5)).toBe(5);
    expect(gcd(-8, 12)).toBe(4);
  });

  it("mixStr y fstr", () => {
    expect(mixStr(frac(7, 4))).toBe("1 3/4");
    expect(mixStr(frac(8, 4))).toBe("2");
    expect(mixStr(frac(3, 4))).toBe("3/4");
    expect(mixStr(frac(-7, 4))).toBe("-1 3/4");
    expect(fstr(frac(6, 3))).toBe("2");
  });

  it("isSimplest juzga la forma escrita, no el valor", () => {
    expect(isSimplest("3/4")).toBe(true);
    expect(isSimplest("6/8")).toBe(false);
    expect(isSimplest("1 6/8")).toBe(false);
    expect(isSimplest("1 3/4")).toBe(true);
    expect(isSimplest("0.75")).toBe(true);
    expect(isSimplest("basura")).toBe(true);
    expect(isSimplest(undefined)).toBe(true);
  });

  it("eqNum absorbe la fuzz binaria pero no un error real", () => {
    expect(eqNum(0.1 + 0.2, 0.3)).toBe(true);
    expect(eqNum(0.3, 0.31)).toBe(false);
  });
});

describe("formato numerico", () => {
  it("separador de miles y sin ceros de cola", () => {
    expect(nf(1234)).toBe("1,234");
    expect(nf(1234567.5)).toBe("1,234,567.5");
    expect(nf(100)).toBe("100");
    expect(nf(1.5)).toBe("1.5");
    expect(nf(0.1 + 0.2)).toBe("0.3");
    expect(nf(-1234.25)).toBe("-1,234.25");
    expect(nf(0)).toBe("0");
  });

  it("nunca devuelve notacion cientifica: el alumno no puede teclearla", () => {
    expect(nf(1e21)).not.toContain("e");
    expect(nf(1e21)).toBe("1,000,000,000,000,000,000,000");
    expect(nf(0.0000001)).not.toContain("e");
  });

  it("respeta la convencion del idioma (AD-7)", () => {
    expect(nf(1234567.5, "es")).toBe("1.234.567,5");
    expect(nf(97.8, "es")).toBe("97,8");
    expect(nf(97.8, "en")).toBe("97.8");
    expect(nf(1000, "es")).toBe("1.000");
  });

  it("un valor no finito lanza en vez de imprimir NaN en un examen", () => {
    expect(() => nf(Number.NaN)).toThrow(EngineError);
    expect(() => nf(Number.POSITIVE_INFINITY)).toThrow(EngineError);
  });
});

describe("decimales escalados", () => {
  it("mover la coma es exacto", () => {
    expect(scaledValue(scaledShift(scaled(75, 2), 3))).toBe(750);
    expect(scaledValue(scaledShift(scaled(1234, 0), -3))).toBe(1.234);
    expect(scaledValue(scaled(456, 1))).toBe(45.6);
  });

  it("0.1 + 0.2 no aparece por ningun lado", () => {
    expect(scaledValue(scaledShift(scaled(3, 1), 0))).toBe(0.3);
  });

  it("una division inexacta lanza: no puede llegar a un enunciado", () => {
    expect(() => scaledDivInt(scaled(100, 0), 3)).toThrow(EngineError);
    expect(scaledValue(scaledDivInt(scaled(45600, 0), 8))).toBe(5700);
  });

  it("rechaza escalas fuera de rango", () => {
    expect(() => scaled(1.5, 2)).toThrow(EngineError);
    expect(() => scaled(1, -1)).toThrow(EngineError);
  });
});
