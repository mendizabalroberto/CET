/**
 * @cet/ui — la tarjeta y la rejilla de materias.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este fichero no comprueba que la tarjeta "se pinte". Comprueba los cuatro
 * fallos concretos que esta pantalla tiene si nadie los vigila:
 *
 *   1. que el enlace sea el renglon del titulo y no la tarjeta entera — 18 px
 *      de objetivo tactil donde la casa exige 44, y en la tableta de un nino de
 *      once anos eso se reporta como "no va bien", nunca como un bug;
 *   2. que una consulta de avance caida se pinte como un 0 %, que le dice al
 *      alumno que no ha hecho nada y es mentira;
 *   3. que un `code` que el design system no conoce (el colegio da de alta
 *      `music`) salga con un token inexistente, o sea invisible;
 *   4. que la rejilla respete el orden del array y la materia del alumno cambie
 *      de casilla cada vez que el colegio activa un curso.
 */

import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../src/lib/i18n.js";
import { SubjectCard, type SubjectCardProps } from "../src/navigation/SubjectCard.js";
import { SubjectGrid } from "../src/navigation/SubjectGrid.js";

/** Los rotulos que la aplicacion pasa: el paquete no los tiene (AD-7). */
const TEXTOS = {
  ofText: { es: "de", en: "of" },
  completedText: { es: "terminadas", en: "completed" },
  startedText: { es: "en marcha", en: "in progress" },
  notStartedText: { es: "Sin empezar", en: "Not started" },
  doneText: { es: "Terminada", en: "Finished" },
  unavailableText: { es: "Sin datos de avance", en: "No progress data" },
} as const;

function card(overrides: Partial<SubjectCardProps> = {}): SubjectCardProps {
  return {
    code: "math",
    name: "Matemáticas",
    href: "/learn/materia/math",
    total: 12,
    completed: 3,
    started: 2,
    ...TEXTOS,
    ...overrides,
  };
}

