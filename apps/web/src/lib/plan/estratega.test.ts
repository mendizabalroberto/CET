import { describe, expect, it } from "vitest";
import {
  normalizarReparto,
  promptDeEstratega,
  PropuestaInvalidaError,
  validarPropuesta,
  type EntradaEstratega,
} from "./estratega";
import { MATERIAS_CON_CONTENIDO } from "./tipos";

const reparto = { english: 0.35, math: 0.25, spanish: 0.2, science: 0.1, socials: 0.1 };

describe("normalizarReparto", () => {
  it("conserva un reparto que ya suma 1 y usa el orden canónico", () => {
    const r = normalizarReparto(reparto);
    expect(Object.keys(r)).toEqual(["english", "math", "science", "socials", "spanish"]);
    expect(Object.values(r).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1, 9);
    expect(r.english ?? 0).toBeCloseTo(0.35, 9);
  });

  it("renormaliza pesos que no suman 1", () => {
    expect(normalizarReparto({ english: 2, math: 2 })).toEqual({ english: 0.5, math: 0.5 });
  });

  it("descarta claves ajenas y pesos 0", () => {
    expect(normalizarReparto({ english: 0.5, art: 0.5 })).toEqual({ english: 1 });
    expect(() => normalizarReparto({ art: 1 })).toThrow(PropuestaInvalidaError);
    const r = normalizarReparto({ english: 0.7, math: 0.3, science: 0 });
    expect(r.science).toBeUndefined();
  });
});

describe("validarPropuesta", () => {
  const base = {
    minutos_por_dia: 45,
    reparto,
    recomendaciones: ["Revisa la tabla del 7 en voz alta."],
  };

  it("valida un caso bueno", () => {
    expect(validarPropuesta(base).minutosPorDia).toBe(45);
  });

  it("rechaza más de seis recomendaciones y horas imposibles", () => {
    expect(() =>
      validarPropuesta({
        ...base,
        recomendaciones: Array.from({ length: 7 }, () => "Frase."),
      })
    ).toThrow(PropuestaInvalidaError);
    expect(() => validarPropuesta({ ...base, minutos_por_dia: 200 })).toThrow(
      PropuestaInvalidaError
    );
  });
});

describe("promptDeEstratega", () => {
  const entrada: EntradaEstratega = {
    nombreDePila: "Lucía",
    notas: [
      { materia: "Arte", code: null, nota: 8.2, banda: "well_done" },
      { materia: "Inglés", code: "english", nota: 6.4, banda: "satisfactory" },
    ],
    inventario: [
      {
        code: "english",
        leccionesPublicadas: 10,
        leccionesCompletadas: 3,
        minutosEstimados: 450,
        preguntasPublicadas: 12,
      },
    ],
    ventana: {
      desde: "2026-09-07",
      hasta: "2026-12-18",
      hito: "preparar el examen de diciembre",
    },
    minutosPorDiaObservados: null,
  };

  it("incluye los datos que ya conocemos y el aviso de no planificadas", () => {
    const { user, system } = promptDeEstratega(entrada);
    expect(user).toContain("Lucía");
    expect(user).toContain("preparar el examen de diciembre");
    expect(user).toContain("no se planifica");
    for (const materia of MATERIAS_CON_CONTENIDO) {
      expect(system).toContain(materia);
    }
  });
});
