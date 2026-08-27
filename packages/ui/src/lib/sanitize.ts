/**
 * @cet/ui — sanitizador HTML.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ============================================================================
 * FRONTERA DE SEGURIDAD — LEER ANTES DE TOCAR
 * ============================================================================
 *
 * Todo el contenido de leccion (`lesson_blocks.content`) y todo `stem`,
 * `options[].html` y `figureSvg` de `RenderedBody` viaja como HTML desde la base
 * de datos. Ese HTML lo escriben profesores y autores desde el panel de admin:
 * es entrada de usuario, no contenido de confianza.
 *
 * REGLA DEL PAQUETE, sin excepciones:
 *
 *   Ningun componente de @cet/ui — ni de apps/web — puede llamar a
 *   `dangerouslySetInnerHTML` con una cadena que no haya pasado por
 *   `sanitizeHtml()` o `sanitizeSvg()` de este fichero.
 *
 * En la practica ni siquiera hace falta llamarlo a mano: los componentes
 * `<SafeHtml>` y `<MathStem>` son la unica via publica para pintar HTML de la
 * DB, y ambos sanean por dentro. El unico `dangerouslySetInnerHTML` del paquete
 * vive en `SafeHtml`; el lint del repo debe prohibirlo en cualquier otro sitio
 * (`react/no-danger`, con excepcion unicamente para `src/lib/safe-html.tsx`).
 *
 * DECISIONES:
 *
 *  - Allowlist, nunca denylist. Lo que no esta listado se cae.
 *  - Implementacion propia sin DOM: corre igual en Server Components (Node) que
 *    en el navegador. Un sanitizador basado en `innerHTML` no es utilizable en
 *    SSR y ademas abre la puerta a mXSS por reserializacion.
 *  - Las entidades de los valores de atributo se decodifican ANTES de validar el
 *    esquema de URL. `javascript&#58;alert(1)` y `java&#9;script:x` son ataques
 *    reales y este es el punto donde mueren.
 *  - `style` NUNCA se permite: habilita `url(javascript:...)`, exfiltracion por
 *    `background-image` y ataques de posicionamiento (clickjacking sobre el
 *    boton de entregar examen).
 *  - `class` se filtra contra una allowlist: las clases de los trainers Y6A se
 *    remapean a las clases del design system y el resto se descarta.
 *  - Elementos peligrosos (`script`, `style`, `iframe`, `object`, `embed`,
 *    `template`, `noscript`, ...) se eliminan CON su contenido, no solo la
 *    etiqueta: dejar el contenido de un `<script>` como texto plano es como
 *    minimo ruido y en algunos contextos vuelve a ser ejecutable.
 */

/* -------------------------------------------------------------------------- */
/* Allowlists                                                                  */
/* -------------------------------------------------------------------------- */

/** Etiquetas admitidas en HTML de leccion y en enunciados de pregunta. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "p",
  "br",
  "span",
  "div",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "mark",
  "small",
  "sub",
  "sup",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "abbr",
  "blockquote",
  "cite",
  "q",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "figure",
  "figcaption",
  "img",
  "a",
  "ruby",
  "rt",
  "rp",
  "wbr",
  "time",
]);

/**
 * Elementos que se eliminan junto con TODO su contenido.
 * `svg` y `math` no estan aqui: `sanitizeHtml` los descarta como cualquier otra
 * etiqueta desconocida, y las figuras SVG pasan por `sanitizeSvg`, que tiene su
 * propia allowlist.
 */
const VOID_CONTENT_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "noscript",
  "noembed",
  "template",
  "slot",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "optgroup",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "portal",
  "base",
  "link",
  "meta",
  "title",
  "head",
  "body",
  "html",
  "xmp",
  "listing",
  "plaintext",
]);

/** Elementos sin cierre. */
const SELF_CLOSING: ReadonlySet<string> = new Set(["br", "hr", "img", "wbr", "col"]);

/** Atributos admitidos en cualquier etiqueta permitida. */
const GLOBAL_ATTRS: ReadonlySet<string> = new Set(["class", "dir", "lang", "title"]);

