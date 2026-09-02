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
import { fireEvent, render, screen, within } from "@testing-library/react";
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

/**
 * ===========================================================================
 * EL RELOJ COMO GRAFICO PROFESIONAL: LIENZO MEDIDO, ESCALA Y CAPA DE DETALLE
 * ===========================================================================
 * Lo de arriba fija que el reloj no MIENTE. Esto fija que el reloj se LEE, que
 * es la otra mitad y la que se cae sola en cuanto alguien toca el dibujo:
 *
 *  1. **El lienzo se mide.** El reparto viejo daba 238 px clavados dentro de un
 *     panel de 560, con la mitad del panel en blanco al lado. Se comprueba que
 *     el `viewBox` es el ancho dibujado y que las columnas se reparten ese
 *     ancho, no un numero escrito a mano.
 *  2. **La escala, si llega, manda ella.** El tope del eje es el corte mas alto
 *     y NO el maximo de los datos: si mandara el dato, el ultimo rotulo quedaria
 *     por debajo de la columna mas alta, que es un adorno y no una escala.
 *  3. **La rejilla es continua.** El guion ya significa «esto no es tuyo» y «de
 *     ese dia no hay registro» en los hermanos de esta carpeta.
 *  4. **El detalle no vive solo en el raton.** El globo del navegador no aparece
 *     con el teclado; se comprueba que el foco abre EXACTAMENTE el mismo aviso
 *     que el puntero, y que cada hora es alcanzable y se llama con su frase.
 *  5. **Un solo numero sobre el dibujo, y solo si lo escribe la aplicacion.**
 */
