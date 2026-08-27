/**
 * @cet/ui — que teclas necesita una respuesta.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ESTE MODULO ES PURO Y NO LLEVA "use client"
 * ===========================================================================
 * Lo llama el componente (cliente) pero tambien lo recorre un invariante que
 * corre en Node contra el registro de generadores. Si viviera dentro de un
 * modulo `"use client"` seria una referencia de cliente en cuanto lo importara
 * algo de servidor — el fallo que ya nos costo la leccion entera (HANDOFF §2.1).
 *
 * ===========================================================================
 * POR QUE @cet/ui NO IMPORTA @cet/engine
 * ===========================================================================
 * El design system no depende del motor (misma razon que `banco-visual`: `fh`
 * esta repetido alli). Asi que `keypadLayoutFor` no recibe un `GeneratedItem`,
 * recibe un `KeypadSpec` estructural: el tipo de clave y el placeholder. Quien
 * tenga el item lo arma en una linea, y el examen —que en modo servidor NO
 * manda la clave al cliente (AD-6)— podra mandar solo `answerType`, que no
 * revela nada: saber que la respuesta es "un numero" ya lo dice el enunciado.
 *
 * ===========================================================================
 * DE DONDE SALE CADA TECLA (tabla verificada generando 800 items por generador)
 * ===========================================================================
 *   answerType "numeric"   -> digitos + separador decimal del IDIOMA
 *                             (math.decimal, math.metric, math.powten,
 *                              math.shape, y la mitad de math.word)
 *   answerType "fraction"  -> digitos + barra + ESPACIO
 *                             (math.simplify, math.fracop, math.mixed, y la
 *                              otra mitad de math.word)
 *   answerType "text"      -> los simbolos que declara el placeholder
 *                             (math.compare, cuyo placeholder es "> < =")
 *   lo demas               -> null: no se teclea, no lleva teclado
 *
 * Dos decisiones que no son obvias:
 *
 *  - LA FRACCION LLEVA ESPACIO SIEMPRE. La tabla del encargo daba espacio solo
 *    a `math.mixed`, pero `math.fracop` produce canonicas mixtas de verdad
 *    ("1 3/10"): sin espacio, un nino que escribe su respuesta en la forma que
 *    el enunciado le acaba de ensenar no puede teclearla. Y el corrector trata
 *    "7/4" y "1 3/4" como LA MISMA respuesta, asi que ofrecerlo nunca sobra.
 *  - LA FRACCION NO LLEVA SEPARADOR DECIMAL. El corrector aceptaria "0,75",
 *    pero la pregunta pide una fraccion y el teclado tiene que ser coherente
 *    con lo que se le pide, no con lo que el parser tolera.
 *
 * NO HAY TECLA DE MENOS. Comprobado: ningun generador registrado produce hoy
 * una respuesta negativa (0 de 7.200 items generados). El dia que alguno la
 * produzca, `teclado-cubre-generadores.test.ts` se pone rojo y hay que anadirla.
 */

import type { I18nText, Locale } from "@cet/shared";
import { UI_STRINGS } from "../lib/strings.js";

/** Que clase de teclado pide una respuesta. */
export type KeypadKind = "number" | "fraction" | "comparison";

export interface KeypadKey {
  /** Estable, para `key` de React y para los mensajes de los tests. */
  readonly id: string;
  /** Lo que se inserta en el campo. Vacio en las teclas de accion. */
  readonly insert: string;
  /** Las teclas que no escriben, sino que hacen algo. */
  readonly action?: "backspace" | undefined;
  /** Lo que se PINTA. Puede diferir de `insert`: el espacio se pinta como "␣". */
  readonly glyph: string;
  /** Nombre accesible. Obligatorio: un boton sin nombre no existe para un lector. */
  readonly label: I18nText;
}

/** Columnas de la rejilla. Tres de digitos mas la columna de teclas de apoyo. */
export const KEYPAD_COLUMNS = 4;

export interface KeypadLayout {
  readonly kind: KeypadKind;
  /**
   * La rejilla completa, en orden de lectura, de `KEYPAD_COLUMNS` en
   * `KEYPAD_COLUMNS`. `null` es un hueco.
   *
   * Es UNA sola rejilla y no "digitos + columna aparte" por dos motivos que se
   * vieron mirando la captura: con dos bloques, la unica tecla de apoyo del
   * teclado numerico se estiraba a lo alto de las cuatro filas (44 x 200 px de
   * "borrar"), y el arriba/abajo del teclado fisico tenia que saber en que
   * bloque estaba. Con una rejilla, cada tecla mide lo mismo y las flechas son
   * aritmetica.
   *
   * El `0` cae SIEMPRE en la misma casilla —centro de la ultima fila, como en un
   * telefono— llegue o no separador decimal a su izquierda.
   */
  readonly cells: readonly (KeypadKey | null)[];
}

/** Lo minimo que hay que saber del item para decidir el teclado. */
export interface KeypadSpec {
  /** `answerKey.type` de @cet/shared, como cadena para no acoplar paquetes. */
  readonly answerType: string;
  /** `body.placeholder`. Es de donde salen los simbolos de `math.compare`. */
  readonly placeholder?: string | undefined;
}

