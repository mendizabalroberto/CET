import { describe, expect, it } from "vitest";

import type { EventoCalendario } from "@cet/engine";
import type { NotaGuardada } from "./consultas";
import { hitoMasCercano, leerNotasCorregidas, leerPesos } from "./acciones.puras";

describe("hitoMasCercano", () => {
  it("elige las finales como hito cuando son el siguiente evento del calendario", () => {
    const calendario: EventoCalendario[] = [
      { desde: "2026-07-06", hasta: "2026-07-17", tipo: "vacaciones" },
      { desde: "2026-10-09", hasta: "2026-10-09", tipo: "feriado" },
      { desde: "2026-11-13", hasta: "2026-11-20", tipo: "examenes_finales" },
    ];

    expect(hitoMasCercano(calendario, "2026-09-02")).toEqual({
      hasta: "2026-11-13",
      hito: "examenes_finales",
    });
  });

  it("tambien toma un hito de Cambridge como limite de la ventana", () => {
    const calendario: EventoCalendario[] = [
      { desde: "2026-06-01", hasta: "2026-06-30", tipo: "vacaciones" },
      { desde: "2026-10-02", hasta: "2026-10-02", tipo: "hito_cambridge" },
      { desde: "2026-11-13", hasta: "2026-11-20", tipo: "examenes_finales" },
    ];

    expect(hitoMasCercano(calendario, "2026-09-02")).toEqual({
      hasta: "2026-10-02",
      hito: "hito_cambridge",
    });
  });

  it("sin hito a la vista, estira la ventana a hoy + 70 dias", () => {
    expect(hitoMasCercano([], "2026-09-02")).toEqual({
      hasta: "2026-11-11",
      hito: "",
    });
  });
});

describe("leerNotasCorregidas", () => {
  const actuales: NotaGuardada[] = [
    {
      materia: "English",
      code: "english",
      subject_id: "subject-1",
      nota: 88,
      banda: "well_done",
    },
    {
      materia: "Math",
      code: "math",
      subject_id: null,
      nota: 60,
      banda: "needs_improvement",
    },
  ];

  it("recalcula la banda con la nota corregida y conserva materia y subject", () => {
    const fd = new FormData();
    fd.set("nota:0", "95");
    fd.set("nota:1", "75");

    expect(leerNotasCorregidas(fd, actuales)).toEqual([
      {
        materia: "English",
        code: "english",
        subject_id: "subject-1",
        nota: 95,
        banda: "outstanding",
      },
      {
        materia: "Math",
        code: "math",
        subject_id: null,
        nota: 75,
        banda: "good",
      },
    ]);
  });

  it("devuelve null si alguna nota no es un entero entre 0 y 100", () => {
    const fd = new FormData();
    fd.set("nota:0", "95");
    fd.set("nota:1", "101");

    expect(leerNotasCorregidas(fd, actuales)).toBeNull();
  });
});

describe("leerPesos", () => {
  it("acepta un reparto valido que suma 1", () => {
    expect(leerPesos('{"math": 0.4, "science": 0.3, "spanish": 0.3}')).toEqual({
      math: 0.4,
      science: 0.3,
      spanish: 0.3,
    });
  });

  it("rechaza claves que no son materias", () => {
    expect(leerPesos('{"art": 1}')).toBeNull();
  });

  it("rechaza una suma distinta de 1", () => {
    expect(leerPesos('{"math": 0.6, "science": 0.6}')).toBeNull();
  });
});
