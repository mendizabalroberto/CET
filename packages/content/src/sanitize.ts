/**
 * Saneado de HTML — FRONTERA DE SEGURIDAD.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Todo texto extraído de Y6A acaba en `lesson_blocks.content` / `question_versions.body`
 * y de ahí a un `dangerouslySetInnerHTML` en el navegador de un niño de 11 años.
 * Este fichero es lo único que separa esas dos cosas.
 *
 * MODELO: ALLOWLIST, RE-SERIALIZACIÓN, VERIFICACIÓN
 *   1. Se tokeniza con nuestro propio tokenizador (ver `extract/html.ts`).
 *   2. Se descarta TODO lo que no esté explícitamente permitido: etiqueta,
 *      atributo y — para `class` — incluso el valor concreto.
 *   3. La salida se CONSTRUYE de cero desde los tokens permitidos. Ni un byte
 *      del original se copia sin pasar por `escapeHtml`, salvo los nombres de
 *      etiqueta y los valores de atributo ya validados contra la allowlist.
 *   4. Un verificador final vuelve a escanear el resultado. Si encuentra
 *      `<script`, un `on*=`, un `javascript:` o cualquier etiqueta fuera de la
 *      allowlist, LANZA. No devuelve HTML "casi limpio": aborta el pipeline.
 *
 * La capa 4 es redundante por diseño. Existe para que un fallo futuro en las
 * capas 1–3 rompa el build en vez de publicar un XSS.
 */

import { decodeEntities, escapeAttr, escapeHtml, tokenizeHtml, VOID_ELEMENTS } from "./extract/html.ts";

/** Etiquetas permitidas en el contenido de una lección o de una pregunta. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "br",
  "span",
  "sub",
  "sup",
  "small",
  "code",
  "p",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h3",
  "h4",
  "div",
]);

/**
 * Atributos permitidos por etiqueta. `class` se filtra además por VALOR: si se
 * dejara pasar cualquier clase, un HTML manipulado podría inyectar la clase de
 * un componente del design system y suplantar UI de la aplicación.
 */
const ALLOWED_ATTRS: Readonly<Record<string, readonly string[]>> = {
  span: ["class"],
  div: ["class"],
  table: ["class"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

/**
 * Valores de `class` permitidos. Son exactamente los que los trainers usan con
 * significado semántico o tipográfico. Cualquier otro se elimina (el elemento
 * sobrevive, la clase no).
 */
export const ALLOWED_CLASSES: ReadonlySet<string> = new Set([
  "f", // fracción apilada de Math: <span class="f"><span class="a">3</span><span class="b">4</span></span>
  "a",
  "b",
  "mixw", // parte entera de un número mixto
  "step", // línea de un bloque .eg / .steps
  "sn", // número de paso
  "ic", // icono de paso
  "tsub", // subtítulo tenue
  "u", // unidad en la cadena métrica
  "op", // operador en la cadena métrica
  "t", // tabla de datos
  "big", // lista de tipografía grande
  "chain",
  "steps",
  "num",
  "k",
]);

/** Elementos que se eliminan CON su contenido. */
const DROP_WITH_CONTENT: ReadonlySet<string> = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "frame",
  "frameset",
  "noscript",
  "template",
  "svg",
  "math",
  "form",
  "select",
  "option",
  "textarea",
  "canvas",
  "audio",
  "video",
  "link",
  "meta",
  "base",
  "title",
  "head",
  "xmp",
]);

/** Solo dígitos, y como mucho dos: `colspan="999999"` es un ataque de layout. */
const SPAN_VALUE = /^[1-9][0-9]?$/;

export class SanitizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanitizerError";
  }
}

/**
 * Sanea un fragmento de HTML. Devuelve HTML seguro y bien equilibrado.
 * Lanza `SanitizerError` si el verificador final detecta algo prohibido.
 */
export function sanitizeHtml(input: string): string {
  const tokens = tokenizeHtml(input);
  const out: string[] = [];
  const open: string[] = [];
  /** Profundidad dentro de un elemento que se descarta con su contenido. */
  let dropping: { tag: string; depth: number } | null = null;

  for (const token of tokens) {
    if (dropping !== null) {
      if (token.type === "open" && token.tag === dropping.tag && !token.selfClosing) {
        dropping.depth++;
      } else if (token.type === "close" && token.tag === dropping.tag) {
        dropping.depth--;
        if (dropping.depth === 0) dropping = null;
      }
      continue;
    }

    switch (token.type) {
      case "comment":
        // Los comentarios condicionales de IE ejecutan marcado. Fuera, siempre.
        break;

      case "text":
        out.push(escapeHtml(decodeForOutput(token.text)));
        break;

      case "open": {
        if (DROP_WITH_CONTENT.has(token.tag)) {
          if (!token.selfClosing) dropping = { tag: token.tag, depth: 1 };
          break;
        }
        if (!ALLOWED_TAGS.has(token.tag)) {
          // Etiqueta desconocida (incluida <a>): se "desenvuelve" — el elemento
          // desaparece pero su texto se conserva. Perder texto es perder
          // contenido pedagógico; conservar la etiqueta es perder la frontera.
          break;
        }
        const attrs = renderAttrs(token.tag, token.attrs);
        if (VOID_ELEMENTS.has(token.tag)) {
          out.push(`<${token.tag}${attrs}>`);
        } else if (token.selfClosing) {
          out.push(`<${token.tag}${attrs}></${token.tag}>`);
        } else {
          out.push(`<${token.tag}${attrs}>`);
          open.push(token.tag);
        }
        break;
      }

      case "close": {
        if (DROP_WITH_CONTENT.has(token.tag) || !ALLOWED_TAGS.has(token.tag)) break;
        if (VOID_ELEMENTS.has(token.tag)) break;
        const at = open.lastIndexOf(token.tag);
        if (at === -1) break; // cierre huérfano: se ignora
        // Cierra también lo que quedó abierto por dentro (HTML mal anidado):
        // así la salida siempre está equilibrada.
        for (let k = open.length - 1; k >= at; k--) out.push(`</${open[k]}>`);
        open.length = at;
        break;
      }
    }
  }

  for (let k = open.length - 1; k >= 0; k--) out.push(`</${open[k]}>`);

  const html = collapseWhitespace(out.join(""));
  assertSafe(html);
  return html;
}

