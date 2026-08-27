/**
 * math.word — GEN.word de Y6A. Seis plantillas de problema con enunciado.
 *
 * Cambios respecto del original:
 *   - `M=pick(NAMES.filter(...))` se eliminaba sin usarse nunca; fuera.
 *   - Las fracciones de la plantilla 1 son propias (Y6A permitia 5/2 kg de harina
 *     "de una receta", que no tiene sentido en el contexto del problema).
 *   - Todas las cantidades decimales son enteros escalados: cero fuzz, y la
 *     division en gramos se comprueba exacta (scaledDivInt lanza si no lo es).
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { AnswerKey, Locale, QuestionGenerator, RenderedBody, Seed } from "@cet/shared";
import { createRng, type Rng } from "../../rng.js";
import { fadd, fmul, frac, fstr, mixStr } from "../../fraction.js";
import {
  nf,
  nfScaled,
  scaled,
  scaledDivInt,
  scaledMul,
  scaledShift,
  scaledValue,
  fh,
  mixh,
  type ScaledDecimal,
} from "../../format.js";
import { baseParams, buildItem, NAMES, resolveLocale, pickLocale, type Bilingual } from "../common.js";

export const WORD_TEMPLATE_COUNT = 6;

export const wordParams = baseParams.extend({
  /** 1..6, o se sortea. Las plantillas son las mismas de Y6A, en el mismo orden. */
  template: z.number().int().min(1).max(WORD_TEMPLATE_COUNT).optional(),
});
export type WordParams = z.infer<typeof wordParams>;

interface Built {
  readonly body: RenderedBody;
  readonly answerKey: AnswerKey;
  readonly hint: Bilingual;
  readonly solution: Bilingual;
  readonly difficulty: number;
}

function properFrac(rng: Rng, denominators: readonly number[]): { n: number; d: number } {
  const d = rng.pick(denominators);
  return { n: rng.int(1, d - 1), d };
}

function template1(rng: Rng, loc: Locale, name: string): Built {
  const a = properFrac(rng, [2, 3, 4, 5, 6, 8]);
  const b = properFrac(rng, [2, 3, 4, 5]);
  const fa = frac(a.n, a.d);
  const fb = frac(b.n, b.d);
  const result = fmul(fa, fb);
  return {
    difficulty: 4,
    body: {
      stem: pickLocale({
          en:
            `A recipe needs ${fh(a.n, a.d)} kg of flour. ${name} only wants to make ` +
            `${fh(b.n, b.d)} of the recipe. How much flour does ${name} need? <i>(simplify)</i>`,
          es:
            `Una receta necesita ${fh(a.n, a.d)} kg de harina. ${name} solo quiere hacer ` +
            `${fh(b.n, b.d)} de la receta. ¿Cuanta harina necesita ${name}? <i>(simplifica)</i>`,
        },
        loc,
      ),
      unit: "kg",
    },
    answerKey: {
      type: "fraction",
      numerator: result.n,
      denominator: result.d,
      requireSimplest: true,
      canonical: `${mixStr(result)} kg`,
    },
    hint: {
      en: `"${fstr(fb)} <b>of</b> ${fstr(fa)}" means multiply.`,
      es: `"${fstr(fb)} <b>de</b> ${fstr(fa)}" significa multiplicar.`,
    },
    solution: {
      en: `${fstr(fa)} × ${fstr(fb)} = ${a.n * b.n}/${a.d * b.d} = <b>${mixStr(result)} kg</b>`,
      es: `${fstr(fa)} × ${fstr(fb)} = ${a.n * b.n}/${a.d * b.d} = <b>${mixStr(result)} kg</b>`,
    },
  };
}

function template2(rng: Rng, loc: Locale, name: string): Built {
  const d1 = rng.pick([2, 4, 5, 10] as const);
  const d2 = rng.pick([2, 4, 5, 10] as const);
  const w1 = rng.int(1, 3);
  const w2 = rng.int(1, 3);
  const n1 = rng.int(1, d1 - 1);
  const n2 = rng.int(1, d2 - 1);
  const a = frac(w1 * d1 + n1, d1);
  const b = frac(w2 * d2 + n2, d2);
  const result = fadd(a, b);
  return {
    difficulty: 4,
    body: {
      stem: pickLocale({
          en:
            `${name} ran ${mixh(w1, n1, d1)} km on Monday and ${mixh(w2, n2, d2)} km on Tuesday. ` +
            `How far did ${name} run altogether? <i>(give a mixed number)</i>`,
          es:
            `${name} corrio ${mixh(w1, n1, d1)} km el lunes y ${mixh(w2, n2, d2)} km el martes. ` +
            `¿Cuanto corrio en total? <i>(da un numero mixto)</i>`,
        },
        loc,
      ),
      unit: "km",
    },
    answerKey: {
      type: "fraction",
      numerator: result.n,
      denominator: result.d,
      requireSimplest: true,
      canonical: `${mixStr(result)} km`,
    },
    hint: {
      en: "Turn both into improper fractions, give them a common denominator, then add.",
      es: "Pasa los dos a fraccion impropia, ponles denominador comun y suma.",
    },
    solution: {
      en: `${fstr(a)} + ${fstr(b)} = <b>${mixStr(result)} km</b>`,
      es: `${fstr(a)} + ${fstr(b)} = <b>${mixStr(result)} km</b>`,
    },
  };
}

