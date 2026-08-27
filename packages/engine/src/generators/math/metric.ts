/**
 * math.metric — GEN.metric de Y6A. Conversiones del sistema metrico.
 *
 * Correcciones respecto del original:
 *   - El factor se guarda como EXPONENTE (10^e), no como 1/1000 en coma flotante:
 *     0.75 kg -> 750 g sale exacto, no 749.9999999999999.
 *   - La pista de Y6A imprimia `nf(1/1*(1/c.k>1?1/c.k:c.k))`, una expresion sin
 *     sentido que en la mitad de los casos mostraba el factor equivocado.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng } from "../../rng.js";
import { NBSP, nf, nfScaled, scaled, scaledShift, scaledValue } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

export const METRIC_FAMILIES = ["length", "mass", "capacity"] as const;
export type MetricFamily = (typeof METRIC_FAMILIES)[number];

interface Conversion {
  readonly from: string;
  readonly to: string;
  /** factor = 10^exponent */
  readonly exponent: number;
  readonly family: MetricFamily;
}

const CONVERSIONS: readonly Conversion[] = [
  { from: "km", to: "m", exponent: 3, family: "length" },
  { from: "m", to: "km", exponent: -3, family: "length" },
  { from: "m", to: "cm", exponent: 2, family: "length" },
  { from: "cm", to: "m", exponent: -2, family: "length" },
  { from: "cm", to: "mm", exponent: 1, family: "length" },
  { from: "mm", to: "cm", exponent: -1, family: "length" },
  { from: "kg", to: "g", exponent: 3, family: "mass" },
  { from: "g", to: "kg", exponent: -3, family: "mass" },
  { from: "g", to: "mg", exponent: 3, family: "mass" },
  { from: "t", to: "kg", exponent: 3, family: "mass" },
  { from: "L", to: "mL", exponent: 3, family: "capacity" },
  { from: "mL", to: "L", exponent: -3, family: "capacity" },
  { from: "kL", to: "L", exponent: 3, family: "capacity" },
];

export const metricParams = baseParams.extend({
  families: z.array(z.enum(METRIC_FAMILIES)).min(1).optional(),
});
export type MetricParams = z.infer<typeof metricParams>;

export const metricGenerator: QuestionGenerator<MetricParams> = {
  key: "math.metric",
  paramsSchema: metricParams,
  skillCode: "math.measurement.metric",
  format: "numeric",

  generate(params: MetricParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);

    const families = params.families;
    const pool =
      families === undefined
        ? CONVERSIONS
        : CONVERSIONS.filter((c) => families.includes(c.family));
    // `pool` nunca queda vacio: el esquema exige al menos una familia y las tres
    // tienen conversiones. rng.pick lanzaria un error explicito si dejara de ser cierto.
    const conv = rng.pick(pool);

    const toSmaller = conv.exponent > 0;
    const value = toSmaller
      ? scaled(rng.int(105, 995), rng.chance(0.5) ? 1 : 0)
      : scaled(rng.int(120, 9850), 0);
    const result = scaledShift(value, conv.exponent);
    const factor = Math.pow(10, Math.abs(conv.exponent));

    return buildItem({
      key: "math.metric",
      params,
      seed: seedValue,
      format: "numeric",
      skillCode: "math.measurement.metric",
      difficulty: params.difficulty ?? 3,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem: `${nfScaled(value, loc)} ${conv.from}${NBSP}=${NBSP}______ ${conv.to}`,
        unit: conv.to,
        placeholder: pickLocale({ en: "number only", es: "solo el numero" }, loc),
      },
      answerKey: {
        type: "numeric",
        value: scaledValue(result),
        tolerance: 0,
        canonical: `${nfScaled(result, loc)} ${conv.to}`,
      },
      hint: {
        en: toSmaller
          ? `You are going to a <b>smaller</b> unit, so <b>multiply</b> by ${nf(factor, loc)}.`
          : `You are going to a <b>bigger</b> unit, so <b>divide</b> by ${nf(factor, loc)}.`,
        es: toSmaller
          ? `Vas a una unidad <b>menor</b>, asi que <b>multiplica</b> por ${nf(factor, loc)}.`
          : `Vas a una unidad <b>mayor</b>, asi que <b>divide</b> entre ${nf(factor, loc)}.`,
      },
      solution: {
        en:
          `${nfScaled(value, loc)} ${conv.from} ${toSmaller ? "×" : "÷"} ${nf(factor, loc)} = ` +
          `<b>${nfScaled(result, loc)} ${conv.to}</b> (${conv.family})`,
        es:
          `${nfScaled(value, loc)} ${conv.from} ${toSmaller ? "×" : "÷"} ${nf(factor, loc)} = ` +
          `<b>${nfScaled(result, loc)} ${conv.to}</b> (${familyEs(conv.family)})`,
      },
    });
  },
};

function familyEs(family: MetricFamily): string {
  return family === "length" ? "longitud" : family === "mass" ? "masa" : "capacidad";
}
