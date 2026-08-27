/**
 * Saneado de enunciados.
 *
 * `renderedBody.stem` y `renderedBody.figureSvg` acaban en la UI. La UI los
 * renderiza como HTML (fracciones apiladas, subindices, figuras). Por tanto el
 * motor NO puede emitir marcado arbitrario: aqui esta la allowlist, y se aplica
 * en el momento de construir el item, no en el de pintarlo.
 *
 * Doble muro: @cet/ui vuelve a sanear antes de pintar. Este es el primero.
 * Funciona sin DOM (corre en Deno/Edge igual que en el navegador).
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { SanitizationError } from "./errors.js";

const ALLOWED_TAGS = new Set(["b", "i", "u", "em", "strong", "br", "span", "sub", "sup"]);
/** Clases permitidas en <span>. Son exactamente las que usan los trainers Y6A. */
const ALLOWED_CLASSES = new Set(["f", "a", "b", "mixw", "mut", "unit", "op"]);
const VOID_TAGS = new Set(["br"]);

const ALLOWED_SVG_TAGS = new Set([
  "svg",
  "g",
  "polygon",
  "polyline",
  "rect",
  "line",
  "circle",
  "ellipse",
  "path",
  "text",
  "tspan",
  "title",
  "desc",
]);
const ALLOWED_SVG_ATTRS = new Set([
  "viewbox",
  "width",
  "height",
  "xmlns",
  "points",
  "x",
  "y",
  "dx",
  "dy",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "fill",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "text-anchor",
  "dominant-baseline",
  "font-size",
  "font-family",
  "font-weight",
  "class",
  "transform",
  "vector-effect",
  "opacity",
  "role",
  "aria-hidden",
  "aria-label",
  "data-scale",
]);

const ENTITY = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/;
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export type SanitizeMode = "strip" | "strict";

function escapeText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "<") {
      out += "&lt;";
    } else if (ch === ">") {
      out += "&gt;";
    } else if (ch === "&") {
      const rest = text.slice(i);
      const entity = ENTITY.exec(rest);
      // `entity[0]` es el match completo: en un RegExpExecArray siempre existe,
      // asi que comprobarlo solo anadia ruido. El `null` de exec() es el unico
      // caso real, y es el que se comprueba.
      if (entity) {
        out += entity[0];
        i += entity[0].length - 1;
      } else {
        out += "&amp;";
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function reject(mode: SanitizeMode, message: string, fallback: string): string {
  if (mode === "strict") throw new SanitizationError(message);
  return fallback;
}

interface ParsedAttrs {
  readonly attrs: ReadonlyMap<string, string>;
  readonly clean: boolean;
}

function parseAttrs(raw: string): ParsedAttrs {
  const attrs = new Map<string, string>();
  ATTR.lastIndex = 0;
  let leftovers = raw;
  let match = ATTR.exec(raw);
  while (match !== null) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? match[3] ?? "";
    attrs.set(name, value);
    leftovers = leftovers.replace(match[0], " ");
    match = ATTR.exec(raw);
  }
  // Lo que queda tras quitar los pares nombre="valor" solo puede ser espacio o "/".
  const clean = /^[\s/]*$/.test(leftovers);
  return { attrs, clean };
}

function attrValueIsSafe(value: string): boolean {
  const lowered = value.toLowerCase();
  if (lowered.includes("javascript:")) return false;
  if (lowered.includes("data:")) return false;
  if (lowered.includes("url(")) return false;
  if (lowered.includes("expression(")) return false;
  if (lowered.includes("<") || lowered.includes(">")) return false;
  return true;
}

/**
 * Sanea el HTML restringido de un enunciado.
 * `strict` (lo que usan los generadores) lanza ante marcado no permitido: si un
 * generador emite basura queremos enterarnos en los tests, no en produccion.
 * `strip` (lo que usa el contenido estatico del banco) escapa lo que no reconoce.
 */
export function sanitizeStem(input: string, mode: SanitizeMode = "strip"): string {
  if (typeof input !== "string") {
    throw new SanitizationError("sanitizeStem() exige una cadena");
  }
  let out = "";
  let cursor = 0;
  TAG.lastIndex = 0;
  let match = TAG.exec(input);
  while (match !== null) {
    out += escapeText(input.slice(cursor, match.index));
    const whole = match[0];
    const tagName = (match[1] ?? "").toLowerCase();
    const rawAttrs = match[2] ?? "";
    const closing = whole.startsWith("</");

    if (!ALLOWED_TAGS.has(tagName)) {
      out += reject(mode, `Etiqueta no permitida en el enunciado: <${tagName}>`, escapeText(whole));
    } else if (closing) {
      out += VOID_TAGS.has(tagName) ? "" : `</${tagName}>`;
    } else {
      const { attrs, clean } = parseAttrs(rawAttrs);
      let ok = clean;
      for (const [name, value] of attrs) {
        if (!(tagName === "span" && name === "class")) {
          ok = false;
          break;
        }
        const classes = value.split(/\s+/).filter((c) => c.length > 0);
        if (classes.length === 0 || !classes.every((c) => ALLOWED_CLASSES.has(c))) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        out += reject(
          mode,
          `Atributos no permitidos en <${tagName}>: ${rawAttrs.trim()}`,
          escapeText(whole),
        );
      } else {
        const classAttr = attrs.get("class");
        const rendered =
          classAttr === undefined ? `<${tagName}>` : `<${tagName} class="${classAttr}">`;
        out += VOID_TAGS.has(tagName) ? `<${tagName}>` : rendered;
      }
    }

    cursor = match.index + whole.length;
    match = TAG.exec(input);
  }
  out += escapeText(input.slice(cursor));
  return out;
}

/** Sanea una figura SVG inline con una allowlist independiente y mas estrecha. */
export function sanitizeSvg(input: string, mode: SanitizeMode = "strip"): string {
  if (typeof input !== "string") {
    throw new SanitizationError("sanitizeSvg() exige una cadena");
  }
  let out = "";
  let cursor = 0;
  TAG.lastIndex = 0;
  let match = TAG.exec(input);
  while (match !== null) {
    out += escapeText(input.slice(cursor, match.index));
    const whole = match[0];
    const tagName = (match[1] ?? "").toLowerCase();
    const rawAttrs = match[2] ?? "";
    const closing = whole.startsWith("</");

    if (!ALLOWED_SVG_TAGS.has(tagName)) {
      out += reject(mode, `Etiqueta no permitida en la figura: <${tagName}>`, "");
    } else if (closing) {
      out += `</${tagName}>`;
    } else {
      const { attrs, clean } = parseAttrs(rawAttrs);
      let ok = clean;
      const kept: string[] = [];
      for (const [name, value] of attrs) {
        if (!ALLOWED_SVG_ATTRS.has(name) || !attrValueIsSafe(value)) {
          ok = false;
          break;
        }
        kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
      }
      if (!ok) {
        out += reject(mode, `Atributos no permitidos en <${tagName}>: ${rawAttrs.trim()}`, "");
      } else {
        const selfClosing = /\/\s*$/.test(rawAttrs);
        const attrText = kept.length > 0 ? ` ${kept.join(" ")}` : "";
        out += selfClosing ? `<${tagName}${attrText}/>` : `<${tagName}${attrText}>`;
      }
    }

    cursor = match.index + whole.length;
    match = TAG.exec(input);
  }
  out += escapeText(input.slice(cursor));
  return out;
}

/** Escapa texto que va a incrustarse en un enunciado (nombres, unidades, etc.). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