/** Atributos admitidos por etiqueta. */
const TAG_ATTRS: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading", "decoding"],
  td: ["colspan", "rowspan", "headers", "scope"],
  th: ["colspan", "rowspan", "headers", "scope", "abbr"],
  col: ["span"],
  colgroup: ["span"],
  ol: ["start", "reversed", "type"],
  li: ["value"],
  time: ["datetime"],
  abbr: ["title"],
  q: ["cite"],
  blockquote: ["cite"],
};

/** Atributos cuyo valor es una URL y por tanto se validan por esquema. */
const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "cite"]);

/** Esquemas de URL admitidos. `data:` solo para imagenes rasterizadas. */
const SAFE_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);

/** `data:` admitido unicamente con estos tipos. `image/svg+xml` NO: lleva script. */
const SAFE_DATA_MIME = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

/**
 * Clases admitidas en cualquier etiqueta.
 * Cualquier clase que no aparezca en estos mapas se descarta en silencio.
 */
const CLASS_MAP: Readonly<Record<string, string>> = {
  "cet-fraction": "cet-fraction",
  "cet-fraction-num": "cet-fraction-num",
  "cet-fraction-den": "cet-fraction-den",
  "cet-mixed-number": "cet-mixed-number",
  eg: "cet-example-inline",
  mixw: "cet-mixed-number",
  dim: "cet-dim",
  dimq: "cet-dim-unknown",
};

/**
 * Clases de UNA SOLA LETRA de los trainers Y6A. Solo se remapean sobre `<span>`,
 * y `t` solo sobre `<table>`.
 *
 * Por que la restriccion: `a`, `b`, `t` y `f` son nombres de clase demasiado
 * comunes. Sin acotarlos, un autor que escriba `<div class="b">` en una leccion
 * se encontraba con la barra de fraccion pintada encima, y peor:
 * `parseSafeHtml` podia leer ese nodo como el denominador de una fraccion que
 * no existe y anunciarlo mal por el lector de pantalla.
 */
const SHORT_CLASS_MAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // fracciones de Y6A: <span class="f"><span class="a">3</span><span class="b">4</span></span>
  span: {
    f: "cet-fraction",
    a: "cet-fraction-num",
    b: "cet-fraction-den",
    step: "cet-step",
    small: "cet-small",
  },
  div: { step: "cet-step" },
  table: { t: "cet-table" },
};

/* -------------------------------------------------------------------------- */
/* Entidades                                                                   */
/* -------------------------------------------------------------------------- */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  tab: "\t",
  newline: "\n",
  sol: "/",
  lpar: "(",
  rpar: ")",
};

/**
 * Decodifica entidades HTML de forma repetida hasta punto fijo.
 * El bucle importa: `&amp;#58;` decodifica a `&#58;` y en un segundo paso a `:`.
 * Un solo paso deja pasar `javascript&amp;#58;alert(1)` en navegadores que
 * decodifican dos veces. Se limita a 5 vueltas para no dar pie a un DoS.
 */
