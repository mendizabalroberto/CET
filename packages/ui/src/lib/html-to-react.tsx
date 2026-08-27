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

function renderNodes(nodes: ReadonlyArray<ElementNode | string>, keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (typeof node === "string") return node;

    const fraction = asFraction(node);
    if (fraction) {
      return <FractionText key={key} numerator={fraction.numerator} denominator={fraction.denominator} />;
    }

    if (VOID_TAGS.has(node.tag)) {
      return createElement(node.tag, { key, ...node.props });
    }

    return createElement(node.tag, { key, ...node.props }, ...renderNodes(node.children, key));
  });
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
