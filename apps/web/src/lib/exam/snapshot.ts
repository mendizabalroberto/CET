/**
 * `blueprint_snapshot`: congelar el examen en el momento de arrancarlo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * DATA_MODEL §6: "copia del blueprint tal cual estaba. Si mañana lo editan,
 * este intento sigue siendo interpretable". El snapshot es lo que se le pasa a
 * `materializeExam` en el arranque Y lo que se lee al corregir y al enseñar el
 * resultado: nunca se vuelve a consultar `exam_blueprints`, porque el profesor
 * pudo haberlo editado entre medias.
 *
 * ===========================================================================
 * LA TRADUCCIÓN QUE NO SE PUEDE OLVIDAR
 * ===========================================================================
 * `exam_blueprint_sections.selection` está en snake_case (`skill_ids`,
 * `question_kind`) porque es jsonb escrito por el panel de autoría, y el
 * esquema `sectionSelection` de @cet/engine está en camelCase (`skillIds`,
 * `questionKind`).
 *
 * Zod, con `z.object` no estricto, DESCARTA en silencio las claves que no
 * conoce. Es decir: pasarle `{skill_ids: [...]}` sin traducir no da error —
 * simplemente deja la sección SIN filtro de skill, y el examen sale con
 * preguntas de temas que no tocaban. Un fallo silencioso que nadie detecta
 * hasta que un padre pregunta por qué a su hijo le salió álgebra en un examen
 * de fracciones. De ahí que la traducción sea explícita y esté testeada.
 */
import { z } from "zod";
import type { FeedbackMode } from "@cet/shared";

import { ExamError } from "./errors";
import type { BlueprintRow, BlueprintSectionRow } from "./types";

/* -------------------------------------------------------------------------- */
/* Esquema del snapshot                                                       */
/* -------------------------------------------------------------------------- */

/**
 * El snapshot es un superconjunto de lo que `examBlueprint` de @cet/engine
 * necesita: lleva además lo que hace falta para CORREGIR y para ENSEÑAR el
 * resultado sin volver a mirar el blueprint vivo (`passThreshold`,
 * `feedbackMode`, `allowBack`, la duración efectiva y la versión asignada).
 */
export const snapshotSchema = z.object({
  blueprintId: z.string(),
  blueprintVersion: z.number().int(),
  courseId: z.string(),
  title: z.unknown(),
  durationSeconds: z.number().int().positive(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  allowBack: z.boolean(),
  feedbackMode: z.enum(["never", "after_submit", "immediate"]),
  passThreshold: z.number(),
  maxAttempts: z.number().int().positive(),
  locale: z.enum(["es", "en"]).optional(),
  sections: z.array(
    z.object({
      ord: z.number().int(),
      title: z.unknown(),
      itemCount: z.number().int().min(0),
      selection: z.record(z.unknown()),
      source: z.enum(["bank", "generated", "mixed"]),
      pointsPerItem: z.number().positive(),
    }),
  ),
});
export type BlueprintSnapshot = z.infer<typeof snapshotSchema>;

/* -------------------------------------------------------------------------- */
/* Traducción de `selection`                                                  */
/* -------------------------------------------------------------------------- */

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length === value.length ? out : undefined;
}

/**
 * snake_case (Postgres) -> camelCase (@cet/engine).
 *
 * Si una clave viene con una forma que no se reconoce, NO se ignora en
 * silencio: se lanza. Una selección corrupta significa un examen con preguntas
 * que no tocaban, y eso no puede pasar desapercibido.
 */
