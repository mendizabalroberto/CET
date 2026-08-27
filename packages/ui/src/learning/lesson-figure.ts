/**
 * @cet/ui — figuras pedagogicas de leccion: DATOS, no dibujo.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ESTE FICHERO NO LLEVA `"use client"`
 * ===========================================================================
 * `apps/web/src/components/learn/block-mapping.ts` corre en el SERVIDOR y
 * necesita `parseLessonFigure` para decidir si un bloque `interactive` es
 * renderizable. Un modulo con `"use client"` no exporta funciones al servidor:
 * exporta referencias, y llamarlas lanza en produccion. Eso es exactamente lo
 * que tumbaba la pagina de leccion (`isRenderableBlockKind` vivia en
 * `LessonBlock.tsx`). Aqui viven el dato y las funciones puras; el dibujo vive
 * en `LessonFigure.tsx`, que si es cliente. `lib/rsc-boundary.test.ts` vigila
 * que la frontera no se vuelva a cruzar.
 *
 * ===========================================================================
 * POR QUE UNA FIGURA ES `{ component, props }` Y NO UN SVG GUARDADO
 * ===========================================================================
 * El contrato de `lesson_blocks.content` para `kind = 'interactive'` ya es
 * `{ component: string, props?: object }` — lo impone el trigger de
 * `0006_content.sql`. Hasta hoy `block-mapping` leia `component`, no lo usaba
 * para nada, y exigia un `props.svg` con el dibujo entero escrito a mano. Es
 * decir: el discriminador que la base de datos obliga a escribir estaba muerto.
 *
 * Guardar el SVG tiene tres problemas que guardar los NUMEROS no tiene:
 *
 *   1. Pesa. El destino es una tableta de colegio compartida con conexion mala;
 *      `{ bars: [[5,9],[2,3]] }` son 30 bytes y el dibujo lo genera el cliente.
 *   2. No se puede decir en voz alta. De un SVG guardado no se deduce el texto
 *      alternativo, asi que hay que escribirlo aparte y se desincroniza. De los
 *      numeros SI: `figureAltText` es la MISMA figura dicha con palabras, y no
 *      puede mentir porque sale de la misma fuente que el dibujo.
 *   3. No se puede traducir ni reaccionar al idioma. "5 partes pintadas" y
 *      "5 shaded parts" salen del mismo dato.
 *
 * Y hay un cuarto motivo, de seguridad: una figura de numeros nunca es una
 * cadena de marcado, asi que NO pasa por `sanitizeSvg` ni necesita ampliar su
 * allowlist. Lo que no es texto no puede llevar un `<script>` dentro.
 *
 * ===========================================================================
 * QUE FIGURAS HAY Y POR QUE ESTAS
 * ===========================================================================
 * Salen de `Y6A/Math/Grade 5 Maths Exam Trainer.html`, que es como el colegio
 * explica de verdad estos temas. De sus ocho temas, estas tres figuras cubren
 * cinco, y cada una ataca un error que el propio material marca con `.warn`:
 *
 *   - `fraction-bars`      «un denominador mayor NO significa una fraccion
 *                          mayor: mas trozos son trozos mas pequenos». Es un
 *                          hecho de TAMANO y el texto no lo ensena; dos barras
 *                          del mismo largo, si.
 *                          (temas 1, 2 y 3: comparar, operar, mixtos)
 *   - `place-value-shift`  «no se mueve la coma: se mueven los digitos». Es un
 *                          hecho de POSICION. Decirlo con palabras es
 *                          justamente lo que no funciona.  (temas 4 y 5)
 *   - `unit-chain`         la escalera metrica que Y6A ya dibuja con flechas
 *                          `× 1.000 →` / `← ÷ 1.000`. El mnemotecnico ES
 *                          espacial: hacia la unidad pequena se multiplica.
 *                          (tema 6)
 */

import { resolveI18n, type I18nText, type Locale } from "@cet/shared";
import { fractionToWords } from "../lib/fraction-words.js";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

/** Una barra: `numerator` partes pintadas de `denominator` partes iguales. */
export interface FractionBar {
  readonly numerator: number;
  readonly denominator: number;
}

/** Los tres factores que Y6A trabaja al mover digitos. */
export type ShiftFactor = 10 | 100 | 1000;