export function decodeEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = current.replace(
      /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]{1,31});?/g,
      (match, body: string) => {
        if (body.startsWith("#x") || body.startsWith("#X")) {
          const code = Number.parseInt(body.slice(2), 16);
          return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
        }
        if (body.startsWith("#")) {
          const code = Number.parseInt(body.slice(1), 10);
          return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
        }
        const named = NAMED_ENTITIES[body.toLowerCase()];
        return named ?? match;
      },
    );
    if (next === current) break;
    current = next;
  }
  return current;
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (code <= 0 || code > 0x10ffff) return fallback;
  // Sustitutos sueltos: no son un caracter valido.
  if (code >= 0xd800 && code <= 0xdfff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Escapa texto para insertarlo como contenido de un nodo. */
export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapa un valor para insertarlo entre comillas dobles en un atributo. */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Caracteres que los navegadores ignoran dentro de un esquema de URL y que por
 * tanto hay que quitar ANTES de comparar: control C0/C1, tabulador, saltos de
 * linea, espacios Unicode exoticos, marcas de direccion y BOM.
 * Se escribe con escapes, nunca con los caracteres literales: un control suelto
 * en el fuente es invisible en la revision de codigo.
 */
const CONTROL_AND_SPACE_CHARS =
  "[\\u0000-\\u0020\\u007f-\\u00a0\\u1680\\u180e\\u2000-\\u200f" +
  "\\u2028-\\u202f\\u205f-\\u2060\\u3000\\ufeff]";

/* -------------------------------------------------------------------------- */
/* Validacion de URL                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve la URL si es segura, o `null` si hay que descartar el atributo.
 * Se acepta: http, https, mailto, rutas relativas, anclas y `data:` de imagen
 * rasterizada. Se rechaza todo lo demas, incluido `javascript:`, `vbscript:`,
 * `data:text/html` y `data:image/svg+xml`.
 */
export function sanitizeUrl(raw: string): string | null {
  // 1. Decodificar entidades: es el vector clasico (`javascript&#58;`).
  let value = decodeEntities(raw);
  // 2. Quitar caracteres de control y espacios que los navegadores ignoran
  //    dentro del esquema: \u0009, \u000a, espacios exoticos y BOM.
  value = value.replace(new RegExp(CONTROL_AND_SPACE_CHARS, "g"), "");
  if (value === "") return null;

  const lower = value.toLowerCase();

  if (lower.startsWith("data:")) {
    return SAFE_DATA_MIME.test(value.replace(/\s+/g, "")) ? value.replace(/\s+/g, "") : null;
  }

  // Ancla o ruta relativa: sin esquema, no hay superficie de ataque.
  // `//evil.com` (protocol-relative) se rechaza: hereda el esquema de la pagina
  // pero apunta fuera, y el contenido de leccion no tiene motivo para hacerlo.
  if (lower.startsWith("//")) return null;
  if (lower.startsWith("#") || lower.startsWith("/") || lower.startsWith("./") || lower.startsWith("../")) {
    return value;
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(lower);
  if (!schemeMatch) {
    // Sin esquema y sin barra inicial: ruta relativa simple ("img/a.png").
    // Se rechaza si contiene ":" antes de la primera "/" para no dejar colar
    // esquemas raros que el regex anterior no haya reconocido.
    const firstSlash = value.indexOf("/");
    const firstColon = value.indexOf(":");
    if (firstColon !== -1 && (firstSlash === -1 || firstColon < firstSlash)) return null;
    return value;
  }

  const scheme = schemeMatch[1];
  if (scheme === undefined) return null;
  return SAFE_SCHEMES.has(scheme) ? value : null;
}

/* -------------------------------------------------------------------------- */
/* Tokenizador                                                                 */
/* -------------------------------------------------------------------------- */

export type HtmlToken =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "open";
      readonly tag: string;
      readonly attrs: ReadonlyArray<readonly [string, string]>;
      readonly selfClosing: boolean;
    }
  | { readonly kind: "close"; readonly tag: string };

const TAG_NAME_RE = /^[a-zA-Z][a-zA-Z0-9:-]*/;

/**
 * Convierte HTML en una lista de tokens. No valida nada: es el motor comun de
 * `sanitizeHtml` (que filtra) y de `parseSafeHtml` (que solo corre sobre HTML
 * ya saneado). Nunca ejecutar `parseSafeHtml` sobre entrada cruda.
 */
export function tokenizeHtml(input: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let i = 0;
  const n = input.length;

  const pushText = (text: string): void => {
    if (text.length > 0) tokens.push({ kind: "text", text });
  };

  while (i < n) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      pushText(input.slice(i));
      break;
    }
    pushText(input.slice(i, lt));

    // Comentario, doctype, instruccion de proceso: se descartan enteros.
    if (input.startsWith("<!--", lt)) {
      const end = input.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input.startsWith("<!", lt) || input.startsWith("<?", lt)) {
      const end = input.indexOf(">", lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }

    // Etiqueta de cierre.
    if (input.startsWith("</", lt)) {
      const rest = input.slice(lt + 2);
      const nameMatch = TAG_NAME_RE.exec(rest);
      if (!nameMatch) {
        pushText("<");
        i = lt + 1;
        continue;
      }
      const end = input.indexOf(">", lt + 2);
      const tag = nameMatch[0].toLowerCase();
      tokens.push({ kind: "close", tag });
      i = end === -1 ? n : end + 1;
      continue;
    }

    // Etiqueta de apertura.
    const rest = input.slice(lt + 1);
    const nameMatch = TAG_NAME_RE.exec(rest);
    if (!nameMatch) {
      // "<" suelto: es texto literal, no una etiqueta.
      pushText("<");
      i = lt + 1;
      continue;
    }

    const tag = nameMatch[0].toLowerCase();
    let cursor = lt + 1 + nameMatch[0].length;
    const attrs: Array<readonly [string, string]> = [];
    let selfClosing = false;

    // Bucle de atributos, respetando comillas.
    for (;;) {
      while (cursor < n && /\s/.test(input[cursor] ?? "")) cursor += 1;
      if (cursor >= n) break;
      const ch = input[cursor];
      if (ch === ">") {
        cursor += 1;
        break;
      }
      if (ch === "/" && input[cursor + 1] === ">") {
        selfClosing = true;
        cursor += 2;
        break;
      }
      if (ch === "/") {
        cursor += 1;
        continue;
      }

      // Nombre del atributo.
      const nameStart = cursor;
      while (cursor < n && !/[\s/>=]/.test(input[cursor] ?? "")) cursor += 1;
      const attrName = input.slice(nameStart, cursor).toLowerCase();
      if (attrName === "") {
        cursor += 1;
        continue;
      }

      while (cursor < n && /\s/.test(input[cursor] ?? "")) cursor += 1;
      let attrValue = "";
      if (input[cursor] === "=") {
        cursor += 1;
        while (cursor < n && /\s/.test(input[cursor] ?? "")) cursor += 1;
        const quote = input[cursor];
        if (quote === '"' || quote === "'") {
          cursor += 1;
          const close = input.indexOf(quote, cursor);
          attrValue = close === -1 ? input.slice(cursor) : input.slice(cursor, close);
          cursor = close === -1 ? n : close + 1;
        } else {
          const valueStart = cursor;
          while (cursor < n && !/[\s>]/.test(input[cursor] ?? "")) cursor += 1;
          attrValue = input.slice(valueStart, cursor);
        }
      }
      attrs.push([attrName, attrValue]);
    }

    tokens.push({ kind: "open", tag, attrs, selfClosing: selfClosing || SELF_CLOSING.has(tag) });
    i = cursor;
  }

  return tokens;
}

