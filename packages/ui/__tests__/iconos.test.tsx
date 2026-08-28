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
    const [medio, grande] = [...container.querySelectorAll("button")];
    // Se afirma que existen antes de mirarlos: con `noUncheckedIndexedAccess`
    // el compilador lo exige, y si el render fallara este es el mensaje util.
    expect(medio, "no se pinto el boton md").toBeDefined();
    expect(grande, "no se pinto el boton lg").toBeDefined();
    // El ATRIBUTO, no el className: si alguien lo cambia a `h-4 w-4`, este test
    // tiene que ponerse rojo, porque esa es justamente la via que reabre el
    // conflicto de `cn`.
    expect(medio!.querySelector("svg")?.getAttribute("width")).toBe("18");
    expect(grande!.querySelector("svg")?.getAttribute("width")).toBe("20");
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
    // `noUncheckedIndexedAccess` esta activo: se recorre por pares con
    // `entries`, que si da el elemento, en vez de indexar a ciegas.
    for (const grupo of GRUPOS) {
      for (const [i, a] of grupo.entries()) {
        for (const b of grupo.slice(i + 1)) {
          // Lo que tiene que ser distinto son los COMPONENTES, no las cadenas:
          // dos claves distintas apuntando al mismo dibujo es exactamente el
          // fallo que se busca, y comparar las claves lo dejaria pasar siempre.
          expect(
            ICONOS[a],
            `"${a}" y "${b}" comparten dibujo y se ven juntos`,
          ).not.toBe(ICONOS[b]);
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

  /**
   * El caso que el contrato no cubrio y que revento en ejecucion.
   *
   * `asChild` hace que `Button` se pinte con `Slot`, y `Slot` clona a su UNICO
   * hijo. Anadir el icono le daba dos: «Slot failed to slot onto its children».
   * No es hipotetico — «Practicar esto», en la leccion, es exactamente eso: un
   * `<Link>` envuelto en un boton, y con icono.
   *
   * La mutacion que lo pone rojo: cambiar `<Slottable>{children}</Slottable>`
   * por `{children}` en `Button.tsx`.
   */
  it("un boton con asChild acepta icono, y el icono entra DENTRO del enlace", () => {
    render(
      <Button asChild icon="practicar">
        <a href="/practice/math.simplify">Practicar esto</a>
      </Button>,
    );
    const enlace = screen.getByRole("link", { name: "Practicar esto" });
    expect(enlace.querySelector("svg"), "el icono no acabo dentro del enlace").not.toBeNull();
    // Y el nombre accesible sigue siendo solo el texto: el icono no lo alarga.
    expect(enlace).toHaveAccessibleName("Practicar esto");
  });
});
