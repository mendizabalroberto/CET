/**
 * @cet/ui — INVARIANTE DE FAMILIA: ningun indicador de progreso pinta un valor
 * que no venga de sus datos.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FAMILIA CAZA ESTE TEST
 * ===========================================================================
 * La barra decorativa. El fallo clasico de esta funcionalidad no es un calculo
 * mal hecho: es un indicador que SE PINTA IGUAL pase lo que pase con los datos.
 * Sale de tres sitios, y los tres compilan, tipan, lintan y pasan cualquier test
 * de snapshot:
 *
 *   1. `style={{ width: "62%" }}` que se quedo de la maqueta;
 *   2. una prop de datos que el componente recibe y no usa para nada;
 *   3. un `?? 0` que convierte "no hay dato" en "cero por ciento", y entonces un
 *      alumno que no ha empezado ve exactamente lo mismo que uno que va mal.
 *
 * Este proyecto ya vivio esa familia en la base de datos: `skill_mastery` tiene
 * CERO filas porque nadie la escribe, y aun asi `getStudentCourses()` la lee
 * como si fuera la verdad. Una barra alimentada de ahi habria sido creible y
 * falsa durante meses.
 *
 * ===========================================================================
 * COMO LO CAZA, SIN LEER UNA SOLA IMPLEMENTACION
 * ===========================================================================
 * Renderizando. A cada indicador se le dan N entradas DISTINTAS y se exige que
 * produzca N firmas distintas. Los tres fallos de arriba producen la MISMA firma
 * para entradas distintas, asi que fallan aqui aunque el codigo parezca correcto.
 *
 * La firma es lo que percibe alguien que no distingue colores: texto accesible
 * mas geometria. NO incluye los atributos de color, a proposito: un indicador
 * que solo cambiara de tono con los datos seguiria siendo inaccesible, asi que
 * para este test es como si no cambiara.
 *
 * Y ademas: todo indicador que admita "no hay dato" tiene que no pintar NADA.
 * Cero no es ausencia.
 *
 * Anadir un fichero a `src/progress/` sin declararlo aqui hace fallar el test:
 * es lo que impide que el proximo indicador se salte la comprobacion.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { MasteryLadder } from "../src/progress/MasteryLadder.js";
import { EffortMeter } from "../src/progress/EffortMeter.js";
import { MasteryMeter } from "../src/data/MasteryMeter.js";
import { ProgressBar } from "../src/data/ProgressBar.js";
import { ScoreRing } from "../src/data/ScoreRing.js";
import { StatTile } from "../src/data/StatTile.js";

/** `vitest.config.ts` vive en la raiz del paquete, asi que cwd es `packages/ui`. */
const PROGRESS_DIR = join(process.cwd(), "src", "progress");

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });
const GRUPO = T("Comparar", "Compare");

/**
 * Atributos que llevan GEOMETRIA. `fill` y `stroke` quedan fuera porque son
 * color; `stroke-dasharray` entra porque un trazo discontinuo se ve sin color.
 */
const ATRIBUTOS_DE_FORMA = [
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "width",
  "height",
  "d",
  "points",
  "stroke-dasharray",
  "stroke-width",
  "aria-valuenow",
  "aria-valuetext",
  "aria-label",
  "style",
] as const;

/**
 * Los mismos, quitando todo lo que sea texto o valor declarado. Es lo que un
 * ojo ve: longitudes, alturas, radios, cuantos elementos hay. `style` entra
 * porque ahi es donde una barra escribe su `width: 62%`.
 */
const ATRIBUTOS_DE_DIBUJO = [
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "width",
  "height",
  "d",
  "points",
  "stroke-dasharray",
  "style",
] as const;

/**
 * Lo que percibe quien no distingue colores. Si dos entradas distintas dan la
 * misma firma, el indicador no esta diciendo nada sobre sus datos.
 */
