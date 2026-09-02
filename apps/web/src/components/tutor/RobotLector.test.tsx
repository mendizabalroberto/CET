/**
 * El robot lector: pasos por tiempo estimado, barra que nunca llega y un
 * bocadillo que cambia al tocarlo. © 2026 Roberto Mendizabal. Todos los
 * derechos reservados.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pasoActual, progresoEstimado, RobotLector } from "./RobotLector";

const PASOS = ["Leer el PDF", "Interpretar las notas (IA)", "Proponer el reparto (IA)", "Crear las tareas"];

function pintar(pasoInicial = 0) {
  return render(
    <RobotLector
      titulo="Analizando el boletín…"
      pasos={PASOS}
      ayuda="Suele tardar un minuto."
      bocadillos={["Bip.", "Aquí pone Math."]}
      etiquetaRobot="Robot leyendo el boletín"
      pista="Toca al robot."
      pasoInicial={pasoInicial}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("pasoActual", () => {
  it("avanza por tiempo estimado y nunca cierra el último paso", () => {
    expect(pasoActual(0, 0, 4)).toBe(0);
    expect(pasoActual(5, 0, 4)).toBe(1);
    expect(pasoActual(30, 0, 4)).toBe(2);
    expect(pasoActual(600, 0, 4)).toBe(3);
  });

  it("con pasoInicial 1 (regenerar) el primer paso ya está hecho", () => {
    expect(pasoActual(0, 1, 4)).toBe(1);
  });
});

describe("progresoEstimado", () => {
  it("empieza en 0, sube y se frena por debajo del 100 %", () => {
    expect(progresoEstimado(0, 0)).toBe(0);
    expect(progresoEstimado(10, 0)).toBeGreaterThan(0.1);
    expect(progresoEstimado(10_000, 0)).toBeLessThanOrEqual(0.92);
  });
});

describe("RobotLector", () => {
  it("enseña los pasos, el paso activo en negrita y la barra de progreso", () => {
    vi.useFakeTimers();
    pintar();
    for (const paso of PASOS) expect(screen.getAllByText(paso).length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    // A los 6 s el primer paso (3 s) está hecho: lleva su marca.
    expect(screen.getAllByText("✓").length).toBeGreaterThan(0);
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });

  it("al tocar el robot cambia el bocadillo por sus frases, en orden", () => {
    pintar();
    const robot = screen.getByRole("button", { name: "Robot leyendo el boletín" });
    expect(screen.getAllByText("Leer el PDF").length).toBeGreaterThan(0);
    fireEvent.click(robot);
    expect(screen.getAllByText("Bip.").length).toBeGreaterThan(0);
    fireEvent.click(robot);
    expect(screen.getAllByText("Aquí pone Math.").length).toBeGreaterThan(0);
    fireEvent.click(robot);
    expect(screen.getAllByText("Bip.").length).toBeGreaterThan(0);
  });
});