function wrap(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

describe("SubjectCard — la tarjeta entera es el enlace", () => {
  it("hay un solo enlace y su nombre accesible dice de que materia es", () => {
    wrap(<SubjectCard {...card()} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(/Matemáticas/);
    expect(links[0]).toHaveAttribute("href", "/learn/materia/math");
  });

  it("el medallon, el nombre y las cifras estan DENTRO del enlace, no al lado", () => {
    const { container } = wrap(<SubjectCard {...card()} />);
    const link = screen.getByRole("link");

    expect(within(link).getByText("Matemáticas")).toBeInTheDocument();
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link.querySelector("[data-cet-barra]")).not.toBeNull();
    // Nada del contenido de la tarjeta queda fuera del objetivo pulsable.
    expect(container.firstElementChild).toBe(link);
  });

  it("no monta ningun boton ni control propio: la navegacion la hace el enlace", () => {
    wrap(<SubjectCard {...card()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SubjectCard — `null` no es cero", () => {
  it("sin dato de avance no hay barra ni porcentaje, y se explica por escrito", () => {
    const { container } = wrap(
      <SubjectCard {...card({ completed: null, started: null })} />,
    );

    expect(container.querySelector("[data-cet-barra]")).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/%/);
    expect(container.textContent ?? "").not.toMatch(/\b0\b/);
    expect(screen.getByText("Sin datos de avance")).toBeInTheDocument();
    // Y sigue siendo navegable: una consulta caida no deja al alumno encerrado.
    expect(screen.getByRole("link")).toHaveAttribute("href", "/learn/materia/math");
  });

  it("«sin empezar» y «no lo sabemos» no son el mismo marcado", () => {
    const caido = wrap(<SubjectCard {...card({ completed: null, started: null })} />);
    const sinEmpezar = wrap(<SubjectCard {...card({ completed: 0, started: 0 })} />);

    const enlaceCaido = within(caido.container).getByRole("link");
    const enlaceSinEmpezar = within(sinEmpezar.container).getByRole("link");

    expect(enlaceCaido).toHaveAttribute("data-state", "unknown");
    expect(enlaceSinEmpezar).toHaveAttribute("data-state", "not-started");
    expect(enlaceCaido.innerHTML).not.toBe(enlaceSinEmpezar.innerHTML);
  });

  it("sin empezar dice «Sin empezar» y no pinta un 0 % que se lee como suspenso", () => {
    const { container } = wrap(<SubjectCard {...card({ completed: 0, started: 0 })} />);

    expect(screen.getByText("Sin empezar")).toBeInTheDocument();
    expect(container.querySelector("[data-cet-barra]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/%/);
  });
});

describe("SubjectCard — las cifras van escritas, no solo en la barra", () => {
  it("a medias: dice cuantas terminadas y cuantas en marcha", () => {
    wrap(<SubjectCard {...card({ completed: 3, started: 2 })} />);

    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("3 de 12 terminadas");
    expect(link).toHaveTextContent("2 en marcha");
    expect(link).toHaveAttribute("data-state", "in-progress");
  });

  it("terminada: estado propio y el numero dice 12 de 12", () => {
    wrap(<SubjectCard {...card({ completed: 12, started: 0 })} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-state", "done");
    expect(link).toHaveTextContent("12 de 12 terminadas");
    expect(link).toHaveTextContent("Terminada");
  });

  it("la barra es decorativa: no se anuncia dos veces lo que ya esta escrito", () => {
    const { container } = wrap(<SubjectCard {...card()} />);
    const barra = container.querySelector("[data-cet-barra]");
    expect(barra).not.toBeNull();
    expect(barra).toHaveAttribute("aria-hidden", "true");
  });
});

describe("SubjectCard — el color no identifica la materia", () => {
  it("un code desconocido (music) se pinta igual de bien y cae en el token neutro", () => {
    const { container } = wrap(
      <SubjectCard {...card({ code: "music", name: "Música", href: "/learn/materia/music" })} />,
    );

    const link = screen.getByRole("link");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(within(link).getByText("Música")).toBeInTheDocument();
    expect(link).toHaveAttribute("data-subject", "otra");
    expect(container.innerHTML).toContain("var(--cet-materia-otra)");
    expect(container.innerHTML).not.toContain("var(--cet-materia-music)");
  });

  it("no escribe ningun hexadecimal: la paleta vive en tokens.css", () => {
    const { container } = wrap(<SubjectCard {...card()} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("el icono es decorativo porque el nombre ya esta escrito al lado", () => {
    const { container } = wrap(<SubjectCard {...card()} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

const REJILLA: readonly SubjectCardProps[] = [
  card({ code: "ict", name: "Informática", href: "/learn/materia/ict" }),
  card({ code: "music", name: "Música", href: "/learn/materia/music", completed: null, started: null }),
  card({ code: "art", name: "Arte", href: "/learn/materia/art", completed: 0, started: 0 }),
  card({ code: "math", name: "Matemáticas", href: "/learn/materia/math", completed: 12, started: 0 }),
  card({ code: "science", name: "Ciencias", href: "/learn/materia/science" }),
];

describe("SubjectGrid", () => {
  it("ordena por la casilla fija de la materia, no por el orden del array", () => {
    wrap(<SubjectGrid subjects={REJILLA} />);

    const nombres = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(nombres).toEqual([
      "/learn/materia/math",
      "/learn/materia/science",
      "/learn/materia/ict",
      // Las desconocidas al final, y entre ellas por nombre: Arte antes que Música.
      "/learn/materia/art",
      "/learn/materia/music",
    ]);
  });

  it("es una lista, para que el lector pueda decir cuantas materias hay", () => {
    wrap(<SubjectGrid subjects={REJILLA} />);
    const lista = screen.getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(REJILLA.length);
  });

  it("no muta el array que le pasan", () => {
    const entrada = [...REJILLA];
    wrap(<SubjectGrid subjects={entrada} />);
    expect(entrada.map((s) => s.code)).toEqual(REJILLA.map((s) => s.code));
  });

  it("cero violaciones de accesibilidad en la rejilla completa", async () => {
    const { container } = wrap(<SubjectGrid subjects={REJILLA} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
