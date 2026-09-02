/**
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  bandaDeNota,
  ExtraccionInvalidaError,
  extraccionCrudaSchema,
  mapearMateria,
  promptDeExtraccion,
  validarExtraccion,
} from "./boletin";

const TEXTO_LEO = readFileSync(
  new URL("./__fixtures__/leo-boletin.txt", import.meta.url),
  "utf8",
);

const CRUDA_LEO = {
  gestion: 2026,
  trimestre: 1,
  notas: [
    { materia: "Religion and Values", nota: 88 },
    { materia: "Social Studies", nota: 83 },
    { materia: "Science", nota: 90 },
    { materia: "Art", nota: 77 },
    { materia: "Music", nota: 96 },
    { materia: "Physical Education", nota: 88 },
    { materia: "Math", nota: 73 },
    { materia: "Information & Communication Technology", nota: 91 },
    { materia: "English", nota: 64 },
    { materia: "Spanish", nota: 78 },
    { materia: "COML - Communication and Languages", nota: 71 },
  ],
};

describe("extraccionCrudaSchema", () => {
  it("acepta la forma correcta", () => {
    expect(extraccionCrudaSchema.safeParse(CRUDA_LEO).success).toBe(true);
  });

  it("rechaza notas fuera de 0..100 o no enteras", () => {
    expect(
      extraccionCrudaSchema.safeParse({
        ...CRUDA_LEO,
        notas: [{ materia: "Math", nota: 105 }],
      }).success,
    ).toBe(false);
    expect(
      extraccionCrudaSchema.safeParse({
        ...CRUDA_LEO,
        notas: [{ materia: "Math", nota: -1 }],
      }).success,
    ).toBe(false);
    expect(
      extraccionCrudaSchema.safeParse({
        ...CRUDA_LEO,
        notas: [{ materia: "Math", nota: 73.5 }],
      }).success,
    ).toBe(false);
  });

  it("rechaza gestion y trimestre fuera de rango", () => {
    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, gestion: 2019 }).success).toBe(false);
    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, gestion: 2101 }).success).toBe(false);
    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, trimestre: 0 }).success).toBe(false);
    expect(extraccionCrudaSchema.safeParse({ ...CRUDA_LEO, trimestre: 4 }).success).toBe(false);
  });
});

describe("bandaDeNota", () => {
  it("cubre todos los bordes de la escala impresa", () => {
    expect(bandaDeNota(100)).toBe("outstanding");
    expect(bandaDeNota(91)).toBe("outstanding");
    expect(bandaDeNota(90)).toBe("well_done");
    expect(bandaDeNota(81)).toBe("well_done");
    expect(bandaDeNota(80)).toBe("good");
    expect(bandaDeNota(71)).toBe("good");
    expect(bandaDeNota(70)).toBe("satisfactory");
    expect(bandaDeNota(64)).toBe("satisfactory");
    expect(bandaDeNota(60)).toBe("needs_improvement");
    expect(bandaDeNota(51)).toBe("needs_improvement");
    expect(bandaDeNota(50)).toBe("failing");
    expect(bandaDeNota(0)).toBe("failing");
  });
});

describe("mapearMateria", () => {
  it("mapea los sinónimos de las seis materias con contenido", () => {
    expect(mapearMateria("English")).toBe("english");
    expect(mapearMateria("INGLÉS")).toBe("english");
    expect(mapearMateria("ingles")).toBe("english");
    expect(mapearMateria("Math")).toBe("math");
    expect(mapearMateria("Maths")).toBe("math");
    expect(mapearMateria("Mathematics")).toBe("math");
    expect(mapearMateria("Matemáticas")).toBe("math");
    expect(mapearMateria("Matematica(s)")).toBe("math");
    expect(mapearMateria("Science")).toBe("science");
    expect(mapearMateria("Sciences")).toBe("science");
    expect(mapearMateria("Ciencias")).toBe("science");
    expect(mapearMateria("Ciencias Naturales")).toBe("science");
    expect(mapearMateria("Spanish")).toBe("spanish");
    expect(mapearMateria("Español")).toBe("spanish");
    expect(mapearMateria("Lengua")).toBe("spanish");
    expect(mapearMateria("Lenguaje")).toBe("spanish");
    expect(mapearMateria("Castellano")).toBe("spanish");
    expect(mapearMateria("Social Studies")).toBe("socials");
    expect(mapearMateria("Socials")).toBe("socials");
    expect(mapearMateria("Sociales")).toBe("socials");
    expect(mapearMateria("Ciencias Sociales")).toBe("socials");
    expect(mapearMateria("Estudios Sociales")).toBe("socials");
    expect(mapearMateria("ICT")).toBe("ict");
    expect(mapearMateria("Information & Communication Technology")).toBe("ict");
    expect(mapearMateria("Information and Communication Technology")).toBe("ict");
    expect(mapearMateria("Computación")).toBe("ict");
    expect(mapearMateria("Informática")).toBe("ict");
    expect(mapearMateria("TIC")).toBe("ict");
  });

  it("devuelve null para materias fuera del plan", () => {
    expect(mapearMateria("Art")).toBeNull();
    expect(mapearMateria("Music")).toBeNull();
    expect(mapearMateria("Physical Education")).toBeNull();
    expect(mapearMateria("Religion and Values")).toBeNull();
    expect(mapearMateria("COML - Communication and Languages")).toBeNull();
    expect(mapearMateria("AVERAGES")).toBeNull();
  });
});

describe("validarExtraccion", () => {
  it("valida el boletín real de LEO", () => {
    const resultado = validarExtraccion(TEXTO_LEO, CRUDA_LEO);
    expect(resultado.notas).toHaveLength(11);
    const conCodigo = resultado.notas.filter((n) => n.code !== null);
    expect(conCodigo).toHaveLength(6);
    expect(conCodigo.map((n) => n.code).sort()).toEqual([
      "english",
      "ict",
      "math",
      "science",
      "socials",
      "spanish",
    ]);
    const english = resultado.notas.find((n) => n.materia === "English");
    expect(english?.banda).toBe("satisfactory");
    const ict = resultado.notas.find((n) => n.materia === "Information & Communication Technology");
    expect(ict?.banda).toBe("outstanding");
    const math = resultado.notas.find((n) => n.materia === "Math");
    expect(math?.banda).toBe("good");
  });

  it("rechaza una materia inventada", () => {
    const conGeografia = {
      ...CRUDA_LEO,
      notas: [...CRUDA_LEO.notas, { materia: "Geography", nota: 80 }],
    };
    expect(() => validarExtraccion(TEXTO_LEO, conGeografia)).toThrow(ExtraccionInvalidaError);
    try {
      validarExtraccion(TEXTO_LEO, conGeografia);
    } catch (e) {
      expect(e).toBeInstanceOf(ExtraccionInvalidaError);
      expect((e as ExtraccionInvalidaError).motivo).toBe("materia_inventada");
      expect((e as ExtraccionInvalidaError).message).toContain("Geography");
    }
  });

  it("rechaza una nota fuera de rango por forma", () => {
    const conNotaMala = {
      ...CRUDA_LEO,
      notas: CRUDA_LEO.notas.map((n, i) => (i === 0 ? { ...n, nota: 105 } : n)),
    };
    try {
      validarExtraccion(TEXTO_LEO, conNotaMala);
      expect.unreachable("debería haber lanzado");
    } catch (e) {
      expect(e).toBeInstanceOf(ExtraccionInvalidaError);
      expect((e as ExtraccionInvalidaError).motivo).toBe("forma");
    }
  });
});

describe("promptDeExtraccion", () => {
  it("incluye el texto del PDF en el mensaje de usuario", () => {
    const prompt = promptDeExtraccion(TEXTO_LEO);
    expect(prompt.user).toContain(TEXTO_LEO);
  });
});