/** Las tres magnitudes con escalera metrica en el temario. */
export type ChainQuantity = "length" | "mass" | "capacity";

export type LessonFigure =
  /** Barras del MISMO largo divididas en partes distintas. Compara tamanos. */
  | { readonly component: "fraction-bars"; readonly bars: readonly FractionBar[] }
  /** Tabla de valor posicional con los digitos moviendose de columna. */
  | {
      readonly component: "place-value-shift";
      /** Valor de partida en notacion canonica con punto: "4.7", "0.086". */
      readonly value: string;
      readonly factor: ShiftFactor;
      readonly direction: "multiply" | "divide";
    }
  /** Escalera de unidades con el factor de cada peldano. */
  | {
      readonly component: "unit-chain";
      readonly quantity: ChainQuantity;
      /** Peldano resaltado, si la figura ilustra una conversion concreta. */
      readonly from?: string;
      readonly to?: string;
    };

/** Nombre de `content.component` en la base de datos -> figura. */
export const LESSON_FIGURE_COMPONENTS: readonly string[] = [
  "fraction-bars",
  "place-value-shift",
  "unit-chain",
];

/* -------------------------------------------------------------------------- */
/* Escaleras metricas — copiadas de Y6A, no inventadas                        */
/* -------------------------------------------------------------------------- */

export interface ChainStep {
  readonly from: string;
  readonly to: string;
  /**
   * EXPONENTE, no factor: ir de `from` (grande) a `to` (pequena) multiplica por
   * `10 ** exponent`.
   *
   * Se guarda asi porque el motor ya aprendio esta leccion. La cabecera de
   * `packages/engine/src/generators/math/metric.ts` la deja escrita: guardar el
   * factor en coma flotante hacia que `0,75 kg -> g` saliera `749.9999999999999`.
   * Encadenar varios peldanos multiplicando `double` es la misma trampa un paso
   * mas alla; sumar exponentes enteros no puede perder precision.
   */
  readonly exponent: number;
}

/** El factor de un peldano: `10 ** exponent`, exacto para todo el temario. */
export function stepFactor(step: ChainStep): number {
  return 10 ** step.exponent;
}

/**
 * Y6A remata el tema con: «solo la LONGITUD usa 10 y 100. Masa y capacidad son
 * siempre 1.000 — eso solo vale varios puntos». Por eso la escalera se guarda
 * con su factor por peldano y no con un 1.000 uniforme: la irregularidad de la
 * longitud es parte de lo que hay que ver.
 */
const CHAINS: Readonly<Record<ChainQuantity, readonly ChainStep[]>> = {
  length: [
    { from: "km", to: "m", exponent: 3 },
    { from: "m", to: "cm", exponent: 2 },
    { from: "cm", to: "mm", exponent: 1 },
  ],
  mass: [
    { from: "t", to: "kg", exponent: 3 },
    { from: "kg", to: "g", exponent: 3 },
    { from: "g", to: "mg", exponent: 3 },
  ],
  capacity: [
    { from: "kL", to: "L", exponent: 3 },
    { from: "L", to: "mL", exponent: 3 },
  ],
};

/** Las unidades de una magnitud, de la mas grande a la mas pequena. */
export function chainUnits(quantity: ChainQuantity): readonly string[] {
  const pasos = CHAINS[quantity];
  const primero = pasos[0];
  if (primero === undefined) return [];
  return [primero.from, ...pasos.map((p) => p.to)];
}

/** Los peldanos de una magnitud, con su factor. */
export function chainSteps(quantity: ChainQuantity): readonly ChainStep[] {
  return CHAINS[quantity];
}

