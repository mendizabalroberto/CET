/**
 * @cet/ui — el reloj del dia y la nube de esfuerzo contra resultado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * Los dos dibujos nuevos del informe del tutor comparten con sus hermanos la
 * unica forma de romperse que importa: no dar error, sino producir una
 * conclusion falsa sobre un nino. Aqui se fijan las cuatro maneras concretas.
 *
 *  1. **Una nube con pocos dias no se pinta.** Por dos puntos pasa exactamente
 *     una recta, asi que una dispersion de dos dias enseña SIEMPRE una
 *     tendencia perfecta que no existe; el padre leeria «cuanto mas estudia,
 *     mas le cunde» de dos tardes cualesquiera. El umbral es
 *     `MIN_DIAS_DISPERSION` y se comprueba justo a los dos lados. Y los dias
 *     sin esfuerzo NO cuentan para llegar a el: cuatro puntos amontonados en el
 *     origen darian por bueno el dibujo sin un solo dato dentro.
 *  2. **Un reloj sin ni un minuto medido no se pinta.** Ocurre de verdad: las
 *     sesiones anteriores al cronometro tienen minutos en el resumen y ni un
 *     latido que atribuir a una hora. Veinticuatro columnas planas al lado de
 *     una baldosa que dice «44 min» es el informe contradiciendose solo.
 *  3. **Ninguna diferencia se cuenta con el color.** Lo que separa una hora de
 *     otra es la ALTURA y lo que separa un dia de otro es la POSICION. Se
 *     comprueba sobre la firma no cromatica, igual que en `scorecard.test.tsx`:
 *     si algun dia alguien codifica un estado en un tono, este test lo ve.
 *  4. **Ni un literal de cara al usuario dentro del paquete (AD-7).** Lo que la
 *     aplicacion no pasa, no se pinta — y en particular la nube que se retira
 *     sin frase que lo explique no deja un hueco, deja nada.
 *
 * Y lo que oye quien no ve los dibujos: los dos traen la lista de sus datos, y
 * las dos listas llevan SOLO lo que tiene contenido. Un lector de pantalla que
 * tuviera que atravesar veinte renglones de «no estudio» para llegar al dato
 * estaria peor atendido que uno que no tiene lista.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";

import { LocaleProvider } from "../src/lib/i18n.js";
import { DailyRhythm } from "../src/reports/DailyRhythm.js";
import { EffortOutcomeScatter } from "../src/reports/EffortOutcomeScatter.js";
import { StudyScorecard } from "../src/reports/StudyScorecard.js";
import {
  MIN_DIAS_DISPERSION,
  hayDispersionSuficiente,
  hayRitmoDiario,
  type EffortOutcomePoint,
  type HourActivity,
} from "../src/reports/scorecard-data.js";

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });

function pintar(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

/** Las veinticuatro horas, todas a cero. El reloj que devuelve la base. */
function relojVacio(): HourActivity[] {
  return Array.from({ length: 24 }, (_, hora) => ({
    hour: hora,
    minutes: 0,
    label: T(`De ${hora}:00 a ${hora + 1}:00: no estudio`, `${hora}:00 to ${hora + 1}:00: no study`),
  }));
}

/** El mismo reloj con minutos en las horas que se le pasen. */
function relojCon(minutosPorHora: Readonly<Record<number, number>>): HourActivity[] {
  return relojVacio().map((h) => {
    const minutos = minutosPorHora[h.hour];
    if (minutos === undefined) return h;
    return {
      ...h,
      minutes: minutos,
      label: T(
        `De ${h.hour}:00 a ${h.hour + 1}:00: ${minutos} min`,
        `${h.hour}:00 to ${h.hour + 1}:00: ${minutos} min`,
      ),
    };
  });
}

const RESUMEN_RITMO = T("Estudia de noche.", "They study at night.");

function columnas(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect[data-cet-hora]"));
}

/**
 * Firma NO cromatica de una marca: todo lo que percibe quien no distingue
 * colores. Deliberadamente sin ninguna clase ni atributo de tono.
 */
