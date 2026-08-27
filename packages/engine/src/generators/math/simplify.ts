/**
 * math.simplify — GEN.simplify de Y6A.
 * Se toma una fraccion ya simplificada de una lista curada y se "des-simplifica"
 * multiplicando por k. Asi la respuesta correcta siempre existe y siempre es limpia.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng } from "../../rng.js";
import { frac, fstr } from "../../fraction.js";
import { fh, NBSP } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

const BASES = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [1, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [5, 6],
  [5, 8],
  [3, 8],
  [7, 8],
  [4, 9],
  [7, 10],
  [5, 12],
] as const;

export const simplifyParams = baseParams.extend({
  /** Factor maximo por el que se multiplica la fraccion base. Y6A usaba 2..9. */
  maxFactor: z.number().int().min(2).max(12).optional(),
});
export type SimplifyParams = z.infer<typeof simplifyParams>;

export const simplifyGenerator: QuestionGenerator<SimplifyParams> = {
  key: "math.simplify",
  paramsSchema: simplifyParams,
  skillCode: "math.fractions.simplify",
  format: "fraction",

  generate(params: SimplifyParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);
    const maxFactor = params.maxFactor ?? 9;

    const base = rng.pick(BASES);
    const k = rng.int(2, maxFactor);
    const n = base[0] * k;
    const d = base[1] * k;
    const target = frac(base[0], base[1]);

    return buildItem({
      key: "math.simplify",
      params,
      seed: seedValue,
      format: "fraction",
      skillCode: "math.fractions.simplify",
      difficulty: params.difficulty ?? 2,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem: `${pickLocale({ en: "Simplify", es: "Simplifica" }, loc)}${NBSP}${NBSP}${fh(n, d)}`,
        placeholder: pickLocale({ en: "e.g. 3/4", es: "p. ej. 3/4" }, loc),
      },
      answerKey: {
        type: "fraction",
        numerator: target.n,
        denominator: target.d,
        requireSimplest: true,
        canonical: fstr(target),
      },
      hint: {
        en: `Both ${n} and ${d} divide by <b>${k}</b>.`,
        es: `Tanto ${n} como ${d} se dividen entre <b>${k}</b>.`,
      },
      solution: {
        en: `${n} ÷ ${k} = ${base[0]} and ${d} ÷ ${k} = ${base[1]} → <b>${fstr(target)}</b>`,
        es: `${n} ÷ ${k} = ${base[0]} y ${d} ÷ ${k} = ${base[1]} → <b>${fstr(target)}</b>`,
      },
    });
  },
};
