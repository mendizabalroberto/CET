/**
 * Piezas comunes a todos los generadores.
 *
 * DECISION (el contrato era ambiguo): `renderedBody.stem` es UNA cadena, no un
 * I18nText. Como AD-7 exige es/en desde el dia uno, el idioma tiene que ser un
 * PARAMETRO del generador: `locale` entra en params, el enunciado sale ya en ese
 * idioma, y `hint`/`solution` — que si son I18nText en el contrato — salen en los
 * dos. Es coherente con `question_versions.locale` del DATA_MODEL.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import {
  generatedItem,
  locale as localeSchema,
  type AnswerKey,
  type EngineKey,
  type GeneratedItem,
  type I18nText,
  type Locale,
  type QuestionFormat,
  type RenderedBody,
  type Seed,
} from "@cet/shared";
import { InvalidGeneratedItemError } from "../errors.js";
import { sanitizeStem, sanitizeSvg } from "../sanitize.js";

/**
 * Parametros que todo generador acepta. Ojo: todos OPCIONALES y sin `.default()`
 * de zod a proposito — asi el tipo de entrada y el de salida del esquema coinciden
 * y `paramsSchema` encaja en `z.ZodType<TParams>` del contrato. Los valores por
 * defecto se resuelven en codigo.
 */
/**
 * `.strict()` NO es un detalle: es lo que convierte un fallo silencioso en uno
 * ruidoso.
 *
 * Por defecto, zod DESCARTA las claves que no conoce. El blueprint del simulacro
 * pedia `{ op: "+" }` y este generador espera `{ ops: ["add"] }`; con el modo
 * permisivo, `op` se tiraba a la basura, `ops` quedaba undefined y el generador
 * sorteaba la operacion al azar. El examen decia "una pregunta de cada
 * operacion" y podia salir con cuatro multiplicaciones y ninguna division, sin
 * un solo error por ningun lado.
 *
 * Con `.strict()`, ese blueprint falla al materializar el intento y alguien se
 * entera el primer dia en vez de al tercer trimestre.
 */
export const baseParams = z
  .object({
    locale: localeSchema.optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    maxPoints: z.number().positive().max(100).optional(),
  })
  .strict();
export type BaseParams = z.infer<typeof baseParams>;

export const DEFAULT_LOCALE_PARAM: Locale = "en";

export function resolveLocale(params: BaseParams): Locale {
  return params.locale ?? DEFAULT_LOCALE_PARAM;
}

/** Texto bilingue obligatorio: en el motor no existe el texto a medio traducir. */
export interface Bilingual {
  readonly en: string;
  readonly es: string;
}

export function pickLocale(text: Bilingual, loc: Locale): string {
  return loc === "es" ? text.es : text.en;
}

export function i18n(text: Bilingual): I18nText {
  return { en: text.en, es: text.es };
}

/** Pista y solucion tambien se pintan como HTML: pasan por la misma allowlist. */
function sanitizeBilingual(text: Bilingual): I18nText {
  return {
    en: sanitizeStem(text.en, "strict"),
    es: sanitizeStem(text.es, "strict"),
  };
}

export interface BuildItemArgs {
  readonly key: EngineKey;
  readonly params: Record<string, unknown>;
  readonly seed: Seed;
  readonly format: QuestionFormat;
  readonly skillCode: string;
  readonly difficulty: number;
  readonly maxPoints: number;
  readonly body: RenderedBody;
  readonly answerKey: AnswerKey;
  readonly hint: Bilingual;
  readonly solution: Bilingual;
}

/**
 * Construye el GeneratedItem: sanea el marcado en modo `strict` (un generador que
 * emite HTML fuera de la allowlist es un bug que debe explotar en los tests) y
 * valida el resultado contra el esquema del contrato.
 */
export function buildItem(args: BuildItemArgs): GeneratedItem {
  const body: RenderedBody = {
    ...args.body,
    stem: sanitizeStem(args.body.stem, "strict"),
    ...(args.body.figureSvg === undefined
      ? {}
      : { figureSvg: sanitizeSvg(args.body.figureSvg, "strict") }),
  };

  if (body.figureSvg !== undefined && body.figureAlt === undefined) {
    throw new InvalidGeneratedItemError(args.key, [
      "hay figureSvg sin figureAlt: una figura sin texto alternativo es inaccesible",
    ]);
  }

  const candidate = {
    engineKey: args.key,
    seed: args.seed,
    params: args.params,
    format: args.format,
    body,
    answerKey: args.answerKey,
    hint: sanitizeBilingual(args.hint),
    solution: sanitizeBilingual(args.solution),
    difficulty: args.difficulty,
    maxPoints: args.maxPoints,
    gradingMode: "auto" as const,
    skillCode: args.skillCode,
  };

  const parsed = generatedItem.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidGeneratedItemError(
      args.key,
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return parsed.data;
}

/** Nombres propios de los enunciados. Portados de NAMES en Y6A. */
export const NAMES = [
  "Liam",
  "Maria",
  "Sofia",
  "Tom",
  "Ana",
  "Diego",
  "Emma",
  "Luca",
  "Nora",
  "Ben",
] as const;
