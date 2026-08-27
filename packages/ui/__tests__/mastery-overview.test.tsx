/**
 * @cet/ui — MasteryOverview: la vista de conjunto, «como voy en general».
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo que este test fija, y por que cada cosa:
 *
 *  - Hay UNA columna por tema, tambien por los que aun no se han medido. Sin
 *    los no medidos el dibujo no responde la pregunta que justifica que exista:
 *    tres columnas altas no significan lo mismo si el total son cuatro temas o
 *    si son doce.
 *  - La altura crece con el nivel, y un tema sin medir va HUECO y muy por
 *    debajo del primer nivel: dos canales que no son el tono (invariante
 *    `estados-no-solo-color`). No lleva trazo discontinuo, a diferencia de los
 *    peldanos pendientes de `MasteryLadder`: a 4 px de alto un guion no se lee
 *    como contorno. El componente lo explica.
 *  - Sin NINGUN tema medido no se pinta nada. Una fila de columnas vacias es
 *    una medida de cero, y cero no es ausencia.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { MasteryOverview } from "../src/progress/MasteryOverview.js";
import type { MasteryLevel } from "../src/data/mastery-level.js";

const RESUMEN = { es: "Has medido 2 de 4 temas.", en: "You have measured 2 of 4 topics." };

function pintar(levels: readonly (MasteryLevel | null)[], resumen = RESUMEN) {
  return render(
    <LocaleProvider locale="es">
      <MasteryOverview levels={levels} summary={resumen} />
    </LocaleProvider>,
  );
}

/** Las columnas del dibujo, en el orden en que se pintan. */
function columnas(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect"));
}

describe("MasteryOverview", () => {
  it("pinta una columna por tema, tambien por los que aun no se han medido", () => {
    const { container } = pintar(["mastered", null, "learning", null]);
    expect(columnas(container)).toHaveLength(4);
  });

  it("la columna es mas alta cuanto mas alto es el nivel", () => {
    const { container } = pintar(["starting", "learning", "solid", "mastered"]);
    const alturas = columnas(container).map((r) => Number(r.getAttribute("height")));
    expect(alturas).toHaveLength(4);
    for (let i = 1; i < alturas.length; i += 1) {
      expect(alturas[i], `la columna ${i} no es mas alta que la ${i - 1}`).toBeGreaterThan(
        alturas[i - 1] as number,
      );
    }
  });

  it("un tema sin medir se distingue por la forma y por la altura, no por el tono", () => {
    // Dos canales que no son el color: hueco contra macizo, y mas bajo que
    // cualquier nivel. Las columnas se ordenan por altura, asi que se localizan
    // por el relleno y no por la posicion de entrada.
    const { container } = pintar(["starting", null]);
    const medido = columnas(container).find((r) => r.getAttribute("fill") === "currentColor");
    const sinMedir = columnas(container).find((r) => r.getAttribute("fill") === "none");
    expect(medido).toBeDefined();
    expect(sinMedir).toBeDefined();
    expect(Number(sinMedir?.getAttribute("height"))).toBeLessThan(
      Number(medido?.getAttribute("height")),
    );
  });

  it("el tocon de un tema sin medir no puede confundirse con el nivel mas bajo", () => {
    // Si el tocon midiera casi lo mismo que «empezando», el dibujo diria que a
    // ese tema le falta poco, y lo que pasa es que no se ha medido.
    const { container } = pintar(["starting", null]);
    const alturas = columnas(container).map((r) => Number(r.getAttribute("height")));
    const [tocon, primerNivel] = [Math.min(...alturas), Math.max(...alturas)];
    expect(tocon * 2).toBeLessThan(primerNivel);
  });

  it("sin ningun tema medido no pinta NADA: cero no es ausencia", () => {
    const { container } = pintar([null, null, null]);
    expect(container.innerHTML.trim()).toBe("");
  });

  it("sin temas tampoco pinta nada (no se inventa un eje vacio)", () => {
    const { container } = pintar([]);
    expect(container.innerHTML.trim()).toBe("");
  });

  it("el nombre accesible es el resumen que le pasan, en el idioma activo", () => {
    pintar(["mastered", null]);
    expect(screen.getByRole("img", { name: RESUMEN.es })).toBeTruthy();
  });

  it("el resumen tambien esta escrito: quien no cuenta columnas lo lee", () => {
    const { container } = pintar(["mastered", null]);
    expect(container.textContent).toContain(RESUMEN.es);
  });
});