function firma(el: HTMLElement): string {
  const nodos = Array.from(el.querySelectorAll("*"))
    .map((n) =>
      [
        n.tagName,
        ...ATRIBUTOS_DE_FORMA.map((a) => `${a}=${n.getAttribute(a) ?? ""}`),
      ].join(","),
    )
    .join("|");
  return `${(el.textContent ?? "").trim()}##${nodos}`;
}

/**
 * Solo el DIBUJO: ni texto ni etiquetas.
 *
 * Existe porque la primera version de este test se dejaba enganar. Un indicador
 * con `const escalones = 3` fijo seguia pasando, porque su etiqueta accesible SI
 * cambiaba con los datos y eso ya bastaba para que las firmas fueran distintas.
 * Es decir: cazaba la mentira en el texto y dejaba pasar la barra decorativa,
 * que es justo la que da nombre a este fichero. Comprobado mutando
 * `MasteryLadder` a un valor constante.
 */
function firmaGeometrica(el: HTMLElement): string {
  return Array.from(el.querySelectorAll("*"))
    .map((n) =>
      [n.tagName, ...ATRIBUTOS_DE_DIBUJO.map((a) => `${a}=${n.getAttribute(a) ?? ""}`)].join(","),
    )
    .join("|");
}

function pintar(nodo: ReactNode): { firma: string; dibujo: string; vacio: boolean } {
  const { container, unmount } = render(<LocaleProvider locale="es">{nodo}</LocaleProvider>);
  const resultado = {
    firma: firma(container),
    dibujo: firmaGeometrica(container),
    vacio: container.innerHTML.trim() === "",
  };
  unmount();
  return resultado;
}

interface Declaracion {
  /** Al menos dos entradas DISTINTAS. Cada una tiene que dar una firma distinta. */
  readonly entradas: readonly ReactNode[];
  /**
   * `true` si el componente DIBUJA la magnitud (barra, anillo, escalones) y por
   * tanto su geometria tiene que cambiar con los datos. `false` solo cuando el
   * numero ES el componente y no hay dibujo que pueda mentir.
   */
  readonly dibuja: boolean;
  /**
   * Entrada que significa "no hay dato". Tiene que renderizar VACIO.
   * `null` cuando el componente exige siempre un dato (y entonces no puede
   * inventarse uno).
   */
  readonly sinDato: ReactNode | null;
}

/**
 * Clave: fichero relativo a `src/`. Todo `.tsx` de `src/progress/` tiene que
 * estar aqui; los de `src/data/` estan porque tambien pintan magnitudes y la
 * familia es la misma.
 */
const INDICADORES: Readonly<Record<string, Declaracion>> = {
  "progress/MasteryLadder.tsx": {
    dibuja: true,
    entradas: [
      <MasteryLadder level="starting" groupLabel={GRUPO} />,
      <MasteryLadder level="learning" groupLabel={GRUPO} />,
      <MasteryLadder level="solid" groupLabel={GRUPO} />,
      <MasteryLadder level="mastered" groupLabel={GRUPO} />,
    ],
    // El caso que motiva todo: sin evidencia no se dibuja una escalera vacia.
    sinDato: <MasteryLadder level={null} groupLabel={GRUPO} />,
  },
  "progress/EffortMeter.tsx": {
    dibuja: true,
    entradas: [
      <EffortMeter targets={1} message={T("1 acierto", "1 right answer")} />,
      <EffortMeter targets={2} message={T("2 aciertos", "2 right answers")} />,
      <EffortMeter targets={5} message={T("5 aciertos", "5 right answers")} />,
    ],
    // "Ya no te falta nada" no se pinta con cero circulos: no se pinta.
    sinDato: <EffortMeter targets={0} message={T("Dominado", "Mastered")} />,
  },
  "data/MasteryMeter.tsx": {
    dibuja: true,
    entradas: [
      <MasteryMeter mastery={0.1} skillLabel={GRUPO} />,
      <MasteryMeter mastery={0.45} skillLabel={GRUPO} />,
      <MasteryMeter mastery={0.7} skillLabel={GRUPO} />,
      <MasteryMeter mastery={0.95} skillLabel={GRUPO} />,
    ],
    sinDato: null,
  },
  "data/ProgressBar.tsx": {
    dibuja: true,
    entradas: [
      <ProgressBar value={10} max={100} label={GRUPO} />,
      <ProgressBar value={55} max={100} label={GRUPO} />,
      <ProgressBar value={90} max={100} label={GRUPO} />,
    ],
    sinDato: null,
  },
  "data/ScoreRing.tsx": {
    dibuja: true,
    entradas: [
      <ScoreRing value={3} max={20} />,
      <ScoreRing value={11} max={20} />,
      <ScoreRing value={20} max={20} />,
    ],
    sinDato: null,
  },
  "data/StatTile.tsx": {
    dibuja: false,
    entradas: [
      <StatTile value="0" label={GRUPO} />,
      <StatTile value="7" label={GRUPO} />,
      <StatTile value="19" label={GRUPO} />,
    ],
    sinDato: null,
  },
};

