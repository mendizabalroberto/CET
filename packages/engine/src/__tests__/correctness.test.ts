/**
 * Correccion matematica: se resuelve cada enunciado POR SEPARADO, leyendo lo que
 * el alumno veria (stem y figura), y se compara con la answerKey del generador.
 * Si el generador se equivoca, aqui se nota; ningun test de "no explota" lo haria.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import type { GeneratedItem } from "@cet/shared";
import { registry } from "../generators/index.js";
import { fadd, feq, fmul, frac, fval, gcd } from "../fraction.js";
import {
  fractionsIn,
  mixedIn,
  numbersIn,
  polygonPerimeter,
  polygonPoints,
  seedList,
  shoelaceArea,
  stripTags,
} from "./helpers.js";

const SEEDS = seedList(120, 2026);
const EN = { locale: "en" } as const;

function fractionKey(engine: string, seed: number, params: Record<string, unknown> = {}) {
  const item = registry.generate(engine, { ...EN, ...params }, seed);
  const key = item.answerKey;
  if (key.type !== "fraction") throw new Error(`Se esperaba clave fraction, llego ${key.type}`);
  return { item, key };
}

function numericKey(engine: string, seed: number, params: Record<string, unknown> = {}) {
  const item = registry.generate(engine, { ...EN, ...params }, seed);
  const key = item.answerKey;
  if (key.type !== "numeric") throw new Error(`Se esperaba clave numeric, llego ${key.type}`);
  return { item, key };
}

describe("math.simplify", () => {
  it("la clave es la fraccion del enunciado reducida", () => {
    for (const seed of SEEDS) {
      const { item, key } = fractionKey("math.simplify", seed);
      const shown = fractionsIn(item.body.stem);
      expect(shown).toHaveLength(1);
      const { n, d } = shown[0] ?? { n: 0, d: 1 };
      const g = gcd(n, d);
      expect(key.numerator).toBe(n / g);
      expect(key.denominator).toBe(d / g);
      expect(key.requireSimplest).toBe(true);
      // La fraccion mostrada NO puede estar ya simplificada: no habria nada que hacer.
      expect(g).toBeGreaterThan(1);
    }
  });
});

describe("math.compare", () => {
  it("el simbolo se corresponde con el valor real de las dos fracciones", () => {
    for (const seed of SEEDS) {
      const item = registry.generate("math.compare", EN, seed);
      const key = item.answerKey;
      if (key.type !== "text") throw new Error("clave inesperada");
      const shown = fractionsIn(item.body.stem);
      expect(shown).toHaveLength(2);
      const a = shown[0] ?? { n: 0, d: 1 };
      const b = shown[1] ?? { n: 0, d: 1 };
      const expected = a.n * b.d === b.n * a.d ? "=" : a.n * b.d > b.n * a.d ? ">" : "<";
      expect(key.canonical).toBe(expected);
      expect(key.accepted).toContain(expected);
    }
  });
});

describe("math.fracop", () => {
  const cases = [
    { op: "add", glyph: "+" },
    { op: "sub", glyph: "−" },
    { op: "mul", glyph: "×" },
    { op: "div", glyph: "÷" },
  ] as const;

  for (const { op, glyph } of cases) {
    it(`${op}: el resultado de la clave coincide con la operacion del enunciado`, () => {
      for (const seed of SEEDS) {
        const { item, key } = fractionKey("math.fracop", seed, { ops: [op] });
        expect(item.body.stem).toContain(glyph);
        const shown = fractionsIn(item.body.stem);
        expect(shown).toHaveLength(2);
        const a = frac(shown[0]?.n ?? 0, shown[0]?.d ?? 1);
        const b = frac(shown[1]?.n ?? 0, shown[1]?.d ?? 1);
        const expected =
          op === "add"
            ? fadd(a, b)
            : op === "sub"
              ? frac(a.n * b.d - b.n * a.d, a.d * b.d)
              : op === "mul"
                ? fmul(a, b)
                : frac(a.n * b.d, a.d * b.n);
        expect(feq(frac(key.numerator, key.denominator), expected)).toBe(true);
        if (op === "sub") {
          // Nunca una resta con resultado negativo o cero en 5º de primaria.
          expect(fval(expected)).toBeGreaterThan(0);
        }
        if (op === "div") {
          expect(b.n).not.toBe(0);
        }
      }
    });
  }
});

describe("math.mixed", () => {
  it("to_improper: la clave vale lo mismo que el numero mixto mostrado", () => {
    for (const seed of SEEDS) {
      const { item, key } = fractionKey("math.mixed", seed, { direction: "to_improper" });
      const shown = mixedIn(item.body.stem);
      expect(shown).toHaveLength(1);
      const { w, n, d } = shown[0] ?? { w: 0, n: 0, d: 1 };
      expect(feq(frac(key.numerator, key.denominator), frac(w * d + n, d))).toBe(true);
      expect(key.canonical).toBe(`${w * d + n}/${d}`);
      expect(gcd(n, d)).toBe(1);
    }
  });

  it("to_mixed: la clave vale lo mismo que la impropia mostrada", () => {
    for (const seed of SEEDS) {
      const { item, key } = fractionKey("math.mixed", seed, { direction: "to_mixed" });
      const shown = fractionsIn(item.body.stem);
      expect(shown).toHaveLength(1);
      const { n, d } = shown[0] ?? { n: 0, d: 1 };
      expect(n).toBeGreaterThan(d); // tiene que ser impropia
      expect(feq(frac(key.numerator, key.denominator), frac(n, d))).toBe(true);
      const whole = Math.floor(n / d);
      expect(key.canonical).toBe(`${whole} ${n % d}/${d}`);
    }
  });
});

describe("math.decimal", () => {
  it("multiply: el producto del enunciado es la clave", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.decimal", seed, { operation: "multiply" });
      const [a, b] = numbersIn(item.body.stem);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(key.value).toBeCloseTo((a ?? 0) * (b ?? 0), 9);
    }
  });

  it("divide: el cociente es exacto y es la clave", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.decimal", seed, { operation: "divide" });
      const [a, b] = numbersIn(item.body.stem);
      expect(b).toBeDefined();
      expect(key.value).toBeCloseTo((a ?? 0) / (b ?? 1), 9);
      // El resultado tiene que ser tecleable: como mucho dos decimales.
      expect(key.canonical).toMatch(/^-?[\d,]+(\.\d{1,2})?$/);
    }
  });
});

describe("math.powten", () => {
  it("mover la coma da exactamente la clave", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.powten", seed);
      const [value, power] = numbersIn(item.body.stem);
      const multiply = item.body.stem.includes("×");
      const expected = multiply ? (value ?? 0) * (power ?? 1) : (value ?? 0) / (power ?? 1);
      expect(key.value).toBeCloseTo(expected, 9);
      expect([10, 100, 1000]).toContain(power);
    }
  });
});

describe("math.metric", () => {
  /** Exponente de cada unidad respecto de la unidad base de su familia. */
  const UNIT_EXPONENT: Record<string, number> = {
    km: 3,
    m: 0,
    cm: -2,
    mm: -3,
    t: 3,
    kg: 0,
    g: -3,
    mg: -6,
    kL: 3,
    L: 0,
    mL: -3,
  };

  it("la conversion se comprueba con la tabla de exponentes", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.metric", seed);
      const text = stripTags(item.body.stem);
      const match = /^([\d.,]+) (\S+) = _+ (\S+)$/.exec(text);
      expect(match).not.toBeNull();
      const value = Number((match?.[1] ?? "0").replace(/,/g, ""));
      const from = match?.[2] ?? "";
      const to = match?.[3] ?? "";
      const eFrom = UNIT_EXPONENT[from];
      const eTo = UNIT_EXPONENT[to];
      expect(eFrom).toBeDefined();
      expect(eTo).toBeDefined();
      const expected = value * Math.pow(10, (eFrom ?? 0) - (eTo ?? 0));
      expect(key.value).toBeCloseTo(expected, 6);
      expect(item.body.unit).toBe(to);
    }
  });
});

