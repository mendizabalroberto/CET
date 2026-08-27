/**
 * math.mixed — GEN.mixed de Y6A. Impropia ↔ numero mixto.
 *
 * El original sorteaba d y n y repetia hasta gcd(n,d)===1 con un guard de 40.
 * Aqui el numerador se elige de la lista PRECALCULADA de coprimos de d: cero
 * bucles, misma distribucion pedagogica.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng } from "../../rng.js";
import { gcd } from "../../fraction.js";
import { fh, mixh, NBSP } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

const DENOMINATORS = [3, 4, 5, 6, 7, 8, 9] as const;

/** Numeradores 1..d-1 coprimos con d. Nunca vacio: el 1 siempre esta. */
const COPRIMES: ReadonlyMap<number, readonly number[]> = new Map(
  DENOMINATORS.map((d) => {
    const list: number[] = [];
    for (let n = 1; n < d; n += 1) if (gcd(n, d) === 1) list.push(n);
    return [d, list] as const;
  }),
);

export const MIXED_DIRECTIONS = ["to_improper", "to_mixed", "either"] as const;

export const mixedParams = baseParams.extend({
  direction: z.enum(MIXED_DIRECTIONS).optional(),
});
export type MixedParams = z.infer<typeof mixedParams>;

export const mixedGenerator: QuestionGenerator<MixedParams> = {
  key: "math.mixed",
  paramsSchema: mixedParams,
  skillCode: "math.fractions.mixed",
  format: "fraction",

  generate(params: MixedParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);

    const d = rng.pick(DENOMINATORS);
    const numerators = COPRIMES.get(d) ?? [1];
    const n = rng.pick(numerators);
    const whole = rng.int(2, 8);
    const improper = whole * d + n;

    const requested = params.direction ?? "either";
    const direction =
      requested === "either" ? (rng.chance(0.5) ? "to_improper" : "to_mixed") : requested;

    if (direction === "to_improper") {
      return buildItem({
        key: "math.mixed",
        params,
        seed: seedValue,
        format: "fraction",
        skillCode: "math.fractions.mixed",
        difficulty: params.difficulty ?? 2,
        maxPoints: params.maxPoints ?? 1,
        body: {
          stem:
            `${pickLocale({ en: "Write", es: "Escribe" }, loc)}${NBSP}${mixh(whole, n, d)}${NBSP}` +
            `${pickLocale({ en: "as an improper fraction", es: "como fraccion impropia" }, loc)}`,
          placeholder: pickLocale({ en: "e.g. 7/4", es: "p. ej. 7/4" }, loc),
        },
        answerKey: {
          type: "fraction",
          numerator: improper,
          denominator: d,
          // gcd(improper, d) === gcd(n, d) === 1, asi que la clave ya es irreducible:
          // exigir forma simplificada solo rechaza escrituras como 14/8.
          requireSimplest: true,
          canonical: `${improper}/${d}`,
        },
        hint: {
          en: `Multiply the whole number by the bottom, then add the top: ${whole} × ${d} + ${n}.`,
          es: `Multiplica el entero por el denominador y suma el numerador: ${whole} × ${d} + ${n}.`,
        },
        solution: {
          en: `${whole} × ${d} = ${whole * d}, ${whole * d} + ${n} = ${improper} → <b>${improper}/${d}</b>`,
          es: `${whole} × ${d} = ${whole * d}, ${whole * d} + ${n} = ${improper} → <b>${improper}/${d}</b>`,
        },
      });
    }

    return buildItem({
      key: "math.mixed",
      params,
      seed: seedValue,
      format: "fraction",
      skillCode: "math.fractions.mixed",
      difficulty: params.difficulty ?? 2,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem:
          `${pickLocale({ en: "Write", es: "Escribe" }, loc)}${NBSP}${fh(improper, d)}${NBSP}` +
          `${pickLocale({ en: "as a mixed number", es: "como numero mixto" }, loc)}`,
        placeholder: pickLocale({ en: "e.g. 1 3/4", es: "p. ej. 1 3/4" }, loc),
      },
      answerKey: {
        type: "fraction",
        numerator: improper,
        denominator: d,
        requireSimplest: true,
        canonical: `${whole} ${n}/${d}`,
      },
      hint: {
        en: `Divide ${improper} by ${d}. The remainder becomes the new top.`,
        es: `Divide ${improper} entre ${d}. El resto es el nuevo numerador.`,
      },
      solution: {
        en: `${improper} ÷ ${d} = ${whole} remainder ${n} → <b>${whole} ${n}/${d}</b>`,
        es: `${improper} ÷ ${d} = ${whole} y resto ${n} → <b>${whole} ${n}/${d}</b>`,
      },
    });
  },
};
