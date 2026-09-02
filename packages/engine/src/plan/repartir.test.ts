import { describe, expect, it } from "vitest";
import { repartir } from "./repartir.js";
import type { EntradaReparto, EventoCalendario, LeccionDisponible, MateriaDelPlan, SkillDisponible } from "./tipos.js";
const leccion = (lessonId: string, moduloOrd: number, ord: number, minutos: number): LeccionDisponible => ({ lessonId, moduloOrd, ord, minutos, completada: false });
const skill = (skillId: string, ord: number, preguntas: number, mastery: number | null = null): SkillDisponible => ({ skillId, ord, preguntas, mastery });
const evento = (desde: string, hasta: string, tipo: EventoCalendario["tipo"]): EventoCalendario => ({ desde, hasta, tipo });
const materia = (subjectId: string, code: string, peso: number, lecciones: readonly LeccionDisponible[], skills: readonly SkillDisponible[]): MateriaDelPlan => ({ subjectId, code, peso, lecciones, skills });
const varias = (base: string, minutos: number[]): LeccionDisponible[] => minutos.map((minuto, indice) => leccion(`${base}-${indice + 1}`, 0, indice, minuto));
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
    for (const tarea of reparto.tareas) porFecha.set(tarea.fecha, (porFecha.get(tarea.fecha) ?? 0) + tarea.minutos);
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
        materia("math", "math", 1, [leccion("l1", 0, 0, 10)], [
          skill("cero", 0, 0, 0.1),
          skill("floja", 1, 30, 0.2),
          skill("fuerte", 2, 30, 0.9),
        ]),
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
    expect(reparto.techos[0]).toMatchObject({ subjectId: "math", code: "math", minutosDisponibles: 108 });
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
        materia("english", "english", 0.35, varias("english-l", [20, 20, 20, 20, 12]), [skill("english-s", 0, 86, 0.4)]),
        materia("math", "math", 0.25, varias("math-l", [12, 12, 12, 12, 12, 12, 12, 12]), [skill("math-s", 0, 16, 0.3)]),
        materia("spanish", "spanish", 0.2, varias("spanish-l", [20, 20, 19]), [skill("spanish-s", 0, 93, 0.5)]),
        materia("science", "science", 0.1, varias("science-l", [15, 15, 14, 14, 14]), [skill("science-s", 0, 78, 0.6)]),
        materia("socials", "socials", 0.1, varias("socials-l", [20, 20, 20, 20, 20, 19]), [skill("socials-s", 0, 165, 0.8)]),
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
});