const DIGIT_LABEL = (d: string): I18nText => ({ es: d, en: d });

function digitKey(d: string): KeypadKey {
  return { id: `d${d}`, insert: d, glyph: d, label: DIGIT_LABEL(d) };
}

const BACKSPACE: KeypadKey = {
  id: "backspace",
  insert: "",
  action: "backspace",
  // "⌫" no se lee: el nombre accesible lo pone `label`.
  glyph: "⌫",
  label: UI_STRINGS.keypadBackspace,
};

const SLASH: KeypadKey = { id: "slash", insert: "/", glyph: "/", label: UI_STRINGS.keypadSlash };

/** El espacio se PINTA con un glifo visible: una tecla en blanco parece rota. */
const SPACE: KeypadKey = { id: "space", insert: " ", glyph: "␣", label: UI_STRINGS.keypadSpace };

function decimalKey(locale: Locale): KeypadKey {
  // AD-7: en espanol el decimal es la coma. `nf()` ya lo respeta al MOSTRAR, y
  // el alumno tiene que poder escribir lo que lee.
  return locale === "es"
    ? { id: "decimal", insert: ",", glyph: ",", label: UI_STRINGS.keypadDecimalComma }
    : { id: "decimal", insert: ".", glyph: ".", label: UI_STRINGS.keypadDecimalPoint };
}

/** Nombres de los simbolos que sabemos leer en voz alta. */
const SYMBOL_LABELS: Readonly<Record<string, I18nText>> = {
  ">": UI_STRINGS.keypadGreater,
  "<": UI_STRINGS.keypadLess,
  "=": UI_STRINGS.keypadEqual,
};

/**
 * Un placeholder que declara un juego de simbolos, como el "> < =" de
 * `math.compare`. Exigimos que TODOS los trozos sean simbolos cortos conocidos:
 * si no, devolvemos null y el item se queda sin teclado en pantalla, con el del
 * sistema como red de seguridad. Preferimos eso a fabricar teclas a partir de
 * prosa ("escribe la palabra") que no sirven para contestar.
 */
function symbolKeysFrom(placeholder: string | undefined): KeypadKey[] | null {
  if (placeholder === undefined) return null;
  const tokens = placeholder.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 2) return null;
  const keys: KeypadKey[] = [];
  for (const token of tokens) {
    const label = SYMBOL_LABELS[token];
    if (label === undefined) return null;
    keys.push({ id: `sym-${token}`, insert: token, glyph: token, label });
  }
  return keys;
}

/**
 * Rejilla de cuatro columnas: los diez digitos en el orden de un telefono
 * (1-2-3 arriba, 0 abajo al centro) y las teclas de apoyo en la cuarta columna,
 * de arriba abajo. Borrar va la primera porque es la que mas se usa y la que
 * antes se busca cuando uno se equivoca.
 */
function grid(
  bottomLeft: KeypadKey | null,
  support: readonly KeypadKey[],
): readonly (KeypadKey | null)[] {
  const col4 = (row: number): KeypadKey | null => support[row] ?? null;
  return [
    digitKey("1"), digitKey("2"), digitKey("3"), col4(0),
    digitKey("4"), digitKey("5"), digitKey("6"), col4(1),
    digitKey("7"), digitKey("8"), digitKey("9"), col4(2),
    bottomLeft, digitKey("0"), null, col4(3),
  ];
}

/**
 * El teclado que necesita esta respuesta, o `null` si no se teclea.
 *
 * `null` NO es un fallo silencioso: quien llama deja el teclado del sistema, y
 * el invariante de familia se pone rojo si con eso un generador se queda sin
 * poder escribir su respuesta.
 */
export function keypadLayoutFor(spec: KeypadSpec, locale: Locale): KeypadLayout | null {
  switch (spec.answerType) {
    case "numeric":
      return { kind: "number", cells: grid(decimalKey(locale), [BACKSPACE]) };
    case "fraction":
      return { kind: "fraction", cells: grid(null, [BACKSPACE, SLASH, SPACE]) };
    case "text": {
      const symbols = symbolKeysFrom(spec.placeholder);
      if (symbols === null) return null;
      // Sin digitos la rejilla es una sola fila: tres simbolos y borrar.
      return { kind: "comparison", cells: [...symbols, BACKSPACE] };
    }
    default:
      return null;
  }
}

/** Todas las teclas de la rejilla, sin los huecos. */
export function keypadKeys(layout: KeypadLayout): readonly KeypadKey[] {
  return layout.cells.filter((k): k is KeypadKey => k !== null);
}

/**
 * Los caracteres que este teclado puede producir. Es lo que compara el
 * invariante de familia contra la respuesta que el generador espera.
 */
export function keypadCharacters(layout: KeypadLayout): ReadonlySet<string> {
  const out = new Set<string>();
  for (const key of keypadKeys(layout)) {
    for (const char of key.insert) out.add(char);
  }
  return out;
}