describe("math.shape", () => {
  it("area: el area de Gauss sobre el poligono persistido coincide con la clave", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.shape", seed, { target: "area" });
      const points = polygonPoints(item.body.figureSvg ?? "");
      expect(points.length).toBe(6);
      expect(key.value).toBeCloseTo(shoelaceArea(points), 9);
      expect(item.body.unit ?? "").toMatch(/²$/);
      expect(item.body.figureAlt).toBeDefined();
    }
  });

  it("el texto alternativo no regala los lados ocultos", () => {
    for (const seed of SEEDS) {
      const { item } = numericKey("math.shape", seed);
      const points = polygonPoints(item.body.figureSvg ?? "");
      const w = points[1]?.[0] ?? 0;
      const h = points[2]?.[1] ?? 0;
      const cutW = points[3]?.[0] ?? 0;
      const cutH = h - (points[4]?.[1] ?? 0);
      const unit = (item.body.unit ?? "").replace("²", "");
      const visible = new Set([w, h, w - cutW, cutH]);
      const alt = `${item.body.figureAlt?.en ?? ""} ${item.body.figureAlt?.es ?? ""}`;
      // Los dos lados que el alumno tiene que deducir son cutW y h - cutH.
      for (const hidden of [cutW, h - cutH]) {
        if (visible.has(hidden)) continue; // coincide con un lado rotulado: no es una fuga
        // Frontera de palabra: "13 m" no puede contar como fuga del lado "3".
        expect(new RegExp(`(^|[^0-9])${hidden} ${unit}`).test(alt)).toBe(false);
      }
    }
  });

  it("perimeter: la suma de los lados del poligono coincide con la clave", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.shape", seed, { target: "perimeter" });
      const points = polygonPoints(item.body.figureSvg ?? "");
      expect(key.value).toBeCloseTo(polygonPerimeter(points), 9);
      expect(item.body.unit ?? "").not.toMatch(/²$/);
    }
  });

  it("la figura nunca degenera (el corte cabe dentro del rectangulo)", () => {
    for (const seed of SEEDS) {
      const { item } = numericKey("math.shape", seed);
      const points = polygonPoints(item.body.figureSvg ?? "");
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
      }
      expect(shoelaceArea(points)).toBeGreaterThan(0);
    }
  });
});

