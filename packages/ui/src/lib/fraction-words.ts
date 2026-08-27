/**
 * @cet/ui — nombre hablado de una fraccion.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los trainers Y6A pintan las fracciones como dos <span> apilados. Un lector de
 * pantalla lee eso como "tres cuatro", que para un nino de 10 anos que depende
 * del audio es directamente una respuesta equivocada. Aqui se construye el
 * texto que va en `aria-label`.
 *
 * Regla de degradacion: si el numero no esta en la tabla de nombres, se dice
 * "3 partido por 17" / "3 over 17". Peor que "tres diecisieteavos", pero
 * inequivoco, que es lo que importa en un examen.
 */

import type { Locale } from "@cet/shared";

const CARDINALS: Readonly<Record<Locale, readonly string[]>> = {
  es: [
    "cero",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
  ],
  en: [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ],
};

/** Nombre del denominador en singular y plural, indexado por el denominador. */
const DENOMINATORS: Readonly<Record<Locale, Readonly<Record<number, readonly [string, string]>>>> = {
  es: {
    2: ["medio", "medios"],
    3: ["tercio", "tercios"],
    4: ["cuarto", "cuartos"],
    5: ["quinto", "quintos"],
    6: ["sexto", "sextos"],
    7: ["séptimo", "séptimos"],
    8: ["octavo", "octavos"],
    9: ["noveno", "novenos"],
    10: ["décimo", "décimos"],
    11: ["onceavo", "onceavos"],
    12: ["doceavo", "doceavos"],
    100: ["centésimo", "centésimos"],
    1000: ["milésimo", "milésimos"],
  },
  en: {
    2: ["half", "halves"],
    3: ["third", "thirds"],
    4: ["quarter", "quarters"],
    5: ["fifth", "fifths"],
    6: ["sixth", "sixths"],
    7: ["seventh", "sevenths"],
    8: ["eighth", "eighths"],
    9: ["ninth", "ninths"],
    10: ["tenth", "tenths"],
    11: ["eleventh", "elevenths"],
    12: ["twelfth", "twelfths"],
    100: ["hundredth", "hundredths"],
    1000: ["thousandth", "thousandths"],
  },
};

const OVER: Readonly<Record<Locale, string>> = {
  es: "partido por",
  en: "over",
};

const AND: Readonly<Record<Locale, string>> = {
  es: "y",
  en: "and",
};

const NEGATIVE: Readonly<Record<Locale, string>> = {
  es: "menos",
  en: "minus",
};

function cardinal(value: number, locale: Locale): string {
  const table = CARDINALS[locale];
  const word = Number.isInteger(value) && value >= 0 && value <= 20 ? table[value] : undefined;
  return word ?? String(value);
}

export interface FractionParts {
  readonly numerator: number;
  readonly denominator: number;
  /** Parte entera de un numero mixto: `2 1/5`. */
  readonly whole?: number | undefined;
}

/**
 * Texto accesible de una fraccion.
 *
 * @example
 * fractionToWords({ numerator: 3, denominator: 4 }, "es") // "tres cuartos"
 * fractionToWords({ numerator: 3, denominator: 4 }, "en") // "three quarters"
 * fractionToWords({ numerator: 1, denominator: 2 }, "es") // "un medio"
 * fractionToWords({ whole: 2, numerator: 1, denominator: 5 }, "en") // "two and one fifth"
 * fractionToWords({ numerator: 3, denominator: 17 }, "en") // "three over seventeen"
 */
export function fractionToWords(parts: FractionParts, locale: Locale): string {
  const { numerator, denominator, whole } = parts;

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return `${numerator} ${OVER[locale]} ${denominator}`;
  }

  const negative = numerator < 0 !== denominator < 0 || (whole !== undefined && whole < 0);
  const absNum = Math.abs(numerator);
  const absDen = Math.abs(denominator);
  const absWhole = whole === undefined ? undefined : Math.abs(whole);

  const named = DENOMINATORS[locale][absDen];
  let core: string;

  if (named) {
    const [singular, plural] = named;
    const numWord =
      locale === "es" && absNum === 1 ? "un" : locale === "en" && absNum === 1 ? "one" : cardinal(absNum, locale);
    core = `${numWord} ${absNum === 1 ? singular : plural}`;
  } else {
    core = `${cardinal(absNum, locale)} ${OVER[locale]} ${cardinal(absDen, locale)}`;
  }

  const withWhole =
    absWhole !== undefined && absWhole !== 0
      ? `${cardinal(absWhole, locale)} ${AND[locale]} ${core}`
      : core;

  return negative ? `${NEGATIVE[locale]} ${withWhole}` : withWhole;
}
