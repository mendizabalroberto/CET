/**
 * Una cota que no se lee no es una cota.
 *
 * La observacion `obs/obs002.png` es el caso real: en `math.shape` los numeros
 * de los lados salian en negro por defecto sobre un trazo azul marino de 57 px,
 * y el alumno no podia leer "7 m" ni el "?" que tenia que deducir. El fallo no
 * fue elegir mal un color: fue que NADIE eligio color. El texto SVG sin `fill`
 * hereda el negro del navegador y cae sobre lo que haya debajo.
 *
 * Estas pruebas fijan la regla contraria: una etiqueta lleva SIEMPRE su propia
 * placa opaca y su propia tinta, y el par tiene contraste medido. Asi la
 * legibilidad deja de depender del dibujo, del tema claro/oscuro y de la suerte.
 */

import { describe, expect, it } from "vitest";
import {
  FIGURE_SVG_ATTRIBUTES,
  LABEL_PALETTES,
  contrastRatio,
  svgLabel,
  type LabelTone,
} from "../svg-label.js";

const TONOS: readonly LabelTone[] = ["neutral", "unknown"];

describe("contrastRatio", () => {
  it("da 21 entre negro y blanco, y 1 entre un color y el mismo", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#173a63", "#173a63")).toBeCloseTo(1, 5);
  });

  it("es simetrico y acepta la forma corta de tres digitos", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(contrastRatio("#000", "#fff"), 10);
  });

  it("rechaza lo que no es un hexadecimal en vez de devolver un numero falso", () => {
    expect(() => contrastRatio("rojo", "#fff")).toThrow();
    expect(() => contrastRatio("#12345", "#fff")).toThrow();
  });
});

describe("las paletas de etiqueta", () => {
  it.each(TONOS)("'%s' pasa AAA (>= 7:1) entre su tinta y su placa", (tono) => {
    const paleta = LABEL_PALETTES[tono];
    expect(contrastRatio(paleta.ink, paleta.plate)).toBeGreaterThanOrEqual(7);
  });

  it.each(TONOS)("'%s' separa su placa del relleno y del trazo de la figura", (tono) => {
    // La placa tiene que VERSE como una tarjeta encima del dibujo, no fundirse
    // con el. 3:1 es el umbral de 1.4.11 para elementos no textuales.
    const paleta = LABEL_PALETTES[tono];
    expect(contrastRatio(paleta.plate, "#173a63")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(paleta.border, paleta.plate)).toBeGreaterThanOrEqual(1.2);
  });

  it("la placa es opaca: sin canal alfa no hay nada del fondo que se cuele", () => {
    for (const tono of TONOS) {
      const paleta = LABEL_PALETTES[tono];
      expect(paleta.plate).toMatch(/^#[0-9a-f]{6}$/i);
      expect(paleta.ink).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("svgLabel", () => {
  const base = { x: 100, y: 50, text: "13 m" } as const;

  it("pinta la placa ANTES del texto: el orden es lo que tapa el dibujo", () => {
    const svg = svgLabel(base);
    expect(svg.indexOf("<rect")).toBeGreaterThanOrEqual(0);
    expect(svg.indexOf("<rect")).toBeLessThan(svg.indexOf("<text"));
  });

  it("no deja NUNCA el texto sin fill, ni la placa sin fill", () => {
    for (const tono of TONOS) {
      const svg = svgLabel({ ...base, tone: tono });
      const text = /<text\b[^>]*>/.exec(svg)?.[0] ?? "";
      const rect = /<rect\b[^>]*>/.exec(svg)?.[0] ?? "";
      expect(text).toMatch(/\bfill="#[0-9a-f]{6}"/i);
      expect(rect).toMatch(/\bfill="#[0-9a-f]{6}"/i);
      // Sin tamano explicito el navegador pone 16 px y la cota se come el dibujo.
      expect(text).toMatch(/\bfont-size="\d/);
    }
  });

  it("la placa envuelve el texto: nunca es mas estrecha que lo que lleva dentro", () => {
    const corta = svgLabel({ ...base, text: "?" });
    const larga = svgLabel({ ...base, text: "128 cm" });
    // `\s` y no `\b`: con `\b` el "width" de `stroke-width` tambien casaba, y
    // la prueba comparaba el grosor del filo consigo mismo en vez del ancho.
    const ancho = (svg: string): number => Number(/<rect\b[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
    expect(ancho(larga)).toBeGreaterThan(ancho(corta));
    expect(ancho(corta)).toBeGreaterThan(0);
  });

  it("centra la placa en el mismo punto en el que ancla el texto", () => {
    const rect = (svg: string): { x: number; y: number; w: number; h: number } => {
      const m = /<rect\b[^>]*\sx="([-\d.]+)"[^>]*\sy="([-\d.]+)"[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg);
      if (m === null) throw new Error(`el rect no sale bien formado: ${svg}`);
      return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
    };

    const medio = rect(svgLabel({ ...base, anchor: "middle" }));
    expect(medio.x + medio.w / 2).toBeCloseTo(100, 6);
    expect(medio.y + medio.h / 2).toBeCloseTo(50, 6);

    const inicio = rect(svgLabel({ ...base, anchor: "start" }));
    expect(inicio.x).toBeLessThanOrEqual(100);
    expect(inicio.x + inicio.w).toBeGreaterThan(100);

    const fin = rect(svgLabel({ ...base, anchor: "end" }));
    expect(fin.x + fin.w).toBeGreaterThanOrEqual(100);
    expect(fin.x).toBeLessThan(100);
  });

  it("escapa el texto: una cota es dato, no marcado", () => {
    const svg = svgLabel({ ...base, text: "<script>x</script> & 5" });
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
  });

  it("solo usa atributos que las dos allowlists del proyecto dejan pasar", () => {
    const svg = svgLabel(base);
    const usados = [...svg.matchAll(/\s([a-zA-Z-]+)="/g)].map((m) => m[1] as string);
    expect(usados.length).toBeGreaterThan(0);
    for (const attr of usados) expect(FIGURE_SVG_ATTRIBUTES).toContain(attr);
  });
});

describe("FIGURE_SVG_ATTRIBUTES", () => {
  it("es el contrato que las dos allowlists tienen que cumplir, y no esta vacio", () => {
    expect(FIGURE_SVG_ATTRIBUTES.length).toBeGreaterThan(5);
    expect(new Set(FIGURE_SVG_ATTRIBUTES).size).toBe(FIGURE_SVG_ATTRIBUTES.length);
  });
});