const BOTTLE_CAPACITIES: readonly ScaledDecimal[] = [
  { scaled: 125, dp: 2 },
  { scaled: 150, dp: 2 },
  { scaled: 175, dp: 2 },
  { scaled: 250, dp: 2 },
  { scaled: 75, dp: 2 },
  { scaled: 320, dp: 2 },
];

function template3(rng: Rng, loc: Locale): Built {
  const capacity = rng.pick(BOTTLE_CAPACITIES);
  const bottles = rng.int(6, 30);
  const litres = scaledMul(capacity, scaled(bottles, 0));
  const millilitres = scaledShift(litres, 3);
  return {
    difficulty: 4,
    body: {
      stem: pickLocale({
          en:
            `A bottle holds ${nfScaled(capacity, loc)} L of juice. A cafe buys ${bottles} identical ` +
            `bottles. How many <b>millilitres</b> of juice is that altogether?`,
          es:
            `Una botella contiene ${nfScaled(capacity, loc)} L de zumo. Una cafeteria compra ${bottles} ` +
            `botellas iguales. ¿Cuantos <b>mililitros</b> de zumo son en total?`,
        },
        loc,
      ),
      unit: "mL",
    },
    answerKey: {
      type: "numeric",
      value: scaledValue(millilitres),
      tolerance: 0,
      canonical: `${nfScaled(millilitres, loc)} mL`,
    },
    hint: {
      en: "First multiply to get litres, then × 1,000 to change to millilitres.",
      es: "Primero multiplica para obtener litros y despues × 1.000 para pasar a mililitros.",
    },
    solution: {
      en:
        `${nfScaled(capacity, loc)} × ${bottles} = ${nfScaled(litres, loc)} L; ` +
        `${nfScaled(litres, loc)} × 1,000 = <b>${nfScaled(millilitres, loc)} mL</b>`,
      es:
        `${nfScaled(capacity, loc)} × ${bottles} = ${nfScaled(litres, loc)} L; ` +
        `${nfScaled(litres, loc)} × 1.000 = <b>${nfScaled(millilitres, loc)} mL</b>`,
    },
  };
}

const PIECE_LENGTHS: readonly ScaledDecimal[] = [
  { scaled: 120, dp: 2 },
  { scaled: 80, dp: 2 },
  { scaled: 250, dp: 2 },
  { scaled: 145, dp: 2 },
  { scaled: 360, dp: 2 },
  { scaled: 75, dp: 2 },
];

function template4(rng: Rng, loc: Locale): Built {
  const piece = rng.pick(PIECE_LENGTHS);
  const pieces = rng.pick([4, 5, 6, 8, 12] as const);
  const total = scaledMul(piece, scaled(pieces, 0));
  const centimetres = scaledShift(piece, 2);
  return {
    difficulty: 4,
    body: {
      stem: pickLocale({
          en:
            `A ribbon ${nfScaled(total, loc)} m long is cut into ${pieces} equal pieces. ` +
            `How long is each piece in <b>centimetres</b>?`,
          es:
            `Una cinta de ${nfScaled(total, loc)} m se corta en ${pieces} trozos iguales. ` +
            `¿Cuanto mide cada trozo en <b>centimetros</b>?`,
        },
        loc,
      ),
      unit: "cm",
    },
    answerKey: {
      type: "numeric",
      value: scaledValue(centimetres),
      tolerance: 0,
      canonical: `${nfScaled(centimetres, loc)} cm`,
    },
    hint: {
      en: "Divide first to get metres, then × 100 to change to centimetres.",
      es: "Primero divide para obtener metros y despues × 100 para pasar a centimetros.",
    },
    solution: {
      en:
        `${nfScaled(total, loc)} ÷ ${pieces} = ${nfScaled(piece, loc)} m; ` +
        `${nfScaled(piece, loc)} × 100 = <b>${nfScaled(centimetres, loc)} cm</b>`,
      es:
        `${nfScaled(total, loc)} ÷ ${pieces} = ${nfScaled(piece, loc)} m; ` +
        `${nfScaled(piece, loc)} × 100 = <b>${nfScaled(centimetres, loc)} cm</b>`,
    },
  };
}

