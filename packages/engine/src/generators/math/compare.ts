/**
 * math.compare — GEN.compare de Y6A.
 *
 * BUG DEL ORIGINAL, CORREGIDO AQUI: Y6A construia las dos fracciones con F(),
 * que las reduce, y despues repetia el sorteo mientras fueran identicas. Efecto:
 * el simbolo "=" era INALCANZABLE — el alumno nunca veia el caso de igualdad, que
 * es justo el que se confunde. Aqui las fracciones se muestran SIN reducir y
 * ademas hay una rama que fabrica pares equivalentes a proposito (2/4 vs 1/2).
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng } from "../../rng.js";
import { frac, fval, gcd, lcm } from "../../fraction.js";
import { fh, NBSP } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

const DENOMINATORS = [2, 3, 4, 5, 6, 8, 9, 10, 12] as const;

export const compareParams = baseParams.extend({
  /** Probabilidad de fabricar un par equivalente (respuesta "="). 0 lo desactiva. */
  equalityChance: z.number().min(0).max(1).optional(),
});
export type CompareParams = z.infer<typeof compareParams>;

interface Displayed {
  readonly n: number;
  readonly d: number;
}

export const compareGenerator: QuestionGenerator<CompareParams> = {
  key: "math.compare",
  paramsSchema: compareParams,
  skillCode: "math.fractions.compare",
  format: "short_text",

  generate(params: CompareParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);
    const equalityChance = params.equalityChance ?? 1 / 6;

    let a: Displayed;
    let b: Displayed;

    if (rng.chance(equalityChance)) {
      // Par equivalente: la misma fraccion escrita de dos maneras.
      const d = rng.pick([2, 3, 4, 5, 6] as const);
      const n = rng.int(1, d - 1);
      const k = rng.int(2, 3);
      const flip = rng.chance(0.5);
      a = flip ? { n, d } : { n: n * k, d: d * k };
      b = flip ? { n: n * k, d: d * k } : { n, d };
    } else {
      const da = rng.pick(DENOMINATORS);
      const na = rng.int(1, da - 1);
      let db = rng.pick(DENOMINATORS);
      let nb = rng.int(1, db - 1);
      if (na === nb && da === db) {
        // Mismo par mostrado dos veces: se desplaza el denominador de forma
        // determinista. Sin bucles: un `while` aqui es una bomba de relojeria.
        const idx = DENOMINATORS.indexOf(db);
        const next = DENOMINATORS[(idx + 1) % DENOMINATORS.length];
        db = next ?? 3;
        nb = Math.min(nb, db - 1);
      }
      a = { n: na, d: da };
      b = { n: nb, d: db };
    }

    const va = fval(frac(a.n, a.d));
    const vb = fval(frac(b.n, b.d));
    const symbol = a.n * b.d === b.n * a.d ? "=" : va > vb ? ">" : "<";
    const cd = lcm(a.d, b.d);
    const accepted =
      symbol === "=" ? ["=", "=="] : symbol === ">" ? [">", "&gt;"] : ["<", "&lt;"];

    return buildItem({
      key: "math.compare",
      params,
      seed: seedValue,
      format: "short_text",
      skillCode: "math.fractions.compare",
      difficulty: params.difficulty ?? 2,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem:
          `${pickLocale({ en: "Type &gt;, &lt; or =", es: "Escribe &gt;, &lt; o =" }, loc)}${NBSP}${NBSP}` +
          `${fh(a.n, a.d)}${NBSP}___${NBSP}${fh(b.n, b.d)}`,
        placeholder: "> < =",
      },
      answerKey: {
        type: "text",
        accepted,
        caseSensitive: false,
        ignoreDiacritics: true,
        canonical: symbol,
      },
      hint: {
        en:
          `Cross multiply: ${a.n} × ${b.d} = ${a.n * b.d} and ${b.n} × ${a.d} = ${b.n * a.d}. ` +
          `The bigger product sits over the bigger fraction.`,
        es:
          `Multiplica en cruz: ${a.n} × ${b.d} = ${a.n * b.d} y ${b.n} × ${a.d} = ${b.n * a.d}. ` +
          `El producto mayor corresponde a la fracción mayor.`,
      },
      solution: {
        en:
          `Common denominator ${cd}: ${a.n}/${a.d} = ${a.n * (cd / a.d)}/${cd} and ` +
          `${b.n}/${b.d} = ${b.n * (cd / b.d)}/${cd} → <b>${a.n}/${a.d} ${symbol} ${b.n}/${b.d}</b>` +
          (symbol === "=" ? ` (both simplify to ${simplified(a)})` : ""),
        es:
          `Denominador común ${cd}: ${a.n}/${a.d} = ${a.n * (cd / a.d)}/${cd} y ` +
          `${b.n}/${b.d} = ${b.n * (cd / b.d)}/${cd} → <b>${a.n}/${a.d} ${symbol} ${b.n}/${b.d}</b>` +
          (symbol === "=" ? ` (las dos se simplifican a ${simplified(a)})` : ""),
      },
    });
  },
};

function simplified(value: Displayed): string {
  const g = gcd(value.n, value.d);
  return `${value.n / g}/${value.d / g}`;
}