describe("reloj del dia — el dibujo se lee, no solo es cierto", () => {
  const RELOJ = relojCon({ 21: 12, 22: 30 });
  const CORTES = [
    { value: 30, text: "30 min" },
    { value: 60, text: "60 min" },
  ];

  it("el lienzo es el ancho medido, y las columnas se lo reparten", () => {
    const { container } = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    const svg = container.querySelector("svg")!;
    const ancho = Number(svg.getAttribute("width"));
    // Un pixel del viewBox es un pixel de pantalla: ni escalado ni deformado.
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${ancho} ${svg.getAttribute("height")}`);
    const xs = columnas(container).map((c) => Number(c.getAttribute("x")));
    // La ultima columna llega al borde derecho del lienzo, no a los 238 px de
    // un reparto fijo. Un decimo de holgura para el aire del carril.
    expect(xs.at(-1)!).toBeGreaterThan(ancho * 0.9);
  });

  it("sin cortes no hay escala dibujada, y el reloj sigue igual que siempre", () => {
    const { container } = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    expect(container.querySelectorAll("line[data-cet-rejilla]")).toHaveLength(0);
    expect(container.querySelectorAll('text[data-cet-rotulo="valor"]')).toHaveLength(0);
    expect(columnas(container)).toHaveLength(24);
  });

  it("con cortes, el tope del eje es el corte mas alto y no el dato mas alto", () => {
    const sinEscala = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    const conEscala = pintar(
      <DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} yTicks={CORTES} />,
    );
    const pico = (c: HTMLElement): number =>
      Math.max(...columnas(c).map((m) => Number(m.getAttribute("height"))));
    // El pico son 30 min. Contra su propio maximo llena el area; contra un eje
    // que llega a 60 mide la mitad. Si el tope fuera el dato, medirian igual.
    expect(pico(conEscala.container)).toBeLessThan(pico(sinEscala.container) * 0.75);
  });

  it("cada corte trae su linea CONTINUA y su rotulo, escrito por la aplicacion", () => {
    const { container } = pintar(
      <DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} yTicks={CORTES} />,
    );
    const rejilla = Array.from(container.querySelectorAll("line[data-cet-rejilla]"));
    expect(rejilla).toHaveLength(2);
    // Continua: el guion ya significa otra cosa en esta carpeta.
    expect(rejilla.every((l) => l.getAttribute("stroke-dasharray") === null)).toBe(true);
    const rotulos = Array.from(container.querySelectorAll('text[data-cet-rotulo="valor"]'));
    expect(rotulos.map((r) => r.textContent)).toEqual(["30 min", "60 min"]);
  });

  it("las horas ancladas llevan su vertical de referencia, y solo ellas", () => {
    const conRotulos = RELOJ.map((h) =>
      h.hour % 6 === 0 ? { ...h, tick: String(h.hour).padStart(2, "0") } : h,
    );
    const { container } = pintar(<DailyRhythm hours={conRotulos} summary={RESUMEN_RITMO} />);
    expect(container.querySelectorAll("line[data-cet-ancla]")).toHaveLength(4);
  });

  it("la marca apoya cuadrada en la linea base y solo redondea el extremo de dato", () => {
    const { container } = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    const marcas = columnas(container);
    const conEstudio = marcas.find((m) => m.getAttribute("data-cet-hora") === "con-minutos")!;
    const aCero = marcas.find((m) => m.getAttribute("data-cet-hora") === "cero")!;
    expect(Number(conEstudio.getAttribute("rx"))).toBeGreaterThan(0);
    // El zocalo del cero no es la punta de una medida: es el suelo.
    expect(Number(aCero.getAttribute("rx"))).toBe(0);
  });

  it("cada hora es un blanco alcanzable con el dedo y con el tabulador", () => {
    const { container } = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    const blancos = Array.from(container.querySelectorAll('rect[data-cet-blanco="hora"]'));
    expect(blancos).toHaveLength(24);
    expect(blancos.every((b) => b.getAttribute("tabindex") === "0")).toBe(true);
    // 24 px es el minimo de la casa para un dedo, aunque el carril sea menor.
    expect(blancos.every((b) => Number(b.getAttribute("width")) >= 24)).toBe(true);
    // Y se llama con la frase que redacta la aplicacion, no con un numero.
    expect(screen.getByRole("img", { name: "De 22:00 a 23:00: 30 min" })).toBeInTheDocument();
  });

  it("el foco del teclado abre el MISMO aviso que el raton", () => {
    const { container } = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    const blanco = container.querySelectorAll('rect[data-cet-blanco="hora"]')[22]!;

    expect(container.querySelector("[data-cet-aviso]")).toBeNull();
    fireEvent.focus(blanco);
    // Quien navega con tabulador se quedaba sin la capa de detalle entera.
    expect(container.querySelector("[data-cet-aviso]")?.textContent).toBe(
      "De 22:00 a 23:00: 30 min",
    );
    fireEvent.blur(blanco);
    expect(container.querySelector("[data-cet-aviso]")).toBeNull();

    fireEvent.pointerEnter(blanco);
    expect(container.querySelector("[data-cet-aviso]")?.textContent).toBe(
      "De 22:00 a 23:00: 30 min",
    );
  });

  it("la hora senalada responde con una FORMA, no con un tono", () => {
    const { container } = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    expect(container.querySelectorAll("rect[data-cet-carril]")).toHaveLength(0);
    fireEvent.focus(container.querySelectorAll('rect[data-cet-blanco="hora"]')[22]!);
    // Un carril que aparece lo ve tambien quien no distingue colores.
    expect(container.querySelectorAll("rect[data-cet-carril]")).toHaveLength(1);
  });

  it("la cifra sobre el dibujo es una sola, la del pico, y solo si llega escrita", () => {
    const sin = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} />);
    expect(sin.container.querySelectorAll("text[data-cet-pico]")).toHaveLength(0);

    const con = pintar(<DailyRhythm hours={RELOJ} summary={RESUMEN_RITMO} peakText="30 min" />);
    const cifras = Array.from(con.container.querySelectorAll("text[data-cet-pico]"));
    // Rotular las veinticuatro convertiria el dibujo en una tabla mal maquetada.
    expect(cifras.map((c) => c.textContent)).toEqual(["30 min"]);
    // Y va sobre la columna del pico (las 22 h), no sobre otra.
    const x = Number(cifras[0]!.getAttribute("x"));
    const pico = columnas(con.container)[22]!;
    const centro = Number(pico.getAttribute("x")) + Number(pico.getAttribute("width")) / 2;
    expect(Math.abs(x - centro)).toBeLessThan(1);
  });
});

/**
 * ===========================================================================
 * LA NUBE PROFESIONALIZADA: ESCALA, ANILLO Y BLANCO DE ALCANCE
 * ===========================================================================
 * Lo que cierran estos casos son las tres formas de romper la nube al darle
 * rejilla y aviso, ninguna de las cuales da error:
 *
 *  1. **La rejilla contradice a los datos.** Si el tope del eje saliera del
 *     maximo de los puntos y no del corte mas alto que rotula la aplicacion, el
 *     ultimo rotulo caeria por debajo del punto mas alto y la magnitud escrita
 *     mentiria. Y al reves: un corte por debajo del dato sacaria el punto fuera
 *     del marco, que es perder un dia sin avisar.
 *  2. **La rejilla se disfraza de dato.** Continua siempre: el guion ya significa
 *     «referencia» o «sin registro» en los hermanos de esta carpeta.
 *  3. **El foco cae en un agujero mudo.** El dibujo es `aria-hidden`, asi que
 *     nada enfocable puede vivir dentro; los blancos de alcance son la propia
 *     lista de dias y por eso cada dia se nombra UNA vez, no dos.
 */
describe("dispersion — la escala rotulada", () => {
  const CORTES_X = [
    { value: 15, text: "15 min" },
    { value: 30, text: "30 min" },
    { value: 45, text: "45 min" },
  ];
  const CORTES_Y = [
    { value: 1, text: "1 lec" },
    { value: 2, text: "2 lec" },
  ];

  it("sin cortes se comporta como siempre: topes escritos y solo los dos ejes", () => {
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(6))} />);
    expect(container.querySelectorAll("svg line")).toHaveLength(2);
    expect(container.querySelectorAll("[data-cet-rejilla]")).toHaveLength(0);
    expect(screen.getByText("40 min")).toBeInTheDocument();
    expect(screen.getByText("2 lecciones")).toBeInTheDocument();
  });

  it("con cortes hay rejilla rotulada, y el tope no se dice dos veces", () => {
    const { container } = pintar(
      <EffortOutcomeScatter {...propsDeNube(nubeDe(6))} xTicks={CORTES_X} yTicks={CORTES_Y} />,
    );
    expect(container.querySelectorAll('line[data-cet-rejilla="dispersion-x"]')).toHaveLength(3);
    expect(container.querySelectorAll('line[data-cet-rejilla="dispersion-y"]')).toHaveLength(2);

    const rotulosX = Array.from(container.querySelectorAll('text[data-cet-rotulo="dispersion-x"]'));
    expect(rotulosX.map((r) => r.textContent)).toEqual(["15 min", "30 min", "45 min"]);
    const rotulosY = Array.from(container.querySelectorAll('text[data-cet-rotulo="dispersion-y"]'));
    expect(rotulosY.map((r) => r.textContent)).toEqual(["1 lec", "2 lec"]);

    // El tope escrito se calla: con rejilla seria el mismo numero repetido.
    expect(screen.queryByText("40 min")).toBeNull();
    expect(screen.queryByText("2 lecciones")).toBeNull();
  });

  it("la rejilla es continua: el guion significa otra cosa en esta casa", () => {
    const { container } = pintar(
      <EffortOutcomeScatter {...propsDeNube(nubeDe(6))} xTicks={CORTES_X} yTicks={CORTES_Y} />,
    );
    const rejilla = Array.from(container.querySelectorAll("[data-cet-rejilla]"));
    expect(rejilla.length).toBeGreaterThan(0);
    for (const linea of rejilla) {
      expect(linea.getAttribute("stroke-dasharray")).toBeNull();
    }
  });

  it("ni con rejilla se dibuja una recta de tendencia", () => {
    const { container } = pintar(
      <EffortOutcomeScatter {...propsDeNube(nubeDe(6))} xTicks={CORTES_X} yTicks={CORTES_Y} />,
    );
    expect(container.querySelectorAll("svg path, svg polyline")).toHaveLength(0);
    // Toda linea del dibujo es un eje o un corte; ninguna se ajusta a los puntos.
    expect(container.querySelectorAll("svg line")).toHaveLength(2 + 3 + 2);
  });

  it("el tope del eje lo manda el corte mas alto, no el maximo de los puntos", () => {
    // Los mismos seis dias (maximo 45 min) con dos escalas distintas. Con el eje
    // hasta 90, el ultimo dia tiene que caer MAS A LA IZQUIERDA: si el tope
    // saliera de los datos, las dos nubes se pintarian identicas y el rotulo
    // «90 min» estaria mintiendo sobre el ancho del dibujo.
    const hasta45 = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(6))} xTicks={CORTES_X} />);
    const hasta90 = pintar(
      <EffortOutcomeScatter
        {...propsDeNube(nubeDe(6))}
        xTicks={[
          { value: 30, text: "30 min" },
          { value: 60, text: "60 min" },
          { value: 90, text: "90 min" },
        ]}
      />,
    );
    const ultimoDe = (c: HTMLElement): number =>
      Number(
        Array.from(c.querySelectorAll('circle[data-cet-punto="dia"]'))
          .at(-1)!
          .getAttribute("cx"),
      );
    expect(ultimoDe(hasta90.container)).toBeLessThan(ultimoDe(hasta45.container));
  });

  it("un corte por debajo del dato no saca el punto del marco", () => {
    // La aplicacion manda la escala, pero un corte equivocado no puede perder un
    // dia: el dato mas alto sigue dentro y el eje se estira hasta el.
    const { container } = pintar(
      <EffortOutcomeScatter {...propsDeNube(nubeDe(6))} xTicks={[{ value: 10, text: "10 min" }]} />,
    );
    const anchoDelLienzo = Number(container.querySelector("svg")!.getAttribute("width"));
    const xs = Array.from(container.querySelectorAll('circle[data-cet-punto="dia"]')).map((p) =>
      Number(p.getAttribute("cx")),
    );
    for (const x of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThanOrEqual(anchoDelLienzo);
    }
  });
});

describe("dispersion — el punto se puede contar y se puede apuntar", () => {
  it("cada dia es un disco de al menos 8 px con anillo de la superficie", () => {
    // Dos dias solapados se siguen contando porque cada disco conserva su borde.
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    for (const punto of Array.from(container.querySelectorAll('circle[data-cet-punto="dia"]'))) {
      expect(Number(punto.getAttribute("r"))).toBeGreaterThanOrEqual(4);
      expect(punto.getAttribute("stroke")).toBe("var(--cet-surface)");
      expect(Number(punto.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(2);
    }
  });

  it("el dibujo esta oculto al lector y no esconde nada enfocable dentro", () => {
    // `aria-hidden` con algo enfocable dentro es un usuario de teclado oyendo
    // silencio. Los blancos de alcance viven FUERA del svg, en la lista.
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("la lista de dias ES el blanco de alcance: un solo nodo por dia", () => {
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    const lista = container.querySelector('ul[data-cet-lista="dias-de-dispersion"]') as HTMLElement;
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);

    const blancos = within(lista).getAllByRole("img");
    expect(blancos).toHaveLength(5);
    // Nombre accesible: la frase que ya escribio la aplicacion, ni una inventada.
    expect(blancos[0]!).toHaveAttribute("aria-label", "Dia 1: 10 min");
    expect(blancos[0]!).toHaveAttribute("tabindex", "0");
    // Y el dia se nombra UNA vez, no dos.
    expect(screen.getAllByRole("img", { name: "Dia 1: 10 min" })).toHaveLength(1);
  });

  it("el foco y el raton abren el MISMO aviso, con la frase del dia", () => {
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    const blancos = screen.getAllByRole("img");
    expect(container.querySelector('[data-cet-aviso="grafico"]')).toBeNull();

    fireEvent.focus(blancos[2]!);
    expect(container.querySelector('[data-cet-aviso="grafico"]')).toHaveTextContent("Dia 3: 24 min");
    fireEvent.blur(blancos[2]!);
    expect(container.querySelector('[data-cet-aviso="grafico"]')).toBeNull();

    fireEvent.mouseEnter(blancos[1]!);
    expect(container.querySelector('[data-cet-aviso="grafico"]')).toHaveTextContent("Dia 2: 17 min");
    fireEvent.mouseLeave(blancos[1]!);
    expect(container.querySelector('[data-cet-aviso="grafico"]')).toBeNull();
  });

  it("el dia enfocado responde con el TAMANO, no con el tono", () => {
    // Un realce cromatico no existe en escala de grises. El disco crece.
    const { container } = pintar(<EffortOutcomeScatter {...propsDeNube(nubeDe(5))} />);
    const discos = (): Element[] =>
      Array.from(container.querySelectorAll('circle[data-cet-punto="dia"]'));
    const antes = discos().map((d) => d.getAttribute("r"));
    expect(new Set(antes).size).toBe(1);

    fireEvent.focus(screen.getAllByRole("img")[0]!);
    const despues = discos().map((d) => Number(d.getAttribute("r")));
    expect(despues[0]!).toBeGreaterThan(Number(antes[0]));
    expect(despues[1]!).toBe(Number(antes[1]));
    // Y el tono no se ha tocado: la tinta sigue siendo una sola.
    expect(new Set(discos().map((d) => d.getAttribute("fill"))).size).toBe(1);
  });

  it("la nube con rejilla y avisos no tiene violaciones de accesibilidad", async () => {
    const { container } = pintar(
      <EffortOutcomeScatter
        {...propsDeNube(nubeDe(6))}
        xTicks={[{ value: 45, text: "45 min" }]}
        yTicks={[{ value: 2, text: "2 lec" }]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
