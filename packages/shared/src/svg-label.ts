/**
 * @cet/shared — etiquetas legibles dentro de una figura SVG.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EXISTE ESTE FICHERO
 * ===========================================================================
 * `obs/obs002.png`: en una pregunta de figuras compuestas, las cotas ("13 m",
 * "7 m", "?") salian ilegibles sobre el dibujo. La causa inmediata era otra —el
 * trazo del poligono se agrandaba x26 y pintaba una banda azul marino de 57 px
 * justo por donde pasan las cotas— pero la causa de fondo es que un `<text>`
 * SVG SIN `fill` hereda el negro del navegador y se apoya en lo que haya
 * debajo. Es decir: la legibilidad era un accidente. Cualquier cambio de
 * relleno, de trazo, de escala o de tema volveria a romperla.
 *
 * La regla que fija este modulo es la contraria y no admite excepciones:
 *
 *   UNA COTA SE PINTA SOBRE SU PROPIA TARJETA OPACA, CON SU PROPIA TINTA.
 *
 * Una placa opaca hace que la etiqueta no dependa de NADA de lo que tiene
 * detras: ni del relleno de la figura, ni del grosor del trazo, ni de si el
 * alumno tiene el tema oscuro. El contraste pasa a ser una propiedad de dos
 * colores que estan aqui escritos, y por lo tanto se puede MEDIR en una prueba
 * (`__tests__/etiquetas-legibles.test.ts`) en vez de mirarse en una captura.
 *
 * ===========================================================================
 * POR QUE EN `@cet/shared` Y NO EN EL GENERADOR
 * ===========================================================================
 * La figura la EMITE `@cet/engine` como cadena y la PINTA `@cet/ui` despues de
 * sanearla. Los dos paquetes dependen de `@cet/shared` y ninguno del otro, asi
 * que este es el unico sitio desde el que se puede imponer una regla que valga
 * en los dos lados. `FIGURE_SVG_ATTRIBUTES` es justamente eso: la lista de
 * atributos que una figura usa, que las DOS allowlists de saneado tienen que
 * dejar pasar. Antes no existia esa lista y las dos listas se desincronizaron
 * en silencio: `vector-effect` estaba permitido en el motor y prohibido en la
 * interfaz, y ese desfase es exactamente lo que se ve en `obs002.png`.
 *
 * ===========================================================================
 * POR QUE LOS COLORES SON HEXADECIMALES Y NO `var(--cet-...)`
 * ===========================================================================
 * La figura se PERSISTE en `rendered_body.figureSvg` y viaja a informes, a PDF
 * y a la vista de intentos del profesor, donde no hay hoja de tokens. Un
 * `var()` que no resuelve deja el `fill` en negro, que es el fallo del que
 * venimos. Un hexadecimal opaco se lee igual en todos esos sitios; los valores
 * son los de `tokens.css` copiados a mano, y la prueba de contraste los vigila.
 */

/* -------------------------------------------------------------------------- */
/* Contraste WCAG                                                             */
/* -------------------------------------------------------------------------- */

function channels(hex: string): readonly [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`no es un color hexadecimal: "${hex}"`);
  const canales = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return [canales[0] as number, canales[1] as number, canales[2] as number];
}

/** Luminancia relativa segun WCAG 2.1, formula literal. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

/**
 * Razon de contraste entre dos colores opacos: de 1 (iguales) a 21 (negro
 * contra blanco). 4.5 es el minimo de texto normal (1.4.3), 7 el de AAA, y 3 el
 * de elementos no textuales (1.4.11).
 *
 * Lanza ante un color que no sepa leer en vez de devolver un numero inventado:
 * un contraste falso que pasa la prueba es peor que no medir nada.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* -------------------------------------------------------------------------- */
/* Paletas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `neutral` es una medida que el alumno LEE; `unknown` es un lado que tiene que
 * DEDUCIR. Se distinguen por color porque la pregunta ("los dos lados marcados
 * ? son los que tienes que averiguar") depende de saber cuales son, y buscarlos
 * por la forma del glifo obliga a leer la figura entera.
 *
 * El color no es la UNICA senal: el texto sigue siendo un "?", que es lo que
 * lee quien no distingue el ambar del blanco. 1.4.1 se cumple sin depender de
 * la paleta.
 */
export type LabelTone = "neutral" | "unknown";

export interface LabelPalette {
  /** Color del texto. Opaco. */
  readonly ink: string;
  /** Fondo de la tarjeta. Opaco: es lo que independiza la cota del dibujo. */
  readonly plate: string;
  /** Filo de la tarjeta. Separa la placa del relleno claro de la figura. */
  readonly border: string;
}

export const LABEL_PALETTES: Readonly<Record<LabelTone, LabelPalette>> = {
  // --cet-surface / --cet-ink / --cet-line del tema claro. 15.3:1.
  neutral: { ink: "#12202f", plate: "#ffffff", border: "#c8d4e2" },
  // El ambar de "atencion" del sistema, oscurecido hasta que el par pasa AAA:
  // el `?` tiene que cantar, pero un ambar claro con tinta clara no se lee.
  unknown: { ink: "#5a3a00", plate: "#fff3d6", border: "#d9a441" },
};

