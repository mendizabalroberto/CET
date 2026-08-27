/**
 * Materializacion de un examen: blueprint + banco + semilla raiz -> items.
 *
 * Es el equivalente de mkBuild()/buildMock() de los trainers Y6A, pero
 * determinista y ejecutable en el servidor. La salida es exactamente lo que
 * `attempt_items` necesita (DATA_MODEL §6): ord, section_ord, question_id,
 * question_version_id, item_seed, rendered_body, option_order, answer_key,
 * skill_id, difficulty, max_points.
 *
 * DETERMINISMO: dado (blueprint, pool, rootSeed) la salida es siempre la misma,
 * byte a byte. Para conseguirlo el pool se ORDENA por question_version_id antes
 * de sortear: si dependiera del orden en que Postgres devolvio las filas, el
 * mismo intento se reconstruiria distinto en cada ejecucion.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import {
  answerKey as answerKeySchema,
  blueprintSectionSource,
  engineKey as engineKeySchema,
  gradingMode as gradingModeSchema,
  i18nText,
  questionFormat,
  questionKind,
  renderedBody as renderedBodySchema,
  seed as seedSchema,
  type AnswerKey,
  type GradingMode,
  type QuestionFormat,
  type RenderedBody,
  type Seed,
} from "@cet/shared";
import { EngineError, InsufficientPoolError } from "./errors.js";
import { createRng } from "./rng.js";
import { deriveItemSeed, deriveStreamSeed, SEED_STREAM } from "./seed.js";
import { registry as defaultRegistry } from "./generators/index.js";
import type { GeneratorRegistry } from "./registry.js";
import { sanitizeStem, sanitizeSvg } from "./sanitize.js";

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

const poolCommon = {
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  skillId: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  maxPoints: z.number().positive(),
  gradingMode: gradingModeSchema,
  format: questionFormat,
  tags: z.array(z.string()).optional(),
};

/** Una pregunta del banco, tal cual sale de questions + question_versions. */
export const poolQuestion = z.discriminatedUnion("kind", [
  z.object({
    ...poolCommon,
    kind: z.literal(questionKind.enum.static),
    body: renderedBodySchema,
    answerSpec: answerKeySchema,
  }),
  z.object({
    ...poolCommon,
    kind: z.literal(questionKind.enum.generated),
    body: z.object({
      engineKey: engineKeySchema,
      paramSpec: z.record(z.unknown()).optional(),
    }),
  }),
]);
export type PoolQuestion = z.infer<typeof poolQuestion>;

export const sectionSelection = z.object({
  skillIds: z.array(z.string()).optional(),
  difficulty: z.object({ min: z.number().int().min(1).max(5), max: z.number().int().min(1).max(5) }).optional(),
  questionKind: questionKind.optional(),
  tags: z.array(z.string()).optional(),
  engineKeys: z.array(engineKeySchema).optional(),
});
export type SectionSelection = z.infer<typeof sectionSelection>;

export const blueprintSection = z.object({
  ord: z.number().int().min(0),
  title: i18nText.optional(),
  itemCount: z.number().int().min(0),
  selection: sectionSelection,
  source: blueprintSectionSource,
  pointsPerItem: z.number().positive().optional(),
});
export type BlueprintSection = z.infer<typeof blueprintSection>;

export const examBlueprint = z.object({
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  /** Idioma del examen. Se inyecta en los generadores que no lo traigan en paramSpec. */
  locale: z.enum(["es", "en"]).optional(),
  sections: z.array(blueprintSection).min(1),
});
export type ExamBlueprint = z.infer<typeof examBlueprint>;

/* -------------------------------------------------------------------------- */
/* Salida                                                                     */
/* -------------------------------------------------------------------------- */

