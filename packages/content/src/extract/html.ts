/**
 * Utilidades de lectura de los trainers Y6A.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Dos trabajos:
 *   1. Recortar del fichero el literal JS de un símbolo (`var BANK=[...]`) sin
 *      ejecutar nada, y entregárselo al parser restringido de `js-literal.ts`.
 *   2. Tokenizar el HTML de las lecciones con un tokenizador propio y pequeño.
 *
 * POR QUÉ UN TOKENIZADOR PROPIO Y NO `node-html-parser`
 *   Este HTML acaba renderizándose en el navegador de un niño. El saneado es una
 *   frontera de seguridad. Un parser de terceros tolerante a HTML roto
 *   "recupera" etiquetas y reordena nodos según heurísticas que no controlamos —
 *   y esa diferencia entre lo que el saneador vio y lo que el navegador verá es
 *   exactamente el hueco por el que entra la mutation-XSS.
 *
 *   El tokenizador de aquí es deliberadamente estricto y pequeño:
 *     - reconoce texto, etiquetas de apertura/cierre, comentarios y CDATA;
 *     - trata `<script>` `<style>` `<textarea>` `<title>` como texto crudo hasta
 *       su cierre, igual que el estándar;
 *     - NO intenta recuperar nada. Todo lo que no entiende se convierte en TEXTO
 *       escapado, nunca en marcado.
 *   El resultado es que la salida se RE-SERIALIZA desde tokens conocidos: nada
 *   del original llega intacto al pack.
 */

import { readFileSync } from "node:fs";
import { parseJsLiteral, JsLiteralError, type JsValue, type ParseOptions } from "../js-literal.ts";

/* ========================================================================== */
/* Entidades                                                                  */
/* ========================================================================== */

/**
 * Entidades nombradas que aparecen realmente en los seis trainers, más las
 * imprescindibles. La lista es corta a propósito: una entidad desconocida se
 * deja tal cual (texto literal `&foo;`), nunca se adivina.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  times: "×",
  divide: "÷",
  minus: "−",
  deg: "°",
  sup2: "²",
  sup3: "³",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  rarr: "→",
  larr: "←",
  harr: "↔",
  bull: "•",
  middot: "·",
  eacute: "é",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  iexcl: "¡",
  iquest: "¿",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  check: "✓",
  cross: "✗",
};

/**
 * Decodifica entidades. Acepta numéricas decimales y hexadecimales (los emojis
 * de los trainers pueden venir así) y las nombradas de la tabla.
 *
 * Los puntos de código inválidos (surrogates sueltos, > 0x10FFFF, NULL) se
 * sustituyen por U+FFFD: un surrogate suelto propagado a la base de datos rompe
 * la serialización JSON aguas abajo.
 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,31});/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const digits = isHex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, isHex ? 16 : 10);
      if (!Number.isFinite(code)) return whole;
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body];
    return named ?? whole;
  });
}

/**
 * Escapa un NODO DE TEXTO. Solo `&`, `<` y `>`: fuera de un atributo, las
 * comillas no tienen significado, y escaparlas llenaría el pack de `&#39;` en
 * cada apóstrofo inglés ("you can&#39;t") sin ganar ni un gramo de seguridad.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escapa un VALOR DE ATRIBUTO. Aquí sí van las comillas: sin ellas, un valor
 * con `"` cerraría el atributo y abriría uno nuevo — la ruta clásica para colar
 * un `onerror=`.
 */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Colapsa espacios y quita los no separables, para comparar y para títulos. */
