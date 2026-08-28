/**
 * @cet/ui — INVARIANTE DE FAMILIA: los disparadores de los paneles de feedback
 * usan el `Button` del design system, no botones escritos a mano.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Habia cuatro botones seguidos en la pantalla de practica con tres
 * implementaciones distintas: dos venian de `Button` y dos se los escribio a
 * mano cada panel. El resultado media distinto (px-4 frente a px-5, border-2
 * frente a border) y uno de los cuatro tenia un contorno ambar que no cumplia
 * el minimo de contraste de WCAG (2.04:1 frente al 3:1 que pide SC 1.4.11).
 *
 * Este test fija el contrato: los disparadores son `Button` `secondary`, el
 * ambar deja de ser contorno de control y pasa a ser un punto decorativo
 * dentro del boton, y el cableado ARIA sobrevive al cambio.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "../src/lib/i18n.js";
import { Button } from "../src/primitives/Button.js";
import { HintPanel } from "../src/feedback/HintPanel.js";
import { SolutionPanel } from "../src/feedback/SolutionPanel.js";

const SRC = join(process.cwd(), "src");

function leerFuente(relativa: string): string {
  const ruta = join(SRC, relativa);
  const texto = readFileSync(ruta, "utf8");
  expect(texto.length).toBeGreaterThan(500);
  return texto;
}

describe("paleta de botones — los paneles usan Button", () => {
  it("HintPanel y SolutionPanel no contienen '<button' en su fuente", () => {
    const hint = leerFuente("feedback/HintPanel.tsx");
    const solution = leerFuente("feedback/SolutionPanel.tsx");
    expect(hint).not.toContain("<button");
    expect(solution).not.toContain("<button");
  });

  it("el disparador de HintPanel lleva las clases de Button md (px-5, sin px-4 ni border-2)", () => {
    render(
      <LocaleProvider locale="es">
        <HintPanel html="<p>pista</p>" open={false} onOpenChange={() => {}} />
      </LocaleProvider>,
    );
    const boton = screen.getByRole("button", { name: "Ver una pista" });
    expect(boton.className).toContain("px-5");
    expect(boton.className).not.toContain("px-4");
    expect(boton.className).not.toContain("border-2");
  });

  it("el disparador de SolutionPanel lleva las clases de Button md (px-5, sin px-4 ni border-2)", () => {
    render(
      <LocaleProvider locale="es">
        <SolutionPanel html="<p>sol</p>" open={false} onOpenChange={() => {}} />
      </LocaleProvider>,
    );
    const boton = screen.getByRole("button", { name: "Ver cómo se hace" });
    expect(boton.className).toContain("px-5");
    expect(boton.className).not.toContain("px-4");
    expect(boton.className).not.toContain("border-2");
  });
});

describe("paleta de botones — cromado identico", () => {
  it("Button secondary, disparador de HintPanel y de SolutionPanel comparten className", () => {
    const { container: c1 } = render(
      <LocaleProvider locale="es">
        <Button variant="secondary">base</Button>
      </LocaleProvider>,
    );
    const base = c1.querySelector("button")!.className;

    const { container: c2 } = render(
      <LocaleProvider locale="es">
        <HintPanel html="<p>pista</p>" open={false} onOpenChange={() => {}} />
      </LocaleProvider>,
    );
    const hint = c2.querySelector("button")!.className;

    const { container: c3 } = render(
      <LocaleProvider locale="es">
        <SolutionPanel html="<p>sol</p>" open={false} onOpenChange={() => {}} />
      </LocaleProvider>,
    );
    const solution = c3.querySelector("button")!.className;

    // Los paneles anaden w-fit para no estirarse; lo que se compara es el
    // cromado: quitamos w-fit de los paneles antes de comparar.
    const sinFit = (cls: string) => cls.replace(/\s*w-fit\s*/g, " ").trim();
    expect(sinFit(hint)).toBe(base);
    expect(sinFit(solution)).toBe(base);
  });
});

