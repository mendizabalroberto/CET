/**
 * HTML de lección -> `lesson_blocks` tipados.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El mapeo de clases CSS a `block_kind` (§3 de DATA_MODEL, `enums.ts`):
 *
 *     .rule            -> rule       regla / definición
 *     .eg              -> example    ejemplo trabajado
 *     .tip / .good     -> tip        truco, atajo, confirmación
 *     .warn            -> warning    error típico
 *     .steps / .chain  -> steps      secuencia ordenada
 *     table.t          -> table      tabla de datos
 *     h3 / p / ul / ol -> text       prosa y listas
 *     svg / canvas     -> (nada)     se anota como hueco, NO se inventa
 *
 * INVARIANTE: recorrer el HTML no puede perder contenido en silencio. Todo nodo
 * de nivel superior acaba en un bloque o en `unmapped`, y el llamante decide
 * qué hacer con `unmapped`. El pipeline lo vuelca a COVERAGE.md.
 */

import type { BlockKind, I18nText, Locale } from "@cet/shared";
import { sanitizeHtml, sanitizeToText, textToSafeHtml } from "../sanitize.ts";
import { stableId } from "../ids.ts";
import type { LessonBlock, SourceRef } from "../schema.ts";
import { decodeEntities, findClosingTag, normalizeSpace } from "./html.ts";

/** Clase CSS -> `block_kind`. La única tabla de verdad de este mapeo. */
export const CLASS_TO_KIND: Readonly<Record<string, BlockKind>> = {
  rule: "rule",
  eg: "example",
  tip: "tip",
  good: "tip",
  warn: "warning",
  warning: "warning",
  steps: "steps",
  chain: "steps",
};

export interface BlockExtractionResult {
  readonly blocks: LessonBlock[];
  /** Etiquetas de nivel superior que no encajaron en ningún `block_kind`. */
  readonly unmapped: readonly string[];
}

function i18n(locale: Locale, text: string): I18nText {
  return locale === "es" ? { es: text } : { en: text };
}

/** Celda de tabla: `null` cuando está vacía (ver `tableCell` en schema.ts). */
function cell(locale: Locale, html: string): I18nText | null {
  const clean = sanitizeHtml(html);
  return sanitizeToText(clean) === "" ? null : i18n(locale, clean);
}

/**
 * Recorre los elementos de nivel superior de un fragmento de lección y los
 * convierte en bloques. Los nodos de texto sueltos entre elementos se agrupan
 * en un bloque `text` para no perderlos.
 */
export function extractBlocks(
  html: string,
  locale: Locale,
  source: SourceRef,
  idPrefix: readonly (string | number)[],
): BlockExtractionResult {
  const blocks: LessonBlock[] = [];
  const unmapped: string[] = [];
  let ord = 0;
  /** Prosa acumulada (h3, p, texto suelto) pendiente de cerrar en un bloque. */
  let prose: string[] = [];

  const flushProse = (): void => {
    const merged = prose.join("").trim();
    prose = [];
    if (merged === "") return;
    const clean = sanitizeHtml(merged);
    if (sanitizeToText(clean) === "") return; // solo espacios/adornos: no es contenido
    blocks.push(makeBlock("text", { html: i18n(locale, clean) }, ord++, source, idPrefix));
  };

  for (const node of topLevelNodes(html)) {
    if (node.kind === "text") {
      prose.push(node.html);
      continue;
    }

    const { tag, classes, inner, outer } = node;

    if (tag === "table" && classes.includes("t")) {
      flushProse();
      blocks.push(tableBlock(inner, locale, ord++, source, idPrefix));
      continue;
    }

    const kindClass = classes.find((c) => c in CLASS_TO_KIND);
    if (kindClass !== undefined) {
      flushProse();
      const kind = CLASS_TO_KIND[kindClass]!;
      blocks.push(
        kind === "steps"
          ? stepsBlock(inner, locale, ord++, source, idPrefix, kindClass)
          : makeBlock(kind, { html: i18n(locale, sanitizeHtml(inner)) }, ord++, source, idPrefix),
      );
      continue;
    }

    if (tag === "svg" || tag === "canvas") {
      flushProse();
      unmapped.push(`<${tag}> (figura interactiva)`);
      continue;
    }

    // Contenedor sin semántica propia (`<div class="card">`, `<section>`): se
    // ATRAVIESA. Tratarlo como prosa aplastaría toda la lección en un solo
    // bloque `text` y perdería los `.rule` y `.tip` que hay dentro — que es
    // exactamente lo que le pasaba al panel de plan de estudio de Math.
    if (TRANSPARENT_CONTAINERS.has(tag)) {
      flushProse();
      const nested = extractBlocks(inner, locale, source, [...idPrefix, "in", ord]);
      for (const b of nested.blocks) blocks.push({ ...b, ord: ord++ });
      unmapped.push(...nested.unmapped);
      continue;
    }

    // h3, h4, p, ul, ol, table sin clase, inline…: prosa. Se acumula para que un
    // encabezado y su párrafo queden en el mismo bloque `text`.
    if (PROSE_TAGS.has(tag)) {
      prose.push(outer);
      continue;
    }

    flushProse();
    unmapped.push(`<${tag}>`);
  }
  flushProse();

  return { blocks, unmapped };
}

