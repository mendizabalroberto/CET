/**
 * @cet/ui — el scorecard de esfuerzo que lee el profesor.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FIJA ESTE FICHERO, Y POR QUE CADA COSA
 * ===========================================================================
 * Las cuatro decisiones de este scorecard que, si se rompen, no producen un
 * error sino una conclusion falsa sobre un nino:
 *
 *  1. **Un dia a cero no se pinta como un dia sin dato.** Cero es «no estudio»;
 *     sin dato es «no lo sabemos». Confundirlos convierte un fallo de
 *     sincronizacion en una conversacion con una familia. Se comprueba sobre la
 *     firma NO CROMATICA —relleno, trazo, altura—, nunca sobre el color: un
 *     dibujo que solo cambiara de tono seguiria siendo indistinguible en escala
 *     de grises, y para este test es como si no cambiara.
 *  2. **La comparacion con la clase se oculta con cohorte pequena.** El umbral
 *     es `MIN_COHORTE` y se comprueba justo a los dos lados.
 *  3. **Nada se pinta con datos que no lo sostienen.** Todo indicador que
 *     admita «no hay dato» devuelve `null`; cero no es ausencia. Y ninguno se
 *     pinta igual con entradas distintas —la barra decorativa que persigue
 *     `progreso-viene-de-datos.test.tsx`, aqui aplicada a los informes.
 *  4. **La caja se importa, no se copia.** Los paneles llevan exactamente
 *     `CARD_CHROME`; si alguien escribe su propia lista de clases, este test se
 *     pone rojo. Es lo que no hubo cuando /learn y /practice divergieron.
 *
 * Y ademas: ni un literal de cara al usuario dentro del paquete (AD-7). Lo que
 * la aplicacion no pasa, no se pinta.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";

import { LocaleProvider } from "../src/lib/i18n.js";
import { CARD_CHROME } from "../src/navigation/card-chrome.js";
import { ScorecardPanel } from "../src/reports/ScorecardPanel.js";
import { EffortTrend } from "../src/reports/EffortTrend.js";
import { SkillList } from "../src/reports/SkillList.js";
import { CohortComparison } from "../src/reports/CohortComparison.js";
import { LessonTimeBreakdown } from "../src/reports/LessonTimeBreakdown.js";
import { StudyScorecard } from "../src/reports/StudyScorecard.js";
import {
  MIN_COHORTE,
  hayCohorteSuficiente,
  type EffortDay,
  type LessonTime,
  type SkillEntry,
} from "../src/reports/scorecard-data.js";

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });

function pintar(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

const RESUMEN = T("Ha estudiado 5 de 7 dias.", "Studied 5 of 7 days.");

/** Un dia con minutos, uno a cero y uno sin registro, en ese orden. */
const TRES_DIAS: readonly EffortDay[] = [
  { label: T("Lunes: 30 minutos", "Monday: 30 minutes"), minutes: 30 },
  { label: T("Martes: 0 minutos", "Tuesday: 0 minutes"), minutes: 0 },
  { label: T("Miercoles: sin registro", "Wednesday: no record"), minutes: null },
];

/**
 * Firma NO cromatica de una marca: todo lo que percibe quien no distingue
 * colores o mira una impresion en blanco y negro. Deliberadamente SIN `fill`
 * cuando el fill es un color: aqui `currentColor` frente a `none` no es un tono,
 * es «macizo o hueco», que es forma. Lo que no entra nunca es una clase de color.
 */
function firmaNoCromatica(marca: Element): string {
  const macizo = marca.getAttribute("fill") === "none" ? "hueco" : "macizo";
  const trazo = marca.getAttribute("stroke-dasharray") ?? "continuo";
  return `${macizo}|${trazo}|${marca.getAttribute("height") ?? ""}`;
}

function barrasDeDia(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect[data-cet-dia]"));
}

/* ================================================================== *
 * 1. La constancia: cero, sin dato y estudio son TRES cosas
 * ================================================================== */