function firmaNoCromatica(marca: Element): string {
  const macizo = marca.getAttribute("fill") === "none" ? "hueco" : "macizo";
  return `${macizo}|${marca.getAttribute("stroke-dasharray") ?? "continuo"}|${marca.getAttribute("height") ?? ""}`;
}

/** `n` dias distintos con esfuerzo y con resultado. */
function nubeDe(n: number): EffortOutcomePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: 10 + i * 7,
    y: i % 3,
    label: T(`Dia ${i + 1}: ${10 + i * 7} min`, `Day ${i + 1}: ${10 + i * 7} min`),
  }));
}

const RESUMEN_NUBE = T("Un punto por dia.", "One dot per day.");
const POCOS = T("Hacen falta mas dias.", "More days needed.");

function propsDeNube(points: readonly EffortOutcomePoint[]) {
  return {
    points,
    summary: RESUMEN_NUBE,
    xAxisLabel: T("Tiempo de estudio", "Study time"),
    yAxisLabel: T("Lecciones terminadas", "Lessons finished"),
    xMaxText: "40 min",
    yMaxText: "2 lecciones",
  };
}

describe("reloj del dia — sin ni un minuto medido no se pinta", () => {
  it("veinticuatro horas a cero no son un reloj: son una ventana sin medicion", () => {
    expect(hayRitmoDiario(relojVacio())).toBe(false);
    const { container } = pintar(<DailyRhythm hours={relojVacio()} summary={RESUMEN_RITMO} />);
    expect(container.querySelector("svg")).toBeNull();
    // Y ni siquiera el resumen: sin dibujo no hay nada que resumir.
    expect(container.textContent).toBe("");
  });

  it("una sola hora con minutos ya es un reloj", () => {
    expect(hayRitmoDiario(relojCon({ 22: 18 }))).toBe(true);
  });

  it("un reloj vacio no monta su panel dentro del scorecard", () => {
    const { container } = pintar(
      <StudyScorecard
        subjectCode="otra"
        studentName="Leo"
        rhythm={{ title: T("A que hora", "When"), hours: relojVacio(), summary: RESUMEN_RITMO }}
      />,
    );
    expect(screen.queryByText("A que hora")).toBeNull();
    expect(container.querySelectorAll("rect[data-cet-hora]")).toHaveLength(0);
  });
});

