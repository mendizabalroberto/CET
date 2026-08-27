/**
 * CONTRATO DEL MOTOR (@cet/engine).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este fichero define la frontera entre el motor y todo lo demás. El motor se
 * ejecuta en DOS contextos (AD-5/AD-6):
 *
 *   - Práctica  -> en el navegador. Feedback inmediato, tolerante a red caída.
 *   - Examen    -> en el servidor. La clave nunca sale de la base de datos.
 *
 * Una sola implementación, dos contextos. Si estas dos rutas divergen, el sistema
 * miente al alumno; por eso el contrato vive aquí y no dentro del motor.
 *
 * INVARIANTE CENTRAL — DETERMINISMO
 *   generate(engineKey, params, seed) debe devolver SIEMPRE el mismo resultado.
 *   Sin esto, un examen no se puede reconstruir y el principio rector del
 *   MASTER_PLAN se rompe. El paquete @cet/engine DEBE incluir un test de
 *   propiedad que lo verifique sobre todos los generadores registrados.
 */

import { z } from "zod";
import { i18nText } from "./i18n.js";
import { questionFormat, gradingMode } from "./enums.js";

/** Identificador de generador: `<materia>.<familia>`, p.ej. `math.fracop`. */
export const engineKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, "engineKey debe ser `materia.familia`");
export type EngineKey = z.infer<typeof engineKey>;

/** Semilla de 53 bits: entero seguro en JS y cabe en un bigint de Postgres. */
export const seed = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export type Seed = z.infer<typeof seed>;

/* -------------------------------------------------------------------------- */
/* Enunciado renderizado                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Lo que el alumno ve, literal. Se persiste tal cual en `attempt_items.rendered_body`.
 *
 * `stem` es HTML restringido: los trainers Y6A usan <b>, <i>, <u>, <br>, <span class="f">
 * para fracciones y <sub>/<sup>. Debe sanearse con una allowlist ANTES de renderizar.
 * Nunca usar dangerouslySetInnerHTML sin pasar por el sanitizador de @cet/ui.
 */
export const renderedBody = z.object({
  stem: z.string().min(1),
  /** Opciones ya en su orden final. `option_order` guarda la permutación aplicada. */
  options: z.array(z.object({ id: z.string(), html: z.string() })).optional(),
  /** SVG inline para los "labs" (compound shapes, circuitos, mapas). Saneado igual que stem. */
  figureSvg: z.string().optional(),
  /** Texto de ayuda para lectores de pantalla cuando hay figura. Obligatorio si hay figureSvg. */
  figureAlt: i18nText.optional(),
  /** Unidad esperada ("cm", "kg") que la UI muestra junto al input. */
  unit: z.string().optional(),
  placeholder: z.string().optional(),
});
export type RenderedBody = z.infer<typeof renderedBody>;

/* -------------------------------------------------------------------------- */
/* Clave de respuesta — NUNCA cruza al cliente en modo examen                  */
/* -------------------------------------------------------------------------- */

/**
 * `canonical` es la respuesta de referencia mostrada en la revisión.
 * `accepts` describe cómo comparar: el caso Math exige que 7/4, 1 3/4 y 1.75
 * sean la MISMA respuesta correcta (así funciona `parseAns` en los trainers Y6A).
 */
export const answerKey = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    correctIds: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal("numeric"),
    value: z.number(),
    tolerance: z.number().nonnegative().default(0),
    canonical: z.string(),
  }),
  z.object({
    type: z.literal("fraction"),
    numerator: z.number().int(),
    denominator: z.number().int().positive(),
    /** Si true, `2/4` se considera incorrecta aunque valga lo mismo que `1/2`. */
    requireSimplest: z.boolean().default(false),
    canonical: z.string(),
  }),
  z.object({
    type: z.literal("text"),
    accepted: z.array(z.string()).min(1),
    caseSensitive: z.boolean().default(false),
    /** Ignora tildes al comparar. Necesario para Español. */
    ignoreDiacritics: z.boolean().default(false),
    canonical: z.string(),
  }),
  z.object({
    type: z.literal("ordering"),
    correctOrder: z.array(z.string()).min(2),
  }),
  z.object({
    type: z.literal("matching"),
    pairs: z.array(z.tuple([z.string(), z.string()])).min(1),
  }),
  z.object({
    type: z.literal("manual"),
    rubric: i18nText,
  }),
]);
export type AnswerKey = z.infer<typeof answerKey>;