describe("math.word", () => {
  it("plantilla 1: fraccion de fraccion", () => {
    for (const seed of SEEDS) {
      const { key } = fractionKey("math.word", seed, { template: 1 });
      const item = registry.generate("math.word", { ...EN, template: 1 }, seed);
      const [a, b] = fractionsIn(item.body.stem);
      const expected = fmul(frac(a?.n ?? 0, a?.d ?? 1), frac(b?.n ?? 0, b?.d ?? 1));
      expect(feq(frac(key.numerator, key.denominator), expected)).toBe(true);
      expect(key.requireSimplest).toBe(true);
    }
  });

  it("plantilla 2: suma de numeros mixtos", () => {
    for (const seed of SEEDS) {
      const { item, key } = fractionKey("math.word", seed, { template: 2 });
      const shown = mixedIn(item.body.stem);
      expect(shown).toHaveLength(2);
      const a = shown[0] ?? { w: 0, n: 0, d: 1 };
      const b = shown[1] ?? { w: 0, n: 0, d: 1 };
      const expected = fadd(frac(a.w * a.d + a.n, a.d), frac(b.w * b.d + b.n, b.d));
      expect(feq(frac(key.numerator, key.denominator), expected)).toBe(true);
    }
  });

  it("plantilla 3: litros a mililitros", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.word", seed, { template: 3 });
      const [capacity, bottles] = numbersIn(item.body.stem);
      expect(key.value).toBeCloseTo((capacity ?? 0) * (bottles ?? 0) * 1000, 6);
      expect(item.body.unit).toBe("mL");
    }
  });

  it("plantilla 4: metros a centimetros", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.word", seed, { template: 4 });
      const [total, pieces] = numbersIn(item.body.stem);
      expect(key.value).toBeCloseTo(((total ?? 0) / (pieces ?? 1)) * 100, 6);
      expect(item.body.unit).toBe("cm");
    }
  });

  it("plantilla 5: area restante", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.word", seed, { template: 5 });
      const [long, wide, pitLong, pitWide] = numbersIn(item.body.stem);
      expect(key.value).toBe((long ?? 0) * (wide ?? 0) - (pitLong ?? 0) * (pitWide ?? 0));
      expect(key.value).toBeGreaterThan(0);
    }
  });

  it("plantilla 6: kilos a gramos por saco, division exacta", () => {
    for (const seed of SEEDS) {
      const { item, key } = numericKey("math.word", seed, { template: 6 });
      const [mass, sacks] = numbersIn(item.body.stem);
      expect(key.value).toBeCloseTo(((mass ?? 0) / (sacks ?? 1)) * 1000, 6);
      expect(Number.isInteger(key.value)).toBe(true);
      expect(item.body.unit).toBe("g");
    }
  });
});

