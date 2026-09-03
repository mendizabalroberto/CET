/**
 * El calendario semanal: semanas de lunes a domingo, navegación acotada al
 * plan y la marca de hecha. © 2026 Roberto Mendizabal. Todos los derechos
 * reservados.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DiaDelCalendario } from "@/lib/plan/consultas";

import { CalendarioSemanal, lunesDe, sumarDiasIso } from "./CalendarioSemanal";

const TEXTOS = {
  title: "Calendario",
  previous: "Anterior",
  next: "Siguiente",
  free: "Libre",
  outside: "Fuera",
  lesson: "Lección",
  practice: "Práctica",
  minutes: "{count} min",
  studied: "Estudió {studied} de {planned}",
  done: "Hecha",
  weekOf: "Del {from} al {to}",
};

const fmt = (plantilla: string, valores: Record<string, string | number>) =>
  plantilla.replace(/\{(\w+)\}/g, (_, k: string) => String(valores[k] ?? ""));

const DIAS: DiaDelCalendario[] = [
  {
    fecha: "2026-09-02",
    minutos: 40,
    tareas: [
      { id: "a", ord: 0, code: "math", tipo: "leccion", titulo: "Fracciones", minutos: 20, hecha: true },
      { id: "b", ord: 1, code: "english", tipo: "practica", titulo: "Present simple", minutos: 20, hecha: false },
    ],
  },
  {
    fecha: "2026-09-10",
    minutos: 15,
    tareas: [{ id: "c", ord: 0, code: "science", tipo: "leccion", titulo: "Circuitos", minutos: 15, hecha: false }],
  },
];

afterEach(cleanup);

describe("lunesDe / sumarDiasIso", () => {
  it("el lunes de un miércoles es dos días antes, y el de un domingo seis", () => {
    expect(lunesDe("2026-09-02")).toBe("2026-08-31");
    expect(lunesDe("2026-09-06")).toBe("2026-08-31");
    expect(lunesDe("2026-08-31")).toBe("2026-08-31");
    expect(sumarDiasIso("2026-08-31", 7)).toBe("2026-09-07");
  });
});

describe("CalendarioSemanal", () => {
  it("abre en la semana de hoy, enseña las tareas y la marca de hecha", () => {
    render(
      <CalendarioSemanal
        dias={DIAS}
        partes={[{ fecha: "2026-09-02", minutosPrevistos: 40, minutosMedidos: 33, itemsRespondidos: 5, aciertos: 4, enviadoAt: null }]}
        hoy="2026-09-02"
        locale="es"
        nombrePorCode={new Map([["math", "Matemática"]])}
        textos={TEXTOS}
        fmt={fmt}
      />,
    );
    expect(screen.getByText("Fracciones")).toBeInTheDocument();
    expect(screen.getByLabelText("Hecha")).toBeInTheDocument();
    expect(screen.getByText("Estudió 33 de 40")).toBeInTheDocument();
    expect(screen.getAllByText("Libre").length).toBeGreaterThan(0);
    expect(screen.queryByText("Circuitos")).not.toBeInTheDocument();
  });

  it("navega a la semana siguiente y no pasa del final del plan", () => {
    render(
      <CalendarioSemanal
        dias={DIAS}
        partes={[]}
        hoy="2026-09-02"
        locale="es"
        nombrePorCode={new Map()}
        textos={TEXTOS}
        fmt={fmt}
      />,
    );
    const anterior = screen.getByRole("button", { name: "Anterior" });
    const siguiente = screen.getByRole("button", { name: "Siguiente" });
    expect(anterior).toBeDisabled();
    fireEvent.click(siguiente);
    expect(screen.getByText("Circuitos")).toBeInTheDocument();
    expect(siguiente).toBeDisabled();
  });
});