function template5(rng: Rng, loc: Locale): Built {
  const long = rng.int(12, 30);
  const wide = rng.int(8, 20);
  const pitLong = rng.int(3, 7);
  const pitWide = rng.int(2, 6);
  const grass = long * wide - pitLong * pitWide;
  return {
    difficulty: 3,
    body: {
      stem: pickLocale({
          en:
            `A school field is a rectangle ${long} m long and ${wide} m wide. Inside it there is a ` +
            `rectangular sandpit measuring ${pitLong} m by ${pitWide} m. What area of the field is <b>grass</b>?`,
          es:
            `Un patio es un rectangulo de ${long} m de largo y ${wide} m de ancho. Dentro hay un ` +
            `arenero rectangular de ${pitLong} m por ${pitWide} m. ¿Que superficie del patio es <b>cesped</b>?`,
        },
        loc,
      ),
      unit: "m²",
    },
    answerKey: {
      type: "numeric",
      value: grass,
      tolerance: 0,
      canonical: `${nf(grass, loc)} m²`,
    },
    hint: {
      en: "Area of the whole field minus the area of the sandpit.",
      es: "El area del patio entero menos el area del arenero.",
    },
    solution: {
      en:
        `${long} × ${wide} = ${nf(long * wide, loc)} m²; ${pitLong} × ${pitWide} = ${pitLong * pitWide} m²<br>` +
        `${nf(long * wide, loc)} − ${pitLong * pitWide} = <b>${nf(grass, loc)} m²</b>`,
      es:
        `${long} × ${wide} = ${nf(long * wide, loc)} m²; ${pitLong} × ${pitWide} = ${pitLong * pitWide} m²<br>` +
        `${nf(long * wide, loc)} − ${pitLong * pitWide} = <b>${nf(grass, loc)} m²</b>`,
    },
  };
}

const POTATO_MASSES: readonly ScaledDecimal[] = [
  { scaled: 456, dp: 1 },
  { scaled: 384, dp: 1 },
  { scaled: 528, dp: 1 },
  { scaled: 276, dp: 1 },
  { scaled: 648, dp: 1 },
];

function template6(rng: Rng, loc: Locale): Built {
  const mass = rng.pick(POTATO_MASSES);
  const sacks = rng.pick([4, 6, 8, 12] as const);
  const grams = scaledShift(mass, 3);
  // Lanza si la division no fuese exacta: un enunciado con respuesta periodica
  // no puede llegar a un examen. Los cinco valores estan elegidos para que lo sea.
  const perSackGrams = scaledDivInt(grams, sacks);
  const perSackKg = scaledShift(perSackGrams, -3);
  return {
    difficulty: 4,
    body: {
      stem: pickLocale({
          en:
            `A farmer packs ${nfScaled(mass, loc)} kg of potatoes equally into ${sacks} sacks. ` +
            `What is the mass of each sack in <b>grams</b>?`,
          es:
            `Un agricultor reparte ${nfScaled(mass, loc)} kg de patatas por igual en ${sacks} sacos. ` +
            `¿Cual es la masa de cada saco en <b>gramos</b>?`,
        },
        loc,
      ),
      unit: "g",
    },
    answerKey: {
      type: "numeric",
      value: scaledValue(perSackGrams),
      tolerance: 0,
      canonical: `${nfScaled(perSackGrams, loc)} g`,
    },
    hint: {
      en: "Divide to find the kg in one sack, then × 1,000 for grams.",
      es: "Divide para hallar los kg de un saco y despues × 1.000 para pasar a gramos.",
    },
    solution: {
      en:
        `${nfScaled(mass, loc)} ÷ ${sacks} = ${nfScaled(perSackKg, loc)} kg; ` +
        `${nfScaled(perSackKg, loc)} × 1,000 = <b>${nfScaled(perSackGrams, loc)} g</b>`,
      es:
        `${nfScaled(mass, loc)} ÷ ${sacks} = ${nfScaled(perSackKg, loc)} kg; ` +
        `${nfScaled(perSackKg, loc)} × 1.000 = <b>${nfScaled(perSackGrams, loc)} g</b>`,
    },
  };
}

export const wordGenerator: QuestionGenerator<WordParams> = {
  key: "math.word",
  paramsSchema: wordParams,
  skillCode: "math.problem_solving.word",
  // DECISION: los seis enunciados se responden en una caja de texto libre; unos
  // esperan fraccion y otros decimal. El formato declarado es el widget de entrada
  // (short_text); quien decide como se corrige es answerKey.type, no el formato.
  format: "short_text",

  generate(params: WordParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);
    const name = rng.pick(NAMES);
    const template = params.template ?? rng.int(1, WORD_TEMPLATE_COUNT);

    const built =
      template === 1
        ? template1(rng, loc, name)
        : template === 2
          ? template2(rng, loc, name)
          : template === 3
            ? template3(rng, loc)
            : template === 4
              ? template4(rng, loc)
              : template === 5
                ? template5(rng, loc)
                : template6(rng, loc);

    return buildItem({
      key: "math.word",
      params,
      seed: seedValue,
      format: "short_text",
      skillCode: "math.problem_solving.word",
      difficulty: params.difficulty ?? built.difficulty,
      maxPoints: params.maxPoints ?? 1,
      body: built.body,
      answerKey: built.answerKey,
      hint: built.hint,
      solution: built.solution,
    });
  },
};