describe("reloj del dia — lo que se ve y lo que se oye", () => {
  it("pinta las veinticuatro horas, tambien las de cero", () => {
    const { container } = pintar(
      <DailyRhythm hours={relojCon({ 21: 12, 22: 30 })} summary={RESUMEN_RITMO} />,
    );
    // El eje completo o no hay eje: un reloj con huecos no se lee.
    expect(columnas(container)).toHaveLength(24);
    expect(container.querySelectorAll('rect[data-cet-hora="con-minutos"]')).toHaveLength(2);
    expect(container.querySelectorAll('rect[data-cet-hora="cero"]')).toHaveLength(22);
  });

  it("una hora con estudio y una a cero se distinguen SIN mirar el color", () => {
    const { container } = pintar(
      <DailyRhythm hours={relojCon({ 22: 30 })} summary={RESUMEN_RITMO} />,
    );
    const marcas = columnas(container);
    const conEstudio = marcas.find((m) => m.getAttribute("data-cet-hora") === "con-minutos");
    const aCero = marcas.find((m) => m.getAttribute("data-cet-hora") === "cero");
    expect(conEstudio).toBeDefined();
    expect(aCero).toBeDefined();
    expect(firmaNoCromatica(conEstudio!)).not.toBe(firmaNoCromatica(aCero!));
  });

  it("la altura sale de los datos: dos relojes distintos no se pintan igual", () => {
    // La barra decorativa que persigue `progreso-viene-de-datos.test.tsx`,
    // aplicada al reloj: si la altura no dependiera de los minutos, estas dos
    // columnas medirian lo mismo.
    const flojo = pintar(<DailyRhythm hours={relojCon({ 22: 5, 23: 60 })} summary={RESUMEN_RITMO} />);
    const alturas = columnas(flojo.container)
      .filter((m) => m.getAttribute("data-cet-hora") === "con-minutos")
      .map((m) => Number(m.getAttribute("height")));
    expect(alturas[0]).toBeLessThan(alturas[1]!);
  });

  it("la lista alternativa trae solo las horas con estudio", () => {
    const { container } = pintar(
      <DailyRhythm hours={relojCon({ 21: 12, 22: 30 })} summary={RESUMEN_RITMO} />,
    );
    const lista = container.querySelector('ul[data-cet-lista="horas-con-estudio"]');
    expect(lista).not.toBeNull();
    // Dos renglones, no veinticuatro. Ver la cabecera.
    expect(within(lista as HTMLElement).getAllByRole("listitem")).toHaveLength(2);
  });

  it("el dibujo se llama con el resumen que pasa la aplicacion, y no con otro", () => {
    pintar(<DailyRhythm hours={relojCon({ 22: 30 })} summary={RESUMEN_RITMO} />);
    expect(screen.getByRole("img", { name: "Estudia de noche." })).toBeInTheDocument();
  });

  it("los rotulos del eje son los que pide la aplicacion, ni uno mas", () => {
    const conRotulos = relojCon({ 22: 30 }).map((h) =>
      h.hour === 0 || h.hour === 12 ? { ...h, tick: String(h.hour).padStart(2, "0") } : h,
    );
    const { container } = pintar(<DailyRhythm hours={conRotulos} summary={RESUMEN_RITMO} />);
    const rotulos = Array.from(container.querySelectorAll('text[data-cet-rotulo="hora"]'));
    expect(rotulos.map((r) => r.textContent)).toEqual(["00", "12"]);
  });
});

describe("dispersion — por debajo del umbral no se pinta la nube", () => {
  it("el umbral no puede bajar de tres: por dos puntos pasa una recta", () => {
    expect(MIN_DIAS_DISPERSION).toBeGreaterThanOrEqual(3);
  });

  it("justo por debajo no hay nube; justo en el umbral si", () => {
    expect(hayDispersionSuficiente(nubeDe(MIN_DIAS_DISPERSION - 1))).toBe(false);
    expect(hayDispersionSuficiente(nubeDe(MIN_DIAS_DISPERSION))).toBe(true);
  });

  it("los dias sin esfuerzo no cuentan para llegar al umbral", () => {
    // Cuatro puntos en el origen no son cuatro dias de datos: son cuatro dias
    // sin estudiar, y de ellos no sale ninguna respuesta sobre si el tiempo
    // cunde. Contarlos daria por bueno un dibujo vacio.
    const enElOrigen = Array.from({ length: MIN_DIAS_DISPERSION }, (_, i) => ({
      x: 0,
      y: 0,
      label: T(`Dia ${i}`, `Day ${i}`),
    }));
    expect(hayDispersionSuficiente(enElOrigen)).toBe(false);
  });

  it("con pocos dias se pinta la frase que lo explica, y NO la nube", () => {
    const { container } = pintar(
      <EffortOutcomeScatter {...propsDeNube(nubeDe(2))} tooFewText={POCOS} />,
    );
    expect(screen.getByText("Hacen falta mas dias.")).toBeInTheDocument();
    expect(container.querySelectorAll('circle[data-cet-punto="dia"]')).toHaveLength(0);
  });

  it("con pocos dias y SIN frase no se pinta nada (AD-7)", () => {
    // Un literal inventado aqui dentro es peor que la ausencia: saldria en un
    // idioma solo, y en el que le tocara al paquete y no al lector.
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(2))} />);
    expect(container.textContent).toBe("");
  });

  it("dentro del scorecard, sin frase el panel entero desaparece", () => {
    pintar(
      <StudyScorecard
        subjectCode="otra"
        studentName="Leo"
        outcome={{ title: T("Le cunde", "Paying off"), ...propsDeNube(nubeDe(2)) }}
      />,
    );
    expect(screen.queryByText("Le cunde")).toBeNull();
  });
});

