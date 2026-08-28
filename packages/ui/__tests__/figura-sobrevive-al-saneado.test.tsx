/**
 * La otra mitad del contrato de `obs/obs002.png`.
 *
 * El motor emite la figura y `@cet/ui` la pinta despues de `sanitizeSvg`. Son
 * dos allowlists, en dos paquetes, escritas en dos dias distintos, y no habia
 * nada que las obligase a coincidir. Se desincronizaron: `vector-effect` estaba
 * permitido alli y prohibido aqui, el trazo de la figura compuesta se multiplico
 * por la escala y aparecio una banda azul marino de 57 px encima de las cotas.
 *
 * `FIGURE_SVG_ATTRIBUTES` es ahora esa obligacion escrita, y esta prueba es la
 * mitad que le toca a la interfaz: si alguien quita un atributo de la lista de
 * aqui, se entera al construir y no por una captura de pantalla.
 *
 * (`packages/engine/src/__tests__/figura-legible.test.ts` es la otra mitad: que
 * el motor no emita nada fuera de la lista.)
 */

import { describe, expect, it } from "vitest";
import { FIGURE_SVG_ATTRIBUTES, contrastRatio, svgLabel } from "@cet/shared";
import { sanitizeSvg } from "../src/lib/sanitize.js";

/** Un valor legitimo para cada atributo del contrato. */
const VALOR: Readonly<Record<string, string>> = {
  viewBox: "0 0 100 50",
  width: "100",
  height: "50",
  role: "img",
  "aria-hidden": "true",
  transform: "translate(4 4) scale(2)",
  points: "0,0 10,0 10,10",
  d: "M0 0 L10 10",
  x: "4",
  y: "6",
  rx: "3",
  ry: "3",
  fill: "#eef4fb",
  "fill-rule": "evenodd",
  stroke: "#173a63",
  "stroke-width": "1.5",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "text-anchor": "middle",
  "dominant-baseline": "central",
  "font-family": "system-ui, sans-serif",
  "font-size": "13",
  "font-weight": "600",
};

describe("sanitizeSvg y el contrato de figuras", () => {
  it.each(FIGURE_SVG_ATTRIBUTES)("deja pasar %s", (attr) => {
    const valor = VALOR[attr];
    expect(valor, `falta un valor de ejemplo para ${attr}`).toBeDefined();
    // En un <rect>, que es la etiqueta que acepta mas atributos de geometria.
    const limpio = sanitizeSvg(`<svg><rect ${attr}="${valor as string}" /></svg>`);
    expect(limpio.toLowerCase()).toContain(attr.toLowerCase());
  });

  it("no toca una etiqueta de cota: llega entera a la pantalla del alumno", () => {
    for (const tone of ["neutral", "unknown"] as const) {
      const etiqueta = svgLabel({ x: 40, y: 20, text: "13 m", anchor: "middle", tone });
      const limpio = sanitizeSvg(`<svg>${etiqueta}</svg>`);

      const placa = /<rect\b[^>]*\sfill="(#[0-9a-fA-F]{6})"/.exec(limpio)?.[1];
      const tinta = /<text\b[^>]*\sfill="(#[0-9a-fA-F]{6})"/.exec(limpio)?.[1];
      expect(placa, "el saneado se ha comido el fondo de la tarjeta").toBeDefined();
      expect(tinta, "el saneado se ha comido el color del texto").toBeDefined();
      // Lo que de verdad importa medir: lo que queda DESPUES de sanear.
      expect(contrastRatio(tinta as string, placa as string)).toBeGreaterThanOrEqual(7);

      expect(limpio).toContain("13 m");
      expect(limpio).toMatch(/font-size="13"/);
      // La placa antes que el texto: si el saneado reordenara, la cota
      // quedaria debajo de su propio fondo.
      expect(limpio.indexOf("<rect")).toBeLessThan(limpio.indexOf("<text"));
    }
  });

  it("sigue quitando lo peligroso: el contrato no ha abierto ninguna puerta", () => {
    const sucio = `<svg onload="x()"><script>alert(1)</script><rect fill="#fff" style="x" id="a" /></svg>`;
    const limpio = sanitizeSvg(sucio);
    expect(limpio).not.toContain("script");
    expect(limpio).not.toContain("onload");
    expect(limpio).not.toContain("style");
    expect(limpio).not.toContain("id=");
  });
});