/* -------------------------------------------------------------------------- */
/* Parseo defensivo de `content.props`                                        */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Entero dentro de un rango. Un jsonb puede traer cualquier cosa. */
function readInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function parseFractionBars(props: Record<string, unknown>): LessonFigure | null {
  if (!Array.isArray(props.bars)) return null;

  const bars: FractionBar[] = [];
  for (const raw of props.bars) {
    if (!isRecord(raw)) return null;
    // El denominador tiene tope 20: mas alla de 20 trozos un nino de once anos
    // no cuenta la barra de un vistazo, que es todo el proposito de la figura.
    const denominator = readInt(raw.denominator, 1, 20);
    const numerator = readInt(raw.numerator, 0, 20);
    if (denominator === null || numerator === null) return null;
    // Una barra representa una fraccion de UNA unidad. Con 5/3 el dibujo se
    // saldria de la barra y mentiria; el bloque se descarta en vez de mentir.
    if (numerator > denominator) return null;
    bars.push({ numerator, denominator });
  }

  // Una barra sola no compara nada, y comparar es para lo que sirve la figura.
  // Cuatro ya no caben legibles en la pantalla de una tableta en vertical.
  if (bars.length < 2 || bars.length > 4) return null;
  return { component: "fraction-bars", bars };
}

/**
 * Digitos con un punto decimal opcional. Nunca notacion cientifica ni signo.
 *
 * La parte entera es `0` o empieza por un digito distinto de cero: "007.5" se
 * pintaba tal cual en la tabla, y en una leccion de VALOR POSICIONAL un cero de
 * relleno a la izquierda ensena justo lo contrario de lo que se pretende.
 */
const VALOR_DECIMAL = /^(0|[1-9]\d{0,6})(\.\d{1,6})?$/;

/**
 * Columnas que la tabla de nombres sabe decir en voz alta, de millones a
 * millonesimas. Fuera de este rango `placeName` degradaria a "10^7", que un
 * lector de pantalla dice "diez circunflejo siete".
 */
const EXP_MIN = -6;
const EXP_MAX = 6;

function parsePlaceValueShift(props: Record<string, unknown>): LessonFigure | null {
  const value = typeof props.value === "string" ? props.value.trim() : "";
  if (!VALOR_DECIMAL.test(value)) return null;

  const factor = props.factor;
  if (factor !== 10 && factor !== 100 && factor !== 1000) return null;

  const direction = props.direction;
  if (direction !== "multiply" && direction !== "divide") return null;

  const figura = { component: "place-value-shift", value, factor, direction } as const;

  // Un valor sin ningun digito significativo no ensena nada —"0 x 10" producia
  // ademas una frase que se quedaba a medias, "los digitos se mueven 1 lugar a
  // la izquierda: ."— asi que el bloque se descarta.
  const digitos = placeDigits(value).filter((d) => d.digit !== "0");
  if (digitos.length === 0) return null;

  // Fail-closed: si alguna columna, antes o despues de mover, se saliera de la
  // tabla de nombres, la figura no se podria decir en voz alta. Preferimos una
  // leccion SIN figura a una figura que deja fuera al nino que usa lector.
  const salto = shiftPlaces(figura);
  const exps = [...placeDigits(value), ...shiftedDigits(figura)].map((d) => d.exp);
  const extremos = [...exps, ...digitos.map((d) => d.exp + salto)];
  if (extremos.some((e) => e < EXP_MIN || e > EXP_MAX)) return null;

  return figura;
}

function parseUnitChain(props: Record<string, unknown>): LessonFigure | null {
  const quantity = props.quantity;
  if (quantity !== "length" && quantity !== "mass" && quantity !== "capacity") return null;

  const unidades = chainUnits(quantity);
  const from = typeof props.from === "string" ? props.from : undefined;
  const to = typeof props.to === "string" ? props.to : undefined;

  // O se resalta una conversion entera, o ninguna. Media conversion resaltada
  // seria una flecha que no lleva a ningun sitio.
  if (from === undefined && to === undefined) return { component: "unit-chain", quantity };
  if (from === undefined || to === undefined) return null;
  if (!unidades.includes(from) || !unidades.includes(to) || from === to) return null;

  return { component: "unit-chain", quantity, from, to };
}

/**
 * `content.component` + `content.props` -> figura, o `null` si no encaja.
 *
 * Devuelve `null` y no lanza: un bloque que no se entiende se omite de la
 * leccion, que es peor que pintarlo pero muchisimo mejor que reventar la
 * pagina entera del alumno por un dato mal escrito en el panel de autoria.
 */
export function parseLessonFigure(component: string, props: unknown): LessonFigure | null {
  if (!isRecord(props)) return null;

  switch (component) {
    case "fraction-bars":
      return parseFractionBars(props);
    case "place-value-shift":
      return parsePlaceValueShift(props);
    case "unit-chain":
      return parseUnitChain(props);
    default:
      return null;
  }
}


