import { describe, expect, it } from "vitest";
import { repartir } from "./repartir.js";
import type {
  EntradaReparto,
  EventoCalendario,
  ExamenDelAlumno,
  LeccionDisponible,
  MateriaDelPlan,
  SkillDisponible,
} from "./tipos.js";
const leccion = (
  lessonId: string,
  moduloOrd: number,
  ord: number,
  minutos: number,
): LeccionDisponible => ({ lessonId, moduloOrd, ord, minutos, completada: false });
const skill = (
  skillId: string,
  ord: number,
  preguntas: number,
  mastery: number | null = null,
): SkillDisponible => ({ skillId, ord, preguntas, mastery });
const evento = (
  desde: string,
  hasta: string,
  tipo: EventoCalendario["tipo"],
): EventoCalendario => ({ desde, hasta, tipo });
const materia = (
  subjectId: string,
  code: string,
  peso: number,
  lecciones: readonly LeccionDisponible[],
  skills: readonly SkillDisponible[],
  prioridadLecciones?: readonly string[],
  prioridadSkills?: readonly string[],
): MateriaDelPlan => ({
  subjectId,
  code,
  peso,
  lecciones,
  skills,
  ...(prioridadLecciones ? { prioridadLecciones } : {}),
  ...(prioridadSkills ? { prioridadSkills } : {}),
});
const varias = (base: string, minutos: number[]): LeccionDisponible[] =>
  minutos.map((minuto, indice) => leccion(`${base}-${indice + 1}`, 0, indice, minuto));
