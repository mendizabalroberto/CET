/**
 * OOXML (.docx / .pptx) -> spans.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Extracción DETERMINISTA: aquí no hay modelo, no hay heurística de contenido y
 * no se inventa nada. Lo que sale es lo que el profesor escribió, en su orden,
 * con la diapositiva de la que salió cuando la hay.
 *
 * Se recorre el XML con un pequeño autómata en vez de con una expresión regular
 * global. La diferencia importa: un `<w:p>` dentro de una celda de tabla y uno
 * suelto son cosas distintas, y una regex sobre todo el fichero los mezcla —que
 * es exactamente la clase de fallo que no rompe nada y luego miente.
 *
 * Los patrones dinámicos se construyen con `String.raw`. No es un capricho: en
 * una plantilla normal `\s` se evalúa a `s` sin avisar, y la regex resultante
 * deja de casar en silencio. Costó una tanda entera descubrirlo.
 */

import { makeSpan, type SourceSpan } from "./spans.ts";
import { mustRead, readZip } from "./zip.ts";

/** Entidades XML. Un `&amp;` sin resolver acaba impreso tal cual en una lección. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // el último, o se re-decodifican los de arriba
}

const W_TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|(<w:br\b[^>]*\/?>)/g;
const A_TEXT = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|(<a:br\b[^>]*\/?>)/g;

/**
 * Texto visible de un fragmento. El salto blando (`<w:br/>`) se conserva como
 * `\n`; el tabulador, como espacio.
 *
 * Se conserva a propósito: Word mete las cinco preguntas de un ejercicio en un
 * solo `<w:p>` separadas por saltos blandos. Aplanarlo a un espacio produce un
 * span de cinco preguntas, y entonces una cita "correcta" puede señalar un
 * bloque donde la respuesta está a tres preguntas de distancia. La cita solo
 * vale lo que vale su grano.
 */
function visibleText(fragment: string, re: RegExp): string {
  re.lastIndex = 0;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    if (m[2] !== undefined) out += "\n";
    else if (m[1] === undefined) out += " ";
    else out += decodeEntities(m[1]);
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Une los saltos blandos que parten una frase a la mitad.
 *
 * Word usa `<w:br/>` para dos cosas distintas: separar renglones de verdad
 * («1. CELL», «2. BATTERY») y romper una línea larga por estética («Circuit» +
 * «symbols are simple…»). Distinguirlas sin adivinar es imposible; con una
 * regla estrecha, casi siempre: **una línea que empieza en minúscula continúa a
 * la anterior**. Una lista nunca empieza sus puntos en minúscula; una frase
 * partida sí.
 *
 * Si la regla se equivoca, se equivoca uniendo de más — dos trozos del mismo
 * párrafo. Nunca separa lo que estaba junto, que es el error que rompería una
 * cita.
 */
function joinContinuations(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (out.length > 0 && /^[\p{Ll}(]/u.test(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out;
}

/** Una línea, un span: el grano más fino que el documento declara por sí mismo. */
function pushLines(
  spans: SourceSpan[],
  next: () => number,
  text: string,
  kind: "heading" | "list_item" | "paragraph" | "table_row",
  page: number | null,
): void {
  for (const line of joinContinuations(text.split("\n").filter((l) => l !== ""))) {
    spans.push(makeSpan(next(), kind, line, page));
  }
}

/**
 * Encuentra el final del elemento que abre en `open`, contando anidamiento.
 *
 * El escaneo empieza DESPUÉS de la etiqueta de apertura y con profundidad 0. Si
 * empezara en `open`, la propia apertura contaría como anidamiento y la función
 * devolvería el cierre del elemento siguiente: un párrafo se tragaría al de al
 * lado y nadie lo notaría hasta leer el contenido.
 */
function closeOf(xml: string, open: number, tag: string): number {
  const openRe = new RegExp(String.raw`<${tag}(?:\s|>)`, "g");
  const closeRe = new RegExp(String.raw`</${tag}>`, "g");
  let depth = 0;
  let i = open + 1;
  for (;;) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(xml);
    const c = closeRe.exec(xml);
    if (!c) return xml.length;
    if (o && o.index < c.index) {
      depth++;
      i = o.index + 1;
    } else {
      if (depth === 0) return c.index + c[0].length;
      depth--;
      i = c.index + 1;
    }
  }
}

function classifyParagraph(fragment: string): "heading" | "list_item" | "paragraph" {
  const props = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(fragment)?.[0] ?? "";
  if (/<w:numPr\b/.test(props)) return "list_item";
  if (/<w:outlineLvl\b/.test(props)) return "heading";
  if (/<w:pStyle[^>]*w:val="(?:Heading|T[ií]tulo|Title)[^"]*"/i.test(props)) return "heading";
  return "paragraph";
}

/** .docx -> spans, en orden de documento. */
export function docxToSpans(buf: Buffer): SourceSpan[] {
  const xml = mustRead(readZip(buf), "word/document.xml");
  const bodyStart = xml.indexOf("<w:body>");
  const body = bodyStart === -1 ? xml : xml.slice(bodyStart);

  const spans: SourceSpan[] = [];
  let ord = 0;
  let i = 0;

  for (;;) {
    // `indexOf("<w:p")` casa también con `<w:pPr`: hay que descartar el falso
    // positivo o el autómata se desincroniza.
    let p = body.indexOf("<w:p", i);
    while (p !== -1 && !/^<w:p[\s>]/.test(body.slice(p, p + 5))) {
      p = body.indexOf("<w:p", p + 1);
    }
    const t = body.indexOf("<w:tbl", i);
    if (p === -1 && t === -1) break;

    if (t !== -1 && (p === -1 || t < p)) {
      const end = closeOf(body, t, "w:tbl");
      const table = body.slice(t, end);
      // Una fila = un span. Las celdas se unen con ` | `, que es como se lee.
      const rowRe = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
      let r: RegExpExecArray | null;
      while ((r = rowRe.exec(table)) !== null) {
        const cells = [...r[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((c) =>
          visibleText(c[0], W_TEXT),
        );
        // Dentro de una celda el salto blando no separa preguntas: separa
        // renglones de la misma celda. Ahí sí se aplana.
        const text = cells.join(" | ").replace(/\n/g, " ").trim();
        if (text.replace(/[|\s]/g, "") !== "") spans.push(makeSpan(ord++, "table_row", text, null));
      }
      i = end;
      continue;
    }

    const end = closeOf(body, p, "w:p");
    const fragment = body.slice(p, end);
    pushLines(spans, () => ord++, visibleText(fragment, W_TEXT), classifyParagraph(fragment), null);
    i = end;
  }
  return spans;
}

/** .pptx -> spans. `page` es el número de diapositiva. */
export function pptxToSpans(buf: Buffer): { spans: SourceSpan[]; pages: number } {
  const entries = readZip(buf);
  const slides = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/slide(\d+)\.xml$/.exec(a)![1]) - Number(/slide(\d+)\.xml$/.exec(b)![1]));

  const spans: SourceSpan[] = [];
  let ord = 0;
  slides.forEach((name, idx) => {
    const xml = entries.get(name)!.read().toString("utf8");
    const paraRe = /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g;
    let m: RegExpExecArray | null;
    while ((m = paraRe.exec(xml)) !== null) {
      pushLines(spans, () => ord++, visibleText(m[0], A_TEXT), "paragraph", idx + 1);
    }
  });
  return { spans, pages: slides.length };
}