describe("EffortTrend — un dia a cero no es un dia sin dato", () => {
  it("pinta una barra por dia, tambien por los dias sin registro", () => {
    const { container } = pintar(<EffortTrend series={TRES_DIAS} summary={RESUMEN} />);
    expect(barrasDeDia(container)).toHaveLength(3);
  });

  it("las tres situaciones tienen firmas distintas SIN mirar el color", () => {
    const { container } = pintar(<EffortTrend series={TRES_DIAS} summary={RESUMEN} />);
    const firmas = barrasDeDia(container).map(firmaNoCromatica);
    expect(new Set(firmas).size).toBe(3);
  });

  it("el dia a cero va MACIZO y el dia sin dato va HUECO y discontinuo", () => {
    const { container } = pintar(<EffortTrend series={TRES_DIAS} summary={RESUMEN} />);
    const cero = container.querySelector('rect[data-cet-dia="cero"]');
    const sinDato = container.querySelector('rect[data-cet-dia="sin-dato"]');

    // Cero es un DATO, y los datos van rellenos: «sabemos que fueron cero».
    expect(cero?.getAttribute("fill")).toBe("currentColor");
    expect(cero?.getAttribute("stroke-dasharray")).toBeNull();

    // Sin dato es la AUSENCIA, y va en contorno discontinuo, como los peldanos
    // pendientes de MasteryLadder. Dos canales de forma, ninguno de tono.
    expect(sinDato?.getAttribute("fill")).toBe("none");
    expect(sinDato?.getAttribute("stroke-dasharray")).toBe("2 2");
  });

  it("el hueco de «sin dato» nunca sobresale por encima de un dia con estudio", () => {
    // Un «sin dato» mas alto que el suelo de un dia activo se leeria como un dia
    // bueno. Se comprueba contra el caso PEOR: un dia de un solo minuto, que es
    // el que se pinta a la altura minima.
    const { container } = pintar(
      <EffortTrend
        series={[
          { label: T("Lunes: 1 minuto", "Monday: 1 minute"), minutes: 1 },
          { label: T("Martes: 90 minutos", "Tuesday: 90 minutes"), minutes: 90 },
          { label: T("Miercoles: sin registro", "Wednesday: no record"), minutes: null },
        ]}
        summary={RESUMEN}
      />,
    );
    const alto = (sel: string): number =>
      Number(container.querySelector(sel)?.getAttribute("height"));

    expect(alto('rect[data-cet-dia="sin-dato"]')).toBeLessThan(
      alto('rect[data-cet-dia="con-minutos"]'),
    );
  });

  it("el zocalo del dia a cero no puede confundirse con el suelo de un dia activo", () => {
    const { container } = pintar(
      <EffortTrend
        series={[
          { label: T("Lunes: 1 minuto", "Monday: 1 minute"), minutes: 1 },
          { label: T("Martes: 0 minutos", "Tuesday: 0 minutes"), minutes: 0 },
        ]}
        summary={RESUMEN}
      />,
    );
    const cero = Number(container.querySelector('rect[data-cet-dia="cero"]')?.getAttribute("height"));
    const activo = Number(
      container.querySelector('rect[data-cet-dia="con-minutos"]')?.getAttribute("height"),
    );
    expect(cero * 2).toBeLessThan(activo);
  });

  it("la altura sale de los minutos: mas minutos, mas alto", () => {
    const { container } = pintar(
      <EffortTrend
        series={[
          { label: T("A", "A"), minutes: 10 },
          { label: T("B", "B"), minutes: 40 },
          { label: T("C", "C"), minutes: 80 },
        ]}
        summary={RESUMEN}
      />,
    );
    const alturas = barrasDeDia(container).map((r) => Number(r.getAttribute("height")));
    expect(alturas[1]).toBeGreaterThan(alturas[0] as number);
    expect(alturas[2]).toBeGreaterThan(alturas[1] as number);
  });

  it("dos series distintas no pueden producir el mismo dibujo (nada de barra decorativa)", () => {
    const firma = (serie: readonly EffortDay[]): string => {
      const { container } = pintar(<EffortTrend series={serie} summary={RESUMEN} />);
      return barrasDeDia(container).map(firmaNoCromatica).join("/");
    };
    const constante = firma([
      { label: T("A", "A"), minutes: 20 },
      { label: T("B", "B"), minutes: 20 },
    ]);
    const dispar = firma([
      { label: T("A", "A"), minutes: 20 },
      { label: T("B", "B"), minutes: 90 },
    ]);
    const conHueco = firma([
      { label: T("A", "A"), minutes: 20 },
      { label: T("B", "B"), minutes: null },
    ]);
    expect(new Set([constante, dispar, conHueco]).size).toBe(3);
  });

  it("una semana entera a cero SI se pinta: cero es un resultado", () => {
    const { container } = pintar(
      <EffortTrend
        series={[
          { label: T("A", "A"), minutes: 0 },
          { label: T("B", "B"), minutes: 0 },
        ]}
        summary={RESUMEN}
      />,
    );
    expect(barrasDeDia(container)).toHaveLength(2);
  });

  it("una semana entera SIN registro no pinta nada: cero no es ausencia", () => {
    const { container } = pintar(
      <EffortTrend
        series={[
          { label: T("A", "A"), minutes: null },
          { label: T("B", "B"), minutes: null },
        ]}
        summary={RESUMEN}
      />,
    );
    expect(container.innerHTML.trim()).toBe("");
  });

  it("sin dias no se inventa un eje vacio", () => {
    const { container } = pintar(<EffortTrend series={[]} summary={RESUMEN} />);
    expect(container.innerHTML.trim()).toBe("");
  });

  it("el nombre accesible del dibujo es el resumen, en el idioma activo", () => {
    pintar(<EffortTrend series={TRES_DIAS} summary={RESUMEN} />);
    expect(screen.getByRole("img", { name: RESUMEN.es })).toBeTruthy();
  });

  it("el resumen tambien va escrito: quien no cuenta columnas lo lee", () => {
    const { container } = pintar(<EffortTrend series={TRES_DIAS} summary={RESUMEN} />);
    expect(container.textContent).toContain(RESUMEN.es);
  });

  it("cada dia lleva su etiqueta encima, y en el idioma activo", () => {
    const { container } = pintar(<EffortTrend series={TRES_DIAS} summary={RESUMEN} />);
    const titulos = Array.from(container.querySelectorAll("rect > title")).map((n) => n.textContent);
    expect(titulos).toEqual([
      "Lunes: 30 minutos",
      "Martes: 0 minutos",
      "Miercoles: sin registro",
    ]);
  });

  it("no pinta tinta atenuada sobre el lavado del panel (WCAG 1.4.3)", () => {
    // `--cet-ink-muted` mide 4.45:1 sobre los lavados de materia. Dentro de un
    // panel, el texto hereda la tinta normal y no la fija a mano.
    const { container } = pintar(
      <ScorecardPanel subjectCode="math" title={T("Constancia", "Consistency")}>
        <EffortTrend series={TRES_DIAS} summary={RESUMEN} />
      </ScorecardPanel>,
    );
    expect(container.innerHTML).not.toContain("--cet-ink-muted");
  });
});