describe("invariante — ningun indicador de progreso pinta un valor sin datos detras", () => {
  it("todo componente de src/progress/ esta declarado (uno nuevo no puede colarse)", () => {
    const ficheros = readdirSync(PROGRESS_DIR)
      .filter((n) => n.endsWith(".tsx"))
      .map((n) => `progress/${n}`);

    expect(ficheros.length, "src/progress/ esta vacio: el test no prueba nada").toBeGreaterThan(0);

    const sinDeclarar = ficheros.filter((f) => !(f in INDICADORES));
    expect(
      sinDeclarar,
      "Declara estos indicadores en INDICADORES con al menos dos entradas distintas:\n  " +
        sinDeclarar.join("\n  "),
    ).toEqual([]);
  });

  it("no sobra ninguna declaracion", () => {
    const existentes = new Set([
      ...readdirSync(PROGRESS_DIR)
        .filter((n) => n.endsWith(".tsx"))
        .map((n) => `progress/${n}`),
      ...readdirSync(join(process.cwd(), "src", "data"))
        .filter((n) => n.endsWith(".tsx"))
        .map((n) => `data/${n}`),
    ]);
    expect(Object.keys(INDICADORES).filter((c) => !existentes.has(c))).toEqual([]);
  });

  describe.each(Object.entries(INDICADORES).map(([clave, d]) => ({ clave, d })))(
    "$clave",
    ({ d }) => {
      it("entradas distintas producen dibujos distintos (una constante daria el mismo)", () => {
        const firmas = d.entradas.map((nodo) => pintar(nodo).firma);
        expect(
          new Set(firmas).size,
          "Dos entradas distintas han pintado exactamente lo mismo. O el valor no llega " +
            "al dibujo, o el dibujo sale de una constante.\n" +
            JSON.stringify(firmas, null, 2),
        ).toBe(firmas.length);
      });

      it("el DIBUJO tambien cambia con los datos, no solo la etiqueta", () => {
        if (!d.dibuja) return;
        const dibujos = d.entradas.map((nodo) => pintar(nodo).dibujo);
        expect(
          new Set(dibujos).size,
          "El texto cambia con los datos pero el dibujo NO: es una barra decorativa. " +
            "Alguien que no lee la etiqueta —o sea, el nino— ve siempre lo mismo.",
        ).toBe(dibujos.length);
      });

      it("ninguna firma esta vacia (un indicador que no pinta nada pasaria el test anterior por accidente)", () => {
        for (const nodo of d.entradas) {
          expect(pintar(nodo).vacio).toBe(false);
        }
      });

      if (d.sinDato !== null) {
        it("sin dato no pinta NADA: cero no es ausencia", () => {
          expect(pintar(d.sinDato).vacio).toBe(true);
        });
      }
    },
  );
});
