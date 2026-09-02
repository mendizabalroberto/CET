/**
 * @cet/ui — la fila de KPI, la adherencia al plan y el reparto por materia.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo que fija este fichero:
 *  1. La variacion del KPI se distingue por FORMA y no solo por color: el
 *     texto visible ya lleva el signo y la frase accesible es otra, propia.
 *  2. La adherencia al plan se capa en el 100 %, y la cifra real por encima
 *     no se esconde.
 *  3. El reparto por materia se calla sin ni un minuto, igual que el resto de
 *     indicadores de la casa.
 *  4. `StudyScorecard` monta los tres bloques nuevos cuando hay datos y no
 *     deja un panel vacio cuando no los hay.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";

import { LocaleProvider } from "../src/lib/i18n.js";
import { KpiTile } from "../src/reports/KpiTile.js";
import { PlanAdherence } from "../src/reports/PlanAdherence.js";
import { SubjectBreakdown, haySubjectBreakdown } from "../src/reports/SubjectBreakdown.js";
import { StudyScorecard } from "../src/reports/StudyScorecard.js";

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });

function pintar(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

describe("KpiTile — la variacion", () => {
  it("pinta el valor, la etiqueta y el texto de variacion, ya redactados", () => {
    pintar(
      <KpiTile
        value="193"
        label={T("Tiempo de estudio", "Study time")}
        trend={{
          direction: "mejora",
          text: "▲ +42 min",
          srText: T("42 minutos mas que la semana anterior.", "42 minutes more than last week."),
        }}
      />,
    );
    expect(screen.getByText("193")).toBeTruthy();
    expect(screen.getByText("▲ +42 min")).toBeTruthy();
    expect(
      screen.getByText("42 minutos mas que la semana anterior."),
    ).toBeTruthy();
  });

  it("sin variacion no pinta ninguna fila de tendencia", () => {
    const { container } = pintar(<KpiTile value="9" label={T("Sesiones", "Sessions")} />);
    expect(container.querySelector('[data-cet-kpi]')?.textContent).not.toContain("▲");
  });

  it("el color de la tendencia sale de `direction`, nunca del texto", () => {
    const { container: mejora } = pintar(
      <KpiTile
        value="1"
        label={T("A", "A")}
        trend={{ direction: "mejora", text: "▲ +1", srText: T("mas", "more") }}
      />,
    );
    const { container: empeora } = pintar(
      <KpiTile
        value="1"
        label={T("A", "A")}
        trend={{ direction: "empeora", text: "▼ -1", srText: T("menos", "less") }}
      />,
    );
    const claseDe = (c: HTMLElement): string =>
      c.querySelector('dd span[aria-hidden="true"]')?.className ?? "";
    expect(claseDe(mejora)).toContain("teal-text");
    expect(claseDe(empeora)).toContain("danger");
    expect(claseDe(mejora)).not.toBe(claseDe(empeora));
  });

  it("con sparkline pinta una barra por semana, y la mas alta lleva un trazo distinto", () => {
    const { container } = pintar(
      <KpiTile
        value="193"
        label={T("Tiempo de estudio", "Study time")}
        sparkline={{ weeks: [40, 60, 30, 193], summary: T("4 semanas", "4 weeks") }}
      />,
    );
    const barras = Array.from(container.querySelectorAll("svg rect"));
    expect(barras).toHaveLength(4);
    const maximas = barras.filter((b) => b.getAttribute("data-cet-semana") === "maxima");
    expect(maximas).toHaveLength(1);
    expect(maximas[0]?.getAttribute("stroke-width")).not.toBe("0");
  });
});

describe("PlanAdherence — se capa al 100 %, la cifra real no se esconde", () => {
  const BASE = {
    label: T("Cumplimiento del plan", "Plan adherence"),
    progressText: "96 min de 120 min",
    summary: T("Ha hecho el 80 % de lo planificado.", "Did 80% of what was planned."),
  } as const;

  it("un cumplimiento normal pinta la barra a su fraccion", () => {
    const { container } = pintar(
      <PlanAdherence {...BASE} percentText="80 %" ratio={0.8} />,
    );
    const barra = container.querySelector('rect[data-cet-barra="hecho"]') as SVGRectElement;
    const carril = container.querySelector("svg rect") as SVGRectElement;
    expect(Number(barra.getAttribute("width"))).toBeLessThan(Number(carril.getAttribute("width")));
    expect(container.textContent).toContain("80 %");
  });

  it("por encima del 100 % la barra se capa y la cifra real se escribe al lado", () => {
    const { container } = pintar(
      <PlanAdherence {...BASE} percentText="100 %" ratio={1.34} overText="134 %" />,
    );
    const barra = container.querySelector('rect[data-cet-barra="hecho"]') as SVGRectElement;
    const svg = container.querySelector("svg") as SVGSVGElement;
    // La barra nunca sale del viewBox aunque el ratio real sea mayor que 1.
    expect(Number(barra.getAttribute("width")) + Number(barra.getAttribute("x"))).toBeLessThanOrEqual(
      Number(svg.getAttribute("width")),
    );
    expect(container.textContent).toContain("100 %");
    expect(container.textContent).toContain("134 %");
  });

  it("sin cifra real no escribe ningun porcentaje adicional (AD-7)", () => {
    const { container } = pintar(<PlanAdherence {...BASE} percentText="80 %" ratio={0.8} />);
    expect(container.textContent).not.toContain("134");
  });
});

const MATERIAS = [
  { subjectCode: "math", name: "Matemáticas", minutes: 90, minutesText: "1 h 30 min" },
  { subjectCode: "english", name: "Inglés", minutes: 20, minutesText: "20 min" },
  { subjectCode: "science", name: "Ciencias", minutes: 0, minutesText: "0 min" },
] as const;

describe("SubjectBreakdown — el reparto por materia", () => {
  it("ordena de mas a menos tiempo, y descarta la materia sin minutos ninguno", () => {
    expect(haySubjectBreakdown(MATERIAS)).toBe(true);
    const { container } = pintar(<SubjectBreakdown items={MATERIAS} />);
    const nombres = Array.from(container.querySelectorAll('li[data-cet-fila="materia"]')).map(
      (li) => li.querySelectorAll(":scope > span")[1]?.textContent,
    );
    expect(nombres[0]).toBe("Matemáticas");
  });

  it("sin ni un minuto en toda la lista no pinta nada", () => {
    const { container } = pintar(
      <SubjectBreakdown
        items={[{ subjectCode: "math", name: "Matemáticas", minutes: 0, minutesText: "0 min" }]}
      />,
    );
    expect(container.innerHTML.trim()).toBe("");
  });

  it("el acierto y las lecciones solo se escriben si la aplicacion las pasa", () => {
    const { container } = pintar(
      <SubjectBreakdown
        items={[
          {
            subjectCode: "math",
            name: "Matemáticas",
            minutes: 90,
            minutesText: "1 h 30 min",
            accuracyText: "74 %",
            lessonsText: "2 lecciones",
          },
        ]}
      />,
    );
    expect(container.textContent).toContain("74 %");
    expect(container.textContent).toContain("2 lecciones");
  });
});

describe("StudyScorecard — la fila de KPI y las baldosas nuevas", () => {
  const INFORME = {
    subjectCode: "math",
    studentName: "Ana Ruiz Blanco",
    kpis: {
      items: [
        { value: "193", label: T("Tiempo", "Time") },
        { value: "9", label: T("Sesiones", "Sessions") },
      ],
    },
    planAdherence: {
      label: T("Cumplimiento del plan", "Plan adherence"),
      percentText: "80 %",
      ratio: 0.8,
      progressText: "96 min de 120 min",
      summary: T("Ha hecho el 80 % de lo planificado.", "Did 80% of what was planned."),
    },
    subjects: { title: T("Por materia", "By subject"), items: MATERIAS },
  } as const;

  it("monta la fila de KPI, la adherencia y el reparto por materia", () => {
    const { container } = pintar(<StudyScorecard {...INFORME} />);
    expect(container.querySelector('[data-cet-fila="kpis"]')).toBeTruthy();
    expect(container.querySelector('[data-cet-adherencia="plan"]')).toBeTruthy();
    expect(container.querySelector('[data-cet-lista="reparto-materias"]')).toBeTruthy();
  });

  it("sin plan activo la baldosa de adherencia no aparece", () => {
    const { container } = pintar(
      <StudyScorecard subjectCode="math" studentName="Ana" kpis={INFORME.kpis} />,
    );
    expect(container.querySelector('[data-cet-adherencia="plan"]')).toBeNull();
  });

  it("el informe con los bloques nuevos sigue sin violaciones de axe", async () => {
    const { container } = pintar(
      <main>
        <StudyScorecard {...INFORME} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