/* ================================================================== *
 * 2. La comparacion con la clase y su umbral
 * ================================================================== */

const COMPARACION = {
  studentLabel: T("Ana", "Ana"),
  studentValueText: "128 min",
  studentRatio: 0.8,
  classLabel: T("Media de la clase", "Class average"),
  classValueText: "96 min",
  classRatio: 0.6,
  summary: T("Ana estudia por encima de su clase.", "Ana studies above her class."),
} as const;

const GRUPO_PEQUENO = T(
  "Sin comparacion: el grupo es demasiado pequeno.",
  "No comparison: the group is too small.",
);

describe("CohortComparison — con cohorte pequena no hay comparacion", () => {
  it("el umbral es CINCO, y esta escrito aqui a proposito", () => {
    // Los casos de abajo estan parametrizados por `MIN_COHORTE`, asi que se
    // adaptarian solos si alguien bajara el umbral y seguirian en verde. El
    // numero se fija AQUI para que bajarlo obligue a tocar este fichero y a leer
    // por que es cinco (ver la cabecera de `scorecard-data.ts`): por debajo, un
    // companero mueve la media mas de un 20 % y su dato se despeja restando.
    expect(MIN_COHORTE).toBe(5);
  });

  it(`se pinta a partir de ${MIN_COHORTE} alumnos`, () => {
    const { container } = pintar(
      <CohortComparison {...COMPARACION} cohortSize={MIN_COHORTE} tooSmallText={GRUPO_PEQUENO} />,
    );
    expect(container.querySelector('[data-cet-comparacion="visible"]')).toBeTruthy();
    expect(container.querySelectorAll("rect[data-cet-barra]")).toHaveLength(2);
  });

  it(`con ${MIN_COHORTE - 1} alumnos NO se pinta ninguna barra`, () => {
    const { container } = pintar(
      <CohortComparison
        {...COMPARACION}
        cohortSize={MIN_COHORTE - 1}
        tooSmallText={GRUPO_PEQUENO}
      />,
    );
    expect(container.querySelectorAll("rect[data-cet-barra]")).toHaveLength(0);
    expect(container.textContent).not.toContain("96 min");
    expect(container.textContent).not.toContain("128 min");
  });

  it("con cohorte pequena explica por que no esta, en vez de desaparecer sin mas", () => {
    const { container } = pintar(
      <CohortComparison {...COMPARACION} cohortSize={2} tooSmallText={GRUPO_PEQUENO} />,
    );
    expect(container.querySelector('[data-cet-comparacion="oculta"]')).toBeTruthy();
    expect(container.textContent).toContain(GRUPO_PEQUENO.es);
  });

  it("sin la frase que lo explica no escribe ningun literal: no pinta nada (AD-7)", () => {
    const { container } = pintar(<CohortComparison {...COMPARACION} cohortSize={2} />);
    expect(container.innerHTML.trim()).toBe("");
  });

  it("un tamano que no es un numero utilizable tampoco pinta comparacion", () => {
    // `NaN < 5` es `false`: una comparacion escrita a mano dejaria pasar el caso
    // peor —«no sabemos cuantos son»— como si fuera una cohorte grande.
    for (const tamano of [Number.NaN, Number.POSITIVE_INFINITY * 0, -1]) {
      const { container } = pintar(
        <CohortComparison {...COMPARACION} cohortSize={tamano} tooSmallText={GRUPO_PEQUENO} />,
      );
      expect(container.querySelectorAll("rect[data-cet-barra]")).toHaveLength(0);
    }
    expect(hayCohorteSuficiente(Number.NaN)).toBe(false);
    expect(hayCohorteSuficiente(MIN_COHORTE - 0.5)).toBe(false);
    expect(hayCohorteSuficiente(MIN_COHORTE)).toBe(true);
  });

  it("el alumno y la clase se distinguen por la forma, no por el tono", () => {
    const { container } = pintar(<CohortComparison {...COMPARACION} cohortSize={24} />);
    const alumno = container.querySelector('rect[data-cet-barra="alumno"]');
    const clase = container.querySelector('rect[data-cet-barra="clase"]');
    expect(alumno?.getAttribute("fill")).toBe("currentColor");
    expect(alumno?.getAttribute("stroke-dasharray")).toBeNull();
    expect(clase?.getAttribute("fill")).toBe("none");
    expect(clase?.getAttribute("stroke-dasharray")).toBe("3 2");
  });

  it("las dos cifras van escritas, y los dos rotulos tambien", () => {
    const { container } = pintar(<CohortComparison {...COMPARACION} cohortSize={24} />);
    expect(container.textContent).toContain("128 min");
    expect(container.textContent).toContain("96 min");
    expect(container.textContent).toContain("Ana");
    expect(container.textContent).toContain("Media de la clase");
  });

  it("las dos barras comparten eje: el mismo valor da la misma longitud", () => {
    const { container } = pintar(
      <CohortComparison {...COMPARACION} studentRatio={0.5} classRatio={0.5} cohortSize={24} />,
    );
    const anchos = Array.from(container.querySelectorAll("rect[data-cet-barra]")).map((r) =>
      r.getAttribute("width"),
    );
    expect(anchos[0]).toBe(anchos[1]);
  });

  it("el ancho sale del dato: dos comparaciones distintas se dibujan distinto", () => {
    const ancho = (ratio: number): string | null => {
      const { container } = pintar(
        <CohortComparison {...COMPARACION} studentRatio={ratio} cohortSize={24} />,
      );
      return container.querySelector('rect[data-cet-barra="alumno"]')?.getAttribute("width") ?? null;
    };
    expect(ancho(0.2)).not.toBe(ancho(0.9));
  });
});