export function normalizeSpace(text: string): string {
  // Escapes explicitos y no los caracteres literales: un U+00A0 escrito tal cual
  // es invisible en el editor y en el diff, y basta con que alguien lo borre sin
  // querer para que los titulos de Y6A dejen de normalizarse en silencio.
  //   \u00A0 no-break | \u2002 en space | \u2003 em space | \u2009 thin space
  return text
    .replace(/[\u00A0\u2002\u2003\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ========================================================================== */
/* Lectura de ficheros                                                        */
/* ========================================================================== */

export function readTrainer(absolutePath: string): string {
  const raw = readFileSync(absolutePath, "utf8");
  // Quita el BOM: si sobrevive, acaba dentro del primer título del pack.
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/* ========================================================================== */
/* Extracción de literales JS                                                 */
/* ========================================================================== */

export class SymbolNotFoundError extends Error {
  readonly symbol: string;
  readonly file: string;
  constructor(symbol: string, file: string) {
    super(`No se encontró el símbolo \`${symbol}\` en ${file}`);
    this.name = "SymbolNotFoundError";
    this.symbol = symbol;
    this.file = file;
  }
}

/**
 * Recorre `source` desde `start` hasta cerrar el delimitador abierto en `start`,
 * saltando strings, plantillas y comentarios. Devuelve el índice del cierre.
 *
 * Nota deliberada: no intenta distinguir una expresión regular de una división.
 * Los literales de datos de Y6A no contienen regex; si algún día lo hicieran,
 * el parser restringido fallaría ruidosamente en vez de leer basura.
 */
function findMatching(source: string, start: number): number {
  const open = source[start];
  const close = open === "[" ? "]" : open === "{" ? "}" : null;
  if (close === null) throw new Error(`findMatching necesita '[' o '{', vino '${open}'`);

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < source.length) {
        const d = source[i]!;
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === c) break;
        i++;
      }
      if (i >= source.length) return -1; // string sin cerrar
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Sustituye por espacios el contenido de todos los comentarios, dejando
 * intactos strings y literales de expresión regular, y conservando la longitud.
 *
 * POR QUÉ ES NECESARIO
 *   `readSymbol` busca `var SYMBOL=` con una expresión regular. Sin blanquear
 *   comentarios se engancha a una declaración COMENTADA — un `var BANK=[999];`
 *   dentro de un bloque comentado — y devuelve el banco viejo sin que nada
 *   avise. Ese es el peor fallo posible de este pipeline: no rompe, MIENTE.
 *
 * POR QUÉ HAY QUE RECONOCER LAS EXPRESIONES REGULARES
 *   Un escáner ingenuo que solo conozca comillas se rompe con el código real de
 *   Y6A. English tiene, ANTES de su banco:
 *
 *       function norm(s){ return s.replace(/[^a-z0-9' ]/g, "") }
 *
 *   Ese apóstrofo dentro de la clase de caracteres pone al escáner en 'estado
 *   de string' y desactiva el blanqueo de comentarios durante todo el trozo
 *   siguiente — justo la protección que se acaba de añadir, anulada en silencio.
 *   Por eso el lexer de aquí decide si un `/` abre una expresión regular con la
 *   heurística estándar: mira el último token significativo. Si es un
 *   identificador, un número o un cierre `) ] }`, el `/` es división; en
 *   cualquier otro caso, abre una expresión regular.
 *
 * Conservar la longitud mantiene válidos los offsets que `JsLiteralError` reporta.
 */
export function blankComments(source: string): string {
  const out = source.split("");
  /** Último carácter significativo visto (ni espacio ni comentario). */
  let prev = "";

  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) out[k] = source[k] === "\n" ? "\n" : " ";
  };

  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;

    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      const end = nl === -1 ? source.length : nl;
      blank(i, end);
      i = end - 1;
      continue;
    }

    if (c === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(i, end);
      i = end - 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      i = skipDelimited(source, i, c);
      prev = c;
      continue;
    }

    if (c === "/" && regexCanStartHere(prev)) {
      i = skipRegex(source, i);
      prev = "/";
      continue;
    }

    if (!/\s/.test(c)) prev = c;
  }
  return out.join("");
}

/**
 * Tras estos caracteres, un `/` es el operador de división. Tras cualquier otro
 * (`=`, `(`, `,`, `:`, `return`…) abre una expresión regular. Es la heurística
 * clásica: sin analizar la gramática completa no se puede hacer mejor, y para
 * el JS de Y6A — que nunca divide por algo justo detrás de un identificador y
 * luego abre una regex — basta.
 */
function regexCanStartHere(prev: string): boolean {
  if (prev === "") return true;
  return !/[A-Za-z0-9_$)\]]/.test(prev);
}

/** Devuelve el índice del delimitador de cierre (o el final de la entrada). */
function skipDelimited(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const d = source[i]!;
    if (d === "\\") {
      i += 2;
      continue;
    }
    if (d === quote) return i;
    i++;
  }
  return source.length;
}

/** Igual, pero una clase `[...]` puede contener un `/` sin cerrar la regex. */
function skipRegex(source: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const d = source[i]!;
    if (d === "\\") {
      i += 2;
      continue;
    }
    if (d === "\n") return i; // una regex no cruza líneas: era una división
    if (d === "[") inClass = true;
    else if (d === "]") inClass = false;
    else if (d === "/" && !inClass) return i;
    i++;
  }
  return source.length;
}

/** Todo el JS en línea del documento, concatenado en orden de aparición. */
export function extractInlineScripts(html: string): string {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue; // script externo: no hay cuerpo
    out.push(m[2] ?? "");
  }
  return out.join("\n;\n");
}

/**
 * Recorta el literal de `var SYMBOL = [...]` / `= {...}` y lo parsea.
 * Lanza si el símbolo no existe o si el literal no cierra: perder un símbolo en
 * silencio es la forma más cara de romper un pack.
 */
