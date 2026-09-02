import { describe, expect, it } from "vitest";

import type { EventoCalendario } from "@cet/engine";
import type { NotaGuardada } from "./consultas";
import {
  hitoMasCercano,
  leerIdsDeCancelacion,
  leerIdsDeDescarte,
  leerNotasCorregidas,
  leerPesos,
  leerPesosEditados,
} from "./acciones.puras";

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

  it("estira el hasta hasta el examen del alumno si cae despues del hito del calendario", () => {
    const calendario: EventoCalendario[] = [
      { desde: "2026-11-13", hasta: "2026-11-20", tipo: "examenes_finales" },
    ];
    expect(
      hitoMasCercano(calendario, "2026-09-02", [{ fecha: "2026-12-01" }]),
    ).toEqual({ hasta: "2026-12-01", hito: "examen_del_alumno" });
  });

  it("no toca el hasta si el examen del alumno cae antes o el mismo dia del hito", () => {
    const calendario: EventoCalendario[] = [
      { desde: "2026-11-13", hasta: "2026-11-20", tipo: "examenes_finales" },
    ];
    expect(
      hitoMasCercano(calendario, "2026-09-02", [{ fecha: "2026-10-01" }, { fecha: "2026-11-13" }]),
    ).toEqual({ hasta: "2026-11-13", hito: "examenes_finales" });
  });

  it("ignora examenes del alumno que ya pasaron", () => {
    expect(hitoMasCercano([], "2026-09-02", [{ fecha: "2026-08-01" }])).toEqual({
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

describe("leerPesosEditados", () => {
  it("acepta porcentajes enteros que suman 100 y los normaliza a fracciones", () => {
    expect(leerPesosEditados('{"math": 40, "science": 30, "spanish": 30}')).toEqual({
      math: 0.4,
      science: 0.3,
      spanish: 0.3,
    });
  });

  it("rechaza una suma que se aleja de 100 en más de 1", () => {
    expect(leerPesosEditados('{"math": 50, "science": 40}')).toBeNull();
  });

  it("rechaza claves que no son materias con contenido", () => {
    expect(leerPesosEditados('{"art": 100}')).toBeNull();
  });

  it("rechaza un porcentaje que no es entero", () => {
    expect(leerPesosEditados('{"math": 60.5, "science": 39.5}')).toBeNull();
  });
});

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("leerIdsDeCancelacion", () => {
  it("con dos UUID validos devuelve el par", () => {
    const fd = new FormData();
    fd.set("planId", UUID_A);
    fd.set("studentId", UUID_B);

    expect(leerIdsDeCancelacion(fd)).toEqual({ planId: UUID_A, studentId: UUID_B });
  });

  it("devuelve null si un id esta vacio", () => {
    const fd = new FormData();
    fd.set("planId", "");
    fd.set("studentId", UUID_B);

    expect(leerIdsDeCancelacion(fd)).toBeNull();
  });

  it("devuelve null si un id no es un UUID", () => {
    const fd = new FormData();
    fd.set("planId", "no-es-un-uuid");
    fd.set("studentId", UUID_B);

    expect(leerIdsDeCancelacion(fd)).toBeNull();
  });

  it("devuelve null si falta un campo", () => {
    const fd = new FormData();
    fd.set("planId", UUID_A);

    expect(leerIdsDeCancelacion(fd)).toBeNull();
  });
});

describe("leerIdsDeDescarte", () => {
  it("con dos UUID validos devuelve el par", () => {
    const fd = new FormData();
    fd.set("boletinId", UUID_A);
    fd.set("studentId", UUID_B);

    expect(leerIdsDeDescarte(fd)).toEqual({ boletinId: UUID_A, studentId: UUID_B });
  });

  it("devuelve null si un id esta vacio", () => {
    const fd = new FormData();
    fd.set("boletinId", UUID_A);
    fd.set("studentId", "");

    expect(leerIdsDeDescarte(fd)).toBeNull();
  });

  it("devuelve null si un id no es un UUID", () => {
    const fd = new FormData();
    fd.set("boletinId", "no-es-un-uuid");
    fd.set("studentId", UUID_B);

    expect(leerIdsDeDescarte(fd)).toBeNull();
  });

  it("devuelve null si falta un campo", () => {
    const fd = new FormData();
    fd.set("studentId", UUID_B);

    expect(leerIdsDeDescarte(fd)).toBeNull();
  });
});
