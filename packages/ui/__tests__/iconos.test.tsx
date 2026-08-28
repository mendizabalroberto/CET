/**
 * @cet/ui — iconos.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Button } from "../src/primitives/Button.js";
import { ICONOS } from "../src/icons/registro.js";

/**
 * Los grupos que de verdad se ven juntos. Dos acciones hermanas no comparten
 * dibujo: «Comprobar» y «Siguiente pregunta» viven en el MISMO boton, que
 * cambia de texto al responder; si los dos fuesen una marca de verificacion, el
 * boton diria «he acertado» cuando solo quiere decir «sigue».
 */
const GRUPOS = [
  ["comprobar", "saltar", "pista", "solucion"], // zona de acciones
  ["siguiente", "anterior", "marcar", "entregar"], // barra del examen
  ["navAprender", "navPracticar", "navExamenes"], // rail lateral
] as const;

describe("Icono", () => {
  it("el icono llega a la pantalla dentro del boton", () => {
    render(<Button icon="comprobar">Comprobar</Button>);
    const boton = screen.getByRole("button", { name: "Comprobar" });
    // Se consulta desde el propio boton, no desde el documento: despues de lo
    // de tailwind-merge, no se da por hecho que algo llega a la pantalla.
    expect(boton.querySelector("svg")).not.toBeNull();
  });

  it("el tamano sale del size del boton, no de una clase", () => {
    const { container } = render(
      <>
        <Button icon="comprobar" size="md">
          Mediano
        </Button>
        <Button icon="comprobar" size="lg">
          Grande
        </Button>
      </>,
    );
    const botones = container.querySelectorAll("button");
    expect(botones).toHaveLength(2);
    // El ATRIBUTO, no el className: si alguien lo cambia a `h-4 w-4`, este test
    // tiene que ponerse rojo, porque esa es justamente la via que reabre el
    // conflicto de `cn`.
    expect(botones[0].querySelector("svg")?.getAttribute("width")).toBe("18");
    expect(botones[1].querySelector("svg")?.getAttribute("width")).toBe("20");
  });

  it("el icono es invisible para el lector y el nombre accesible no cambia", () => {
    render(<Button icon="comprobar">Comprobar</Button>);
    const boton = screen.getByRole("button", { name: "Comprobar" });
    const svg = boton.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    // El nombre accesible sigue siendo exactamente el texto, ni mas largo ni
    // distinto.
    expect(boton).toHaveAccessibleName("Comprobar");
  });

  it("sin icon no hay svg", () => {
    render(<Button>Comprobar</Button>);
    const boton = screen.getByRole("button", { name: "Comprobar" });
    expect(boton.querySelector("svg")).toBeNull();
  });

  it("dentro de un grupo, dos acciones no comparten dibujo", () => {
    for (const grupo of GRUPOS) {
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          // Lo que tiene que ser distinto son los COMPONENTES, no las cadenas:
          // dos claves distintas apuntando al mismo dibujo es exactamente el
          // fallo que se busca.
          expect(
            ICONOS[grupo[i]],
            `"${grupo[i]}" y "${grupo[j]}" comparten dibujo y se ven juntos`,
          ).not.toBe(ICONOS[grupo[j]]);
        }
      }
    }
  });

  it("lucide-react se importa en un solo sitio", () => {
    const srcDir = join(process.cwd(), "src");
    const ficheros = readdirSync(srcDir, { recursive: true })
      .filter((f): f is string => typeof f === "string")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => join(srcDir, f));

    // Un recorrido que no encuentra nada pasaria en verde sin mirar nada.
    expect(ficheros.length).toBeGreaterThan(30);

    const conImport = ficheros.filter((f) => readFileSync(f, "utf8").includes('from "lucide-react"'));
    expect(conImport).toEqual([join(srcDir, "icons", "registro.ts")]);
  });

  it("todo nombre del registro pinta algo", () => {
    const nombres = Object.keys(ICONOS);
    // Por lo mismo del punto anterior: un recorrido vacio pasaria en verde.
    expect(nombres.length).toBeGreaterThan(15);

    for (const nombre of nombres) {
      const { container } = render(<Button icon={nombre as keyof typeof ICONOS}>{nombre}</Button>);
      const boton = screen.getByRole("button", { name: nombre });
      expect(
        boton.querySelector("svg"),
        `el icono "${nombre}" no pinta ningun svg`,
      ).not.toBeNull();
      container.remove();
    }
  });
});
