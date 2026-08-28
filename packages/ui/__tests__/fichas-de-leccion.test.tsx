/**
 * @cet/ui — la ficha de lección dice el estado sin usar el color.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Hermano de `estados-no-solo-color.test.tsx` y de `identidad-de-materia.test.tsx`,
 * y por la misma razón: en deuteranopia el verde y el rojo de esta paleta son
 * el mismo color (1.29:1, medido en la sección ACENTO VIVO de `tokens.css`).
 * Una ficha que distinga «terminada» de «sin empezar» sólo con la tinta se ve
 * perfecta en el monitor de quien la escribió y no dice nada a uno de cada doce
 * niños varones.
 *
 * Lo que aquí se comprueba, y por qué cada cosa:
 *
 *  - las tres geometrías son distintas de verdad, no el mismo dibujo repintado;
 *  - el nombre accesible de la ficha lleva el título Y el estado, porque el
 *    glifo es forma pero no es texto, y el lector de pantalla sólo oye texto;
 *  - `minutes: null` no inventa un «0», que se leería como una lección de cero
 *    minutos en vez de como un dato que no consta;
 *  - un módulo vacío lo dice con palabras: una lista de cero elementos es
 *    indistinguible de una que no ha cargado;
 *  - el área táctil declarada no baja de `--cet-touch-min`, que es el mínimo de
 *    2.5.5 y lo que hace falta con un dedo sobre un portátil táctil.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";

import { LocaleProvider } from "../src/lib/i18n.js";
import { LessonTile, type LessonState, type LessonTileProps } from "../src/navigation/LessonTile.js";
import { ModuleSection } from "../src/navigation/ModuleSection.js";

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });

const ESTADOS: Readonly<Record<LessonState, { es: string; en: string }>> = {
  not_started: T("Sin empezar", "Not started"),
  started: T("En marcha", "In progress"),
  completed: T("Terminada", "Completed"),
};

const VACIO = T("Este modulo todavia no tiene lecciones", "This module has no lessons yet");

function wrap(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

function ficha(state: LessonState, extra?: Partial<LessonTileProps>): LessonTileProps {
  return {
    title: "Fracciones equivalentes",
    href: `/learn/leccion/${state}`,
    state,
    minutes: 12,
    minutesLabel: T("12 minutos", "12 minutes"),
    stateLabel: ESTADOS[state],
    ...extra,
  };
}

/** La geometría que percibe quien no distingue los colores. Sin `class` a propósito. */
function siluetaDe(el: HTMLElement): string {
  return Array.from(el.querySelectorAll("path,circle,polygon,rect,line"))
    .map(
      (n) =>
        `${n.tagName}:${n.getAttribute("d") ?? ""}:${n.getAttribute("points") ?? ""}:` +
        `${n.getAttribute("fill") ?? ""}`,
    )
    .join("|");
}