/* -------------------------------------------------------------------------- */
/* La figura dicha con palabras                                               */
/* -------------------------------------------------------------------------- */

/**
 * Todo texto que oye el alumno se escribe como `{ es, en }` literal y no como
 * argumentos posicionales de un ayudante. No es estilo: `ortografia-es.test.ts`
 * reconoce el espanol por la clave `es:` en el codigo fuente, asi que un
 * literal posicional se le escaparia y estas cadenas volverian a poder
 * escribirse sin tildes, que es el fallo que ese invariante cierra.
 */
const say = (text: I18nText, locale: Locale): string => resolveI18n(text, locale);

/**
 * Compara dos fracciones SIN dividir: `a/b` contra `c/d` es `a*d` contra `c*b`.
 *
 * Es el «truco rapido» que Y6A ensena para comparar, y aqui ademas evita el
 * problema de la version anterior: comparar cocientes en coma flotante con una
 * tolerancia. Con numeradores y denominadores <= 20 los productos son enteros
 * exactos, asi que «1/3 y 2/6 valen lo mismo» es una igualdad, no un epsilon.
 */
function comparaBarras(a: FractionBar, b: FractionBar): number {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}

/** Enumera «1», «1 y 2», «1, 2 y 3» — como se leen en voz alta. */
function listaDeBarras(indices: readonly number[], locale: Locale): string {
  const nombres = indices.map((i) => String(i + 1));
  if (nombres.length <= 1) return nombres.join("");
  const ultimo = nombres[nombres.length - 1] as string;
  return `${nombres.slice(0, -1).join(", ")} ${say({ es: "y", en: "and" }, locale)} ${ultimo}`;
}

function altFractionBars(bars: readonly FractionBar[], locale: Locale): string {
  const partes = bars.map((bar, i) => {
    const nombre = fractionToWords(
      { numerator: bar.numerator, denominator: bar.denominator },
      locale,
    );
    // La concordancia importa porque esto se OYE: «1 pintadas» en la barra mas
    // comun de todas —la mitad— suena a error de quien escribio la leccion, y
    // `ortografia-es.test.ts` no mira concordancia, solo tildes.
    const trozos: I18nText = {
      es: `${bar.denominator} ${bar.denominator === 1 ? "parte igual" : "partes iguales"}`,
      en: `${bar.denominator} equal ${bar.denominator === 1 ? "part" : "parts"}`,
    };
    const pintadas: I18nText = {
      es: `${bar.numerator} ${bar.numerator === 1 ? "pintada" : "pintadas"}`,
      en: `${bar.numerator} shaded`,
    };
    return say(
      {
        es: `Barra ${i + 1}: ${say(trozos, "es")}, ${say(pintadas, "es")}, ${nombre}.`,
        en: `Bar ${i + 1}: ${say(trozos, "en")}, ${say(pintadas, "en")}, ${nombre}.`,
      },
      locale,
    );
  });

  // La comparacion es LA pregunta que contesta el dibujo. Si el texto
  // alternativo no la contesta, quien oye la figura no recibe lo mismo que
  // quien la ve: la figura no seria accesible, solo estaria descrita.
  //
  // El empate PARCIAL es el caso que hay que tratar aparte, y es el importante:
  // con `[1/2, 2/4, 1/4]` —fracciones equivalentes, el ejemplo canonico de
  // Y6A— la version anterior exigia que empataran TODAS; como la tercera era
  // menor, no empataban, y anunciaba «la barra 1 es la que esta mas pintada».
  // El nino que VE el dibujo ve dos barras iguales; el que lo OYE oia lo
  // contrario del hecho que la figura existe para ensenar.
  const maximo = bars.reduce(
    (mejor, bar) => (comparaBarras(bar, mejor) > 0 ? bar : mejor),
    bars[0] as FractionBar,
  );
  const lideres = bars
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => comparaBarras(b, maximo) === 0);
  const primero = lideres[0] as { readonly i: number };

  const veredicto: I18nText =
    lideres.length === bars.length
      ? {
          es: "Todas las barras están pintadas por igual: son fracciones equivalentes.",
          en: "All the bars are shaded the same amount: they are equivalent fractions.",
        }
      : lideres.length > 1
        ? {
            es:
              `Las barras ${listaDeBarras(
                lideres.map((l) => l.i),
                "es",
              )} están pintadas por igual, y son las que más: son fracciones equivalentes.`,
            en:
              `Bars ${listaDeBarras(
                lideres.map((l) => l.i),
                "en",
              )} are shaded the same amount, and they are the most shaded: they are equivalent fractions.`,
          }
        : {
            es: `La barra ${primero.i + 1} es la que está más pintada.`,
            en: `Bar ${primero.i + 1} is the one shaded the most.`,
          };

  return [
    say(
      { es: "Barras de fracción del mismo largo.", en: "Fraction bars, all the same length." },
      locale,
    ),
    ...partes,
    say(veredicto, locale),
  ].join(" ");
}

