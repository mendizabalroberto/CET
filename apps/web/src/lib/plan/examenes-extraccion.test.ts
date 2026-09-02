import { describe, expect, it } from "vitest";

import {
  ExtraccionDeExamenesInvalidaError,
  promptDeExtraccionDeExamenes,
  validarExamenes,
} from "./examenes-extraccion";

const TEXTO = [
  "Calendario de exámenes · Segundo trimestre 2026",
  "Lunes 12 de octubre — Mathematics",
  "Martes 13 de octubre — Science",
  "Miércoles 14 de octubre — Música",
].join("\n");

describe("validarExamenes", () => {
  it("acepta fechas reales y materias que están en el texto, mapeando el código", () => {
    const examenes = validarExamenes(TEXTO, {
      examenes: [
        { fecha: "2026-10-13", materia: "Science" },
        { fecha: "2026-10-12", materia: "Mathematics" },
        { fecha: "2026-10-14", materia: "Música" },
      ],
    });
    expect(examenes.map((e) => e.fecha)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(examenes[0]?.code).toBe("math");
    expect(examenes[1]?.code).toBe("science");
    expect(examenes[2]?.code).toBeNull();
  });

  it("rechaza una materia que no aparece en el documento", () => {
    expect(() =>
      validarExamenes(TEXTO, { examenes: [{ fecha: "2026-10-12", materia: "Química" }] }),
    ).toThrow(ExtraccionDeExamenesInvalidaError);
  });

  it("rechaza una fecha que no existe y una salida vacía", () => {
    expect(() =>
      validarExamenes(TEXTO, { examenes: [{ fecha: "2026-02-30", materia: "Science" }] }),
    ).toThrow(ExtraccionDeExamenesInvalidaError);
    expect(() => validarExamenes(TEXTO, { examenes: [] })).toThrow(
      ExtraccionDeExamenesInvalidaError,
    );
  });

  it("quita duplicados de la misma fecha y materia", () => {
    const examenes = validarExamenes(TEXTO, {
      examenes: [
        { fecha: "2026-10-12", materia: "Mathematics" },
        { fecha: "2026-10-12", materia: "mathematics" },
      ],
    });
    expect(examenes).toHaveLength(1);
  });
});

describe("promptDeExtraccionDeExamenes", () => {
  it("lleva el texto y el año lectivo por defecto", () => {
    const { system, user } = promptDeExtraccionDeExamenes(TEXTO, 2026);
    expect(system).toContain("2026");
    expect(user).toContain("Mathematics");
  });
});