/* -------------------------------------------------------------------------- */
/* Filtrado de atributos                                                       */
/* -------------------------------------------------------------------------- */

function filterClass(tag: string, raw: string): string | null {
  const scoped = SHORT_CLASS_MAP[tag] ?? {};
  const mapped = decodeEntities(raw)
    .split(/\s+/)
    .map((token) => {
      const name = token.trim();
      return CLASS_MAP[name] ?? scoped[name];
    })
    .filter((c): c is string => typeof c === "string" && c.length > 0);
  const unique = Array.from(new Set(mapped));
  return unique.length > 0 ? unique.join(" ") : null;
}

function isAllowedAttr(tag: string, name: string): boolean {
  // `on*` muere aqui de forma explicita ademas de por no estar en la allowlist:
  // una allowlist mal editada en el futuro no debe reabrir este agujero.
  if (name.startsWith("on")) return false;
  if (name === "style") return false;
  // `xlink:*`, `xmlns:*`, `formaction`, `srcset`, `data-*`: fuera.
  if (name.includes(":")) return false;
  if (name.startsWith("data-")) return false;
  if (GLOBAL_ATTRS.has(name)) return true;
  return (TAG_ATTRS[tag] ?? []).includes(name);
}

function sanitizeAttrs(
  tag: string,
  attrs: ReadonlyArray<readonly [string, string]>,
): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  const seen = new Set<string>();

  for (const [name, rawValue] of attrs) {
    if (seen.has(name)) continue;
    if (!isAllowedAttr(tag, name)) continue;
    seen.add(name);

    if (name === "class") {
      const cls = filterClass(tag, rawValue);
      if (cls !== null) out.push(["class", cls]);
      continue;
    }

    if (URL_ATTRS.has(name)) {
      const url = sanitizeUrl(rawValue);
      if (url !== null) out.push([name, url]);
      continue;
    }

    if (name === "target") {
      // Solo `_blank`, y siempre acompanado de rel (ver abajo).
      if (decodeEntities(rawValue).trim().toLowerCase() === "_blank") out.push(["target", "_blank"]);
      continue;
    }

    if (name === "rel") {
      continue; // se reconstruye deterministicamente mas abajo
    }

    if (["width", "height", "colspan", "rowspan", "span", "start", "value"].includes(name)) {
      const num = decodeEntities(rawValue).trim();
      if (/^[0-9]{1,6}$/.test(num)) out.push([name, num]);
      continue;
    }

    if (name === "loading") {
      const v = decodeEntities(rawValue).trim().toLowerCase();
      if (v === "lazy" || v === "eager") out.push([name, v]);
      continue;
    }

    if (name === "decoding") {
      const v = decodeEntities(rawValue).trim().toLowerCase();
      if (v === "async" || v === "sync" || v === "auto") out.push([name, v]);
      continue;
    }

    if (name === "dir") {
      const v = decodeEntities(rawValue).trim().toLowerCase();
      if (v === "ltr" || v === "rtl" || v === "auto") out.push([name, v]);
      continue;
    }

    if (name === "scope") {
      const v = decodeEntities(rawValue).trim().toLowerCase();
      if (["row", "col", "rowgroup", "colgroup"].includes(v)) out.push([name, v]);
      continue;
    }

    // Texto libre (alt, title, lang, headers, datetime, abbr): se decodifica y
    // se vuelve a escapar en la serializacion.
    out.push([name, decodeEntities(rawValue)]);
  }

  if (tag === "a") {
    const hasTarget = out.some(([k]) => k === "target");
    if (hasTarget) out.push(["rel", "noopener noreferrer"]);
    // Un enlace sin href no es navegable ni enfocable: se deja pasar como span
    // visual, pero nunca convertimos un <a> roto en algo clicable.
  }

  if (tag === "img") {
    const hasAlt = out.some(([k]) => k === "alt");
    // Accesibilidad: una imagen sin alt en material para ninos es un fallo.
    // `alt=""` la marca como decorativa, que es el default menos danino.
    if (!hasAlt) out.push(["alt", ""]);
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* sanitizeHtml                                                                */
/* -------------------------------------------------------------------------- */

export interface SanitizeOptions {
  /**
   * Corta la entrada por longitud antes de procesar. Protege contra un pack de
   * contenido corrupto que intente colgar el render del servidor.
   * @default 200000
   */
  readonly maxLength?: number | undefined;
}

const DEFAULT_MAX_LENGTH = 200_000;

/**
 * Sanea HTML de la base de datos con una allowlist estricta.
 *
 * Garantias:
 *  - cero `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>` (se eliminan
 *    con su contenido);
 *  - cero atributos `on*` y cero `style`;
 *  - cero `javascript:` / `vbscript:` / `data:text/html` / `data:image/svg+xml`,
 *    incluso ofuscados con entidades o caracteres de control;
 *  - salida siempre bien formada: las etiquetas abiertas se cierran en orden.
 *
 * @param dirty HTML no confiable.
 * @returns HTML seguro para `dangerouslySetInnerHTML`.
 */
export function sanitizeHtml(dirty: string, options: SanitizeOptions = {}): string {
  if (typeof dirty !== "string" || dirty === "") return "";
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const tokens = tokenizeHtml(dirty.slice(0, maxLength));

  const out: string[] = [];
  const stack: string[] = [];
  /** Profundidad dentro de un elemento cuyo contenido se descarta entero. */
  let dropDepth = 0;
  let dropTag = "";

  for (const token of tokens) {
    if (dropDepth > 0) {
      if (token.kind === "open" && token.tag === dropTag && !token.selfClosing) dropDepth += 1;
      else if (token.kind === "close" && token.tag === dropTag) dropDepth -= 1;
      continue;
    }

    if (token.kind === "text") {
      out.push(escapeText(token.text));
      continue;
    }

    if (token.kind === "open") {
      if (VOID_CONTENT_TAGS.has(token.tag)) {
        if (!token.selfClosing) {
          dropDepth = 1;
          dropTag = token.tag;
        }
        continue;
      }
      if (!ALLOWED_TAGS.has(token.tag)) {
        // Etiqueta desconocida (incluido `svg`, `math`, `custom-element`): se
        // descarta la etiqueta pero se conserva el texto interior.
        continue;
      }

      const attrs = sanitizeAttrs(token.tag, token.attrs);
      const serialized = attrs
        .map(([k, v]) => (v === "" && k !== "alt" ? ` ${k}` : ` ${k}="${escapeAttribute(v)}"`))
        .join("");

      if (token.selfClosing || SELF_CLOSING.has(token.tag)) {
        out.push(`<${token.tag}${serialized} />`);
      } else {
        out.push(`<${token.tag}${serialized}>`);
        stack.push(token.tag);
      }
      continue;
    }

    // close
    if (!ALLOWED_TAGS.has(token.tag) || SELF_CLOSING.has(token.tag)) continue;
    const idx = stack.lastIndexOf(token.tag);
    if (idx === -1) continue; // cierre huerfano: se ignora
    // Cerrar todo lo que quedo abierto por encima: evita HTML mal anidado, que
    // es el terreno donde nacen los mXSS.
    for (let d = stack.length - 1; d >= idx; d -= 1) {
      out.push(`</${stack[d] ?? ""}>`);
    }
    stack.length = idx;
  }

  for (let d = stack.length - 1; d >= 0; d -= 1) {
    out.push(`</${stack[d] ?? ""}>`);
  }

  return out.join("");
}

/* -------------------------------------------------------------------------- */
/* sanitizeSvg                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Allowlist de SVG para `RenderedBody.figureSvg` (los "labs" de Y6A: figuras
 * compuestas, circuitos, mapas). Solo geometria y texto: nada de `script`,
 * `foreignObject`, `use`, `image`, `animate` ni `set`.
 */
const SVG_TAGS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "pattern",
]);