export function readSymbol(
  scriptSource: string,
  symbol: string,
  file: string,
  options: ParseOptions = {},
): JsValue {
  // La búsqueda de la declaración se hace sobre el código SIN comentarios, para
  // no engancharse a una versión vieja comentada (ver `blankComments`).
  const searchable = blankComments(scriptSource);
  const decl = new RegExp(
    `(?:^|[^\\w$.])(?:var|let|const)\\s+${escapeRegExp(symbol)}\\s*=\\s*`,
    "gm",
  );
  const matches = [...searchable.matchAll(decl)];
  if (matches.length === 0) throw new SymbolNotFoundError(symbol, file);
  if (matches.length > 1) {
    // Dos declaraciones REALES del mismo nombre: cuál gana depende del orden de
    // ejecución, y adivinarlo es inventar. Que lo resuelva quien edite el HTML.
    throw new Error(
      `\`${symbol}\` está declarado ${matches.length} veces en ${file}: ambiguo, el extractor no elige por ti`,
    );
  }
  const m = matches[0]!;

  const valueStart = m.index + m[0].length;
  const opener = scriptSource[valueStart];
  if (opener !== "[" && opener !== "{") {
    throw new JsLiteralError(
      `\`${symbol}\` no es un literal de array ni de objeto`,
      valueStart,
      scriptSource.slice(valueStart, valueStart + 40),
    );
  }
  const end = findMatching(scriptSource, valueStart);
  if (end === -1) {
    throw new JsLiteralError(
      `\`${symbol}\` no cierra: literal truncado`,
      valueStart,
      scriptSource.slice(valueStart, valueStart + 40),
    );
  }
  return parseJsLiteral(scriptSource.slice(valueStart, end + 1), options);
}

export function readSymbolArray(
  scriptSource: string,
  symbol: string,
  file: string,
  options: ParseOptions = {},
): readonly JsValue[] {
  const v = readSymbol(scriptSource, symbol, file, options);
  if (!Array.isArray(v)) throw new Error(`\`${symbol}\` en ${file} no es un array`);
  return v;
}

export function readSymbolObject(
  scriptSource: string,
  symbol: string,
  file: string,
  options: ParseOptions = {},
): Record<string, JsValue> {
  const v = readSymbol(scriptSource, symbol, file, options);
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`\`${symbol}\` en ${file} no es un objeto`);
  }
  return v;
}

/**
 * Lee un literal declarado DENTRO de una función, p.ej. el
 * `var plan={amz:5,...}` que Socials e ICT esconden en `buildMock()`.
 * `readSymbol` ya lo encuentra (la declaración es idéntica), así que esto es un
 * alias con nombre honesto para que el sitio de llamada se lea bien.
 */
export const readLocalSymbolObject = readSymbolObject;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ========================================================================== */
/* Tokenizador HTML                                                           */
/* ========================================================================== */

export type HtmlToken =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "open";
      readonly tag: string;
      readonly attrs: ReadonlyMap<string, string>;
      readonly selfClosing: boolean;
      readonly raw: string;
    }
  | { readonly type: "close"; readonly tag: string }
  | { readonly type: "comment"; readonly text: string };

/** Elementos sin contenido: nunca llevan cierre. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Elementos cuyo contenido es texto crudo hasta el cierre. */
const RAW_TEXT: ReadonlySet<string> = new Set(["script", "style", "textarea", "title", "xmp"]);

/**
 * Tokeniza. NUNCA lanza: un `<` suelto o una etiqueta rota se emite como TEXTO.
 * Esa decisión es intencionada — la alternativa (adivinar el marcado que el
 * autor "quería") es justo lo que abre la puerta a la mutation-XSS.
 */