/**
 * Elementos que solo agrupan: se recorre su interior y ellos desaparecen.
 * `div` está aquí porque los trainers lo usan como caja de maquetación; los
 * `div` CON clase semántica (`.rule`, `.eg`…) ya se han capturado antes.
 */
const TRANSPARENT_CONTAINERS: ReadonlySet<string> = new Set([
  "div",
  "section",
  "article",
  "main",
  "center",
]);

const PROSE_TAGS: ReadonlySet<string> = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "dl",
  "table",
  "blockquote",
  "pre",
  "span",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "small",
  "code",
  "sub",
  "sup",
  "br",
  "hr",
  "img",
  "a",
  "label",
  "figure",
]);

function makeBlock(
  kind: BlockKind,
  content: LessonBlock["content"],
  ord: number,
  source: SourceRef,
  idPrefix: readonly (string | number)[],
): LessonBlock {
  return { id: stableId(...idPrefix, "block", ord), ord, kind, content, source };
}

/**
 * `.steps` de Science ( `<div class="step"><span class="sn">1</span>…` ) y
 * `.chain` de Math ( `<span class="u">km</span><span class="op">…` ).
 * Si no hay hijos reconocibles, degrada a un único paso con todo el contenido:
 * degradar es aceptable, perderlo no.
 */
function stepsBlock(
  inner: string,
  locale: Locale,
  ord: number,
  source: SourceRef,
  idPrefix: readonly (string | number)[],
  kindClass: string,
): LessonBlock {
  const childClass = kindClass === "chain" ? null : "step";
  const steps: string[] = [];
  let intro: string | undefined;

  const leading: string[] = [];
  for (const node of topLevelNodes(inner)) {
    if (node.kind === "text") {
      (steps.length === 0 ? leading : steps).push(node.html);
      continue;
    }
    const isStep =
      childClass === null
        ? node.classes.includes("u") || node.classes.includes("op")
        : node.classes.includes(childClass);
    if (isStep) {
      const clean = sanitizeHtml(node.inner);
      if (sanitizeToText(clean) !== "") steps.push(clean);
    } else if (steps.length === 0) {
      leading.push(node.outer);
    } else {
      steps.push(sanitizeHtml(node.outer));
    }
  }

  const introHtml = sanitizeHtml(leading.join("").trim());
  if (sanitizeToText(introHtml) !== "") intro = introHtml;

  const cleaned = steps.map((s) => (s.startsWith("<") ? s : sanitizeHtml(s))).filter((s) => sanitizeToText(s) !== "");

  if (cleaned.length === 0) {
    const all = sanitizeHtml(inner);
    return makeBlock("steps", { steps: [i18n(locale, all)] }, ord, source, idPrefix);
  }
  const content = { steps: cleaned.map((s) => i18n(locale, s)) } as LessonBlock["content"];
  return makeBlock(
    "steps",
    intro === undefined ? content : { ...(content as object), intro: i18n(locale, intro) } as LessonBlock["content"],
    ord,
    source,
    idPrefix,
  );
}

/**
 * `table.t`. La primera fila es cabecera solo si todas sus celdas son `<th>`;
 * las tablas de Math mezclan `<th>` y `<td>` a mitad de tabla, y tratar esas
 * filas como cabecera desordenaría los datos.
 */