/** La respuesta del alumno, tal cual se persiste en `attempt_responses.response`. */
export const studentResponse = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), selectedIds: z.array(z.string()) }),
  z.object({ type: z.literal("text"), value: z.string() }),
  z.object({ type: z.literal("ordering"), order: z.array(z.string()) }),
  z.object({ type: z.literal("matching"), pairs: z.array(z.tuple([z.string(), z.string()])) }),
  z.object({ type: z.literal("empty") }),
]);
export type StudentResponse = z.infer<typeof studentResponse>;

/* -------------------------------------------------------------------------- */
/* Item generado                                                              */
/* -------------------------------------------------------------------------- */

export const generatedItem = z.object({
  engineKey,
  seed,
  params: z.record(z.unknown()),
  format: questionFormat,
  body: renderedBody,
  answerKey,
  hint: i18nText.optional(),
  /** El `sol:` de los trainers Y6A: la explicación paso a paso. */
  solution: i18nText.optional(),
  difficulty: z.number().int().min(1).max(5),
  maxPoints: z.number().positive().default(1),
  gradingMode,
  skillCode: z.string(),
});
export type GeneratedItem = z.infer<typeof generatedItem>;

/* -------------------------------------------------------------------------- */
/* Resultado de corrección                                                    */
/* -------------------------------------------------------------------------- */

export const gradingResult = z.object({
  isCorrect: z.boolean(),
  pointsAwarded: z.number().min(0),
  maxPoints: z.number().positive(),
  /** 0..1 — para preguntas con crédito parcial (ordering, matching, mcq_multi). */
  partialRatio: z.number().min(0).max(1),
  /** Por qué se dio esa nota. Se guarda en `attempt_gradings.rationale`. */
  rationale: z.string().optional(),
  /** true cuando la corrección no es automatizable y espera a un profesor. */
  requiresManualReview: z.boolean().default(false),
});
export type GradingResult = z.infer<typeof gradingResult>;

/* -------------------------------------------------------------------------- */
/* Interfaz que implementa cada generador                                     */
/* -------------------------------------------------------------------------- */

export interface QuestionGenerator<TParams = Record<string, unknown>> {
  readonly key: EngineKey;
  /** Esquema de los parámetros. Se valida ANTES de generar, siempre. */
  readonly paramsSchema: z.ZodType<TParams>;
  readonly skillCode: string;
  readonly format: QuestionFormatValue;
  /** DEBE ser puro y determinista respecto de (params, seed). Sin Math.random ni Date.now. */
  generate(params: TParams, seed: Seed): GeneratedItem;
}

type QuestionFormatValue = z.infer<typeof questionFormat>;

/** Corrección. Pura, determinista, sin efectos. */
export type Grader = (response: StudentResponse, key: AnswerKey, maxPoints: number) => GradingResult;

/* -------------------------------------------------------------------------- */
/* Derivación de semillas                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Un intento tiene UNA semilla raíz (`exam_attempts.seed`). La de cada item se
 * deriva de ella y de su posición, de forma determinista.
 *
 * Consecuencia: guardar un único bigint permite regenerar el examen completo,
 * y dos alumnos con semillas distintas reciben exámenes distintos (requisito
 * de "exámenes aleatorios distintos por estudiante") sin perder reproducibilidad.
 *
 * La implementación real vive en @cet/engine; la firma se congela aquí.
 */
export type DeriveItemSeed = (rootSeed: Seed, ord: number) => Seed;