/**
 * Nombre hablado de la columna `10^exp`, de millones a millonesimas.
 *
 * Cubre TODO el rango que `parseLessonFigure` deja pasar, y el parseo rechaza
 * lo que se saliera: las dos defensas juntas hacen imposible que un nino oiga
 * "diez circunflejo cuatro" en mitad de una leccion. La rama de degradacion de
 * `placeName` sobrevive como red, pero ya no deberia alcanzarla nadie.
 */
const PLACES: Readonly<Record<number, I18nText>> = {
  6: { es: "millones", en: "millions" },
  5: { es: "centenas de millar", en: "hundred thousands" },
  4: { es: "decenas de millar", en: "ten thousands" },
  3: { es: "millares", en: "thousands" },
  2: { es: "centenas", en: "hundreds" },
  1: { es: "decenas", en: "tens" },
  0: { es: "unidades", en: "units" },
  [-1]: { es: "décimas", en: "tenths" },
  [-2]: { es: "centésimas", en: "hundredths" },
  [-3]: { es: "milésimas", en: "thousandths" },
  [-4]: { es: "diezmilésimas", en: "ten thousandths" },
  [-5]: { es: "cienmilésimas", en: "hundred thousandths" },
  [-6]: { es: "millonésimas", en: "millionths" },
};

/** Nombre de la columna, o su potencia si se sale de la tabla. */
export function placeName(exp: number, locale: Locale): string {
  const nombre = PLACES[exp];
  return nombre === undefined ? `10^${exp}` : say(nombre, locale);
}

/** Un digito colocado en su columna: `4` en `10^0` son cuatro unidades. */
export interface PlacedDigit {
  readonly digit: string;
  /** Exponente de la columna. `0` unidades, `-1` decimas, `1` decenas. */
  readonly exp: number;
}

/**
 * Descompone "4.7" en sus digitos con la columna que ocupa cada uno.
 *
 * Se hace con CADENAS y no con aritmetica de coma flotante a proposito:
 * `0.086 * 1000` da `86.00000000000001` en IEEE-754, y un digito de mas en una
 * tabla de valor posicional destruye justo lo que la figura ensena.
 */
export function placeDigits(value: string): readonly PlacedDigit[] {
  const [entera = "", decimal = ""] = value.split(".");
  const out: PlacedDigit[] = [];
  for (let i = 0; i < entera.length; i += 1) {
    out.push({ digit: entera[i] as string, exp: entera.length - 1 - i });
  }
  for (let i = 0; i < decimal.length; i += 1) {
    out.push({ digit: decimal[i] as string, exp: -(i + 1) });
  }
  return out;
}

/** Cuantas columnas se mueven los digitos, con signo: + hacia la izquierda. */
export function shiftPlaces(
  figure: Extract<LessonFigure, { component: "place-value-shift" }>,
): number {
  const places = Math.log10(figure.factor);
  return figure.direction === "multiply" ? places : -places;
}

