/**
 * La figura que sale del motor tiene que sobrevivir a los DOS saneados.
 *
 * `obs/obs002.png` no fue un fallo de dibujo: fue un fallo de frontera. El
 * motor emitia `vector-effect="non-scaling-stroke"`, su propia allowlist lo
 * dejaba pasar, y la de `@cet/ui` —otro paquete, otra lista, escrita otro dia—
 * lo quitaba al pintar. Resultado: un trazo de 2,2 unidades multiplicado por la
 * escala 26, una banda azul marino de 57 px, y las cotas encima en negro.
 *
 * De ahi las dos reglas que fijan estas pruebas:
 *
 *   1. La figura solo usa atributos de `FIGURE_SVG_ATTRIBUTES`, la lista que
 *      las dos allowlists se comprometen a respetar.
 *   2. El dibujo no cambia al pasar por el saneado. Si alguien vuelve a
 *      apoyarse en un atributo que una lista no conoce, falla aqui y no en la
 *      pantalla del alumno.
 */

import { describe, expect, it } from "vitest";
import { FIGURE_SVG_ATTRIBUTES, contrastRatio } from "@cet/shared";
import { generate } from "../index.js";
import { seedList } from "./helpers.js";
import { sanitizeSvg } from "../sanitize.js";

const SEEDS = seedList(200, 20260828);

function figura(seed: number): string {
  const item = generate("math.shape", {}, seed);
  const svg = item.body.figureSvg;
  expect(svg).toBeDefined();
  return svg as string;
}

/**
 * Atributos que aparecen de verdad en una cadena SVG, en minusculas.
 *
 * En minusculas porque el saneado del motor normaliza los nombres y el `viewBox`
 * persistido sale como `viewbox`. No es un problema: el parser HTML del
 * navegador le devuelve el camello al insertarlo, y la allowlist de `@cet/ui`
 * lo re-escribe con `SVG_CASE`. Comparar sin distinguir mayusculas es lo unico
 * que refleja como viaja de verdad el atributo.
 */
function atributos(svg: string): readonly string[] {
  return [
    ...new Set(
      [...svg.matchAll(/\s([a-zA-Z][a-zA-Z-]*)="/g)].map((m) => (m[1] as string).toLowerCase()),
    ),
  ];
}

const CONTRATO = FIGURE_SVG_ATTRIBUTES.map((a) => a.toLowerCase());

describe("la figura de math.shape", () => {
  it("solo usa atributos del contrato compartido", () => {
    for (const seed of SEEDS) {
      for (const attr of atributos(figura(seed))) {
        expect(CONTRATO, `atributo fuera del contrato: ${attr}`).toContain(attr);
      }
    }
  });

  it("no depende de vector-effect: el trazo ya viene dividido por la escala", () => {
    for (const seed of SEEDS) {
      const svg = figura(seed);
      expect(svg).not.toContain("vector-effect");
      const grosor = Number(/<polygon\b[^>]*\sstroke-width="([\d.]+)"/.exec(svg)?.[1]);
      const escala = Number(/scale\((\d+)\)/.exec(svg)?.[1]);
      expect(escala).toBeGreaterThan(1);
      // Lo que ve el alumno es grosor x escala, y tiene que ser un trazo fino.
      expect(grosor * escala).toBeGreaterThan(1);
      expect(grosor * escala).toBeLessThan(4);
    }
  });

  it("el saneado del motor no le quita nada", () => {
    for (const seed of SEEDS) {
      const svg = figura(seed);
      expect(sanitizeSvg(svg, "strip")).toBe(svg);
    }
  });

  it("toda cota lleva su tarjeta: ningun <text> se queda sin fill ni sin fondo", () => {
    for (const seed of SEEDS) {
      const svg = figura(seed);
      const textos = [...svg.matchAll(/<text\b[^>]*>/g)].map((m) => m[0]);
      const placas = [...svg.matchAll(/<rect\b[^>]*>/g)].map((m) => m[0]);
      expect(textos.length).toBe(6);
      // Una placa por cota: si sobra o falta una, alguna cota va a pelo.
      expect(placas.length).toBe(textos.length);
      for (const t of textos) {
        expect(t).toMatch(/\bfill="#[0-9a-f]{6}"/i);
        expect(t).toMatch(/\bfont-size="\d/);
      }
      for (const r of placas) expect(r).toMatch(/\bfill="#[0-9a-f]{6}"/i);
    }
  });

  it("ninguna tarjeta se sale del viewBox: un SVG en linea recorta a su vista", () => {
    for (const seed of SEEDS) {
      const svg = figura(seed);
      const vista = /viewbox="0 0 ([\d.]+) ([\d.]+)"/i.exec(svg);
      const ancho = Number(vista?.[1]);
      const alto = Number(vista?.[2]);
      for (const m of svg.matchAll(
        /<rect\b[^>]*\sx="([-\d.]+)"[^>]*\sy="([-\d.]+)"[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/g,
      )) {
        const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
        expect(x, `cota fuera por la izquierda (semilla ${seed})`).toBeGreaterThanOrEqual(0);
        expect(y, `cota fuera por arriba (semilla ${seed})`).toBeGreaterThanOrEqual(0);
        expect(x + w, `cota fuera por la derecha (semilla ${seed})`).toBeLessThanOrEqual(ancho);
        expect(y + h, `cota fuera por abajo (semilla ${seed})`).toBeLessThanOrEqual(alto);
      }
    }
  });

  it("cada cota tiene contraste AAA contra su propia placa", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const svg = figura(seed);
      const pares = [...svg.matchAll(/<rect\b[^>]*\sfill="(#[0-9a-f]{6})"[^>]*>\s*<text\b[^>]*\sfill="(#[0-9a-f]{6})"/gi)];
      expect(pares.length).toBe(6);
      for (const par of pares) {
        expect(contrastRatio(par[2] as string, par[1] as string)).toBeGreaterThanOrEqual(7);
      }
    }
  });
});