export function normalizeSelection(raw: unknown, sectionOrd: number): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExamError(
      "blueprint_invalid",
      `[exam] La sección ${sectionOrd} tiene una 'selection' que no es un objeto`,
    );
  }
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const skillIds = source["skill_ids"] ?? source["skillIds"];
  if (skillIds !== undefined) {
    const parsed = asStringArray(skillIds);
    if (!parsed) {
      throw new ExamError(
        "blueprint_invalid",
        `[exam] La sección ${sectionOrd} declara 'skill_ids' que no es un array de texto`,
      );
    }
    out["skillIds"] = parsed;
  }

  const difficulty = source["difficulty"];
  if (difficulty !== undefined) {
    // El CHECK `exam_blueprint_sections_difficulty_range` ya garantiza min<=max
    // y el rango 1..5; aquí solo se comprueba la FORMA, que el CHECK no cubre
    // si la fila llegó por service_role antes de esa migración.
    const d = difficulty as Record<string, unknown>;
    const min = Number(d["min"]);
    const max = Number(d["max"]);
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new ExamError(
        "blueprint_invalid",
        `[exam] La sección ${sectionOrd} declara un rango de dificultad ilegible`,
      );
    }
    out["difficulty"] = { min, max };
  }

  const questionKind = source["question_kind"] ?? source["questionKind"];
  if (questionKind !== undefined && questionKind !== null) {
    if (questionKind !== "static" && questionKind !== "generated") {
      throw new ExamError(
        "blueprint_invalid",
        `[exam] La sección ${sectionOrd} declara un 'question_kind' desconocido`,
      );
    }
    out["questionKind"] = questionKind;
  }

  const tags = source["tags"];
  if (tags !== undefined) {
    const parsed = asStringArray(tags);
    if (!parsed) {
      throw new ExamError(
        "blueprint_invalid",
        `[exam] La sección ${sectionOrd} declara 'tags' que no es un array de texto`,
      );
    }
    out["tags"] = parsed;
  }

  const engineKeys = source["engine_keys"] ?? source["engineKeys"];
  if (engineKeys !== undefined) {
    const parsed = asStringArray(engineKeys);
    if (!parsed) {
      throw new ExamError(
        "blueprint_invalid",
        `[exam] La sección ${sectionOrd} declara 'engine_keys' que no es un array de texto`,
      );
    }
    out["engineKeys"] = parsed;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Construcción                                                               */
/* -------------------------------------------------------------------------- */

export interface BuildSnapshotArgs {
  readonly blueprint: BlueprintRow;
  readonly sections: readonly BlueprintSectionRow[];
  readonly blueprintVersion: number;
  /** `time_limit_override_seconds` de la asignación, si lo hay. */
  readonly durationSeconds: number;
  readonly maxAttempts: number;
  readonly locale?: "es" | "en";
}

export function buildSnapshot(args: BuildSnapshotArgs): BlueprintSnapshot {
  const usable = args.sections
    .filter((section) => section.item_count > 0)
    .sort((a, b) => a.ord - b.ord);

  // `materializeExam` exige al menos una sección (`z.array(...).min(1)`), y con
  // razón: un examen de cero preguntas se entregaría solo, con `score_max = 0`,
  // y violaría el CHECK `exam_attempts_scores_sane`. Se corta ANTES de crear
  // nada, para que no quede un intento vacío en la base de datos.
  if (usable.length === 0) {
    throw new ExamError(
      "blueprint_invalid",
      `[exam] El blueprint ${args.blueprint.id} no tiene ninguna sección con preguntas`,
    );
  }

  const snapshot: BlueprintSnapshot = {
    blueprintId: args.blueprint.id,
    blueprintVersion: args.blueprintVersion,
    courseId: args.blueprint.course_id,
    title: args.blueprint.title,
    durationSeconds: args.durationSeconds,
    shuffleQuestions: args.blueprint.shuffle_questions,
    shuffleOptions: args.blueprint.shuffle_options,
    allowBack: args.blueprint.allow_back,
    feedbackMode: args.blueprint.feedback_mode,
    passThreshold: Number(args.blueprint.pass_threshold),
    maxAttempts: args.maxAttempts,
    ...(args.locale === undefined ? {} : { locale: args.locale }),
    sections: usable.map((section) => ({
      ord: section.ord,
      title: section.title,
      itemCount: section.item_count,
      selection: normalizeSelection(section.selection, section.ord),
      source: section.source,
      pointsPerItem: Number(section.points_per_item),
    })),
  };

  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Lectura defensiva                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Lee el snapshot de un intento ya existente.
 *
 * Se valida con Zod aunque lo haya escrito este mismo módulo: entre la
 * escritura y la lectura pasa una release, y un snapshot de hace seis meses
 * puede no tener la forma que el código de hoy espera. Sin esta validación, un
 * campo ausente saldría como `undefined` y el `passed` del alumno se calcularía
 * contra `NaN`.
 */
export function readSnapshot(raw: unknown): BlueprintSnapshot {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ExamError(
      "internal",
      `[exam] blueprint_snapshot ilegible: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** `feedback_mode` efectivo del intento. Sale del snapshot, nunca del blueprint vivo. */
export function feedbackModeOf(snapshot: BlueprintSnapshot): FeedbackMode {
  return snapshot.feedbackMode;
}