describe("paleta de botones — el ambar deja de ser contorno", () => {
  it("ni HintPanel ni SolutionPanel usan border-[var(--cet-hint-accent)]", () => {
    const hint = leerFuente("feedback/HintPanel.tsx");
    const solution = leerFuente("feedback/SolutionPanel.tsx");
    expect(hint).not.toContain("border-[var(--cet-hint-accent)]");
    expect(solution).not.toContain("border-[var(--cet-hint-accent)]");
  });

  /*
   * Este test cambio de FORMA, no de REQUISITO, y conviene que quede escrito.
   *
   * Cuando obs001 retiro el ambar del contorno del boton —2.04:1, por debajo
   * del 3:1 que pide WCAG 1.4.11— la identidad de «pista» se traslado a un
   * PUNTO ambar de 8 px dentro del boton, y este test lo fijaba clase a clase.
   *
   * Al llegar los iconos, ese punto paso a ser una BOMBILLA ambar. El requisito
   * es el mismo y de hecho se cumple mejor: la senal ya no es solo un color,
   * tiene forma. Lo que se afloja aqui es la forma concreta; lo que se conserva,
   * y es lo unico que de verdad importaba, es que:
   *
   *   1. el disparador de la pista lleva una marca ambar propia,
   *   2. invisible para el lector de pantalla, y
   *   3. el ambar NO es el contorno del control (eso lo fija el test de arriba).
   *
   * Si alguien quita la marca ambar del boton, esto se pone rojo igual que
   * antes. Que es la razon por la que el test existe.
   */
  it("el disparador de la pista lleva una marca ambar propia y decorativa", () => {
    render(
      <LocaleProvider locale="es">
        <HintPanel html="<p>pista</p>" open={false} onOpenChange={() => {}} />
      </LocaleProvider>,
    );
    const boton = screen.getByRole("button", { name: "Ver una pista" });

    const marcas = [...boton.querySelectorAll('[aria-hidden="true"]')].filter((el) =>
      /--cet-hint-vivid/.test(el.getAttribute("class") ?? ""),
    );
    expect(
      marcas,
      "el boton de la pista se quedo sin su marca ambar: la unica senal que lo " +
        "distingue de «Ver como se hace» seria la palabra",
    ).toHaveLength(1);

    // Y sigue sin anunciarse: el nombre accesible es solo el texto.
    expect(boton).toHaveAccessibleName("Ver una pista");
  });

  it("el cuerpo del panel conserva su borde izquierdo ambar", () => {
    const hint = leerFuente("feedback/HintPanel.tsx");
    expect(hint).toContain("border-l-[var(--cet-hint-accent)]");
    expect(hint).toContain("bg-[var(--cet-hint-bg)]");
  });
});

describe("paleta de botones — ARIA y comportamiento", () => {
  it("el disparador cablea aria-expanded, aria-controls y onOpenChange", async () => {
    const user = userEvent.setup();
    let abierto = false;
    const { rerender } = render(
      <LocaleProvider locale="es">
        <HintPanel html="<p>pista</p>" open={abierto} onOpenChange={(v) => { abierto = v; }} />
      </LocaleProvider>,
    );
    const boton = screen.getByRole("button", { name: "Ver una pista" });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    const panelId = boton.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();

    await user.click(boton);
    expect(abierto).toBe(true);

    rerender(
      <LocaleProvider locale="es">
        <HintPanel html="<p>pista</p>" open={abierto} onOpenChange={(v) => { abierto = v; }} />
      </LocaleProvider>,
    );
    expect(screen.getByRole("button", { name: "Pista" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("paleta de botones — part separa disparador y cuerpo", () => {
  it("part='trigger' y part='panel' comparten el id y el aria-controls apunta al cuerpo", () => {
    const id = "mi-panel";
    const { container } = render(
      <LocaleProvider locale="es">
        <div>
          <HintPanel part="trigger" id={id} html="<p>pista</p>" open onOpenChange={() => {}} />
        </div>
        <div>
          <HintPanel part="panel" id={id} html="<p>pista</p>" open onOpenChange={() => {}} />
        </div>
      </LocaleProvider>,
    );
    const boton = container.querySelector("button")!;
    expect(boton.getAttribute("aria-controls")).toBe(`${id}-hint`);
    expect(document.getElementById(`${id}-hint`)).not.toBeNull();
  });

  it("part='trigger' y part='panel' en SolutionPanel comparten el id", () => {
    const id = "mi-sol";
    const { container } = render(
      <LocaleProvider locale="es">
        <div>
          <SolutionPanel part="trigger" id={id} html="<p>sol</p>" open onOpenChange={() => {}} />
        </div>
        <div>
          <SolutionPanel part="panel" id={id} html="<p>sol</p>" open onOpenChange={() => {}} />
        </div>
      </LocaleProvider>,
    );
    const boton = container.querySelector("button")!;
    expect(boton.getAttribute("aria-controls")).toBe(`${id}-solution`);
    expect(document.getElementById(`${id}-solution`)).not.toBeNull();
  });
});