describe("dispersion — un punto por dia, y ninguna raya de tendencia", () => {
  it("hay tantos puntos como dias con esfuerzo", () => {
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(6))} />);
    expect(container.querySelectorAll('circle[data-cet-punto="dia"]')).toHaveLength(6);
  });

  it("no se dibuja ninguna recta ajustada sobre los puntos", () => {
    // Las unicas lineas del dibujo son los dos ejes. Una tercera seria la
    // conclusion pintada con la misma tinta que los datos. Ver la cabecera del
    // componente: es la decision mas importante que toma.
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(6))} />);
    expect(container.querySelectorAll("svg line")).toHaveLength(2);
    expect(container.querySelectorAll("svg path, svg polyline")).toHaveLength(0);
  });

  it("dos dias distintos caen en sitios distintos, y no por el color", () => {
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(6))} />);
    const puntos = Array.from(container.querySelectorAll('circle[data-cet-punto="dia"]'));
    const posiciones = puntos.map((p) => `${p.getAttribute("cx")},${p.getAttribute("cy")}`);
    expect(new Set(posiciones).size).toBe(posiciones.length);
    // Todos con la misma tinta: el color no codifica nada.
    expect(new Set(puntos.map((p) => p.getAttribute("fill"))).size).toBe(1);
  });

  it("el eje empieza en cero: el punto de menos esfuerzo no se pega al borde", () => {
    // Un eje que empezara en el minimo de los datos exageraria las diferencias
    // —el engano de grafica mas repetido que hay—. Con el origen en cero, un
    // dia de 10 min sobre un maximo de 45 cae a un cuarto del ancho, no en el
    // extremo izquierdo.
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(6))} />);
    const puntos = Array.from(container.querySelectorAll('circle[data-cet-punto="dia"]'));
    const xs = puntos.map((p) => Number(p.getAttribute("cx")));
    const primero = xs[0]!;
    const ultimo = xs.at(-1)!;
    expect(primero).toBeGreaterThan(0);
    expect(primero).toBeLessThan(ultimo / 2);
  });

  it("la lista alternativa trae un renglon por dia", () => {
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    const lista = container.querySelector('ul[data-cet-lista="dias-de-dispersion"]');
    expect(lista).not.toBeNull();
    expect(within(lista as HTMLElement).getAllByRole("listitem")).toHaveLength(5);
  });

  it("el grupo se llama con el resumen que pasa la aplicacion", () => {
    pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    expect(screen.getByRole("group", { name: "Un punto por dia." })).toBeInTheDocument();
  });
});

describe("los dos paneles nuevos dentro del informe", () => {
  it("se montan con datos que los sostienen, y el orden es el del fichero", () => {
    const { container } = pintar(
      <StudyScorecard
        subjectCode="otra"
        studentName="Leo"
        rhythm={{
          title: T("A que hora estudia", "When they study"),
          hours: relojCon({ 21: 12, 22: 30 }),
          summary: RESUMEN_RITMO,
        }}
        outcome={{
          title: T("Le cunde el tiempo", "Is the time paying off"),
          ...propsDeNube(nubeDe(5)),
        }}
      />,
    );
    expect(screen.getByText("A que hora estudia")).toBeInTheDocument();
    expect(screen.getByText("Le cunde el tiempo")).toBeInTheDocument();

    const titulos = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent);
    expect(titulos.indexOf("A que hora estudia")).toBeLessThan(
      titulos.indexOf("Le cunde el tiempo"),
    );
  });

  it("el informe con los dos paneles nuevos no tiene violaciones de accesibilidad", async () => {
    const { container } = pintar(
      <StudyScorecard
        subjectCode="otra"
        studentName="Leo"
        rhythm={{
          title: T("A que hora estudia", "When they study"),
          hours: relojCon({ 21: 12, 22: 30 }),
          summary: RESUMEN_RITMO,
        }}
        outcome={{
          title: T("Le cunde el tiempo", "Is the time paying off"),
          ...propsDeNube(nubeDe(5)),
        }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
