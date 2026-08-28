/**
 * Tests del extractor de PDF: fracciones apiladas y filas de tabla.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Corren contra los PDF REALES de Y6A. Un fixture fabricado por mí colocaría el
 * numerador exactamente donde mi código lo espera, y entonces el test sólo
 * demostraría que sé escribir dos veces la misma constante. Lo que hay que
 * demostrar es otra cosa: que un examen que ya existía, hecho por un profesor
 * con un procesador de textos que nadie eligió, sale legible.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pdfToSpans } from "../src/corpus/pdf.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLAVE = join(repoRoot, "Y6A", "Math", "Grade 5 Math Exam - ANSWER KEY.pdf");
const EXAMEN = join(repoRoot, "Y6A", "Math", "Grade 5 Math Exam.pdf");
const BOOKLET = join(repoRoot, "Y6A", "Socials", "SSBooklet25.pdf");

const clave = await pdfToSpans(readFileSync(CLAVE));
const examen = await pdfToSpans(readFileSync(EXAMEN));
const booklet = await pdfToSpans(readFileSync(BOOKLET));

const textos = (r: { spans: { text: string }[] }): string[] => r.spans.map((s) => s.text);

describe("ANSWER KEY: cada respuesta con su número de pregunta", () => {
  it("pone pregunta y respuesta en el mismo span, separadas por la barra de celda", () => {
    // La barra es la convención que ya usa el extractor de .docx para las filas
    // de tabla: quien lee un span no tiene por qué saber de qué formato salió.
    expect(textos(clave)).toContain("1 | b) 3/4");
    expect(textos(clave)).toContain("6 | c) 0.0256");
    expect(textos(clave)).toContain("10 | c) 24 cm");
  });

  it("las diez de la sección A y las ocho de verdadero/falso son filas, no párrafos", () => {
    const filas = clave.spans.filter((s) => s.kind === "table_row" && s.page === 1);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(filas.some((s) => s.text.startsWith(`${n} | `))).toBe(true);
    }
    expect(filas.filter((s) => /^\d+ \| (TRUE|FALSE)$/.test(s.text))).toHaveLength(8);
  });

  it("no deja sueltos en la página 1 los números que eran mitad de una fracción", () => {
    // Antes de unir fracciones, la página 1 emitía spans "3", "4" y "31": el
    // numerador y el denominador convertidos en línea propia.
    const sueltos = clave.spans.filter((s) => s.page === 1 && /^\d+$/.test(s.text));
    expect(sueltos).toEqual([]);
  });
});

describe("fracciones apiladas", () => {
  it("une numerador y denominador en un solo texto", () => {
    expect(textos(clave)).toContain("3 | b) 31/7");
    expect(textos(clave)).toContain("4 | a) 7 5/6");
  });

  it("las une también dentro de una frase, en el sitio donde estaban", () => {
    expect(textos(clave)).toContain(
      "1. A recipe needs 3/4 kg of flour. Maria only wants to make 2/3 of the recipe. How much flour",
    );
    expect(textos(examen)).toContain("1. Which of these is 18/24 written in its simplest form?");
    expect(textos(examen)).toContain("a) 9/12 b) 3/4 c) 2/3 d) 6/8");
  });

  it("no inventa una fracción donde sólo hay dos números apilados sin renglón", () => {
    // El enunciado del examen "9. 1/2 ÷ 1/4 =" tiene sus fracciones sobre una
    // línea de texto y se unen. Lo que NO puede pasar es que se una cualquier
    // par vertical: si se uniera a ciegas, "25 31 12 28" sobre "7 7 7 7"
    // (opciones de la pregunta 3) daría fracciones cruzadas como "25/7 31/7"
    // mal repartidas. Se comprueba que salen las cuatro correctas.
    expect(textos(examen)).toContain("a) 25/7 b) 31/7 c) 12/7 d) 28/7");
  });
});

describe("SSBooklet25: 22 páginas de prosa que no deben empeorar", () => {
  /**
   * Caracteres extraídos por el extractor anterior, medidos sobre este mismo
   * fichero antes de tocar nada. Es un suelo, no un objetivo: separar celdas
   * con " | " añade caracteres, pero perder texto restaría, y eso es lo que
   * vigila este número.
   */
  const CARACTERES_ANTES = 4872;

  it("no pierde texto", () => {
    const caracteres = booklet.spans.reduce((a, s) => a + s.text.length, 0);
    expect(caracteres).toBeGreaterThanOrEqual(CARACTERES_ANTES);
  });

  it("sigue dando prosa entera, sin trocear las frases", () => {
    expect(textos(booklet)).toContain(
      "sometimes, after heavy rains, the river overflows its banks and there is a",
    );
    expect(textos(booklet)).toContain("Explain what these terms mean:");
  });

  it("no convierte la prosa en tabla: las filas son la minoría y sólo donde hay columnas", () => {
    const filas = booklet.spans.filter((s) => s.kind === "table_row");
    expect(filas.length).toBeLessThan(booklet.spans.length / 10);
    // Las únicas que hay son la sopa de letras, el banco de palabras y el
    // recuadro de definiciones a dos columnas.
    expect(new Set(filas.map((s) => s.page))).toEqual(new Set([6, 9, 21]));
  });

  it("mantiene las 22 páginas y la densidad de un documento de texto", () => {
    expect(booklet.pages).toBe(22);
    expect(booklet.densidad).toBeGreaterThan(100);
  });
});