/* ================================================================== *
 * 3. Destrezas y tiempo por leccion
 * ================================================================== */

const DESTREZAS: readonly SkillEntry[] = [
  { name: T("Comparar fracciones", "Compare fractions"), level: "starting" },
  { name: T("Simplificar", "Simplify"), level: "mastered" },
  { name: T("Unidades metricas", "Metric units"), level: null },
  { name: T("Sumar fracciones", "Add fractions"), level: "solid" },
];

describe("SkillList — fortalezas arriba, flojeras abajo, sin medir al final", () => {
  it("ordena de mas a menos nivel y deja lo no medido al final", () => {
    const { container } = pintar(<SkillList items={DESTREZAS} />);
    const nombres = Array.from(container.querySelectorAll("li")).map(
      (li) => li.querySelector("span")?.textContent,
    );
    expect(nombres).toEqual([
      "Simplificar",
      "Sumar fracciones",
      "Comparar fracciones",
      "Unidades metricas",
    ]);
  });

  it("una destreza sin medir no pinta escalera: no hay «nivel cero»", () => {
    const { container } = pintar(
      <SkillList items={[{ name: T("Simplificar", "Simplify"), level: "solid" }, DESTREZAS[2] as SkillEntry]} />,
    );
    const filas = Array.from(container.querySelectorAll("li"));
    expect(within(filas[0] as HTMLElement).queryAllByRole("img")).toHaveLength(1);
    expect(within(filas[1] as HTMLElement).queryAllByRole("img")).toHaveLength(0);
  });

  it("reutiliza la escalera de la casa, con la palabra del nivel escrita", () => {
    const { container } = pintar(
      <SkillList items={[{ name: T("Simplificar", "Simplify"), level: "mastered" }]} />,
    );
    // Cuatro peldanos: el mismo dibujo que ve el alumno en /practice.
    expect(container.querySelectorAll("svg rect")).toHaveLength(4);
    expect(screen.getByRole("img", { name: /^Simplificar: .+ \(4\/4\)$/ })).toBeTruthy();
  });

  it("sin ninguna destreza medida no pinta nada", () => {
    const { container } = pintar(
      <SkillList items={[{ name: T("A", "A"), level: null }, { name: T("B", "B"), level: null }]} />,
    );
    expect(container.innerHTML.trim()).toBe("");
  });

  it("la evidencia que la aplicacion no pasa no deja un hueco (AD-7)", () => {
    const { container } = pintar(
      <SkillList items={[{ name: T("Simplificar", "Simplify"), level: "solid" }]} />,
    );
    expect(container.querySelectorAll("li > span")).toHaveLength(2);
  });
});

const LECCIONES: readonly LessonTime[] = [
  { name: "Fracciones equivalentes", minutes: 12, minutesText: "12 min" },
  { name: "Valor posicional", minutes: 47, minutesText: "47 min" },
  { name: "Unidades metricas", minutes: 3, minutesText: "3 min" },
];

describe("LessonTimeBreakdown — donde se concentra el esfuerzo", () => {
  it("ordena de mas a menos tiempo: la respuesta esta en la primera fila", () => {
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    const nombres = Array.from(container.querySelectorAll('li[data-cet-fila="leccion"]')).map(
      (li) => li.querySelector("span")?.textContent,
    );
    expect(nombres).toEqual(["Valor posicional", "Fracciones equivalentes", "Unidades metricas"]);
  });

  it("la longitud sale de los minutos, contra un solo eje", () => {
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    const anchos = Array.from(container.querySelectorAll('rect[data-cet-barra="minutos"]')).map((r) =>
      Number(r.getAttribute("width")),
    );
    expect(anchos[0]).toBeGreaterThan(anchos[1] as number);
    expect(anchos[1]).toBeGreaterThan(anchos[2] as number);
  });

  it("la cifra va escrita en cada fila: el dibujo no es el unico canal", () => {
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    for (const texto of ["12 min", "47 min", "3 min"]) {
      expect(container.textContent).toContain(texto);
    }
  });

  it("sin un solo minuto no pinta nada", () => {
    const { container } = pintar(
      <LessonTimeBreakdown
        items={[{ name: "Vacia", minutes: 0, minutesText: "0 min" }]}
      />,
    );
    expect(container.innerHTML.trim()).toBe("");
  });
});

