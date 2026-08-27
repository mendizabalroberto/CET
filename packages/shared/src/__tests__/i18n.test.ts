/**
 * Tests de @cet/shared — i18n y contratos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, i18nText, resolveI18n, sameInAll } from "../i18n.js";
import { clientEvent, eventBatch, MAX_EVENT_BATCH } from "../events.js";
import { answerKey, engineKey, seed } from "../engine-contract.js";

describe("i18nText", () => {
  it("acepta un texto con un solo idioma", () => {
    expect(i18nText.safeParse({ en: "Fractions" }).success).toBe(true);
    expect(i18nText.safeParse({ es: "Fracciones" }).success).toBe(true);
  });

  it("rechaza el objeto vacio: un texto sin ningun idioma es dato corrupto", () => {
    expect(i18nText.safeParse({}).success).toBe(false);
  });

  it("rechaza cadenas vacias o solo espacios", () => {
    expect(i18nText.safeParse({ en: "" }).success).toBe(false);
    expect(i18nText.safeParse({ en: "   " }).success).toBe(false);
  });

  it("recorta los espacios de los extremos", () => {
    const parsed = i18nText.parse({ en: "  Fractions  " });
    expect(parsed.en).toBe("Fractions");
  });
});

describe("resolveI18n", () => {
  const both = { es: "Fracciones", en: "Fractions" };

  it("devuelve el idioma pedido cuando existe", () => {
    expect(resolveI18n(both, "es")).toBe("Fracciones");
    expect(resolveI18n(both, "en")).toBe("Fractions");
  });

  it("cae al fallback cuando falta el idioma pedido", () => {
    expect(resolveI18n({ en: "Fractions" }, "es")).toBe("Fractions");
  });

  it("cae a cualquier idioma disponible si tampoco esta el fallback", () => {
    // Un alumno con la interfaz en ingles abriendo contenido solo en espanol
    // debe ver el espanol, no una pantalla vacia.
    expect(resolveI18n({ es: "Tilde diacritica" }, "en", "en")).toBe("Tilde diacritica");
  });

  it("nunca lanza: degrada a cadena vacia en vez de romper la pagina", () => {
    // Inalcanzable si el valor paso por i18nText.parse(), pero la UI no puede
    // caerse por un dato malo que se colara en la base de datos.
    expect(() => resolveI18n({}, "es")).not.toThrow();
    expect(resolveI18n({}, "es")).toBe("");
  });

  it("DEFAULT_LOCALE es un idioma soportado", () => {
    expect(["es", "en"]).toContain(DEFAULT_LOCALE);
  });
});

describe("sameInAll", () => {
  it("rellena todos los idiomas y el resultado valida", () => {
    const text = sameInAll("Math");
    expect(i18nText.safeParse(text).success).toBe(true);
    expect(resolveI18n(text, "es")).toBe("Math");
    expect(resolveI18n(text, "en")).toBe("Math");
  });
});

describe("engineKey", () => {
  it("acepta la forma materia.familia", () => {
    for (const key of ["math.fracop", "math.simplify", "science.acid_rain"]) {
      expect(engineKey.safeParse(key).success).toBe(true);
    }
  });

  it("rechaza formas invalidas", () => {
    for (const key of ["math", "Math.Fracop", "math.", ".fracop", "math..x", "math fracop", ""]) {
      expect(engineKey.safeParse(key).success, key).toBe(false);
    }
  });
});

describe("seed", () => {
  it("acepta enteros no negativos hasta MAX_SAFE_INTEGER", () => {
    expect(seed.safeParse(0).success).toBe(true);
    expect(seed.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
  });

  it("rechaza negativos, decimales y valores fuera del rango seguro", () => {
    // Fuera de 2^53 la semilla deja de ser reproducible en JS, y sin
    // reproducibilidad no se puede reconstruir un examen.
    expect(seed.safeParse(-1).success).toBe(false);
    expect(seed.safeParse(1.5).success).toBe(false);
    expect(seed.safeParse(Number.MAX_SAFE_INTEGER + 2).success).toBe(false);
  });
});

describe("answerKey", () => {
  it("discrimina por type", () => {
    expect(answerKey.safeParse({ type: "choice", correctIds: ["a"] }).success).toBe(true);
    expect(
      answerKey.safeParse({ type: "numeric", value: 41, tolerance: 0, canonical: "41" }).success,
    ).toBe(true);
  });

  it("exige al menos una opcion correcta", () => {
    expect(answerKey.safeParse({ type: "choice", correctIds: [] }).success).toBe(false);
  });

  it("rechaza un denominador cero", () => {
    const bad = { type: "fraction", numerator: 1, denominator: 0, canonical: "1/0" };
    expect(answerKey.safeParse(bad).success).toBe(false);
  });
});

describe("eventBatch", () => {
  const base = {
    sessionId: "00000000-0000-4000-8000-000000000000",
    seq: 0,
    eventType: "question_shown" as const,
    payload: {},
    clientTs: new Date().toISOString(),
  };

  it("acepta un lote valido", () => {
    expect(eventBatch.safeParse({ events: [base] }).success).toBe(true);
  });

  it("rechaza el lote vacio", () => {
    expect(eventBatch.safeParse({ events: [] }).success).toBe(false);
  });

  it("rechaza lotes por encima del tope: protege la ruta de ingesta", () => {
    const tooMany = Array.from({ length: MAX_EVENT_BATCH + 1 }, (_, i) => ({ ...base, seq: i }));
    expect(eventBatch.safeParse({ events: tooMany }).success).toBe(false);
  });

  it("no acepta school_id ni student_id del cliente", () => {
    // Contrato C4: el servidor los deriva de la sesion. Si el cliente pudiera
    // declararlos, un alumno escribiria eventos en nombre de otro.
    const parsed = clientEvent.parse({ ...base, schoolId: "x", studentId: "y" });
    expect(parsed).not.toHaveProperty("schoolId");
    expect(parsed).not.toHaveProperty("studentId");
  });
});
