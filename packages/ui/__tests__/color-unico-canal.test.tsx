/**
 * @cet/ui — WCAG 1.4.1: el color nunca es el unico canal.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Por que existe este fichero: bajo deuteranopia `--cet-ok-accent` (#12805c) y
 * `--cet-no-accent` (#c0392b) se convierten en el mismo color (1.10:1), y los
 * fondos de acierto y error estan a 1.01:1 incluso para vision normal. Un alumno
 * daltonico revisando su examen veia tres filas identicas y no podia saber cual
 * habia acertado. El 8 % de los varones tiene una deficiencia rojo-verde: en una
 * clase de 25 son uno o dos ninos, cada vez.
 *
 * Aqui no se mide contraste. Se comprueba que existe una senal QUE NO ES COLOR.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { ChoiceList } from "../src/exam/ChoiceList.js";

function wrap(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

const CHOICES = [
  { id: "a", html: "Cuatro" },
  { id: "b", html: "Cinco" },
  { id: "c", html: "Seis" },
];

/** Los tres estados de revision, uno por opcion. */
const REVIEW = { a: "correct", b: "incorrect", c: "missed" } as const;

/**
 * Firma NO cromatica de un elemento: todo lo que un alumno que no distingue
 * colores —o un lector de pantalla— puede percibir. Texto accesible, mas la
 * geometria de los glifos SVG. Deliberadamente NO incluye `class`: una clase de
 * color es justo lo que no cuenta como senal.
 */
function firmaNoCromatica(el: HTMLElement): string {
  const paths = Array.from(el.querySelectorAll("path,circle,polygon,rect,line"))
    .map((n) => `${n.tagName}:${n.getAttribute("d") ?? ""}:${n.getAttribute("points") ?? ""}`)
    .join("|");
  return `${(el.textContent ?? "").trim()}##${paths}`;
}

describe("ChoiceList — estados de revision (WCAG 1.4.1)", () => {
  it("dice el estado de revision con texto, no solo con color", () => {
    wrap(<ChoiceList choices={CHOICES} value={["b"]} onChange={() => {}} review={REVIEW} disabled />);

    // El estado tiene que llegar por el nombre accesible de la opcion, que es lo
    // unico que oye un lector de pantalla. Buscar por clase CSS aqui seria
    // comprobar el fallo, no la correccion.
    // Los tres nombres accesibles se solapan por subcadena ("correcta" esta
    // dentro de "incorrecta" y de "era correcta"), asi que se anclan enteros.
    expect(screen.getByRole("radio", { name: /^Cuatro\W+Correcta$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Cinco\W+Tu respuesta, incorrecta$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Seis\W+No marcada, era correcta$/i })).toBeTruthy();
  });

  it("dibuja un glifo distinto por estado, ademas del color", () => {
    // Las tres opciones dicen LO MISMO a proposito. Si el contenido difiere, la
    // firma difiere por el contenido y el test pasa sin probar nada: es
    // exactamente como este fallo sobrevivio a una revision de accesibilidad.
    const iguales = [
      { id: "a", html: "Cuatro" },
      { id: "b", html: "Cuatro" },
      { id: "c", html: "Cuatro" },
    ];
    wrap(<ChoiceList choices={iguales} value={["b"]} onChange={() => {}} review={REVIEW} disabled />);

    const firmas = screen.getAllByRole("radio").map((fila) => firmaNoCromatica(fila));
    expect(new Set(firmas).size).toBe(3);
  });

  it("no marca nada cuando no hay revision (durante el examen la clave no existe)", () => {
    wrap(<ChoiceList choices={CHOICES} value={["b"]} onChange={() => {}} />);
    expect(screen.queryByRole("radio", { name: /correcta/i })).toBeNull();
    expect(screen.queryByRole("radio", { name: /marcada/i })).toBeNull();
  });

  it("traduce el estado de revision, no lo escribe en el componente", () => {
    render(
      <LocaleProvider locale="en">
        <ChoiceList choices={CHOICES} value={["b"]} onChange={() => {}} review={REVIEW} disabled />
      </LocaleProvider>,
    );
    expect(screen.getByRole("radio", { name: /^Cuatro\W+Correct$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Cinco\W+Your answer, incorrect$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Seis\W+Not selected, was correct$/i })).toBeTruthy();
  });

  it("el glifo de estado no ensucia el contenido de la opcion", () => {
    wrap(<ChoiceList choices={CHOICES} value={["b"]} onChange={() => {}} review={REVIEW} disabled />);
    const fila = screen.getByRole("radio", { name: /^Cuatro\W+Correcta$/i });
    expect(within(fila).getByText("Cuatro")).toBeTruthy();
  });
});
