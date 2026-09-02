import { describe, expect, it } from "vitest";
import {
  normalizarReparto,
  promptDeEstratega,
  PropuestaInvalidaError,
  validarPropuesta,
  type EntradaEstratega,
  type InventarioDetalladoDeMateria,
} from "./estratega";
import { MATERIAS_CON_CONTENIDO } from "./tipos";

const reparto = { english: 0.35, math: 0.25, spanish: 0.2, science: 0.1, socials: 0.1 };

const inventarioEnglish: InventarioDetalladoDeMateria = {
  code: "english",
  lecciones: [
    { id: "lesson-1", titulo: "Reading comprehension", modulo: "Reading", minutos: 20, completada: false },
    { id: "lesson-2", titulo: "Past tense", modulo: "Grammar", minutos: 15, completada: true },
  ],
  skills: [
    { id: "skill-1", code: "eng.vocab", nombre: "Vocabulario", preguntas: 12, mastery: 0.3, ultimaPractica: null },
    { id: "skill-2", code: "eng.grammar", nombre: "Gramática", preguntas: 8, mastery: null, ultimaPractica: null },
  ],
  reciente: { minutos: 40, items: 6, porcentajeAcierto: 60, leccionesCompletadas: 1 },
};

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
  const inventario = [inventarioEnglish];

  it("valida un caso bueno sin prioridades", () => {
    const propuesta = validarPropuesta(base, inventario);
    expect(propuesta.minutosPorDia).toBe(45);
    expect(propuesta.prioridades).toBeUndefined();
  });

  it("rechaza más de seis recomendaciones y horas imposibles", () => {
    expect(() =>
      validarPropuesta(
        {
          ...base,
          recomendaciones: Array.from({ length: 7 }, () => "Frase."),
        },
        inventario,
      )
    ).toThrow(PropuestaInvalidaError);
    expect(() => validarPropuesta({ ...base, minutos_por_dia: 200 }, inventario)).toThrow(
      PropuestaInvalidaError
    );
  });

  it("descarta ids que no están en el inventario y lecciones ya completadas", () => {
    const propuesta = validarPropuesta(
      {
        ...base,
        prioridades: {
          english: {
            lecciones: ["lesson-1", "lesson-2", "lesson-inventada"],
            skills: ["skill-1", "skill-inventada"],
            por_que: "Refuerza lectura y vocabulario.",
          },
        },
      },
      inventario,
    );

    expect(propuesta.prioridades?.english?.lecciones).toEqual(["lesson-1"]);
    expect(propuesta.prioridades?.english?.skills).toEqual(["skill-1"]);
    expect(propuesta.prioridades?.english?.porQue).toBe("Refuerza lectura y vocabulario.");
  });

  it("descarta una materia con clave desconocida", () => {
    const propuesta = validarPropuesta(
      {
        ...base,
        prioridades: {
          art: { lecciones: [], skills: [], por_que: "x" },
        },
      },
      inventario,
    );
    expect(propuesta.prioridades).toBeUndefined();
  });

  it("respeta el tope de 8 lecciones y 6 skills por materia", () => {
    const muchasLecciones = Array.from({ length: 12 }, (_, i) => ({
      id: `l${i}`,
      titulo: `Lección ${i}`,
      modulo: "Módulo",
      minutos: 10,
      completada: false,
    }));
    const muchasSkills = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      code: `math.s${i}`,
      nombre: `Skill ${i}`,
      preguntas: 5,
      mastery: null,
      ultimaPractica: null,
    }));
    const inventarioGrande: InventarioDetalladoDeMateria[] = [
      {
        code: "math",
        lecciones: muchasLecciones,
        skills: muchasSkills,
        reciente: { minutos: 0, items: 0, porcentajeAcierto: null, leccionesCompletadas: 0 },
      },
    ];

    const propuesta = validarPropuesta(
      {
        ...base,
        prioridades: {
          math: {
            lecciones: muchasLecciones.map((l) => l.id),
            skills: muchasSkills.map((s) => s.id),
            por_que: "Mucho que practicar.",
          },
        },
      },
      inventarioGrande,
    );

    expect(propuesta.prioridades?.math?.lecciones).toHaveLength(8);
    expect(propuesta.prioridades?.math?.skills).toHaveLength(6);
  });

  it("rechaza un por_que de más de 200 caracteres", () => {
    expect(() =>
      validarPropuesta(
        {
          ...base,
          prioridades: {
            english: {
              lecciones: ["lesson-1"],
              skills: [],
              por_que: "x".repeat(201),
            },
          },
        },
        inventario,
      ),
    ).toThrow(PropuestaInvalidaError);
  });
});

describe("promptDeEstratega", () => {
  const entrada: EntradaEstratega = {
    nombreDePila: "Lucía",
    notas: [
      { materia: "Arte", code: null, nota: 8.2, banda: "well_done" },
      { materia: "Inglés", code: "english", nota: 6.4, banda: "satisfactory" },
    ],
    inventario: [inventarioEnglish],
    ultimasLecciones: [{ titulo: "Past tense", code: "english", fecha: "2026-08-30" }],
    ventana: {
      desde: "2026-09-07",
      hasta: "2026-12-18",
      hito: "preparar el examen de diciembre",
    },
    minutosPorDiaObservados: null,
    idioma: "es",
    examenes: [],
  };

  it("lista los exámenes próximos del alumno, o «ninguno» si no hay", () => {
    expect(promptDeEstratega(entrada).user).toContain("ninguno");
    const { user, system } = promptDeEstratega({
      ...entrada,
      examenes: [{ fecha: "2026-09-20", code: "english", titulo: "Reading test" }],
    });
    expect(user).toContain("2026-09-20");
    expect(user).toContain("english");
    expect(user).toContain("Reading test");
    expect(system).toContain("examen próximo");
  });

  it("lleva la indicación del tutor al prompt solo cuando la hay", () => {
    expect(promptDeEstratega(entrada).user).not.toContain("Indicación del tutor");
    const { user, system } = promptDeEstratega({ ...entrada, indicacionDelTutor: "¡Más matemáticas!" });
    expect(user).toContain("Indicación del tutor: \"¡Más matemáticas!\"");
    expect(system).toContain("indicación del tutor");
  });

  it("incluye los datos que ya conocemos y el aviso de no planificadas", () => {
    const { user, system } = promptDeEstratega(entrada);
    expect(user).toContain("Lucía");
    expect(user).toContain("preparar el examen de diciembre");
    expect(user).toContain("no se planifica");
    for (const materia of MATERIAS_CON_CONTENIDO) {
      expect(system).toContain(materia);
    }
  });

  it("incluye títulos de lecciones/skills y la actividad reciente en el prompt", () => {
    const { user } = promptDeEstratega(entrada);
    expect(user).toContain("Reading comprehension");
    expect(user).toContain("Vocabulario");
    expect(user).toContain("Past tense");
    expect(user).toContain('"porcentajeAcierto": 60');
  });

  it("explica la forma de prioridades en el system prompt", () => {
    const { system } = promptDeEstratega(entrada);
    expect(system).toContain("prioridades");
    expect(system).toContain("completada");
    expect(system).toContain("mastery");
  });

  it("instruye escribir en español o en inglés según el idioma del alumno, nunca mezclado", () => {
    expect(promptDeEstratega(entrada).system).toContain("ESPAÑOL");
    expect(promptDeEstratega({ ...entrada, idioma: "en" }).system).toContain("ENGLISH");
  });
});