export interface MaterializedItem {
  /** 1..n, orden real de presentacion. Es la clave (attempt_id, ord). */
  readonly ord: number;
  readonly sectionOrd: number;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly skillId: string;
  readonly difficulty: number;
  readonly maxPoints: number;
  readonly gradingMode: GradingMode;
  readonly format: QuestionFormat;
  readonly itemSeed: Seed;
  readonly renderedBody: RenderedBody;
  /** Permutacion aplicada a las opciones originales. null cuando el item no tiene opciones. */
  readonly optionOrder: readonly number[] | null;
  readonly answerKey: AnswerKey;
}

export interface MaterializeArgs {
  readonly blueprint: unknown;
  readonly pool: readonly unknown[];
  readonly rootSeed: number;
  readonly registry?: GeneratorRegistry;
}

/* -------------------------------------------------------------------------- */
/* Implementacion                                                             */
/* -------------------------------------------------------------------------- */

function describeSelection(section: BlueprintSection): string {
  const parts: string[] = [`source=${section.source}`];
  const s = section.selection;
  if (s.skillIds !== undefined) parts.push(`skillIds=[${s.skillIds.join(",")}]`);
  if (s.difficulty !== undefined) parts.push(`difficulty=${s.difficulty.min}..${s.difficulty.max}`);
  if (s.questionKind !== undefined) parts.push(`kind=${s.questionKind}`);
  if (s.tags !== undefined) parts.push(`tags=[${s.tags.join(",")}]`);
  if (s.engineKeys !== undefined) parts.push(`engineKeys=[${s.engineKeys.join(",")}]`);
  return parts.join(", ");
}

function matchesSection(question: PoolQuestion, section: BlueprintSection): boolean {
  const { selection, source } = section;

  if (source === "bank" && question.kind !== "static") return false;
  if (source === "generated" && question.kind !== "generated") return false;
  if (selection.questionKind !== undefined && question.kind !== selection.questionKind) return false;

  if (selection.skillIds !== undefined && !selection.skillIds.includes(question.skillId)) return false;

  if (selection.difficulty !== undefined) {
    const { min, max } = selection.difficulty;
    if (question.difficulty < min || question.difficulty > max) return false;
  }

  if (selection.tags !== undefined && selection.tags.length > 0) {
    const tags = question.tags ?? [];
    if (!selection.tags.some((tag) => tags.includes(tag))) return false;
  }

  if (selection.engineKeys !== undefined) {
    if (question.kind !== "generated") return false;
    if (!selection.engineKeys.includes(question.body.engineKey)) return false;
  }

  return true;
}

function byVersionId(a: PoolQuestion, b: PoolQuestion): number {
  return a.questionVersionId < b.questionVersionId ? -1 : a.questionVersionId > b.questionVersionId ? 1 : 0;
}

function applyOptionShuffle(
  body: RenderedBody,
  itemSeed: Seed,
  shuffle: boolean,
): { body: RenderedBody; optionOrder: readonly number[] | null } {
  const options = body.options;
  if (options === undefined || options.length === 0) {
    return { body, optionOrder: null };
  }
  const identity = options.map((_, index) => index);
  if (!shuffle || options.length === 1) {
    return { body, optionOrder: identity };
  }
  const rng = createRng(deriveStreamSeed(itemSeed, SEED_STREAM.optionShuffle, 0));
  const order = rng.permutation(options.length);
  const reordered = order.map((index) => {
    const option = options[index];
    if (option === undefined) {
      throw new EngineError("option_shuffle", "La permutacion de opciones apunta fuera del array");
    }
    return option;
  });
  return { body: { ...body, options: reordered }, optionOrder: order };
}

/** Sanea el cuerpo que viene del banco (contenido de un profesor: nunca de fiar). */
function sanitizeBody(body: RenderedBody): RenderedBody {
  return {
    ...body,
    stem: sanitizeStem(body.stem, "strip"),
    ...(body.figureSvg === undefined ? {} : { figureSvg: sanitizeSvg(body.figureSvg, "strip") }),
    ...(body.options === undefined
      ? {}
      : { options: body.options.map((o) => ({ id: o.id, html: sanitizeStem(o.html, "strip") })) }),
  };
}