/* ================================================================== *
 * 4. La caja se importa, y el informe se monta en orden
 * ================================================================== */

describe("ScorecardPanel — la caja es la de la casa", () => {
  it("lleva exactamente las clases de CARD_CHROME, no una copia parecida", () => {
    const { container } = pintar(
      <ScorecardPanel subjectCode="math" title={T("Esfuerzo", "Effort")}>
        <p>contenido</p>
      </ScorecardPanel>,
    );
    const panel = container.querySelector('[data-cet-panel="scorecard"]') as HTMLElement;
    for (const clase of CARD_CHROME.split(/\s+/)) {
      // `hover:shadow-pop` es la unica que se retira, y a proposito: el panel no
      // se pulsa y una caja que se levanta promete un clic que no existe.
      if (clase === "hover:shadow-pop") continue;
      expect(panel.className, `falta la clase de caja ${clase}`).toContain(clase);
    }
    expect(panel.className).not.toContain("hover:shadow-pop");
  });

  it("el color sale de la identidad de la materia, no de un hexadecimal escrito aqui", () => {
    const { container } = pintar(
      <ScorecardPanel subjectCode="science" title={T("Esfuerzo", "Effort")}>
        <p>contenido</p>
      </ScorecardPanel>,
    );
    const panel = container.querySelector('[data-cet-panel="scorecard"]') as HTMLElement;
    expect(panel.getAttribute("data-subject")).toBe("science");
    expect(panel.style.backgroundColor).toContain("--cet-materia-science-suave");
  });

  it("el titulo va solo en su fila: la cabecera es medallon y nombre", () => {
    const { container } = pintar(
      <ScorecardPanel subjectCode="math" title={T("Esfuerzo", "Effort")}>
        <p>contenido</p>
      </ScorecardPanel>,
    );
    const cabecera = container.querySelector('[data-cet-fila="cabecera"]') as HTMLElement;
    expect(cabecera.textContent).toBe("Esfuerzo");
    expect(cabecera.querySelectorAll("[data-cet-dia], [data-cet-barra]")).toHaveLength(0);
  });

  it("sin titulo no pinta una cabecera vacia (AD-7)", () => {
    const { container } = pintar(
      <ScorecardPanel subjectCode="math">
        <p>contenido</p>
      </ScorecardPanel>,
    );
    expect(container.querySelector('[data-cet-fila="cabecera"]')).toBeNull();
  });
});

const INFORME = {
  subjectCode: "math",
  studentName: "Ana Ruiz Blanco",
  statsTitle: T("Resumen", "Summary"),
  stats: [
    { value: "128", label: T("Minutos", "Minutes") },
    { value: "9", label: T("Sesiones", "Sessions") },
    { value: "74 %", label: T("Acierto", "Accuracy") },
    { value: "5", label: T("Racha maxima", "Longest streak") },
  ],
  effort: { title: T("Constancia", "Consistency"), series: TRES_DIAS, summary: RESUMEN },
  skills: { title: T("Destrezas", "Skills"), items: DESTREZAS },
  cohort: { title: T("Su clase", "Their class"), cohortSize: 24, ...COMPARACION },
  lessons: { title: T("Tiempo por leccion", "Time per lesson"), items: LECCIONES },
} as const;