const conPractica = (id: string): SkillDisponible => skill(id, 0, 1000, null);
describe("repartir", () => {
  it("descarta feriados y sin_clases", () => {
    const reparto = repartir({
      desde: "2026-09-21",
      hasta: "2026-09-28",
      minutosPorDia: 45,
      calendario: [
        evento("2026-09-23", "2026-09-23", "sin_clases"),
        evento("2026-09-24", "2026-09-24", "feriado"),
        evento("2026-09-25", "2026-09-25", "sin_clases"),
      ],
      materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
    } satisfies EntradaReparto);
    const fechas = new Set(reparto.tareas.map((tarea) => tarea.fecha));
    expect(fechas.has("2026-09-23")).toBe(false);
    expect(fechas.has("2026-09-24")).toBe(false);
    expect(fechas.has("2026-09-25")).toBe(false);
    expect(reparto.tareas.length).toBeGreaterThan(0);
  });
  it("sábado 0,5 y examenes_finales 1,5", () => {
    const reparto = repartir({
      desde: "2026-09-03",
      hasta: "2026-09-05",
      minutosPorDia: 40,
      calendario: [evento("2026-09-04", "2026-09-04", "examenes_finales")],
      materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
    } satisfies EntradaReparto);
    expect(reparto.minutosPresupuestados).toBe(120);
    const porFecha = new Map<string, number>();
    for (const tarea of reparto.tareas)
      porFecha.set(tarea.fecha, (porFecha.get(tarea.fecha) ?? 0) + tarea.minutos);
    expect(porFecha.get("2026-09-03")).toBe(40);
    expect(porFecha.get("2026-09-04")).toBe(60);
    expect(porFecha.get("2026-09-05")).toBe(20);
  });
  it("30 minutos para una sola materia salen 25 + 5", () => {
    const reparto = repartir({
      desde: "2026-09-02",
      hasta: "2026-09-02",
      minutosPorDia: 30,
      calendario: [],
      materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
    } satisfies EntradaReparto);
    expect(reparto.minutosPlanificados).toBe(30);
    expect(reparto.tareas.map((tarea) => tarea.minutos)).toEqual([25, 5]);
  });
  it("una lección de 35 se reparte en dos tareas con el mismo lessonId", () => {
    const tareas = repartir({
      desde: "2026-09-02",
      hasta: "2026-09-03",
      minutosPorDia: 25,
      calendario: [],
      materias: [materia("math", "math", 1, [leccion("l1", 0, 0, 35)], [])],
    } satisfies EntradaReparto).tareas;
    expect(tareas).toHaveLength(2);
    expect(tareas[0]).toMatchObject({ lessonId: "l1", skillId: null, minutos: 25 });
    expect(tareas[1]).toMatchObject({ lessonId: "l1", skillId: null, minutos: 10 });
  });
  it("agota lecciones, pasa a práctica rotando skills y evita preguntas 0", () => {
    const tareas = repartir({
      desde: "2026-09-02",
      hasta: "2026-09-02",
      minutosPorDia: 30,
      calendario: [],
      materias: [
        materia(
          "math",
          "math",
          1,
          [leccion("l1", 0, 0, 10)],
          [skill("cero", 0, 0, 0.1), skill("floja", 1, 30, 0.2), skill("fuerte", 2, 30, 0.9)],
        ),
      ],
    } satisfies EntradaReparto).tareas;
    expect(tareas[0]).toMatchObject({ tipo: "leccion", lessonId: "l1", minutos: 10 });
    expect(tareas[1]).toMatchObject({ tipo: "practica", skillId: "floja", minutos: 15 });
    expect(tareas[2]).toMatchObject({ tipo: "practica", skillId: "fuerte", minutos: 5 });
    expect(tareas.some((tarea) => tarea.skillId === "cero")).toBe(false);
  });
  it("aplica techo a math y redistribuye sin perder presupuesto", () => {
    const mathLecciones = [
      leccion("m1", 0, 0, 22),
      leccion("m2", 1, 0, 22),
      leccion("m3", 2, 0, 22),
      leccion("m4", 3, 0, 22),
      leccion("m5", 4, 0, 8),
    ];
    const reparto = repartir({
      desde: "2026-09-07",
      hasta: "2026-11-15",
      minutosPorDia: 45,
      calendario: [],
      materias: [
        materia("math", "math", 0.25, mathLecciones, [skill("math-s", 0, 16, 0.2)]),
        materia("english", "english", 0.75, [], [skill("english-s", 0, 4000, 0.4)]),
      ],
    } satisfies EntradaReparto);
    expect(reparto.minutosPresupuestados).toBe(2710);
    expect(reparto.minutosPlanificados).toBe(2710);
    expect(reparto.techos).toHaveLength(1);
    expect(reparto.techos[0]).toMatchObject({
      subjectId: "math",
      code: "math",
      minutosDisponibles: 108,
    });
  });
  it("LEO: dos materias por día y bloques entre 5 y 25", () => {
    const entrada = {
      desde: "2026-09-02",
      hasta: "2026-11-13",
      minutosPorDia: 45,
      calendario: [
        evento("2026-09-23", "2026-09-23", "sin_clases"),
        evento("2026-09-24", "2026-09-24", "feriado"),
        evento("2026-09-25", "2026-09-25", "sin_clases"),
        evento("2026-10-27", "2026-10-27", "sin_clases"),
        evento("2026-11-02", "2026-11-02", "feriado"),
        evento("2026-11-13", "2026-11-20", "examenes_finales"),
      ],
      materias: [
        materia("english", "english", 0.35, varias("english-l", [20, 20, 20, 20, 12]), [
          skill("english-s", 0, 86, 0.4),
        ]),
        materia("math", "math", 0.25, varias("math-l", [12, 12, 12, 12, 12, 12, 12, 12]), [
          skill("math-s", 0, 16, 0.3),
        ]),
        materia("spanish", "spanish", 0.2, varias("spanish-l", [20, 20, 19]), [
          skill("spanish-s", 0, 93, 0.5),
        ]),
        materia("science", "science", 0.1, varias("science-l", [15, 15, 14, 14, 14]), [
          skill("science-s", 0, 78, 0.6),
        ]),
        materia("socials", "socials", 0.1, varias("socials-l", [20, 20, 20, 20, 20, 19]), [
          skill("socials-s", 0, 165, 0.8),
        ]),
      ],
    } satisfies EntradaReparto;
    const reparto = repartir(entrada);
    // Con el inventario real todas las materias tocan techo, así que el plan no agota el presupuesto.
    expect(reparto.techos).toHaveLength(entrada.materias.length);
    expect(reparto.minutosPlanificados).toBeLessThan(reparto.minutosPresupuestados);
    const fechas = new Set(reparto.tareas.map((tarea) => tarea.fecha));
    expect(fechas.has("2026-09-24")).toBe(false);
    expect(fechas.has("2026-11-02")).toBe(false);
    const materiasPorDia = new Map<string, Set<string>>();
    for (const tarea of reparto.tareas) {
      expect(tarea.minutos).toBeGreaterThanOrEqual(5);
      expect(tarea.minutos).toBeLessThanOrEqual(25);
      expect((tarea.lessonId === null) !== (tarea.skillId === null)).toBe(true);
      const set = materiasPorDia.get(tarea.fecha) ?? new Set<string>();
      set.add(tarea.subjectId);
      materiasPorDia.set(tarea.fecha, set);
    }
    for (const set of materiasPorDia.values()) expect(set.size).toBeLessThanOrEqual(2);
  });
  describe("prioridad del estratega", () => {
    const lecciones3 = [leccion("l1", 0, 0, 20), leccion("l2", 0, 1, 20), leccion("l3", 0, 2, 20)];
    it("la lección priorizada sale primero aunque su ord sea mayor", () => {
      const tareas = repartir({
        desde: "2026-09-02",
        hasta: "2026-09-02",
        minutosPorDia: 20,
        calendario: [],
        materias: [materia("math", "math", 1, lecciones3, [], ["l3"])],
      } satisfies EntradaReparto).tareas;
      expect(tareas[0]).toMatchObject({ lessonId: "l3" });
    });
    it("respeta el orden dentro de la lista de prioridades", () => {
      const tareas = repartir({
        desde: "2026-09-02",
        hasta: "2026-09-03",
        minutosPorDia: 20,
        calendario: [],
        materias: [materia("math", "math", 1, lecciones3, [], ["l2", "l1"])],
      } satisfies EntradaReparto).tareas;
      expect(tareas[0]).toMatchObject({ fecha: "2026-09-02", lessonId: "l2" });
      expect(tareas[1]).toMatchObject({ fecha: "2026-09-03", lessonId: "l1" });
    });
    it("un id desconocido o de una lección completada no rompe nada ni aparece", () => {
      const lecciones = [
        leccion("l1", 0, 0, 20),
        { lessonId: "l2", moduloOrd: 0, ord: 1, minutos: 20, completada: true },
      ];
      const tareas = repartir({
        desde: "2026-09-02",
        hasta: "2026-09-02",
        minutosPorDia: 20,
        calendario: [],
        materias: [materia("math", "math", 1, lecciones, [], ["desconocido", "l2"])],
      } satisfies EntradaReparto).tareas;
      expect(tareas).toHaveLength(1);
      expect(tareas[0]).toMatchObject({ lessonId: "l1" });
      expect(tareas.some((tarea) => tarea.lessonId === "l2")).toBe(false);
    });
    it("sin prioridades el resultado es idéntico al de antes", () => {
      const entrada = {
        desde: "2026-09-02",
        hasta: "2026-09-03",
        minutosPorDia: 20,
        calendario: [],
        materias: [materia("math", "math", 1, lecciones3, [])],
      } satisfies EntradaReparto;
      const tareas = repartir(entrada).tareas;
      expect(tareas[0]).toMatchObject({ fecha: "2026-09-02", lessonId: "l1" });
      expect(tareas[1]).toMatchObject({ fecha: "2026-09-03", lessonId: "l2" });
    });
    it("las skills priorizadas se practican antes que las de menor mastery", () => {
      const tareas = repartir({
        desde: "2026-09-02",
        hasta: "2026-09-02",
        minutosPorDia: 20,
        calendario: [],
        materias: [
          materia(
            "math",
            "math",
            1,
            [],
            [skill("floja", 0, 30, 0.2), skill("fuerte", 1, 30, 0.9)],
            undefined,
            ["fuerte"],
          ),
        ],
      } satisfies EntradaReparto).tareas;
      expect(tareas[0]).toMatchObject({ tipo: "practica", skillId: "fuerte" });
    });
  });
  describe("exámenes del alumno", () => {
    const examenMath = (fecha: string): ExamenDelAlumno[] => [{ fecha, subjectId: "math" }];
    it("en la ventana de empuje math va primero aunque science tenga más pendiente", () => {
      const materias = [
        materia("math", "math", 0.2, varias("math-l", [20, 20]), [conPractica("math-s")]),
        materia("science", "science", 0.8, varias("science-l", [20, 20, 20, 20]), [
          conPractica("science-s"),
        ]),
      ];
      for (const fecha of [
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
        "2026-09-06",
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
      ]) {
        const tareas = repartir({
          desde: fecha,
          hasta: fecha,
          minutosPorDia: 100,
          calendario: [],
          materias,
          examenes: examenMath("2026-09-10"),
        } satisfies EntradaReparto).tareas;
        expect(tareas[0]?.subjectId).toBe("math");
      }
    });
    it("el día del examen ya no cuenta como ventana y el siguiente math pasa al final", () => {
      const materias = [
        materia("math", "math", 0.8, varias("math-l", [20, 20, 20, 20]), [conPractica("math-s")]),
        materia("science", "science", 0.2, varias("science-l", [20, 20]), [conPractica("science-s")]),
      ];
      const tareasExamen = repartir({
        desde: "2026-09-10",
        hasta: "2026-09-10",
        minutosPorDia: 100,
        calendario: [],
        materias,
        examenes: examenMath("2026-09-10"),
      } satisfies EntradaReparto).tareas;
      // Fuera de ventana (el propio día del examen no cuenta): manda el pendiente, math sigue primero.
      expect(tareasExamen[0]?.subjectId).toBe("math");
      const tareasDespues = repartir({
        desde: "2026-09-11",
        hasta: "2026-09-11",
        minutosPorDia: 100,
        calendario: [],
        materias,
        examenes: examenMath("2026-09-10"),
      } satisfies EntradaReparto).tareas;
      // Al día siguiente math pasa al final aunque tenga más pendiente que science.
      expect(tareasDespues[0]?.subjectId).toBe("science");
    });
    it("la ventana de empuje sube el presupuesto x1,25, sin acumularse con examenes_finales", () => {
      const soloVentana = repartir({
        desde: "2026-09-03",
        hasta: "2026-09-03",
        minutosPorDia: 40,
        calendario: [],
        materias: [materia("math", "math", 1, [], [conPractica("math-s")])],
        examenes: examenMath("2026-09-10"),
      } satisfies EntradaReparto);
      expect(soloVentana.minutosPresupuestados).toBe(Math.round(40 * 1.25));
      const conFinales = repartir({
        desde: "2026-09-03",
        hasta: "2026-09-03",
        minutosPorDia: 40,
        calendario: [evento("2026-09-03", "2026-09-03", "examenes_finales")],
        materias: [materia("math", "math", 1, [], [conPractica("math-s")])],
        examenes: examenMath("2026-09-10"),
      } satisfies EntradaReparto);
      expect(conFinales.minutosPresupuestados).toBe(Math.round(40 * 1.5));
    });
    it("un examen general sube el presupuesto pero no reordena materias", () => {
      const materias = [
        materia("math", "math", 0.9, varias("math-l", [5]), []),
        materia("science", "science", 0.1, varias("science-l", [5, 5, 5, 5, 5, 5, 5, 5]), []),
      ];
      const sinExamen = repartir({
        desde: "2026-09-03",
        hasta: "2026-09-03",
        minutosPorDia: 40,
        calendario: [],
        materias,
      } satisfies EntradaReparto);
      const conExamenGeneral = repartir({
        desde: "2026-09-03",
        hasta: "2026-09-03",
        minutosPorDia: 40,
        calendario: [],
        materias,
        examenes: [{ fecha: "2026-09-10", subjectId: null }],
      } satisfies EntradaReparto);
      expect(sinExamen.minutosPresupuestados).toBe(40);
      expect(conExamenGeneral.minutosPresupuestados).toBe(Math.round(40 * 1.25));
      const ordenDeAparicion = (subjectIds: string[]): string[] => [...new Set(subjectIds)];
      expect(ordenDeAparicion(conExamenGeneral.tareas.map((t) => t.subjectId))).toEqual(
        ordenDeAparicion(sinExamen.tareas.map((t) => t.subjectId)),
      );
    });
    it("sin `examenes` el resultado es idéntico al de antes", () => {
      const entrada = {
        desde: "2026-09-03",
        hasta: "2026-09-05",
        minutosPorDia: 40,
        calendario: [evento("2026-09-04", "2026-09-04", "examenes_finales")],
        materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
      } satisfies EntradaReparto;
      const sinCampo = repartir(entrada);
      const conVacio = repartir({ ...entrada, examenes: [] });
      expect(conVacio).toEqual(sinCampo);
    });
  });
});
