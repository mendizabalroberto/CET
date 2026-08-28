/**
 * Pruebas de las migas de pan.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cada `it` está escrito para fallar si se borra la regla que protege. La
 * mutación que lo pondría rojo se indica en el comentario de cada uno.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Migas } from "./Migas";
import type { Miga } from "./Migas";

describe("Migas", () => {
  it("el nav tiene el nombre accesible que se le pasó", () => {
    // Mutación que lo pondría rojo: quitar `aria-label` del `<nav>`.
    render(<Migas label="Ruta" items={[{ label: "Aprender", href: "/learn" }]} />);
    expect(screen.getByRole("navigation", { name: "Ruta" })).toBeInTheDocument();
  });

  it("con tres escalones, solo los dos primeros con href son enlaces", () => {
    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
    //          [Matemáticas, /learn/matematicas] → enlace (intermedio con href)
    //          [Fracciones, sin href] → texto (último, nunca enlace)
    // Enlaces: 2.
    // Mutación que lo pondría rojo: pintar el último escalón como `<Link>`
    // "porque tiene href".
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas", href: "/learn/matematicas" },
      { label: "Fracciones" },
    ];

    render(<Migas label="Ruta" items={items} />);

    const enlaces = screen.getAllByRole("link");
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0]).toHaveTextContent("Aprender");
    expect(enlaces[1]).toHaveTextContent("Matemáticas");
    expect(screen.getByText("Fracciones")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fracciones" })).toBeNull();
  });

  it("solo el último escalón lleva aria-current=page", () => {
    // Mutación que lo pondría rojo: poner `aria-current` en todos los escalones
    // o en ninguno.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas", href: "/learn/matematicas" },
      { label: "Fracciones" },
    ];

    render(<Migas label="Ruta" items={items} />);

    const actual = screen.getByRole("navigation", { name: "Ruta" });
    expect(actual.querySelector('[aria-current="page"]')).toHaveTextContent("Fracciones");
    expect(actual.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("el último escalón con href sigue sin ser enlace", () => {
    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
    //          [Fracciones, /learn/fracciones] → texto (último, NUNCA enlace)
    // Enlaces: 1.
    // Mutación que lo pondría rojo: pintar el último escalón como `<Link>`
    // "porque tiene href".
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Fracciones", href: "/learn/fracciones" },
    ];

    render(<Migas label="Ruta" items={items} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Fracciones")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fracciones" })).toBeNull();
  });

  it("un escalón intermedio sin href aparece como texto, no desaparece", () => {
    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
    //          [Matemáticas, sin href] → texto (intermedio sin href)
    //          [Fracciones, /learn/fracciones] → texto (último, NUNCA enlace)
    // Enlaces: 1.
    // Mutación que lo pondría rojo: filtrar los escalones sin href en lugar de
    // pintarlos como texto.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas" },
      { label: "Fracciones", href: "/learn/fracciones" },
    ];

    render(<Migas label="Ruta" items={items} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Matemáticas")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Matemáticas" })).toBeNull();
  });

  it("con items vacío no se pinta nada", () => {
    // Mutación que lo pondría rojo: devolver un `<nav>` con lista vacía en
    // lugar de `null`.
    render(<Migas label="Ruta" items={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("los separadores no se anuncian y no van después del último", () => {
    // Mutación que lo pondría rojo: pintar el separador como texto suelto sin
    // `aria-hidden`, o ponerlo después del último escalón.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas", href: "/learn/matematicas" },
      { label: "Fracciones" },
    ];

    render(<Migas label="Ruta" items={items} />);

    const separadores = document.querySelectorAll('[aria-hidden="true"]');
    expect(separadores).toHaveLength(items.length - 1);
    for (const separador of separadores) {
      expect(separador.textContent).toBe("›");
    }

    const nav = screen.getByRole("navigation", { name: "Ruta" });
    const textoAccesible = nav.textContent ?? "";
    expect(textoAccesible.endsWith("›")).toBe(false);
  });
});