/**
 * Resuelve el blueprint contra el banco y devuelve los items del intento.
 * Lanza InsufficientPoolError si alguna seccion no se puede llenar: un examen
 * corto silenciosamente es un examen invalido, y eso no se descubre a tiempo.
 */
export function materializeExam(args: MaterializeArgs): MaterializedItem[] {
  const blueprint = examBlueprint.parse(args.blueprint);
  const rootSeed = seedSchema.parse(args.rootSeed);
  const registry = args.registry ?? defaultRegistry;

  const pool = args.pool.map((raw, index) => {
    const parsed = poolQuestion.safeParse(raw);
    if (!parsed.success) {
      throw new EngineError(
        "invalid_pool_question",
        `La pregunta ${index} del banco no cumple el contrato: ` +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return parsed.data;
  });

  const seenVersionIds = new Set<string>();
  for (const question of pool) {
    if (seenVersionIds.has(question.questionVersionId)) {
      throw new EngineError(
        "duplicate_pool_question",
        `question_version_id repetido en el banco: ${question.questionVersionId}. ` +
          `Con duplicados la seleccion deja de ser reproducible.`,
      );
    }
    seenVersionIds.add(question.questionVersionId);
  }

  const sections = [...blueprint.sections].sort((a, b) => a.ord - b.ord);
  const usedQuestionIds = new Set<string>();
  const items: MaterializedItem[] = [];
  let ord = 0;

  for (const section of sections) {
    if (section.itemCount === 0) continue;

    const candidates = pool
      .filter((q) => !usedQuestionIds.has(q.questionId) && matchesSection(q, section))
      .sort(byVersionId);

    if (candidates.length < section.itemCount) {
      throw new InsufficientPoolError(
        section.ord,
        section.itemCount,
        candidates.length,
        describeSelection(section),
      );
    }

    const selectionRng = createRng(
      deriveStreamSeed(rootSeed, SEED_STREAM.sectionSelection, section.ord),
    );
    const chosen = selectionRng.sample(candidates, section.itemCount);

    const presented = blueprint.shuffleQuestions
      ? createRng(deriveStreamSeed(rootSeed, SEED_STREAM.sectionPresentation, section.ord)).shuffle(
          chosen,
        )
      : [...chosen].sort(byVersionId);

    for (const question of presented) {
      usedQuestionIds.add(question.questionId);
      ord += 1;
      const itemSeed = deriveItemSeed(rootSeed, ord);
      const maxPoints = section.pointsPerItem ?? question.maxPoints;

      let body: RenderedBody;
      let key: AnswerKey;
      let format: QuestionFormat = question.format;

      if (question.kind === "static") {
        body = sanitizeBody(question.body);
        key = question.answerSpec;
      } else {
        const params: Record<string, unknown> = { ...(question.body.paramSpec ?? {}) };
        if (params["locale"] === undefined && blueprint.locale !== undefined) {
          params["locale"] = blueprint.locale;
        }
        if (params["difficulty"] === undefined) {
          params["difficulty"] = question.difficulty;
        }
        const generated = registry.generate(question.body.engineKey, params, itemSeed);
        body = generated.body;
        key = generated.answerKey;
        // El formato real lo manda el generador: es quien decide el widget de
        // entrada. question_versions.format es solo la declaracion del banco.
        format = generated.format;
      }

      const shuffled = applyOptionShuffle(body, itemSeed, blueprint.shuffleOptions);

      items.push({
        ord,
        sectionOrd: section.ord,
        questionId: question.questionId,
        questionVersionId: question.questionVersionId,
        skillId: question.skillId,
        difficulty: question.difficulty,
        maxPoints,
        gradingMode: question.gradingMode,
        format,
        itemSeed,
        renderedBody: shuffled.body,
        optionOrder: shuffled.optionOrder,
        answerKey: key,
      });
    }
  }

  return items;
}

/** Puntuacion maxima del examen materializado. */
export function totalMaxPoints(items: readonly MaterializedItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.maxPoints, 0) * 10000) / 10000;
}
