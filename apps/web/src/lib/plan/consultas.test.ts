import { describe, expect, it } from "vitest";

import {
  armarEntradaReparto,
  armarInventarioEstratega,
  notaGuardadaSchema,
  repartoGuardadoSchema,
  type MateriaInventario,
} from "./consultas";

const materiaEnglish: MateriaInventario = {
  subjectId: "subj-english",
  code: "english",
  lecciones: [
    { lessonId: "lesson-1", moduloOrd: 1, ord: 1, minutos: 25 },
    { lessonId: "lesson-2", moduloOrd: 1, ord: 2, minutos: 15 },
  ],
  skills: [
    { skillId: "skill-1", code: "s1", ord: 1, preguntas: 10 },
    { skillId: "skill-2", code: "s2", ord: 2, preguntas: 0 },
  ],
};

const materiaMath: MateriaInventario = {
  subjectId: "subj-math",
  code: "math",
  lecciones: [{ lessonId: "lesson-3", moduloOrd: 1, ord: 1, minutos: 30 }],
  skills: [],
};

const materiaScience: MateriaInventario = {
  subjectId: "subj-science",
  code: "science",
  lecciones: [{ lessonId: "lesson-6", moduloOrd: 1, ord: 1, minutos: 40 }],
  skills: [],
};

const calendario = [{ desde: "2026-09-07", hasta: "2026-09-07", tipo: "feriado" }] as const;

describe("notaGuardadaSchema", () => {
  it("acepta una nota válida", () => {
    expect(
      notaGuardadaSchema.safeParse({
        materia: "English",
        code: "english",
        subject_id: "subj-1",
        nota: 85,
        banda: "well_done",
      }).success,
    ).toBe(true);
  });

  it("rechaza una nota fuera de rango", () => {
    expect(
      notaGuardadaSchema.safeParse({
        materia: "English",
        code: "english",
        subject_id: "subj-1",
        nota: 101,
        banda: "well_done",
      }).success,
    ).toBe(false);
  });

  it("rechaza una banda desconocida", () => {
    expect(
      notaGuardadaSchema.safeParse({
        materia: "English",
        code: "english",
        subject_id: "subj-1",
        nota: 80,
        banda: "otra",
      }).success,
    ).toBe(false);
  });
});

describe("repartoGuardadoSchema", () => {
  it("acepta un reparto válido", () => {
    expect(
      repartoGuardadoSchema.safeParse({
        pesos: { english: 1 },
        techos: [],
      }).success,
    ).toBe(true);
  });

  it("rechaza claves que no son materias planificables", () => {
    expect(
      repartoGuardadoSchema.safeParse({
        pesos: { art: 1 },
        techos: [],
      }).success,
    ).toBe(false);
  });
});

describe("armarInventarioEstratega", () => {
  it("cuenta completadas, minutos y preguntas de dos materias", () => {
    const resultado = armarInventarioEstratega(
      [materiaEnglish, materiaMath],
      new Set(["lesson-1", "lesson-3"]),
    );

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({
      code: "english",
      leccionesPublicadas: 2,
      leccionesCompletadas: 1,
      minutosEstimados: 40,
      preguntasPublicadas: 10,
    });
    expect(resultado[1]).toEqual({
      code: "math",
      leccionesPublicadas: 1,
      leccionesCompletadas: 1,
      minutosEstimados: 30,
      preguntasPublicadas: 0,
    });
  });
});

describe("armarEntradaReparto", () => {
  it("cruza completadas y mastery, respeta pesos y conserva calendario", () => {
    const entrada = armarEntradaReparto({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      minutosPorDia: 30,
      pesos: { english: 0.5, math: 0.5, science: 0 },
      inventario: [materiaEnglish, materiaScience, materiaMath],
      completadas: new Set(["lesson-1", "lesson-3"]),
      mastery: new Map([["skill-1", 0.8]]),
      calendario,
    });

    expect(entrada.materias).toHaveLength(2);
    expect(entrada.materias[0]?.code).toBe("english");
    expect(entrada.materias[0]?.lecciones[0]?.completada).toBe(true);
    expect(entrada.materias[0]?.lecciones[1]?.completada).toBe(false);
    expect(entrada.materias[0]?.skills[0]?.mastery).toBe(0.8);
    expect(entrada.materias[0]?.skills[1]?.mastery).toBeNull();
    expect(entrada.materias.some((materia) => materia.code === "science")).toBe(false);
    expect(entrada.materias.some((materia) => materia.code === "math")).toBe(true);
    expect(entrada.calendario).toEqual(calendario);
    expect(entrada.minutosPorDia).toBe(30);
  });

  it("devuelve materias vacias cuando ningun peso es positivo", () => {
    const entrada = armarEntradaReparto({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      minutosPorDia: 30,
      pesos: {},
      inventario: [materiaEnglish, materiaMath],
      completadas: new Set(),
      mastery: new Map(),
      calendario: [],
    });

    expect(entrada.materias).toEqual([]);
  });
});