function tableBlock(
  inner: string,
  locale: Locale,
  ord: number,
  source: SourceRef,
  idPrefix: readonly (string | number)[],
): LessonBlock {
  const rows: { cells: (I18nText | null)[]; allTh: boolean }[] = [];
  for (const rowInner of innerOf(inner, "tr")) {
    const cells: (I18nText | null)[] = [];
    let allTh = true;
    for (const c of cellsOf(rowInner)) {
      if (c.tag !== "th") allTh = false;
      cells.push(cell(locale, c.inner));
    }
    if (cells.length > 0) rows.push({ cells, allTh });
  }

  if (rows.length === 0) {
    // Tabla sin `<tr>`: no se descarta, se degrada a una fila de una celda.
    return makeBlock("table", { rows: [[cell(locale, inner)]] }, ord, source, idPrefix);
  }

  const first = rows[0]!;
  const hasHeader = first.allTh && rows.length > 1;
  const body = hasHeader ? rows.slice(1) : rows;
  const content: Record<string, unknown> = { rows: body.map((r) => r.cells) };
  if (hasHeader) content["headers"] = first.cells;
  return makeBlock("table", content as LessonBlock["content"], ord, source, idPrefix);
}

/* -------------------------------------------------------------------------- */
/* Recorrido de nivel superior                                                */
/* -------------------------------------------------------------------------- */

type TopNode =
  | { kind: "text"; html: string }
  | { kind: "element"; tag: string; classes: string[]; inner: string; outer: string };

/**
 * Divide un fragmento en sus nodos de nivel superior. No construye un árbol
 * completo: el extractor solo necesita un nivel, y un recorrido plano es
 * verificable de un vistazo.
 *
 * Una etiqueta sin cierre se trata como texto hasta el final del fragmento —
 * degradar a texto es seguro; el saneador lo escapa igual.
 */
export function topLevelNodes(html: string): TopNode[] {
  const out: TopNode[] = [];
  const re = /<([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*)>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    if (m.index < cursor) continue;
    const tag = m[1]!.toLowerCase();
    const attrs = m[2] ?? "";
    const selfClosing = /\/\s*$/.test(attrs) || tag === "br" || tag === "hr" || tag === "img";

    if (m.index > cursor) out.push({ kind: "text", html: html.slice(cursor, m.index) });

    const bodyStart = m.index + m[0].length;
    if (selfClosing) {
      out.push({ kind: "element", tag, classes: classesOf(attrs), inner: "", outer: m[0] });
      cursor = bodyStart;
      re.lastIndex = bodyStart;
      continue;
    }

    const closeAt = findClosingTag(html, tag, bodyStart);
    if (closeAt === -1) {
      // Sin cierre: el resto es texto. Ruidoso en COVERAGE, no silencioso.
      out.push({ kind: "text", html: html.slice(m.index) });
      return out;
    }
    const end = closeAt + `</${tag}>`.length;
    out.push({
      kind: "element",
      tag,
      classes: classesOf(attrs),
      inner: html.slice(bodyStart, closeAt),
      outer: html.slice(m.index, end),
    });
    cursor = end;
    re.lastIndex = end;
  }
  if (cursor < html.length) out.push({ kind: "text", html: html.slice(cursor) });
  return out;
}

function classesOf(attrs: string): string[] {
  const m = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
  if (!m) return [];
  return decodeEntities(m[1]!).split(/\s+/).filter(Boolean);
}

/** HTML interior de cada `<tag>` de primer nivel dentro del fragmento. */
function innerOf(html: string, tag: string): string[] {
  return topLevelNodes(html)
    .flatMap((n) => (n.kind === "element" ? [n] : []))
    .flatMap((n) => (n.tag === tag ? [n.inner] : n.tag === "tbody" || n.tag === "thead" ? innerOf(n.inner, tag) : []));
}

function cellsOf(rowInner: string): { tag: string; inner: string }[] {
  return topLevelNodes(rowInner)
    .flatMap((n) => (n.kind === "element" && (n.tag === "td" || n.tag === "th") ? [{ tag: n.tag, inner: n.inner }] : []));
}

/**
 * Título de una lección a partir del HTML del botón del acordeón.
 *
 * Devuelve HTML **ya seguro y escapado una sola vez**: el llamante lo guarda tal
 * cual. Volver a pasarlo por `sanitizeHtml` lo decodificaría una segunda vez y
 * un título que contenga `&lt;` perdería su escape.
 */
export function titleFromButton(buttonHtml: string): string {
  return normalizeSpace(textToSafeHtml(buttonHtml.replace(/[▼▲]/g, "")));
}
