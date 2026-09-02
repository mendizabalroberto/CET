import { describe, expect, it } from "vitest";

import { presentarTareas } from "./presentar";

const filaLeccion = {
  id: "tarea-leccion",
  fecha: "2026-09-03",
  ord: 2,
  tipo: "leccion",
  minutos: 25,
  lesson_id: "lesson-101",
  subjects: [{ code: "math", name: { en: "Math", es: "Matemáticas" } }],
  lessons: [{ title: { en: "Adding and subtracting", es: "Sumas y restas" } }],
  skills: [],
};

const filaPractica = {
  id: "tarea-practica",
  fecha: "2026-09-03",
  ord: 1,
  tipo: "practica",
  minutos: 15,
  skills: [{ code: "simplify", name: { en: "Simplifying", es: "Simplificar" } }],
  subjects: [{ code: "math", name: { en: "Math", es: "Matemáticas" } }],
  lessons: [],
};

describe("presentarTareas", () => {
  it("presenta una lección y una práctica con sus destinos y títulos en español", () => {
    const tarjetas = presentarTareas([filaLeccion, filaPractica], "es");

    expect(tarjetas).toHaveLength(2);

    const leccion = tarjetas.find((tarea) => tarea.tipo === "leccion");
    const practica = tarjetas.find((tarea) => tarea.tipo === "practica");

    expect(leccion?.href).toBe("/learn/lesson-101");
    expect(leccion?.titulo).toBe("Sumas y restas");
    expect(practica?.href).toBe("/practice/simplify");
    expect(practica?.titulo).toBe("Simplificar");
  });

  it("descarta una fila sin subjects", () => {
    const tarjetas = presentarTareas(
      [{ ...filaLeccion, id: "tarea-sin-subject", subjects: [] }],
      "es",
    );

    expect(tarjetas).toHaveLength(0);
  });

  it("respeta el orden de ord", () => {
    const tarjetas = presentarTareas([filaLeccion, filaPractica], "es");

    expect(tarjetas.map((tarea) => tarea.ord)).toEqual([1, 2]);
  });
});
