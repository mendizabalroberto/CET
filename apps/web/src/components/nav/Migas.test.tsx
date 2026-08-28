/**
 * Pruebas de las migas de pan.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cada `it` falla si se borra la regla que protege. La mutación que pondría
 * rojo cada test se indica en su comentario.
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
    //          [Fracciones] → texto (último, nunca enlace)
    // Enlaces: 2.
    // Mutación que lo pondría rojo: pintar el último escalón como `<Link>`
    // cuando trae `href`, o pintar un intermedio sin `href` como enlace.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas", href: "/learn/matematicas" },
      { label: "Fracciones" },
    ];
    render(<Migas label="Ruta" items={items} />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Fracciones")).toBeInTheDocument();
    expect(screen.getByText("Fracciones").tagName).toBe("SPAN");
  });

  it("solo el último escalón lleva aria-current=page", () => {
    // Mutación que lo pondría rojo: poner `aria-current` en todos los escalones,
    // o no ponerlo en el último.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas", href: "/learn/matematicas" },
      { label: "Fracciones" },
    ];
    render(<Migas label="Ruta" items={items} />);

    const nav = screen.getByRole("navigation", { name: "Ruta" });
    const conCurrent = nav.querySelectorAll('[aria-current="page"]');
    expect(conCurrent).toHaveLength(1);
    expect(conCurrent[0]).toHaveTextContent("Fracciones");
  });

  it("el último escalón con href sigue sin ser enlace", () => {
    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
    //          [Fracciones, /learn/fracciones] → texto (último, NUNCA enlace)
    // Enlaces: 1.
    // Mutación que lo pondría rojo: pintar el último escalón como `<Link>`
    // «porque tiene href».
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Fracciones", href: "/learn/fracciones" },
    ];
    render(<Migas label="Ruta" items={items} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Fracciones").tagName).toBe("SPAN");
  });

  it("un escalón intermedio sin href aparece como texto, no desaparece", () => {
    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
    //          [Matemáticas] → texto (intermedio sin href)
    //          [Fracciones, /learn/fracciones] → texto (último, NUNCA enlace)
    // Enlaces: 1. La regla del test 4 vale también aquí: el último con href
    // no es enlace.
    // Mutación que lo pondría rojo: no pintar un escalón intermedio sin `href`,
    // o pintarlo como enlace.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas" },
      { label: "Fracciones", href: "/learn/fracciones" },
    ];
    render(<Migas label="Ruta" items={items} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Matemáticas")).toBeInTheDocument();
    expect(screen.getByText("Matemáticas").tagName).toBe("SPAN");
  });

  it("con items vacío no se pinta nada", () => {
    // Mutación que lo pondría rojo: devolver un `<nav>` con lista vacía en
    // lugar de `null`.
    render(<Migas label="Ruta" items={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("los separadores no se anuncian y no van después del último", () => {
    // Mutación que lo pondría rojo: quitar `aria-hidden` de los separadores,
    // o pintar un separador después del último escalón.
    const items: readonly Miga[] = [
      { label: "Aprender", href: "/learn" },
      { label: "Matemáticas", href: "/learn/matematicas" },
      { label: "Fracciones" },
    ];
    render(<Migas label="Ruta" items={items} />);

    const nav = screen.getByRole("navigation", { name: "Ruta" });
    const separadores = nav.querySelectorAll('[aria-hidden="true"]');
    expect(separadores).toHaveLength(items.length - 1);
    for (const sep of separadores) {
      expect(sep.textContent).toBe("›");
    }

    // El texto accesible no termina en el separador.
    const textoAccesible = nav.textContent ?? "";
    expect(textoAccesible.trim().endsWith("›")).toBe(false);
  });
});
