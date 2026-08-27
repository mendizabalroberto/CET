/**
 * math.fracop — GEN.fracop de Y6A. Las cuatro operaciones con fracciones propias.
 *
 * El original usaba dos `while` con guard para evitar una resta de resultado 0 o
 * negativo. Aqui no hay bucles: si el sorteo produce a === b se sustituye b por
 * 1/(a.d+1), que SIEMPRE es menor que a (a.n >= 1 ⇒ a.n/a.d >= 1/a.d > 1/(a.d+1)).
 * Un generador no puede depender de que un bucle "normalmente" salga.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import type { QuestionGenerator, Seed } from "@cet/shared";
import { createRng, type Rng } from "../../rng.js";
import { fadd, fdiv, feq, fmul, frac, fstr, fsub, fval, lcm, mixStr, type Frac } from "../../fraction.js";
import { fh, NBSP } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

const DENOMINATORS = [2, 3, 4, 5, 6, 8, 9, 10, 12] as const;
export const FRACOP_OPS = ["add", "sub", "mul", "div"] as const;
export type FracOp = (typeof FRACOP_OPS)[number];

const GLYPH: Record<FracOp, string> = { add: "+", sub: "−", mul: "×", div: "÷" };

export const fracopParams = baseParams.extend({
  /** Restringe las operaciones sorteadas. Vacio no vale: seria un generador sin salida. */
  ops: z.array(z.enum(FRACOP_OPS)).min(1).optional(),
});
export type FracopParams = z.infer<typeof fracopParams>;

function properFraction(rng: Rng): Frac {
  const d = rng.pick(DENOMINATORS);
  return frac(rng.int(1, d - 1), d);
}

export const fracopGenerator: QuestionGenerator<FracopParams> = {
  key: "math.fracop",
  paramsSchema: fracopParams,
  skillCode: "math.fractions.operations",
  format: "fraction",

  generate(params: FracopParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);
    const op = rng.pick(params.ops ?? FRACOP_OPS);

    let a = properFraction(rng);
    let b = properFraction(rng);

    if (op === "sub") {
      if (fval(a) < fval(b)) {
        const swap = a;
        a = b;
        b = swap;
      }
      if (feq(a, b)) {
        b = frac(1, a.d + 1);
      }
    }

    const result =
      op === "add" ? fadd(a, b) : op === "sub" ? fsub(a, b) : op === "mul" ? fmul(a, b) : fdiv(a, b);

    const cd = lcm(a.d, b.d);
    const an = a.n * (cd / a.d);
    const bn = b.n * (cd / b.d);

    const work = {
      en:
        op === "add" || op === "sub"
          ? `Common denominator ${cd}: ${an}/${cd} ${GLYPH[op]} ${bn}/${cd} = ` +
            `${op === "add" ? an + bn : an - bn}/${cd} = <b>${mixStr(result)}</b>`
          : op === "mul"
            ? `Tops: ${a.n} × ${b.n} = ${a.n * b.n} · Bottoms: ${a.d} × ${b.d} = ${a.d * b.d} → ` +
              `${a.n * b.n}/${a.d * b.d} = <b>${mixStr(result)}</b>`
            : `Keep, Change, Flip: ${fstr(a)} × ${b.d}/${b.n} = ${a.n * b.d}/${a.d * b.n} = ` +
              `<b>${mixStr(result)}</b>`,
      es:
        op === "add" || op === "sub"
          ? `Denominador común ${cd}: ${an}/${cd} ${GLYPH[op]} ${bn}/${cd} = ` +
            `${op === "add" ? an + bn : an - bn}/${cd} = <b>${mixStr(result)}</b>`
          : op === "mul"
            ? `Numeradores: ${a.n} × ${b.n} = ${a.n * b.n} · Denominadores: ${a.d} × ${b.d} = ` +
              `${a.d * b.d} → ${a.n * b.n}/${a.d * b.d} = <b>${mixStr(result)}</b>`
            : `Deja, cambia, invierte: ${fstr(a)} × ${b.d}/${b.n} = ${a.n * b.d}/${a.d * b.n} = ` +
              `<b>${mixStr(result)}</b>`,
    };

    const hints: Record<FracOp, { en: string; es: string }> = {
      add: {
        en: "Give both fractions the same denominator first, then add the tops only.",
        es: "Primero pon las dos fracciones con el mismo denominador; luego suma solo los numeradores.",
      },
      sub: {
        en: "Give both fractions the same denominator first, then subtract the tops only.",
        es: "Primero pon las dos fracciones con el mismo denominador; luego resta solo los numeradores.",
      },
      mul: {
        en: "No common denominator needed — tops × tops, bottoms × bottoms.",
        es: "No hace falta denominador común: numerador × numerador, denominador × denominador.",
      },
      div: {
        en: `Keep, Change, Flip: turn ${fstr(b)} upside down and multiply.`,
        es: `Deja, cambia, invierte: da la vuelta a ${fstr(b)} y multiplica.`,
      },
    };

    return buildItem({
      key: "math.fracop",
      params,
      seed: seedValue,
      format: "fraction",
      skillCode: "math.fractions.operations",
      difficulty: params.difficulty ?? (op === "div" ? 4 : 3),
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem: `${fh(a.n, a.d)}${NBSP}${GLYPH[op]}${NBSP}${fh(b.n, b.d)}${NBSP}=`,
        placeholder: pickLocale({ en: "e.g. 1 3/4", es: "p. ej. 1 3/4" }, loc),
      },
      answerKey: {
        type: "fraction",
        numerator: result.n,
        denominator: result.d,
        // Y6A aceptaba 4/4 como respuesta de 3/4 + 1/4. Se mantiene: la destreza
        // evaluada aqui es operar, no simplificar (para eso esta math.simplify).
        requireSimplest: false,
        canonical: mixStr(result),
      },
      hint: hints[op],
      solution: work,
    });
  },
};