const SVG_ATTRS: ReadonlySet<string> = new Set([
  "d",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "points",
  "transform",
  "viewbox",
  "viewBox",
  "preserveaspectratio",
  "preserveAspectRatio",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "dx",
  "dy",
  "class",
  // `id` NO esta permitido: un SVG de contenido que declare
  // id="submit-button" secuestra `document.getElementById` (DOM clobbering) y
  // puede romper un `aria-labelledby` del examen. Los degradados y clip-paths
  // que necesitan referencias internas no se admiten por la misma razon.
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradientUnits",
  "clip-path",
  "marker-end",
  "marker-start",
  "orient",
  "refx",
  "refY",
  "refX",
  "refy",
  "markerwidth",
  "markerWidth",
  "markerheight",
  "markerHeight",
  "role",
  "aria-label",
  "aria-hidden",
  "focusable",
  "xmlns",
]);

const SVG_SELF_CLOSING: ReadonlySet<string> = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "stop",
]);

/** Nombres tal cual deben salir serializados (SVG distingue mayusculas). */
const SVG_CASE: Readonly<Record<string, string>> = {
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  clippath: "clipPath",
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  markerwidth: "markerWidth",
  markerheight: "markerHeight",
  refx: "refX",
  refy: "refY",
};

/**
 * Sanea un SVG inline. Misma regla que `sanitizeHtml`: es la unica via
 * autorizada para pintar `figureSvg`.
 *
 * Rechaza de raiz `script`, `foreignObject` (puede reintroducir HTML completo),
 * `use`/`image` (cargan recursos externos y permiten `xlink:href="data:..."`) y
 * `animate`/`set` (pueden reescribir `href` en tiempo de ejecucion).
 */
