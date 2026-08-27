/**
 * @cet/ui — fracciones accesibles.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { FractionText } from "../src/learning/FractionText.js";
import { MathStem } from "../src/learning/MathStem.js";
import { fractionToWords } from "../src/lib/fraction-words.js";

function renderEs(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

function renderEn(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="en">{node}</LocaleProvider>);
}

describe("fractionToWords", () => {
  it("nombra las fracciones comunes en espanol", () => {
    expect(fractionToWords({ numerator: 3, denominator: 4 }, "es")).toBe("tres cuartos");
    expect(fractionToWords({ numerator: 1, denominator: 2 }, "es")).toBe("un medio");
    expect(fractionToWords({ numerator: 1, denominator: 4 }, "es")).toBe("un cuarto");
    expect(fractionToWords({ numerator: 2, denominator: 3 }, "es")).toBe("dos tercios");
    expect(fractionToWords({ numerator: 7, denominator: 10 }, "es")).toBe("siete decimos");
  });

  it("nombra las fracciones comunes en ingles", () => {
    expect(fractionToWords({ numerator: 3, denominator: 4 }, "en")).toBe("three quarters");
    expect(fractionToWords({ numerator: 1, denominator: 2 }, "en")).toBe("one half");
    expect(fractionToWords({ numerator: 2, denominator: 3 }, "en")).toBe("two thirds");
    expect(fractionToWords({ numerator: 5, denominator: 8 }, "en")).toBe("five eighths");
  });

  it("nombra los numeros mixtos", () => {
    expect(fractionToWords({ whole: 2, numerator: 1, denominator: 5 }, "es")).toBe("dos y un quinto");
    expect(fractionToWords({ whole: 2, numerator: 1, denominator: 5 }, "en")).toBe("two and one fifth");
  });

  it("degrada a 'partido por' cuando el denominador no tiene nombre", () => {
    expect(fractionToWords({ numerator: 3, denominator: 17 }, "es")).toBe("tres partido por diecisiete");
    expect(fractionToWords({ numerator: 3, denominator: 17 }, "en")).toBe("three over seventeen");
  });

  it("marca el signo negativo", () => {
    expect(fractionToWords({ numerator: -3, denominator: 4 }, "es")).toBe("menos tres cuartos");
  });

  it("no revienta con denominador cero", () => {
    expect(fractionToWords({ numerator: 1, denominator: 0 }, "es")).toContain("partido por");
  });
});

describe("FractionText", () => {
  it("se anuncia como fraccion, no como dos numeros sueltos", () => {
    renderEs(<FractionText numerator={3} denominator={4} />);
    expect(screen.getByRole("img", { name: "tres cuartos" })).toBeInTheDocument();
  });

  it("cambia de idioma con el proveedor", () => {
    renderEn(<FractionText numerator={3} denominator={4} />);
    expect(screen.getByRole("img", { name: "three quarters" })).toBeInTheDocument();
  });

  it("oculta los digitos al lector para no leerlos dos veces", () => {
    const { container } = renderEs(<FractionText numerator={3} denominator={4} />);
    const inner = container.querySelector(".cet-fraction");
    expect(inner).toHaveAttribute("aria-hidden", "true");
  });

  it("admite un texto accesible propio", () => {
    renderEs(<FractionText numerator={22} denominator={7} ariaLabel="pi aproximado" />);
    expect(screen.getByRole("img", { name: "pi aproximado" })).toBeInTheDocument();
  });

  it("no produce violaciones de accesibilidad", async () => {
    const { container } = renderEs(<FractionText numerator={3} denominator={4} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("MathStem", () => {
  it("convierte las fracciones apiladas de Y6A en fracciones accesibles", () => {
    renderEs(
      <MathStem html={'Suma <span class="f"><span class="a">3</span><span class="b">4</span></span> y 1'} />,
    );
    expect(screen.getByRole("img", { name: "tres cuartos" })).toBeInTheDocument();
  });

  it("sanea el enunciado antes de pintarlo", () => {
    const { container } = renderEs(<MathStem html={'<img src=x onerror="alert(1)">Calcula 2 + 2'} />);
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.textContent).toContain("Calcula 2 + 2");
  });

  it("no ejecuta scripts inyectados en el enunciado", () => {
    const { container } = renderEs(<MathStem html={"<script>alert(1)</script>2 + 2"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("2 + 2");
  });

  it("conserva el formato del enunciado", () => {
    const { container } = renderEs(<MathStem html={"H<sub>2</sub>O y 5<sup>2</sup>"} />);
    expect(container.querySelector("sub")).not.toBeNull();
    expect(container.querySelector("sup")).not.toBeNull();
  });
});
