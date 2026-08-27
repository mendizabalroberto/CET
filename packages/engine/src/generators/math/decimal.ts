/**
 * math.decimal — GEN.decimal de Y6A. Multiplicar y dividir decimales.
 *
 * El original encadenaba Math.round(x*100)/100 sobre doubles y podia producir
 * respuestas con fuzz (0.30000000000000004) o divisiones periodicas. Aqui toda la
 * aritmetica es ENTERA (ScaledDecimal): el enunciado y la clave se construyen a
 * partir del resultado, no al reves, asi que la respuesta siempre es exacta y
 * siempre tecleable.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng } from "../../rng.js";
import { NBSP, nfScaled, scaled, scaledMul, scaledValue } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

export const DECIMAL_OPERATIONS = ["multiply", "divide", "either"] as const;

export const decimalParams = baseParams.extend({
  operation: z.enum(DECIMAL_OPERATIONS).optional(),
});
export type DecimalParams = z.infer<typeof decimalParams>;

const DIVISORS = [4, 5, 6, 8, 12, 25] as const;

export const decimalGenerator: QuestionGenerator<DecimalParams> = {
  key: "math.decimal",
  paramsSchema: decimalParams,
  skillCode: "math.decimals.multiply_divide",
  format: "numeric",

  generate(params: DecimalParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);
    const requested = params.operation ?? "either";
    const operation =
      requested === "either" ? (rng.chance(0.5) ? "multiply" : "divide") : requested;

    if (operation === "multiply") {
      const dpA = rng.chance(0.4) ? 2 : 1;
      const aScaled = dpA === 1 ? rng.int(105, 995) : rng.int(105, 995) + 100 * rng.int(1, 30);
      const a = scaled(aScaled, dpA);
      const b = scaled(rng.int(12, 89), 1);
      const product = scaledMul(a, b);

      return buildItem({
        key: "math.decimal",
        params,
        seed: seedValue,
        format: "numeric",
        skillCode: "math.decimals.multiply_divide",
        difficulty: params.difficulty ?? 3,
        maxPoints: params.maxPoints ?? 1,
        body: {
          stem: `${nfScaled(a, loc)}${NBSP}×${NBSP}${nfScaled(b, loc)}${NBSP}=`,
          placeholder: pickLocale({ en: "number only", es: "solo el número" }, loc),
        },
        answerKey: {
          type: "numeric",
          value: scaledValue(product),
          tolerance: 0,
          canonical: nfScaled(product, loc),
        },
        hint: {
          en:
            `Ignore the points: ${a.scaled} × ${b.scaled} = ${product.scaled}. ` +
            `Now put back ${product.dp} decimal place${product.dp === 1 ? "" : "s"}.`,
          es:
            `Olvida las comas: ${a.scaled} × ${b.scaled} = ${product.scaled}. ` +
            `Ahora devuelve ${product.dp} cifra${product.dp === 1 ? "" : "s"} decimal${product.dp === 1 ? "" : "es"}.`,
        },
        solution: {
          en:
            `Whole numbers: ${a.scaled} × ${b.scaled} = ${product.scaled}<br>` +
            `${product.dp} decimal places in the question → <b>${nfScaled(product, loc)}</b>`,
          es:
            `Con enteros: ${a.scaled} × ${b.scaled} = ${product.scaled}<br>` +
            `${product.dp} decimales en el enunciado → <b>${nfScaled(product, loc)}</b>`,
        },
      });
    }

    const divisor = rng.pick(DIVISORS);
    const dpQ = rng.chance(0.5) ? 1 : 2;
    const quotient = scaled(rng.int(11, 99), dpQ);
    // El dividendo se DERIVA del cociente: division exacta garantizada.
    const dividend = scaled(quotient.scaled * divisor, dpQ);

    return buildItem({
      key: "math.decimal",
      params,
      seed: seedValue,
      format: "numeric",
      skillCode: "math.decimals.multiply_divide",
      difficulty: params.difficulty ?? 3,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem: `${nfScaled(dividend, loc)}${NBSP}÷${NBSP}${divisor}${NBSP}=`,
        placeholder: pickLocale({ en: "number only", es: "solo el número" }, loc),
      },
      answerKey: {
        type: "numeric",
        value: scaledValue(quotient),
        tolerance: 0,
        canonical: nfScaled(quotient, loc),
      },
      hint: {
        en: `Short division. Keep the decimal point in the answer directly above the one in ${nfScaled(dividend, loc)}.`,
        es: `División corta. Deja la coma del resultado justo encima de la de ${nfScaled(dividend, loc)}.`,
      },
      solution: {
        en:
          `${nfScaled(dividend, loc)} ÷ ${divisor} = <b>${nfScaled(quotient, loc)}</b> ` +
          `(check: ${nfScaled(quotient, loc)} × ${divisor} = ${nfScaled(dividend, loc)})`,
        es:
          `${nfScaled(dividend, loc)} ÷ ${divisor} = <b>${nfScaled(quotient, loc)}</b> ` +
          `(comprobación: ${nfScaled(quotient, loc)} × ${divisor} = ${nfScaled(dividend, loc)})`,
      },
    });
  },
};