export function sanitizeSvg(dirty: string, options: SanitizeOptions = {}): string {
  if (typeof dirty !== "string" || dirty === "") return "";
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const tokens = tokenizeHtml(dirty.slice(0, maxLength));

  const out: string[] = [];
  const stack: string[] = [];
  let dropDepth = 0;
  let dropTag = "";

  for (const token of tokens) {
    if (dropDepth > 0) {
      if (token.kind === "open" && token.tag === dropTag && !token.selfClosing) dropDepth += 1;
      else if (token.kind === "close" && token.tag === dropTag) dropDepth -= 1;
      continue;
    }

    if (token.kind === "text") {
      out.push(escapeText(token.text));
      continue;
    }

    if (token.kind === "open") {
      const canonical = SVG_CASE[token.tag] ?? token.tag;
      if (!SVG_TAGS.has(canonical)) {
        // Cualquier cosa fuera de la allowlist se elimina CON su contenido:
        // en SVG el texto suelto de un `<script>` no debe sobrevivir.
        if (!token.selfClosing) {
          dropDepth = 1;
          dropTag = token.tag;
        }
        continue;
      }

      const attrs: Array<readonly [string, string]> = [];
      const seen = new Set<string>();
      for (const [name, rawValue] of token.attrs) {
        if (name.startsWith("on")) continue;
        if (name === "style") continue;
        if (name.includes(":")) continue; // xlink:href, xml:base, ...
        if (name === "href") continue; // ninguna etiqueta permitida lo necesita
        if (!SVG_ATTRS.has(name)) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        const value = decodeEntities(rawValue);
        // Defensa extra: ningun valor legitimo de estos atributos contiene una
        // URL, asi que cualquier "(" seguido de esquema se descarta.
        if (/url\s*\(/i.test(value) || /(javascript|vbscript|data)\s*:/i.test(value)) continue;
        attrs.push([SVG_CASE[name] ?? name, value]);
      }

      const serialized = attrs.map(([k, v]) => ` ${k}="${escapeAttribute(v)}"`).join("");
      if (token.selfClosing || SVG_SELF_CLOSING.has(canonical)) {
        out.push(`<${canonical}${serialized} />`);
      } else {
        out.push(`<${canonical}${serialized}>`);
        stack.push(canonical);
      }
      continue;
    }

    const canonicalClose = SVG_CASE[token.tag] ?? token.tag;
    if (!SVG_TAGS.has(canonicalClose)) continue;
    const idx = stack.lastIndexOf(canonicalClose);
    if (idx === -1) continue;
    for (let d = stack.length - 1; d >= idx; d -= 1) out.push(`</${stack[d] ?? ""}>`);
    stack.length = idx;
  }

  for (let d = stack.length - 1; d >= 0; d -= 1) out.push(`</${stack[d] ?? ""}>`);
  return out.join("");
}

/**
 * Devuelve solo el texto visible de un HTML no confiable.
 * Util para `title`, `aria-label`, tooltips y cualquier sitio donde el marcado
 * no aporta nada y solo anade superficie de ataque.
 */
export function htmlToPlainText(dirty: string): string {
  const tokens = tokenizeHtml(typeof dirty === "string" ? dirty : "");
  const parts: string[] = [];
  let dropDepth = 0;
  let dropTag = "";
  for (const token of tokens) {
    if (dropDepth > 0) {
      if (token.kind === "open" && token.tag === dropTag && !token.selfClosing) dropDepth += 1;
      else if (token.kind === "close" && token.tag === dropTag) dropDepth -= 1;
      continue;
    }
    if (token.kind === "text") {
      parts.push(decodeEntities(token.text));
      continue;
    }
    if (token.kind === "open") {
      if (VOID_CONTENT_TAGS.has(token.tag) && !token.selfClosing) {
        dropDepth = 1;
        dropTag = token.tag;
        continue;
      }
      if (token.tag === "br") parts.push(" ");
    }
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}
