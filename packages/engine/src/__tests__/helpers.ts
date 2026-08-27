/**
 * Utilidades de test. No forman parte del paquete publicado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { createRng } from "../rng.js";

/**
 * Lista de semillas "aleatorias" pero REPRODUCIBLE: si un test falla con la
 * semilla 8.147.283.914 queremos poder volver a ella manana. Usar Math.random()
 * aqui haria que el guardian del determinismo fuese, el mismo, no determinista.
 */
export function seedList(count: number, streamSeed = 20260826): number[] {
  const rng = createRng(streamSeed);
  const seeds: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // 53 bits a partir de dos palabras de 32.
    const hi = rng.nextUint32() % 2097152; // 21 bits
    const lo = rng.nextUint32();
    seeds.push(hi * 4294967296 + lo);
  }
  return seeds;
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedFraction {
  readonly n: number;
  readonly d: number;
}

const FRACTION_SPAN =
  /<span class="f"><span class="a">(-?\d+)<\/span><span class="b">(-?\d+)<\/span><\/span>/g;
const MIXED_SPAN =
  /<span class="mixw">(-?\d+)<\/span><span class="f"><span class="a">(-?\d+)<\/span><span class="b">(-?\d+)<\/span><\/span>/g;

/** Todas las fracciones apiladas del enunciado, en orden de aparicion. */
export function fractionsIn(html: string): ParsedFraction[] {
  const out: ParsedFraction[] = [];
  FRACTION_SPAN.lastIndex = 0;
  let m = FRACTION_SPAN.exec(html);
  while (m !== null) {
    out.push({ n: Number(m[1]), d: Number(m[2]) });
    m = FRACTION_SPAN.exec(html);
  }
  return out;
}

/** Todos los numeros mixtos del enunciado, en orden de aparicion. */
export function mixedIn(html: string): { w: number; n: number; d: number }[] {
  const out: { w: number; n: number; d: number }[] = [];
  MIXED_SPAN.lastIndex = 0;
  let m = MIXED_SPAN.exec(html);
  while (m !== null) {
    out.push({ w: Number(m[1]), n: Number(m[2]), d: Number(m[3]) });
    m = MIXED_SPAN.exec(html);
  }
  return out;
}

/** Numeros sueltos del texto del enunciado, ya sin separadores de miles. */
export function numbersIn(html: string): number[] {
  const text = stripTags(html).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  return matches === null ? [] : matches.map(Number);
}

/** Puntos del poligono de una figura SVG generada por math.shape. */
export function polygonPoints(svg: string): [number, number][] {
  const match = /points="([^"]+)"/.exec(svg);
  if (match === null || match[1] === undefined) return [];
  return match[1]
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",");
      return [Number(x), Number(y)] as [number, number];
    });
}

/** Area por la formula del zapatero (Gauss). Comprobacion independiente del generador. */
export function shoelaceArea(points: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}