export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end: number): void => {
    if (end > textStart) tokens.push({ type: "text", text: html.slice(textStart, end) });
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    // Comentario / doctype / CDATA
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      flushText(lt);
      if (end === -1) {
        // Comentario sin cerrar: se descarta el resto. Un navegador haría lo
        // mismo, y así ningún resto se cuela como marcado.
        tokens.push({ type: "comment", text: html.slice(lt + 4) });
        return tokens;
      }
      tokens.push({ type: "comment", text: html.slice(lt + 4, end) });
      i = textStart = end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      flushText(lt);
      if (end === -1) return tokens;
      i = textStart = end + 1;
      continue;
    }

    // Cierre
    if (html.startsWith("</", lt)) {
      const m = /^<\/([A-Za-z][A-Za-z0-9:-]*)\s*>/.exec(html.slice(lt));
      if (!m) {
        i = lt + 1;
        continue; // `</` que no forma etiqueta: queda como texto
      }
      flushText(lt);
      tokens.push({ type: "close", tag: m[1]!.toLowerCase() });
      i = textStart = lt + m[0].length;
      continue;
    }

    // Apertura
    const nameMatch = /^<([A-Za-z][A-Za-z0-9:-]*)/.exec(html.slice(lt));
    if (!nameMatch) {
      i = lt + 1;
      continue; // `<` suelto: texto
    }
    const tag = nameMatch[1]!.toLowerCase();
    const parsed = parseAttributes(html, lt + nameMatch[0].length);
    if (parsed === null) {
      i = lt + 1;
      continue; // etiqueta sin `>`: texto
    }
    flushText(lt);
    tokens.push({
      type: "open",
      tag,
      attrs: parsed.attrs,
      selfClosing: parsed.selfClosing || VOID_ELEMENTS.has(tag),
      raw: html.slice(lt, parsed.end),
    });
    i = textStart = parsed.end;

    // Texto crudo: no hay marcado dentro, solo el cierre corta.
    if (RAW_TEXT.has(tag) && !parsed.selfClosing) {
      const closeRe = new RegExp(`</${tag}\\s*>`, "i");
      const rest = html.slice(i);
      const cm = closeRe.exec(rest);
      const bodyEnd = cm ? i + cm.index : html.length;
      tokens.push({ type: "text", text: html.slice(i, bodyEnd) });
      if (cm) {
        tokens.push({ type: "close", tag });
        i = textStart = bodyEnd + cm[0].length;
      } else {
        i = textStart = html.length;
      }
    }
  }
  flushText(html.length);
  return tokens;
}

function parseAttributes(
  html: string,
  from: number,
): { attrs: Map<string, string>; selfClosing: boolean; end: number } | null {
  const attrs = new Map<string, string>();
  let i = from;
  for (;;) {
    while (i < html.length && /\s/.test(html[i]!)) i++;
    if (i >= html.length) return null;
    if (html[i] === ">") return { attrs, selfClosing: false, end: i + 1 };
    if (html[i] === "/" && html[i + 1] === ">") return { attrs, selfClosing: true, end: i + 2 };

    const nameStart = i;
    while (i < html.length && !/[\s/>=]/.test(html[i]!)) i++;
    if (i === nameStart) {
      i++; // carácter raro (`=` suelto): avanza para no colgarse
      continue;
    }
    const name = html.slice(nameStart, i).toLowerCase();

    while (i < html.length && /\s/.test(html[i]!)) i++;
    let value = "";
    if (html[i] === "=") {
      i++;
      while (i < html.length && /\s/.test(html[i]!)) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        i++;
        const end = html.indexOf(q, i);
        if (end === -1) return null; // atributo sin cerrar: etiqueta inválida
        value = html.slice(i, end);
        i = end + 1;
      } else {
        const vs = i;
        while (i < html.length && !/[\s>]/.test(html[i]!)) i++;
        value = html.slice(vs, i);
      }
    }
    // El primer valor gana, como los navegadores: evita el truco de repetir un
    // atributo para colar un segundo valor.
    if (!attrs.has(name)) attrs.set(name, value);
  }
}

/* ========================================================================== */
/* Recorte de secciones                                                       */
/* ========================================================================== */

/** Devuelve el HTML interior del primer elemento con ese `id`. */
export function sliceElementById(html: string, id: string): string | null {
  const re = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid\\s*=\\s*["']${escapeRegExp(id)}["'][^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const tag = m[1]!.toLowerCase();
  const start = m.index + m[0].length;
  const end = findClosingTag(html, tag, start);
  return end === -1 ? null : html.slice(start, end);
}

/**
 * Devuelve los HTML interiores de los elementos cuyo atributo `class` contiene
 * `className` como palabra completa, en el orden del documento y sin anidar
 * (una vez abierto uno, se salta hasta su cierre).
 */
export function sliceElementsByClass(html: string, className: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*)>`, "gi");
  let m: RegExpExecArray | null;
  let skipUntil = 0;
  while ((m = re.exec(html)) !== null) {
    if (m.index < skipUntil) continue;
    const attrs = m[2] ?? "";
    const cm = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (!cm) continue;
    if (!cm[1]!.split(/\s+/).includes(className)) continue;
    const tag = m[1]!.toLowerCase();
    const start = m.index + m[0].length;
    const end = findClosingTag(html, tag, start);
    if (end === -1) continue;
    out.push(html.slice(start, end));
    skipUntil = end;
    re.lastIndex = end;
  }
  return out;
}

/** Índice del `</tag>` que equilibra la apertura ya consumida en `from`. */
export function findClosingTag(html: string, tag: string, from: number): number {
  const re = new RegExp(`<(/?)${escapeRegExp(tag)}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] === "/") {
      depth--;
      if (depth === 0) return m.index;
    } else if (!/\/>\s*$/.test(m[0])) {
      depth++;
    }
  }
  return -1;
}
