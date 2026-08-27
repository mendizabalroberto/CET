"use client";

/**
 * @cet/ui — HTML saneado -> arbol de React.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Por que existe: `SafeHtml` pinta el HTML tal cual, y eso basta para prosa.
 * Pero un enunciado de matematicas trae fracciones apiladas
 * (`<span class="f"><span class="a">3</span><span class="b">4</span></span>`)
 * que un lector de pantalla lee como "tres cuatro". Para arreglarlo hay que
 * sustituir ese nodo por `<FractionText>`, y para eso hace falta un arbol, no
 * una cadena.
 *
 * SEGURIDAD: `parseSafeHtml` NUNCA recibe HTML crudo. Sanea primero con
 * `sanitizeHtml` y despues tokeniza la salida ya limpia. Ademas construye
 * elementos de React (no `innerHTML`), asi que el resultado es inerte por
 * construccion: React escapa todo texto y no ejecuta atributos.
 */

import { createElement, type ReactNode } from "react";
import { sanitizeHtml, tokenizeHtml, decodeEntities, type HtmlToken } from "./sanitize.js";
import { FractionText } from "../learning/FractionText.js";
import { AnswerBlank } from "../learning/AnswerBlank.js";

/** Etiquetas sin hijos, tal como las serializa el sanitizador. */
const VOID_TAGS = new Set(["br", "hr", "img", "wbr", "col"]);

/** Atributo HTML -> prop de React. La allowlist ya limito el conjunto. */
const ATTR_TO_PROP: Readonly<Record<string, string>> = {
  class: "className",
  colspan: "colSpan",
  rowspan: "rowSpan",
  datetime: "dateTime",
  for: "htmlFor",
};

interface ElementNode {
  readonly tag: string;
  readonly props: Record<string, string>;
  readonly children: Array<ElementNode | string>;
}

function toProps(attrs: ReadonlyArray<readonly [string, string]>): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [name, value] of attrs) {
    const prop = ATTR_TO_PROP[name] ?? name;
    props[prop] = value;
  }
  return props;
}

/** Construye un arbol ligero a partir de los tokens del HTML ya saneado. */
function buildTree(tokens: readonly HtmlToken[]): Array<ElementNode | string> {
  const root: Array<ElementNode | string> = [];
  const stack: ElementNode[] = [];

  const push = (node: ElementNode | string): void => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root.push(node);
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      push(decodeEntities(token.text));
      continue;
    }
    if (token.kind === "open") {
      const node: ElementNode = { tag: token.tag, props: toProps(token.attrs), children: [] };
      if (token.selfClosing || VOID_TAGS.has(token.tag)) push(node);
      else {
        push(node);
        stack.push(node);
      }
      continue;
    }
    const idx = stack.map((n) => n.tag).lastIndexOf(token.tag);
    if (idx !== -1) stack.length = idx;
  }

  return root;
}

/** Extrae el texto plano de un nodo, para leer el numerador y el denominador. */
function textOf(node: ElementNode | string): string {
  if (typeof node === "string") return node;
  return node.children.map(textOf).join("");
}

function findChildByClass(node: ElementNode, cls: string): ElementNode | undefined {
  for (const child of node.children) {
    if (typeof child === "string") continue;
    const className = child.props["className"] ?? "";
    if (className.split(/\s+/).includes(cls)) return child;
  }
  return undefined;
}

/** `true` si el nodo es una fraccion apilada portada de Y6A. */
function asFraction(node: ElementNode): { numerator: number; denominator: number } | null {
  const className = node.props["className"] ?? "";
  if (!className.split(/\s+/).includes("cet-fraction")) return null;
  const num = findChildByClass(node, "cet-fraction-num");
  const den = findChildByClass(node, "cet-fraction-den");
  if (!num || !den) return null;
  const numerator = Number.parseFloat(textOf(num).trim());
  const denominator = Number.parseFloat(textOf(den).trim());
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  return { numerator, denominator };
}

/**
 * La parte entera suelta de un numero mixto.
 *
 * `mixh()` escribe `2 1/5` como DOS nodos hermanos:
 * `<span class="mixw">2</span><span class="f">…</span>`. Si se pintan por
 * separado, el lector de pantalla dice "dos" y luego "un quinto" —dos cosas—
 * cuando es un solo numero, y visualmente el 2 se queda en la linea base
 * mientras la fraccion flota, sin pertenecer el uno al otro.
 */
function asWholePart(node: ElementNode): number | null {
  const className = node.props["className"] ?? "";
  if (!className.split(/\s+/).includes("cet-mixed-number")) return null;
  if (findChildByClass(node, "cet-fraction") !== undefined) return null;
  const value = Number.parseFloat(textOf(node).trim());
  return Number.isFinite(value) ? value : null;
}

/**
 * Dos guiones bajos seguidos o mas son el hueco de respuesta del enunciado.
 *
 * Se reconocen aqui, en el renderizador, y no en los generadores: es una
 * decision de presentacion, y hacerlo en un solo sitio cubre a la vez el `___`
 * de `math.compare` y el `______` de `math.measurement.metric` sin tocar ni un
 * generador. Con dos como minimo: un guion bajo suelto en prosa
 * ("archivo_final") no es un hueco.
 */
const BLANK_RUN = /_{2,}/g;

function renderText(text: string, keyPrefix: string): ReactNode[] {
  BLANK_RUN.lastIndex = 0;
  if (!BLANK_RUN.test(text)) return [text];
  BLANK_RUN.lastIndex = 0;

  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = BLANK_RUN.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(<AnswerBlank key={`${keyPrefix}-b${String(match.index)}`} length={match[0].length} />);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderNodes(nodes: ReadonlyArray<ElementNode | string>, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) continue;
    const key = `${keyPrefix}-${String(index)}`;

    if (typeof node === "string") {
      out.push(...renderText(node, key));
      continue;
    }

    // Parte entera seguida de fraccion: un solo numero mixto, un solo anuncio.
    const whole = asWholePart(node);
    if (whole !== null) {
      const next = nodes[index + 1];
      const nextFraction = typeof next === "object" ? asFraction(next) : null;
      if (nextFraction) {
        out.push(
          <FractionText
            key={key}
            whole={whole}
            numerator={nextFraction.numerator}
            denominator={nextFraction.denominator}
          />,
        );
        index += 1;
        continue;
      }
    }

    const fraction = asFraction(node);
    if (fraction) {
      out.push(<FractionText key={key} numerator={fraction.numerator} denominator={fraction.denominator} />);
      continue;
    }

    if (VOID_TAGS.has(node.tag)) {
      out.push(createElement(node.tag, { key, ...node.props }));
      continue;
    }

    out.push(createElement(node.tag, { key, ...node.props }, ...renderNodes(node.children, key)));
  }

  return out;
}

/**
 * Sanea HTML de la base de datos y lo convierte en nodos de React,
 * sustituyendo las fracciones apiladas por `<FractionText>` accesible.
 *
 * @param dirty HTML no confiable.
 */
export function parseSafeHtml(dirty: string): ReactNode {
  const clean = sanitizeHtml(dirty);
  if (clean === "") return null;
  return <>{renderNodes(buildTree(tokenizeHtml(clean)), "h")}</>;
}