describe("StudyScorecard — el informe montado", () => {
  it("monta un panel por bloque con datos", () => {
    const { container } = pintar(<StudyScorecard {...INFORME} />);
    expect(container.querySelectorAll('[data-cet-panel="scorecard"]')).toHaveLength(5);
  });

  it("el nombre del alumno encabeza y no comparte fila con ningun indicador", () => {
    pintar(<StudyScorecard {...INFORME} />);
    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toBe("Ana Ruiz Blanco");
    expect(titulo.querySelectorAll("svg")).toHaveLength(0);
  });

  it("un bloque sin datos que lo sostengan no deja un panel con un hueco debajo", () => {
    const { container } = pintar(
      <StudyScorecard
        subjectCode="math"
        studentName="Ana Ruiz Blanco"
        effort={{
          title: T("Constancia", "Consistency"),
          series: [{ label: T("A", "A"), minutes: null }],
          summary: RESUMEN,
        }}
        skills={{ title: T("Destrezas", "Skills"), items: [{ name: T("A", "A"), level: null }] }}
        lessons={{
          title: T("Tiempo", "Time"),
          items: [{ name: "Vacia", minutes: 0, minutesText: "0 min" }],
        }}
      />,
    );
    expect(container.querySelectorAll('[data-cet-panel="scorecard"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("Constancia");
    expect(container.textContent).not.toContain("Destrezas");
  });

  it("con cohorte pequena el panel de la clase no monta barras, solo la explicacion", () => {
    const { container } = pintar(
      <StudyScorecard
        {...INFORME}
        cohort={{
          title: T("Su clase", "Their class"),
          ...COMPARACION,
          cohortSize: 3,
          tooSmallText: GRUPO_PEQUENO,
        }}
      />,
    );
    // Las barras de la comparacion, no las del reparto por leccion: el informe
    // completo tambien monta esas y comparten atributo.
    expect(container.querySelectorAll('rect[data-cet-barra="alumno"]')).toHaveLength(0);
    expect(container.querySelectorAll('rect[data-cet-barra="clase"]')).toHaveLength(0);
    expect(container.textContent).toContain(GRUPO_PEQUENO.es);
  });

  it("con cohorte pequena y sin explicacion, el panel de la clase no existe", () => {
    const { container } = pintar(
      <StudyScorecard
        {...INFORME}
        cohort={{ title: T("Su clase", "Their class"), ...COMPARACION, cohortSize: 3 }}
      />,
    );
    expect(container.textContent).not.toContain("Su clase");
    expect(container.querySelectorAll('[data-cet-panel="scorecard"]')).toHaveLength(4);
  });

  it("las cifras del encabezado son texto, sin un dibujo que las repita", () => {
    // Un medidor al lado de «74 %» diria en barritas lo que la cifra ya dice.
    const { container } = pintar(
      <StudyScorecard
        subjectCode="math"
        studentName="Ana Ruiz Blanco"
        statsTitle={INFORME.statsTitle}
        stats={INFORME.stats}
      />,
    );
    expect(container.textContent).toContain("74 %");
    expect(container.querySelectorAll("svg rect")).toHaveLength(0);
  });
});

/* ================================================================== *
 * 5. Accesibilidad automatizada
 * ================================================================== */

describe("scorecard — accesibilidad (jest-axe)", () => {
  it("el informe completo no tiene violaciones", async () => {
    const { container } = pintar(
      <main>
        <StudyScorecard {...INFORME} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("el informe con la comparacion oculta tampoco", async () => {
    const { container } = pintar(
      <main>
        <StudyScorecard
          {...INFORME}
          cohort={{
            title: T("Su clase", "Their class"),
            ...COMPARACION,
            cohortSize: 2,
            tooSmallText: GRUPO_PEQUENO,
          }}
        />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ================================================================== *
 * 7. La constancia profesionalizada: escala, eje, apoyo y alcance
 * ================================================================== */

/**
 * Lo que fija este bloque es lo que separa un dibujo de informe de una barra
 * decorativa: que la regla vertical NO la invente el componente, que el detalle
 * llegue tambien por teclado, y que el unico rotulo directo sea el que la
 * aplicacion haya escrito. Nada de esto se comprueba por el color.
 */
describe("EffortTrend — la regla, el eje y el alcance", () => {
  const CORTES = [
    { value: 30, text: "30 min" },
    { value: 60, text: "60 min" },
    { value: 90, text: "90 min" },
  ] as const;

  const SERIE: readonly EffortDay[] = [
    { label: T("Lunes: 30 minutos", "Monday: 30 minutes"), minutes: 30, tick: "1 sep" },
    { label: T("Martes: 0 minutos", "Tuesday: 0 minutes"), minutes: 0 },
    { label: T("Miercoles: 60 minutos", "Wednesday: 60 minutes"), minutes: 60 },
  ];

  const blancos = (container: HTMLElement): SVGRectElement[] =>
    Array.from(container.querySelectorAll("rect[data-cet-alcance]"));

  it("sin yTicks no aparece ninguna rejilla ni calle de rotulos", () => {
    const { container } = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    // La unica linea del dibujo es la base; ninguna linea de rejilla mas.
    expect(container.querySelectorAll("svg line")).toHaveLength(1);
  });

  it("con yTicks pinta una rejilla continua por corte, con su rotulo", () => {
    const { container } = pintar(
      <EffortTrend series={SERIE} summary={RESUMEN} yTicks={CORTES} />,
    );
    // Tres cortes + la linea base.
    expect(container.querySelectorAll("svg line")).toHaveLength(CORTES.length + 1);
    for (const corte of CORTES) expect(container.textContent).toContain(corte.text);

    // Continua: el guion ya significa «sin registro» en este dibujo.
    for (const linea of Array.from(container.querySelectorAll("svg line"))) {
      expect(linea.getAttribute("stroke-dasharray")).toBeNull();
    }
  });

  it("el tope de la escala es el corte mas alto, no el maximo del dato", () => {
    // Con tope 90 y un dia de 60, la columna no puede llegar arriba del todo.
    const conRegla = pintar(<EffortTrend series={SERIE} summary={RESUMEN} yTicks={CORTES} />);
    const sinRegla = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    const masAlta = (c: HTMLElement): number =>
      Math.max(...barrasDeDia(c).map((r) => Number(r.getAttribute("height"))));

    expect(masAlta(conRegla.container)).toBeLessThan(masAlta(sinRegla.container));
  });

  it("el ancla del eje horizontal solo sale en los dias que la traen", () => {
    const { container } = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    const anclas = Array.from(container.querySelectorAll("text[data-cet-ancla]"));
    expect(anclas.map((n) => n.textContent)).toEqual(["1 sep"]);
  });

  it("hay un blanco apuntable por dia, alcanzable con el tabulador y con nombre", () => {
    const { container } = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    const marcas = blancos(container);
    expect(marcas).toHaveLength(SERIE.length);
    for (const marca of marcas) expect(marca.getAttribute("tabindex")).toBe("0");
    expect(marcas.map((m) => m.getAttribute("aria-label"))).toEqual([
      "Lunes: 30 minutos",
      "Martes: 0 minutos",
      "Miercoles: 60 minutos",
    ]);
  });

  it("el foco del teclado abre el mismo aviso que el raton, y al salir se cierra", () => {
    const { container } = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    const primero = blancos(container)[0] as SVGRectElement;

    expect(container.querySelector("[data-cet-aviso]")).toBeNull();

    fireEvent.focus(primero);
    expect(container.querySelector("[data-cet-aviso]")?.textContent).toBe("Lunes: 30 minutos");
    // Y el dia apuntado se realza con FORMA, no con tono.
    expect(container.querySelector("[data-cet-realce]")).toBeTruthy();

    fireEvent.blur(primero);
    expect(container.querySelector("[data-cet-aviso]")).toBeNull();
    expect(container.querySelector("[data-cet-realce]")).toBeNull();
  });

  it("el raton produce exactamente el mismo aviso que el foco", () => {
    const { container } = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    const ultimo = blancos(container)[2] as SVGRectElement;
    fireEvent.mouseEnter(ultimo);
    expect(container.querySelector("[data-cet-aviso]")?.textContent).toBe(
      "Miercoles: 60 minutos",
    );
    fireEvent.mouseLeave(ultimo);
    expect(container.querySelector("[data-cet-aviso]")).toBeNull();
  });

  it("sin peakText no hay ningun rotulo directo sobre las columnas", () => {
    const { container } = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    expect(container.querySelectorAll("text[data-cet-pico]")).toHaveLength(0);
  });

  it("con peakText se rotula UN solo dia, el mas alto", () => {
    const { container } = pintar(
      <EffortTrend series={SERIE} summary={RESUMEN} peakText="60 min" />,
    );
    const picos = Array.from(container.querySelectorAll("text[data-cet-pico]"));
    expect(picos).toHaveLength(1);
    expect(picos[0]?.textContent).toBe("60 min");
  });

  it("la franja del eje entra en el alto del svg: nunca un scroll anidado", () => {
    const alto = (node: Element | null): number => Number(node?.getAttribute("height"));
    const conEje = pintar(<EffortTrend series={SERIE} summary={RESUMEN} />);
    const sinEje = pintar(
      <EffortTrend series={SERIE.map(({ tick: _t, ...d }) => d)} summary={RESUMEN} />,
    );
    expect(alto(conEje.container.querySelector("svg"))).toBeGreaterThan(
      alto(sinEje.container.querySelector("svg")),
    );
  });

  it("el dibujo con regla, eje, pico y alcance sigue sin violaciones de axe", async () => {
    const { container } = pintar(
      <main>
        <EffortTrend series={SERIE} summary={RESUMEN} yTicks={CORTES} peakText="60 min" />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ================================================================== *
 * 6. La geometria de las barras horizontales
 * ================================================================== *
 * Lo que fija este bloque no es «se ve bonito»: es que el dibujo no MIENTA
 * sobre su propia escala. Las dos listas de barras horizontales se dibujaban
 * con `preserveAspectRatio="none"` sobre un `viewBox` de cien unidades, o sea
 * con una escala por eje. Con eso, el radio de una esquina salia elipse, el
 * trazo habia que salvarlo con `vector-effect` y el mismo `width` numerico
 * valia una distancia distinta en cada ancho de panel. Se comprueba aqui —y no
 * a ojo— porque el sintoma es invisible en una captura de un solo ancho.
 */

describe("barras horizontales — la escala es una sola y el extremo redondea", () => {
  const LIENZOS = [
    {
      nombre: "CohortComparison",
      pintarlo: () => pintar(<CohortComparison {...COMPARACION} cohortSize={24} />),
      barra: 'rect[data-cet-barra="alumno"]',
    },
    {
      nombre: "LessonTimeBreakdown",
      pintarlo: () => pintar(<LessonTimeBreakdown items={LECCIONES} />),
      barra: 'rect[data-cet-barra="minutos"]',
    },
  ] as const;

  for (const caso of LIENZOS) {
    it(`${caso.nombre}: el lienzo se dibuja 1:1, sin estirar un eje contra el otro`, () => {
      const { container } = caso.pintarlo();
      const svg = container.querySelector("svg") as SVGSVGElement;

      // Un `preserveAspectRatio="none"` es literalmente «deforma el dibujo».
      expect(svg.getAttribute("preserveAspectRatio")).toBeNull();

      // Y el viewBox mide lo mismo que la caja: una unidad, un pixel.
      const partes = (svg.getAttribute("viewBox") ?? "").split(" ");
      expect(partes[2]).toBe(svg.getAttribute("width"));
      expect(partes[3]).toBe(svg.getAttribute("height"));
    });

    it(`${caso.nombre}: el extremo de dato redondea con el radio de la casa`, async () => {
      const { RADIO_DE_DATO } = await import("../src/reports/chart-chrome.js");
      const { container } = caso.pintarlo();
      const barra = container.querySelector(caso.barra) as SVGRectElement;
      expect(Number(barra.getAttribute("rx"))).toBe(RADIO_DE_DATO);
    });

    it(`${caso.nombre}: el extremo que apoya sale cuadrado, no redondo`, () => {
      // Un `rx` redondea las cuatro esquinas y no hay atributo para pedir dos.
      // La barra desborda el radio hacia la izquierda y se recorta en el
      // origen: por eso su `x` es negativa y lleva un `clip-path`. Si alguien
      // quita el recorte, la barra despega del cero con dos esquinas redondas.
      const { container } = caso.pintarlo();
      const barra = container.querySelector(caso.barra) as SVGRectElement;
      expect(Number(barra.getAttribute("x"))).toBeLessThan(0);
      expect(barra.getAttribute("clip-path")).toBeTruthy();
    });

    it(`${caso.nombre}: ya no hay trazo compensado: no queda que compensar`, () => {
      const { container } = caso.pintarlo();
      expect(container.querySelectorAll("[vector-effect]")).toHaveLength(0);
    });

    it(`${caso.nombre}: el grueso de la barra no pasa del tope de la casa`, async () => {
      const { GRUESO_MAXIMO } = await import("../src/reports/chart-chrome.js");
      const { container } = caso.pintarlo();
      const barra = container.querySelector(caso.barra) as SVGRectElement;
      expect(Number(barra.getAttribute("height"))).toBeLessThanOrEqual(GRUESO_MAXIMO);
    });
  }

  it("CohortComparison: la linea de origen es rejilla continua, nunca un guion", () => {
    // El guion ya significa «esto no es tuyo, es referencia» en la barra de la
    // clase. La linea que marca el cero —y que cierra el contorno de esa barra
    // hueca, cuyo canto se lleva el recorte— tiene que ir continua y en tinta
    // de rejilla, o el dibujo tendria dos cosas distintas dichas igual.
    const { container } = pintar(<CohortComparison {...COMPARACION} cohortSize={24} />);
    const rejilla = Array.from(container.querySelectorAll("svg rect")).filter(
      (r) => r.getAttribute("data-cet-barra") === null && r.getAttribute("opacity") !== null,
    );
    expect(rejilla.length).toBeGreaterThan(0);
    for (const marca of rejilla) {
      expect(marca.getAttribute("stroke-dasharray")).toBeNull();
    }
  });

  it("las dos barras de la comparacion siguen distinguiendose por la forma", () => {
    // Lo mismo que ya fija el bloque 2, repetido aqui a proposito: la geometria
    // se ha rehecho entera y la firma no cromatica es lo que no puede caerse.
    const { container } = pintar(<CohortComparison {...COMPARACION} cohortSize={24} />);
    const alumno = container.querySelector('rect[data-cet-barra="alumno"]');
    const clase = container.querySelector('rect[data-cet-barra="clase"]');
    expect(alumno?.getAttribute("fill")).toBe("currentColor");
    expect(clase?.getAttribute("fill")).toBe("none");
    expect(clase?.getAttribute("stroke-dasharray")).toBe("3 2");
  });
});

/* ================================================================== *
 * 7. La fila de leccion: parte del total y respuesta al teclado
 * ================================================================== */

describe("LessonTimeBreakdown — la parte del total y la respuesta de la fila", () => {
  it("escribe la parte del total SOLO si la aplicacion la pasa (AD-7)", () => {
    const { container } = pintar(
      <LessonTimeBreakdown
        items={[
          { name: "Valor posicional", minutes: 47, minutesText: "47 min", shareText: "44 %" },
        ]}
      />,
    );
    expect(container.textContent).toContain("44 %");
    expect(container.querySelectorAll('[data-cet-parte="del-total"]')).toHaveLength(1);
  });

  it("sin ese texto la fila no deja un hueco ni inventa un porcentaje", () => {
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    expect(container.querySelectorAll('[data-cet-parte="del-total"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("%");
  });

  it("cada fila se alcanza con el tabulador, no solo con el raton", () => {
    // Si la fila solo respondiera al raton, quien navega con teclado se quedaria
    // sin la unica ayuda para no perder la linea en una lista larga (WCAG 2.1.1).
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    const filas = Array.from(container.querySelectorAll('li[data-cet-fila="leccion"]'));
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila.getAttribute("tabindex")).toBe("0");
    }
  });

  it("la respuesta al raton y al foco es de FORMA, y es la misma para los dos", () => {
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    const fila = container.querySelector('li[data-cet-fila="leccion"]') as HTMLElement;
    const nombre = fila.querySelector("span") as HTMLElement;

    // Contorno al foco y subrayado en las dos entradas: nada que dependa del tono.
    expect(fila.className).toContain("focus-visible:outline-2");
    expect(nombre.className).toContain("group-hover:underline");
    expect(nombre.className).toContain("group-focus-visible:underline");

    // Y ni una clase de fondo de color como respuesta: en escala de grises no
    // pasa nada, que es la prueba de que el canal no es el tono.
    expect(fila.className).not.toMatch(/(hover|focus-visible):bg-/);
  });

  it("el nombre sigue sin compartir renglon con la barra (obs003)", () => {
    const { container } = pintar(<LessonTimeBreakdown items={LECCIONES} />);
    const fila = container.querySelector('li[data-cet-fila="leccion"]') as HTMLElement;
    const nombre = fila.querySelector("span") as HTMLElement;
    // El nombre es el primer hijo de la fila y el dibujo cuelga de otro bloque.
    expect(nombre.parentElement).toBe(fila);
    expect(nombre.querySelectorAll("svg")).toHaveLength(0);
  });
});