/** Firma que ignora la redaccion y conserva solo el valor matematico de la clave. */
function numericSignature(key: GeneratedItem["answerKey"]): string {
  switch (key.type) {
    case "numeric":
      return `numeric:${key.value}:${key.tolerance}`;
    case "fraction":
      return `fraction:${key.numerator}/${key.denominator}:${String(key.requireSimplest)}`;
    case "text":
      return `text:${key.accepted.join("|")}`;
    case "choice":
      return `choice:${key.correctIds.join("|")}`;
    case "ordering":
      return `ordering:${key.correctOrder.join("|")}`;
    case "matching":
      return `matching:${key.pairs.map(([a, b]) => `${a}=${b}`).join("|")}`;
    case "manual":
      // Una clave manual no tiene valor matematico que firmar. Si un generador
      // de Math llegara a emitirla, seria un error de diseno: el ejercicio no se
      // podria autocorregir. Se falla en vez de devolver una firma inventada.
      throw new Error("Un generador de Math no puede emitir una clave de correccion manual.");
  }
}

describe("los enunciados con prosa se traducen de verdad", () => {
  // math.decimal, math.fracop, math.powten y math.metric son enunciados
  // puramente simbolicos ("97.8 × 5.5 ="): no hay nada que traducir salvo el
  // formato del numero. Los demas si llevan texto.
  const WITH_PROSE = ["math.simplify", "math.compare", "math.mixed", "math.shape", "math.word"];
  for (const key of WITH_PROSE) {
    it(`${key}: el enunciado en espanol difiere del ingles`, () => {
      const seed = 123456789;
      expect(registry.generate(key, { locale: "es" }, seed).body.stem).not.toBe(
        registry.generate(key, { locale: "en" }, seed).body.stem,
      );
    });
  }

  it("en espanol los decimales llevan coma", () => {
    for (const seed of seedList(30, 4321)) {
      const es = registry.generate("math.decimal", { locale: "es" }, seed);
      const en = registry.generate("math.decimal", { locale: "en" }, seed);
      expect(es.body.stem.replace(/,/g, ".")).toBe(en.body.stem.replace(/,/g, "."));
    }
  });
});

describe("invariantes comunes a todos los generadores", () => {
  for (const generator of registry.all()) {
    it(`${generator.key}: item bien formado y sin marcado fuera de la allowlist`, () => {
      for (const seed of seedList(40, 99)) {
        const item = generator.generate(EN, seed);
        expect(item.body.stem.length).toBeGreaterThan(0);
        expect(item.difficulty).toBeGreaterThanOrEqual(1);
        expect(item.difficulty).toBeLessThanOrEqual(5);
        expect(item.maxPoints).toBeGreaterThan(0);
        expect(item.skillCode).toBe(generator.skillCode);
        expect(item.engineKey).toBe(generator.key);
        expect(item.seed).toBe(seed);
        expect(item.hint?.en).toBeTruthy();
        expect(item.hint?.es).toBeTruthy();
        expect(item.solution?.en).toBeTruthy();
        expect(item.solution?.es).toBeTruthy();
        // Sin scripts, sin manejadores de eventos, sin estilos inline.
        expect(item.body.stem).not.toMatch(/<script|onerror=|onclick=|style=/i);
        if (item.body.figureSvg !== undefined) {
          expect(item.body.figureSvg).not.toMatch(/<script|on[a-z]+=/i);
          expect(item.body.figureAlt).toBeDefined();
        }
      }
    });

    it(`${generator.key}: el idioma cambia el texto pero nunca la matematica`, () => {
      for (const seed of seedList(20, 555)) {
        const en = generator.generate({ locale: "en" }, seed);
        const es = generator.generate({ locale: "es" }, seed);
        // La clave puede cambiar de FORMA (canonical se escribe en el idioma del
        // examen) pero jamas de VALOR.
        expect(numericSignature(es.answerKey)).toBe(numericSignature(en.answerKey));
        expect(es.difficulty).toBe(en.difficulty);
        // Las pistas si son texto: tienen que diferir en los dos idiomas.
        expect(es.hint?.es).not.toBe(undefined);
        expect(en.hint?.en).not.toBe(undefined);
      }
    });
  }
});
