/**
 * math.powten — GEN.powten de Y6A. Multiplicar y dividir por 10, 100 y 1.000.
 * Aritmetica entera: mover la coma es cambiar `dp`, no multiplicar doubles.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng } from "../../rng.js";
import { NBSP, nf, nfScaled, scaled, scaledShift, scaledValue } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

export const POWERS = [10, 100, 1000] as const;
export const POWTEN_OPERATIONS = ["multiply", "divide", "either"] as const;

export const powtenParams = baseParams.extend({
  powers: z.array(z.union([z.literal(10), z.literal(100), z.literal(1000)])).min(1).optional(),
  operation: z.enum(POWTEN_OPERATIONS).optional(),
});
export type PowtenParams = z.infer<typeof powtenParams>;

export const powtenGenerator: QuestionGenerator<PowtenParams> = {
  key: "math.powten",
  paramsSchema: powtenParams,
  skillCode: "math.decimals.powers_of_ten",
  format: "numeric",

  generate(params: PowtenParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);

    const power = rng.pick(params.powers ?? POWERS);
    const requested = params.operation ?? "either";
    const multiply =
      requested === "either" ? rng.chance(0.5) : requested === "multiply";

    const shape = rng.int(1, 4);
    const value =
      shape === 1
        ? scaled(rng.int(1, 999), 3)
        : shape === 2
          ? scaled(rng.int(1, 999), 2)
          : shape === 3
            ? scaled(rng.int(1, 999), 1)
            : scaled(rng.int(1, 99) * 10, 0);

    const places = Math.round(Math.log10(power));
    const result = scaledShift(value, multiply ? places : -places);

    const directionEn = multiply ? "left" : "right";
    const directionEs = multiply ? "izquierda" : "derecha";
    const plural = places > 1;

    return buildItem({
      key: "math.powten",
      params,
      seed: seedValue,
      format: "numeric",
      skillCode: "math.decimals.powers_of_ten",
      difficulty: params.difficulty ?? 2,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem: `${nfScaled(value, loc)}${NBSP}${multiply ? "×" : "÷"}${NBSP}${nf(power, loc)}${NBSP}=`,
        placeholder: pickLocale({ en: "number only", es: "solo el numero" }, loc),
      },
      answerKey: {
        type: "numeric",
        value: scaledValue(result),
        tolerance: 0,
        canonical: nfScaled(result, loc),
      },
      hint: {
        en: `Move every digit ${places} place${plural ? "s" : ""} to the ${directionEn}.`,
        es: `Mueve cada cifra ${places} lugar${plural ? "es" : ""} a la ${directionEs}.`,
      },
      solution: {
        en:
          `Digits move ${places} place${plural ? "s" : ""} to the ${directionEn} ` +
          `(${multiply ? "bigger" : "smaller"}) → <b>${nfScaled(result, loc)}</b>`,
        es:
          `Las cifras se mueven ${places} lugar${plural ? "es" : ""} a la ${directionEs} ` +
          `(${multiply ? "mayor" : "menor"}) → <b>${nfScaled(result, loc)}</b>`,
      },
    });
  },
};