/** Los digitos ya movidos, mas los ceros de relleno que hagan falta. */
export function shiftedDigits(
  figure: Extract<LessonFigure, { component: "place-value-shift" }>,
): readonly PlacedDigit[] {
  const desplazamiento = shiftPlaces(figure);
  const movidos = placeDigits(figure.value).map((d) => ({
    digit: d.digit,
    exp: d.exp + desplazamiento,
  }));

  // «No pierdas ese cero» es un `.warn` literal de Y6A: 48,24 / 8 = 6,03, no
  // 6,3. Al mover los digitos aparecen huecos, y hay que rellenarlos con ceros
  // de posicion o el numero escrito seria otro. Las columnas van siempre desde
  // la mas alta ocupada hasta la mas baja, pasando por las unidades: sin ese
  // `Math.max(0, ...)` un 0,093 se escribiria ",093".
  // Solo los digitos SIGNIFICATIVOS fijan hasta donde llegan las columnas. Con
  // todos, `0,086 x 1.000` salia "0086": los dos ceros de la izquierda viajaban
  // a millares y centenas y se escribian. Un cero a la izquierda del primer
  // digito significativo no es un cero de posicion, es ruido; el de la derecha
  // de la coma tampoco (`40 : 10` es 4, no "4,0"). Los ceros que SI hacen falta
  // —los de `9,3 : 100 = 0,093`— quedan dentro del rango y se rellenan abajo.
  const exps = movidos.filter((d) => d.digit !== "0").map((d) => d.exp);
  const alto = Math.max(0, ...exps);
  const bajo = Math.min(0, ...exps);
  const porExp = new Map(movidos.map((d) => [d.exp, d.digit]));
  const out: PlacedDigit[] = [];
  for (let exp = alto; exp >= bajo; exp -= 1) {
    out.push({ digit: porExp.get(exp) ?? "0", exp });
  }
  return out;
}

/** Los digitos colocados, escritos como numero en el idioma pedido. */
export function formatPlaced(digits: readonly PlacedDigit[], locale: Locale): string {
  const enteros = digits.filter((d) => d.exp >= 0);
  const decimales = digits.filter((d) => d.exp < 0);
  const entera = enteros.length === 0 ? "0" : enteros.map((d) => d.digit).join("");
  if (decimales.length === 0) return entera;
  // El separador decimal en espanol es la coma. El alumno tiene que ver escrito
  // lo mismo que ve en el resto de la aplicacion, no lo que el parser tolera.
  return `${entera}${locale === "es" ? "," : "."}${decimales.map((d) => d.digit).join("")}`;
}

function altPlaceValueShift(
  figure: Extract<LessonFigure, { component: "place-value-shift" }>,
  locale: Locale,
): string {
  const desplazamiento = shiftPlaces(figure);
  const lugares = Math.abs(desplazamiento);
  const origen = placeDigits(figure.value);
  const destino = shiftedDigits(figure);

  const operacion: I18nText =
    figure.direction === "multiply"
      ? {
          es: `${formatPlaced(origen, "es")} multiplicado por ${figure.factor}.`,
          en: `${formatPlaced(origen, "en")} multiplied by ${figure.factor}.`,
        }
      : {
          es: `${formatPlaced(origen, "es")} dividido entre ${figure.factor}.`,
          en: `${formatPlaced(origen, "en")} divided by ${figure.factor}.`,
        };

  // Se dice digito a digito de donde a donde va cada uno: eso es lo que se ve
  // en el dibujo, y es la parte que el texto de la leccion no consigue explicar.
  const viajes = (esLocale: Locale): string =>
    origen
      .filter((d) => d.digit !== "0")
      .map((d) =>
        say(
          {
            es: `el ${d.digit} pasa de ${placeName(d.exp, "es")} a ${placeName(d.exp + desplazamiento, "es")}`,
            en: `the ${d.digit} moves from ${placeName(d.exp, "en")} to ${placeName(d.exp + desplazamiento, "en")}`,
          },
          esLocale,
        ),
      )
      .join(", ");

  const movimiento: I18nText = {
    es: `Los dígitos se mueven ${lugares} ${lugares === 1 ? "lugar" : "lugares"} a la ${
      desplazamiento > 0 ? "izquierda" : "derecha"
    }: ${viajes("es")}.`,
    en: `The digits move ${lugares} ${lugares === 1 ? "place" : "places"} to the ${
      desplazamiento > 0 ? "left" : "right"
    }: ${viajes("en")}.`,
  };

  return [
    say({ es: "Tabla de valor posicional.", en: "Place value chart." }, locale),
    say(operacion, locale),
    say(movimiento, locale),
    say({ es: "La coma no se mueve.", en: "The decimal point does not move." }, locale),
    say(
      {
        es: `Resultado: ${formatPlaced(destino, "es")}.`,
        en: `Result: ${formatPlaced(destino, "en")}.`,
      },
      locale,
    ),
  ].join(" ");
}