describe("LessonTile — el estado no se señala sólo con el color", () => {
  it("cada estado dibuja una geometría distinta, no el mismo glifo repintado", () => {
    const siluetas = new Map<LessonState, string>();
    for (const state of Object.keys(ESTADOS) as LessonState[]) {
      const { container, unmount } = wrap(<LessonTile {...ficha(state)} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      siluetas.set(state, siluetaDe(svg as unknown as HTMLElement));
      unmount();
    }
    expect(
      new Set(siluetas.values()).size,
      `Geometrías repetidas entre estados: ${JSON.stringify([...siluetas])}`,
    ).toBe(siluetas.size);
  });

  it("ninguna geometría de estado está vacía (un glifo ausente no es un canal)", () => {
    for (const state of Object.keys(ESTADOS) as LessonState[]) {
      const { container, unmount } = wrap(<LessonTile {...ficha(state)} />);
      expect(siluetaDe(container.querySelector("svg") as unknown as HTMLElement).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it.each(Object.keys(ESTADOS) as LessonState[])(
    "el nombre accesible de la ficha (%s) lleva el título y el estado",
    (state) => {
      wrap(<LessonTile {...ficha(state)} />);
      const enlace = screen.getByRole("link");
      const nombre = enlace.getAttribute("aria-label") ?? (enlace.textContent ?? "");
      expect(nombre).toContain("Fracciones equivalentes");
      expect(nombre).toContain(ESTADOS[state].es);
    },
  );

  it("la ficha entera es un enlace, no un div con manejador", () => {
    const { container } = wrap(<LessonTile {...ficha("started")} />);
    const enlace = screen.getByRole("link");
    expect(enlace.tagName).toBe("A");
    expect(enlace).toHaveAttribute("href", "/learn/leccion/started");
    // El enlace es la raíz: todo lo que hay dentro de la ficha es pulsable.
    expect(container.firstElementChild).toBe(enlace);
    expect(within(enlace).getByText("Fracciones equivalentes")).toBeInTheDocument();
  });

  it("el estado viaja también en el marcado, no sólo en la tinta", () => {
    wrap(<LessonTile {...ficha("completed")} />);
    expect(screen.getByRole("link")).toHaveAttribute("data-state", "completed");
  });

  it("`started` es un estado propio y no se confunde con `not_started`", () => {
    const { container: a, unmount } = wrap(<LessonTile {...ficha("not_started")} />);
    const sinEmpezar = siluetaDe(a.querySelector("svg") as unknown as HTMLElement);
    unmount();
    const { container: b } = wrap(<LessonTile {...ficha("started")} />);
    expect(siluetaDe(b.querySelector("svg") as unknown as HTMLElement)).not.toBe(sinEmpezar);
  });
});

describe("LessonTile — los minutos", () => {
  it("con minutos, la cifra se ve y el lector oye la etiqueta traducida", () => {
    wrap(<LessonTile {...ficha("started")} />);
    const enlace = screen.getByRole("link");
    expect(enlace.textContent ?? "").toContain("12");
    expect(enlace.textContent ?? "").toContain("12 minutos");
  });

  it("con `minutes: null` no aparece ninguna cifra, ni un «0 min»", () => {
    wrap(
      <LessonTile
        {...ficha("not_started", { minutes: null, minutesLabel: undefined })}
        title="Sumar decimas"
      />,
    );
    const texto = screen.getByRole("link").textContent ?? "";
    expect(texto).not.toMatch(/\d/);
    expect(texto).not.toMatch(/0/);
  });
});

describe("LessonTile — área táctil", () => {
  /** `vitest.config.ts` vive en la raíz del paquete, así que cwd es `packages/ui`. */
  const tokens = readFileSync(join(process.cwd(), "src", "tokens.css"), "utf8");

  it("`--cet-touch-min` no baja de 44 px", () => {
    const m = /--cet-touch-min:\s*(\d+(?:\.\d+)?)px/.exec(tokens);
    expect(m, "el token --cet-touch-min tiene que existir en tokens.css").not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(44);
  });

  it("la ficha declara ese mínimo como alto, y no un valor suelto", () => {
    wrap(<LessonTile {...ficha("completed")} />);
    const clases = screen.getByRole("link").className.split(/\s+/);
    expect(clases).toContain("min-h-touch");
    // Un px a pelo aquí sería una segunda fuente de verdad para el mismo número.
    expect(clases.some((c) => /^min-h-\[\d/.test(c))).toBe(false);
  });
});

describe("ModuleSection", () => {
  const LECCIONES: readonly LessonTileProps[] = [
    ficha("completed"),
    { ...ficha("started"), title: "Comparar fracciones" },
    { ...ficha("not_started"), title: "Fracciones impropias", minutes: null, minutesLabel: undefined },
  ];

  it("es una región con nombre: el módulo se localiza sin recorrer su contenido", () => {
    wrap(
      <ModuleSection
        title="Fracciones"
        ord={3}
        ordLabel={T("Modulo 3", "Unit 3")}
        emptyLabel={VACIO}
        lessons={LECCIONES}
      />,
    );
    const region = screen.getByRole("region", { name: /Modulo 3.*Fracciones/s });
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);
  });

  it("pinta una ficha por lección, cada una con su enlace", () => {
    wrap(
      <ModuleSection
        title="Fracciones"
        ord={3}
        ordLabel={T("Modulo 3", "Unit 3")}
        emptyLabel={VACIO}
        lessons={LECCIONES}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("el número del módulo no se anuncia dos veces", () => {
    const { container } = wrap(
      <ModuleSection
        title="Fracciones"
        ord={3}
        ordLabel={T("Modulo 3", "Unit 3")}
        emptyLabel={VACIO}
        lessons={LECCIONES}
      />,
    );
    const cifra = container.querySelector('[aria-hidden="true"].rounded-pill');
    expect(cifra?.textContent).toBe("3");
  });

  it("un módulo sin lecciones lo dice, y no pinta una lista vacía", () => {
    wrap(
      <ModuleSection
        title="Decimales"
        ord={4}
        ordLabel={T("Modulo 4", "Unit 4")}
        emptyLabel={VACIO}
        lessons={[]}
      />,
    );
    expect(screen.getByText(VACIO.es)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("axe", () => {
  it("una sección con los tres estados no tiene ninguna violación", async () => {
    const { container } = wrap(
      <ModuleSection
        title="Fracciones"
        ord={1}
        ordLabel={T("Modulo 1", "Unit 1")}
        emptyLabel={VACIO}
        lessons={[
          ficha("not_started"),
          { ...ficha("started"), title: "Comparar fracciones" },
          { ...ficha("completed"), title: "Fracciones impropias" },
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("un módulo vacío tampoco", async () => {
    const { container } = wrap(
      <ModuleSection
        title="Decimales"
        ord={2}
        ordLabel={T("Modulo 2", "Unit 2")}
        emptyLabel={VACIO}
        lessons={[]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