/* -------------------------------------------------------------------------- */
/* La etiqueta                                                                */
/* -------------------------------------------------------------------------- */

/** Tamano de letra por defecto. 13 px es lo que ya usaban las figuras de leccion. */
const FONT_SIZE = 13;
/** Aire entre el texto y el filo de la tarjeta. */
const PAD_X = 5;
const PAD_Y = 3;
/**
 * Ancho medio de un glifo como fraccion del tamano de letra.
 *
 * No se mide la fuente: en el servidor no hay fuente que medir, y la cadena
 * viaja al cliente ya escrita. 0,62 es holgado para digitos, espacios y las
 * dos o tres letras de una unidad ("cm", "mm", "m"), que es TODO lo que cabe en
 * una cota. Pasarse de ancho solo tapa un poco mas de dibujo; quedarse corto
 * deja letras fuera de la tarjeta, asi que el error se elige hacia arriba.
 */
const GLYPH_RATIO = 0.62;

/**
 * Pila de fuentes sin `var()` ni descargas: la figura tiene que verse igual en
 * el navegador del alumno y en un PDF generado en el servidor.
 */
const FONT_FAMILY = "system-ui, sans-serif";

export type LabelAnchor = "start" | "middle" | "end";

export interface SvgLabelOptions {
  /** Punto de anclaje en coordenadas del SVG (ya escaladas, no del modelo). */
  readonly x: number;
  readonly y: number;
  /** Texto plano. Se escapa aqui: nunca se acepta marcado. */
  readonly text: string;
  readonly anchor?: LabelAnchor;
  readonly tone?: LabelTone;
  readonly fontSize?: number;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Redondea a dos decimales para que la cadena persistida no engorde. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Ancho que ocupa la tarjeta de una etiqueta, sin llegar a emitirla. */
export function svgLabelWidth(text: string, fontSize: number = FONT_SIZE): number {
  return text.length * fontSize * GLYPH_RATIO + 2 * PAD_X;
}

/** Alto que ocupa la tarjeta de una etiqueta. */
export function svgLabelHeight(fontSize: number = FONT_SIZE): number {
  return fontSize + 2 * PAD_Y;
}

/**
 * Una cota con su tarjeta: `<g><rect/><text/></g>`.
 *
 * El `rect` va PRIMERO y es opaco, asi que tapa el dibujo que hubiera debajo;
 * el `text` va encima con su tinta. Ese orden es la garantia de legibilidad, y
 * la prueba lo comprueba explicitamente.
 *
 * El punto `(x, y)` es el CENTRO VERTICAL de la etiqueta, no la linea base:
 * situar una cota respecto del lado que mide es un problema de centros, y con
 * la linea base habia que compensar a ojo en cada llamada.
 */
export function svgLabel(options: SvgLabelOptions): string {
  const { x, y, text, anchor = "middle", tone = "neutral", fontSize = FONT_SIZE } = options;
  const palette = LABEL_PALETTES[tone];

  const width = svgLabelWidth(text, fontSize);
  const height = svgLabelHeight(fontSize);
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const top = y - height / 2;

  return (
    `<g>` +
    `<rect x="${r2(left)}" y="${r2(top)}" width="${r2(width)}" height="${r2(height)}" ` +
    `rx="${r2(height / 3)}" ry="${r2(height / 3)}" ` +
    `fill="${palette.plate}" stroke="${palette.border}" stroke-width="1"/>` +
    `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" dominant-baseline="central" ` +
    `font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="600" ` +
    `fill="${palette.ink}">${escapeText(text)}</text>` +
    `</g>`
  );
}

/* -------------------------------------------------------------------------- */
/* El contrato con los dos sanitizadores                                      */
/* -------------------------------------------------------------------------- */

/**
 * Atributos que una figura generada usa de verdad.
 *
 * Las dos allowlists del proyecto —`@cet/engine/sanitize` (al emitir) y
 * `@cet/ui/lib/sanitize` (al pintar)— tienen que contenerlos TODOS. Cada
 * paquete tiene una prueba que lo comprueba contra esta lista, de modo que
 * quitar un atributo de una lista rompe la construccion en vez de romper la
 * figura en la pantalla del alumno, que es como nos enteramos la vez anterior.
 *
 * Deliberadamente NO incluye `vector-effect`: la figura ya no depende de el
 * (ver `math/shape.ts`, que divide el grosor por la escala). Un atributo del
 * que depende el dibujo y que un sanitizador puede quitar es una bomba de
 * relojeria, aunque hoy este permitido en los dos sitios.
 */
export const FIGURE_SVG_ATTRIBUTES: readonly string[] = [
  "viewBox",
  "width",
  "height",
  "role",
  "aria-hidden",
  "transform",
  "points",
  "d",
  "x",
  "y",
  "rx",
  "ry",
  "fill",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "text-anchor",
  "dominant-baseline",
  "font-family",
  "font-size",
  "font-weight",
];
