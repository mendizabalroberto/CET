/**
 * @cet/ui — INVARIANTE DE FAMILIA: la escalera y su rotulo heredan la tinta.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FAMILIA CAZA ESTE TEST
 * ===========================================================================
 * `MasteryLadder` con `showLabel` escribia la palabra del nivel con un token
 * fijo (`--cet-ink-muted`). El dibujo de al lado ya usaba `currentColor`, y su
 * cabecera explica por que: con un token fijo daba 2.9:1 dentro del chip activo.
 * La palabra tenia el mismo fallo que el dibujo tenia entonces: sobre los
 * lavados de materia de `/practice`, `--cet-ink-muted` mide entre 4.45:1 y
 * 4.51:1, por debajo del 4.5 de WCAG 1.4.3 en tres de los siete tonos.
 *
 * La cura no es otro token: es heredar. El contenedor es quien conoce su fondo
 * y quien ha medido su texto, asi que el color lo decide el. Este test falla si
 * alguien vuelve a fijar una tinta en el dibujo o en el rotulo, o si las dos
 * mitades del indicador se separan cromaticamente.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { MasteryLadder } from "../src/progress/MasteryLadder.js";

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });
const GRUPO = T("Comparar", "Compare");
const NIVEL = "solid";
const PALABRA = "Lo llevas bien";
const TINTA_DE_PRUEBA = "#123456";

/**
 * Pasea el DOM renderizado y exige que ninguna pieza fije una tinta.
 *
 * El dibujo legitimo usa `fill="none"` en los peldanos vacios: es la ausencia
 * de relleno, no una tinta, y por eso se permite. Lo que este test persigue es
 * que nadie vuelva a escribir `text-[var(--cet-...)]` en el rotulo ni un
 * `fill`/`stroke` con un color fijo en la escalera.
 */
function sinTintaFija(contenedor: HTMLElement): void {
  const elementos = Array.from(contenedor.querySelectorAll<Element>("[class]"));
  expect(elementos.length).toBeGreaterThan(0);
  for (const el of elementos) {
    const clase = el.getAttribute("class") ?? "";
    expect(
      clase,
      `<${el.tagName.toLowerCase()}> lleva una clase de color de tinta fija: ${clase}`,
    ).not.toMatch(/text-\[(?:color:)?var\(--cet-/);
  }

  const conTrazo = Array.from(contenedor.querySelectorAll("[fill], [stroke]"));
  expect(conTrazo.length).toBeGreaterThan(0);
  for (const el of conTrazo) {
    const fill = el.getAttribute("fill");
    const stroke = el.getAttribute("stroke");
    if (fill !== null) {
      expect(
        fill,
        `<${el.tagName.toLowerCase()}> fija un relleno que no es currentColor: ${fill}`,
      ).toMatch(/^(?:currentColor|none)$/);
    }
    if (stroke !== null) {
      expect(
        stroke,
        `<${el.tagName.toLowerCase()}> fija un trazo que no es currentColor: ${stroke}`,
      ).toBe("currentColor");
    }
  }
}

describe("MasteryLadder — la tinta se hereda, no se fija", () => {
  it("con showLabel, ni el dibujo ni el rotulo fijan una tinta", () => {
    const { container } = render(
      <LocaleProvider locale="es">
        <MasteryLadder level={NIVEL} groupLabel={GRUPO} showLabel />
      </LocaleProvider>,
    );
    sinTintaFija(container);
  });

  it("el color efectivo del rotulo y el del dibujo es el mismo", () => {
    const { container } = render(
      <LocaleProvider locale="es">
        <span style={{ color: TINTA_DE_PRUEBA }}>
          <MasteryLadder level={NIVEL} groupLabel={GRUPO} showLabel />
        </span>
      </LocaleProvider>,
    );
    const rotulo = container.querySelector('[aria-hidden="true"]');
    const dibujo = container.querySelector("svg");
    expect(rotulo).not.toBeNull();
    expect(dibujo).not.toBeNull();
    expect(getComputedStyle(rotulo as HTMLElement).color).toBe("rgb(18, 52, 86)");
    expect(getComputedStyle(dibujo as Element).color).toBe("rgb(18, 52, 86)");
  });

  it("sin showLabel no se escribe la palabra", () => {
    const { container } = render(
      <LocaleProvider locale="es">
        <MasteryLadder level={NIVEL} groupLabel={GRUPO} />
      </LocaleProvider>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    const palabras = Array.from(container.querySelectorAll("*")).filter(
      (n) => n.textContent === PALABRA && n.tagName.toLowerCase() !== "title",
    );
    expect(palabras).toHaveLength(0);
  });

  it("con level === null no se pinta nada, aunque se pida showLabel", () => {
    const { container } = render(
      <LocaleProvider locale="es">
        <MasteryLadder level={null} groupLabel={GRUPO} showLabel />
      </LocaleProvider>,
    );
    expect(container.innerHTML.trim()).toBe("");
  });
});