/**
 * Devuelve SOLO el texto visible del fragmento, sin ninguna etiqueta.
 *
 * Tokeniza la ENTRADA y decodifica sus nodos de texto UNA SOLA VEZ. La versión
 * ingenua — sanear, quitar las etiquetas con una regex y volver a decodificar —-
 * decodifica dos veces: `&amp;lt;b&amp;gt;` (que el alumno debe leer como el
 * texto literal `&lt;b&gt;`) acabaría convertido en `<b>`, perdiendo un nivel de
 * escape en cada pasada. Ahí no hay XSS — la allowlist vuelve a filtrar todo —-
 * pero sí corrupción del contenido, y una defensa que depende de una sola capa.
 *
 * También descarta el contenido de `<script>` y compañía, para que el texto de
 * un título nunca arrastre código.
 */
export function sanitizeToText(input: string): string {
  const parts: string[] = [];
  let dropping: { tag: string; depth: number } | null = null;

  for (const token of tokenizeHtml(input)) {
    if (dropping !== null) {
      if (token.type === "open" && token.tag === dropping.tag && !token.selfClosing) {
        dropping.depth++;
      } else if (token.type === "close" && token.tag === dropping.tag) {
        dropping.depth--;
        if (dropping.depth === 0) dropping = null;
      }
      continue;
    }
    if (token.type === "text") {
      parts.push(decodeEntities(token.text));
    } else if (token.type === "open" && DROP_WITH_CONTENT.has(token.tag) && !token.selfClosing) {
      dropping = { tag: token.tag, depth: 1 };
    } else if (token.type === "open" || token.type === "close") {
      // Una etiqueta separa palabras: `<td>a</td><td>b</td>` no es "ab".
      parts.push(" ");
    }
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

/**
 * Texto plano listo para guardarse como HTML: decodificado una vez y escapado
 * una vez. Los títulos de las lecciones pasan por aquí, NO por `sanitizeHtml`
 * sobre el resultado de `sanitizeToText` (eso sería la segunda decodificación).
 */
export function textToSafeHtml(input: string): string {
  const html = escapeHtml(sanitizeToText(input));
  assertSafe(html);
  return html;
}

/* -------------------------------------------------------------------------- */

/**
 * Decodifica entidades del texto de entrada para poder re-escaparlas después.
 * Se hace en UNA sola pasada: decodificar dos veces convierte `&amp;lt;script&gt;`
 * en `<script>`, que es el clásico bypass por doble codificación.
 */
const decodeOnce = decodeEntities;
const decodeForOutput = decodeEntities;

function renderAttrs(tag: string, attrs: ReadonlyMap<string, string>): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const parts: string[] = [];
  for (const name of allowed) {
    const raw = attrs.get(name);
    if (raw === undefined) continue;

    if (name === "class") {
      const kept = decodeOnce(raw)
        .split(/\s+/)
        .filter((c) => ALLOWED_CLASSES.has(c));
      if (kept.length === 0) continue;
      parts.push(` class="${escapeAttr(kept.join(" "))}"`);
      continue;
    }
    if (name === "colspan" || name === "rowspan") {
      const v = decodeOnce(raw).trim();
      if (!SPAN_VALUE.test(v)) continue;
      parts.push(` ${name}="${v}"`);
      continue;
    }
  }
  return parts.join("");
}

function collapseWhitespace(html: string): string {
  return html.replace(/[ \t]*\n[ \t\n]*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * VERIFICADOR FINAL. Redundante a propósito: si alguna vez las capas anteriores
 * dejan pasar algo, esto rompe el build en vez de publicar el agujero.
 */
export function assertSafe(html: string): void {
  // El texto ya está escapado, así que un `<` literal solo puede venir de una
  // etiqueta que el saneador emitió. Las comprobaciones de atributos se hacen
  // SOLO sobre el marcado: aplicarlas al texto daría falsos positivos con una
  // lección que hable, legítimamente, de `javascript:` o de `onclick`.
  if (/<\s*\/?\s*script/i.test(html)) throw new SanitizerError("saneado dejó pasar <script>");

  for (const m of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g)) {
    const tag = m[1]!.toLowerCase();
    const attrs = m[2] ?? "";
    if (!ALLOWED_TAGS.has(tag)) throw new SanitizerError(`saneado dejó pasar <${tag}>`);
    if (/\son[a-z]+\s*=/i.test(attrs)) {
      throw new SanitizerError(`saneado dejó pasar un manejador on*= en <${tag}>`);
    }
    if (/\b(href|src|srcset|xlink:href|formaction|action|style|srcdoc|background|data-[\w-]+)\s*=/i.test(attrs)) {
      throw new SanitizerError(`saneado dejó pasar un atributo prohibido en <${tag}>`);
    }
    if (/javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i.test(attrs)) {
      throw new SanitizerError(`saneado dejó pasar un esquema de URL peligroso en <${tag}>`);
    }
  }

  // Un `<` que no forme parte de una etiqueta bien cerrada no puede existir en
  // la salida: si aparece, el serializador tiene un fallo.
  const stripped = html.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*[^>]*>/g, "");
  if (stripped.includes("<")) throw new SanitizerError("saneado dejó un `<` sin escapar");
}