const QUANTITY_NAME: Readonly<Record<ChainQuantity, I18nText>> = {
  length: { es: "longitud", en: "length" },
  mass: { es: "masa", en: "mass" },
  capacity: { es: "capacidad", en: "capacity" },
};

/** Factor acumulado al ir de `from` a `to`, y si toca multiplicar o dividir. */
export function chainConversion(
  quantity: ChainQuantity,
  from: string,
  to: string,
): { readonly factor: number; readonly direction: "multiply" | "divide" } | null {
  const unidades = chainUnits(quantity);
  const i = unidades.indexOf(from);
  const j = unidades.indexOf(to);
  if (i < 0 || j < 0 || i === j) return null;

  const pasos = chainSteps(quantity);
  const desde = Math.min(i, j);
  const hasta = Math.max(i, j);
  // Se SUMAN exponentes enteros y se eleva una sola vez. Encadenar productos en
  // coma flotante es lo que el motor ya tuvo que corregir en `metric.ts`.
  let exponente = 0;
  for (let k = desde; k < hasta; k += 1) exponente += (pasos[k] as ChainStep).exponent;
  // Bajar en la escalera es ir a la unidad mas pequena, y entonces se multiplica.
  return { factor: 10 ** exponente, direction: j > i ? "multiply" : "divide" };
}

function altUnitChain(
  figure: Extract<LessonFigure, { component: "unit-chain" }>,
  locale: Locale,
): string {
  const unidades = chainUnits(figure.quantity);
  const pasos = chainSteps(figure.quantity);

  const escalera = (donde: Locale): string =>
    pasos
      .map((p) =>
        say(
          {
            es: `de ${p.from} a ${p.to} se multiplica por ${stepFactor(p)}, y al revés se divide entre ${stepFactor(p)}`,
            en: `from ${p.from} to ${p.to} multiply by ${stepFactor(p)}, and back again divide by ${stepFactor(p)}`,
          },
          donde,
        ),
      )
      .join("; ");

  const partes = [
    say(
      {
        es: `Escalera de unidades de ${say(QUANTITY_NAME[figure.quantity], "es")}: ${unidades.join(", ")}.`,
        en: `Unit ladder for ${say(QUANTITY_NAME[figure.quantity], "en")}: ${unidades.join(", ")}.`,
      },
      locale,
    ),
    say({ es: `${escalera("es")}.`, en: `${escalera("en")}.` }, locale),
  ];

  if (figure.from !== undefined && figure.to !== undefined) {
    const conv = chainConversion(figure.quantity, figure.from, figure.to);
    if (conv !== null) {
      partes.push(
        say(
          conv.direction === "multiply"
            ? {
                es: `Camino resaltado: de ${figure.from} a ${figure.to} se multiplica por ${conv.factor}.`,
                en: `Highlighted path: from ${figure.from} to ${figure.to} multiply by ${conv.factor}.`,
              }
            : {
                es: `Camino resaltado: de ${figure.from} a ${figure.to} se divide entre ${conv.factor}.`,
                en: `Highlighted path: from ${figure.from} to ${figure.to} divide by ${conv.factor}.`,
              },
          locale,
        ),
      );
    }
  }

  return partes.join(" ");
}

/**
 * La figura dicha con palabras: lo que oye quien no puede verla.
 *
 * No es una descripcion del dibujo ("un grafico de barras"): es el MISMO
 * contenido por otra via, incluida la conclusion a la que el dibujo lleva. Un
 * dibujo que explica algo y no se puede oir no explica nada a ese nino.
 */
export function figureAltText(figure: LessonFigure, locale: Locale): string {
  switch (figure.component) {
    case "fraction-bars":
      return altFractionBars(figure.bars, locale);
    case "place-value-shift":
      return altPlaceValueShift(figure, locale);
    case "unit-chain":
      return altUnitChain(figure, locale);
    default: {
      const exhaustive: never = figure;
      return exhaustive;
    }
  }
}
