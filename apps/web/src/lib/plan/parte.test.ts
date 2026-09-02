import { describe, expect, it } from "vitest";

import { esViolacionDeUnicidad, pendientesDelDia, textoDelParte, ventanaDelDia } from "./parte";

describe("textoDelParte", () => {
  it("formatea el parte con pendiente", () => {
    expect(
      textoDelParte({
        nombre: "Leo",
        fecha: "2026-09-02",
        minutosPrevistos: 45,
        minutosMedidos: 12,
        itemsRespondidos: 8,
        aciertos: 5,
        pendientes: [{ materia: "English", minutos: 25 }],
      }),
    ).toBe(
      [
        "Leo — miércoles 2 de septiembre",
        "Previsto 45 min · estudiado 12 min",
        "8 ítems, 5 aciertos",
        "Pendiente de hoy: English (25 min)",
      ].join("\n"),
    );
  });

  it("omite la línea de pendientes", () => {
    expect(
      textoDelParte({
        nombre: "Leo",
        fecha: "2026-09-02",
        minutosPrevistos: 45,
        minutosMedidos: 12,
        itemsRespondidos: 8,
        aciertos: 5,
        pendientes: [],
      }),
    ).toBe(
      [
        "Leo — miércoles 2 de septiembre",
        "Previsto 45 min · estudiado 12 min",
        "8 ítems, 5 aciertos",
      ].join("\n"),
    );
  });
});

describe("ventanaDelDia", () => {
  it("devuelve la ventana de La Paz", () => {
    expect(ventanaDelDia("2026-09-02")).toEqual({
      desde: "2026-09-02T00:00:00-04:00",
      hasta: "2026-09-03T00:00:00-04:00",
    });
  });
});

describe("esViolacionDeUnicidad", () => {
  it("distingue 23505", () => {
    expect(esViolacionDeUnicidad({ code: "23505" })).toBe(true);
    expect(esViolacionDeUnicidad({ code: "23514" })).toBe(false);
    expect(esViolacionDeUnicidad(null)).toBe(false);
    expect(esViolacionDeUnicidad(undefined)).toBe(false);
  });
});

describe("pendientesDelDia", () => {
  it("mezcla una lección hecha, una lección pendiente y una práctica respondida", () => {
    const tareas: Parameters<typeof pendientesDelDia>[0] = [
      {
        subjectId: "s1",
        materia: "English",
        tipo: "leccion",
        lessonId: "l1",
        skillId: null,
        minutos: 10,
      },
      {
        subjectId: "s1",
        materia: "English",
        tipo: "leccion",
        lessonId: "l2",
        skillId: null,
        minutos: 25,
      },
      {
        subjectId: "s2",
        materia: "Math",
        tipo: "practica",
        lessonId: null,
        skillId: "sk1",
        minutos: 15,
      },
    ];
    const eventos = [
      { event_type: "lesson_completed", lesson_id: "l1", skill_id: null },
      { event_type: "answer_submitted", lesson_id: null, skill_id: "sk1" },
    ];

    expect(pendientesDelDia(tareas, eventos)).toEqual([{ materia: "English", minutos: 25 }]);
  });
});
