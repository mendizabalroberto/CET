import { describe, expect, it } from "vitest";

import {
  filtrarCalendarioPorCurso,
  recortarVentana,
  armarEntradaReparto,
  armarInventarioDetallado,
  armarUltimasLecciones,
  notaGuardadaSchema,
  repartoGuardadoSchema,
  type ActividadDeMateria,
  type LeccionCompletadaReciente,
  type MasteryDeSkill,
  type MateriaInventario,
} from "./consultas";

const materiaEnglish: MateriaInventario = {
  subjectId: "subj-english",
  code: "english",
  lecciones: [
    { lessonId: "lesson-1", titulo: "Reading 1", moduloTitulo: "Módulo 1", moduloOrd: 1, ord: 1, minutos: 25 },
    { lessonId: "lesson-2", titulo: "Reading 2", moduloTitulo: "Módulo 1", moduloOrd: 1, ord: 2, minutos: 15 },
  ],
  skills: [
    { skillId: "skill-1", code: "s1", nombre: "Vocabulario", ord: 1, preguntas: 10 },
    { skillId: "skill-2", code: "s2", nombre: "Gramática", ord: 2, preguntas: 0 },
  ],
};

const materiaMath: MateriaInventario = {
  subjectId: "subj-math",
  code: "math",
  lecciones: [
    { lessonId: "lesson-3", titulo: "Fracciones", moduloTitulo: "Módulo 1", moduloOrd: 1, ord: 1, minutos: 30 },
  ],
  skills: [],
};

const materiaScience: MateriaInventario = {
  subjectId: "subj-science",
  code: "science",
  lecciones: [
    { lessonId: "lesson-6", titulo: "Plantas", moduloTitulo: "Módulo 1", moduloOrd: 1, ord: 1, minutos: 40 },
  ],
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
  it("acepta un reparto válido sin prioridades (planes previos a §7.4)", () => {
    expect(
      repartoGuardadoSchema.safeParse({
        pesos: { english: 1 },
        techos: [],
      }).success,
    ).toBe(true);
  });

  it("acepta un reparto con prioridades", () => {
    const resultado = repartoGuardadoSchema.safeParse({
      pesos: { english: 1 },
      techos: [],
      prioridades: {
        english: { lecciones: ["lesson-1"], skills: ["skill-1"], porQue: "Repasar lectura." },
      },
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.prioridades?.english?.porQue).toBe("Repasar lectura.");
    }
  });

  it("rechaza una clave de prioridades que no es materia planificable", () => {
    expect(
      repartoGuardadoSchema.safeParse({
        pesos: { english: 1 },
        techos: [],
        prioridades: { art: { lecciones: [], skills: [], porQue: "x" } },
      }).success,
    ).toBe(false);
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

describe("armarInventarioDetallado", () => {
  it("cruza completadas, mastery/ultimaPractica y actividad reciente por materia", () => {
    const mastery = new Map<string, MasteryDeSkill>([
      ["skill-1", { mastery: 0.6, ultimaPractica: "2026-08-20" }],
    ]);
    const actividad = new Map<string, ActividadDeMateria>([
      ["subj-english", { minutos: 30, items: 4, porcentajeAcierto: 75, leccionesCompletadas: 1 }],
    ]);

    const resultado = armarInventarioDetallado(
      [materiaEnglish, materiaMath],
      new Set(["lesson-1", "lesson-3"]),
      mastery,
      actividad,
    );

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({
      code: "english",
      lecciones: [
        { id: "lesson-1", titulo: "Reading 1", modulo: "Módulo 1", minutos: 25, completada: true },
        { id: "lesson-2", titulo: "Reading 2", modulo: "Módulo 1", minutos: 15, completada: false },
      ],
      skills: [
        {
          id: "skill-1",
          code: "s1",
          nombre: "Vocabulario",
          preguntas: 10,
          mastery: 0.6,
          ultimaPractica: "2026-08-20",
        },
        {
          id: "skill-2",
          code: "s2",
          nombre: "Gramática",
          preguntas: 0,
          mastery: null,
          ultimaPractica: null,
        },
      ],
      reciente: { minutos: 30, items: 4, porcentajeAcierto: 75, leccionesCompletadas: 1 },
    });
    expect(resultado[1]?.reciente).toEqual({
      minutos: 0,
      items: 0,
      porcentajeAcierto: null,
      leccionesCompletadas: 0,
    });
  });
});

describe("armarUltimasLecciones", () => {
  it("resuelve título y materia de cada lección reciente", () => {
    const ultimas: LeccionCompletadaReciente[] = [
      { lessonId: "lesson-1", fecha: "2026-08-30" },
      { lessonId: "lesson-desconocida", fecha: "2026-08-29" },
      { lessonId: "lesson-3", fecha: "2026-08-28" },
    ];

    expect(armarUltimasLecciones(ultimas, [materiaEnglish, materiaMath])).toEqual([
      { titulo: "Reading 1", code: "english", fecha: "2026-08-30" },
      { titulo: "Fracciones", code: "math", fecha: "2026-08-28" },
    ]);
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
      mastery: new Map<string, MasteryDeSkill>([
        ["skill-1", { mastery: 0.8, ultimaPractica: "2026-08-20" }],
      ]),
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

  it("rellena prioridadLecciones/prioridadSkills solo donde hay algo que priorizar", () => {
    const entrada = armarEntradaReparto({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      minutosPorDia: 30,
      pesos: { english: 0.5, math: 0.5 },
      inventario: [materiaEnglish, materiaMath],
      completadas: new Set(),
      mastery: new Map(),
      calendario: [],
      prioridades: {
        english: { lecciones: ["lesson-2"], skills: [], porQue: "Repasar lectura." },
      },
    });

    const english = entrada.materias.find((m) => m.code === "english");
    const math = entrada.materias.find((m) => m.code === "math");
    expect(english?.prioridadLecciones).toEqual(["lesson-2"]);
    expect(english?.prioridadSkills).toBeUndefined();
    expect(math?.prioridadLecciones).toBeUndefined();
    expect(math?.prioridadSkills).toBeUndefined();
  });

  it("pasa los examenes del alumno al motor, y los omite si no vienen", () => {
    const sinExamenes = armarEntradaReparto({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      minutosPorDia: 30,
      pesos: { english: 0.5, math: 0.5 },
      inventario: [materiaEnglish, materiaMath],
      completadas: new Set(),
      mastery: new Map(),
      calendario: [],
    });
    expect(sinExamenes.examenes).toBeUndefined();

    const examenes = [{ fecha: "2026-09-15", subjectId: "subj-english" }];
    const conExamenes = armarEntradaReparto({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      minutosPorDia: 30,
      pesos: { english: 0.5, math: 0.5 },
      inventario: [materiaEnglish, materiaMath],
      completadas: new Set(),
      mastery: new Map(),
      calendario: [],
      examenes,
    });
    expect(conExamenes.examenes).toEqual(examenes);
  });
});

describe("filtrarCalendarioPorCurso", () => {
  it("deja pasar un feriado sin year_levels", () => {
    const resultado = filtrarCalendarioPorCurso(
      [{ desde: "2026-09-07", hasta: "2026-09-07", tipo: "feriado" }],
      6,
    );
    expect(resultado).toEqual([
      { desde: "2026-09-07", hasta: "2026-09-07", tipo: "feriado" },
    ]);
  });

  it("descarta un hito de otro curso", () => {
    const resultado = filtrarCalendarioPorCurso(
      [
        {
          desde: "2026-09-07",
          hasta: "2026-09-07",
          tipo: "hito_cambridge",
          year_levels: [4],
        },
      ],
      6,
    );
    expect(resultado).toEqual([]);
  });

  it("conserva un hito del curso del alumno", () => {
    const resultado = filtrarCalendarioPorCurso(
      [
        {
          desde: "2026-09-07",
          hasta: "2026-09-07",
          tipo: "hito_cambridge",
          year_levels: [6],
        },
      ],
      6,
    );
    expect(resultado).toEqual([
      { desde: "2026-09-07", hasta: "2026-09-07", tipo: "hito_cambridge" },
    ]);
  });

  it("descarta un hito con year_levels cuando no se conoce el curso", () => {
    const resultado = filtrarCalendarioPorCurso(
      [
        {
          desde: "2026-09-07",
          hasta: "2026-09-07",
          tipo: "hito_cambridge",
          year_levels: [6],
        },
      ],
      null,
    );
    expect(resultado).toEqual([]);
  });

  it("conserva un hito con year_levels vacio", () => {
    const resultado = filtrarCalendarioPorCurso(
      [
        {
          desde: "2026-09-07",
          hasta: "2026-09-07",
          tipo: "hito_cambridge",
          year_levels: [],
        },
      ],
      6,
    );
    expect(resultado).toEqual([
      { desde: "2026-09-07", hasta: "2026-09-07", tipo: "hito_cambridge" },
    ]);
  });
});

describe("recortarVentana", () => {
  it("conserva solo los eventos dentro de la ventana", () => {
    const resultado = recortarVentana(
      [
        { desde: "2026-09-01", hasta: "2026-09-01", tipo: "feriado" },
        { desde: "2026-09-10", hasta: "2026-09-11", tipo: "hito_cambridge", year_levels: [6] },
        { desde: "2026-10-01", hasta: "2026-10-01", tipo: "feriado" },
      ],
      "2026-09-05",
      "2026-09-30",
    );
    expect(resultado).toEqual([
      {
        desde: "2026-09-10",
        hasta: "2026-09-11",
        tipo: "hito_cambridge",
        yearLevels: [6],
      },
    ]);
  });
});
