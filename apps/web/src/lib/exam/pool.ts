/**
 * Del banco de preguntas al contrato de @cet/engine.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `materializeExam` no acepta filas de Postgres: acepta `PoolQuestion`, que es
 * camelCase, discriminado por `kind` y validado con Zod. Esta traducción es el
 * único sitio donde las dos formas se tocan.
 *
 * EL DETALLE QUE IMPORTA: `body` DE UNA PREGUNTA GENERADA
 * ---------------------------------------------------------------------------
 * DATA_MODEL §4 dice que para `kind = 'generated'` el cuerpo es
 * `{engine_key, param_spec}`. El motor espera `{engineKey, paramSpec}`. Se
 * aceptan las dos escrituras porque el panel de autoría (M07) todavía no
 * existe y el seed podría haber usado cualquiera de ellas; lo que NO se acepta
 * es una tercera cosa: si no hay `engine_key` legible, la pregunta se DESCARTA
 * del banco en vez de reventar la materialización del examen entero. Una
 * pregunta mal escrita por un profesor no puede impedir que treinta niños
 * hagan su examen — y si al descartarla el banco se queda corto,
 * `InsufficientPoolError` lo dirá con el número exacto que falta.
 */
import type { PoolRow } from "./types";

export interface PoolMappingResult {
  readonly pool: readonly unknown[];
  /** Preguntas descartadas por venir mal formadas, con el motivo. Va al log. */
  readonly rejected: readonly { readonly questionId: string; readonly reason: string }[];
}

function readGeneratedBody(body: unknown): { engineKey: string; paramSpec?: Record<string, unknown> } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const engineKey = record["engine_key"] ?? record["engineKey"];
  if (typeof engineKey !== "string" || engineKey.length === 0) return null;

  const paramSpec = record["param_spec"] ?? record["paramSpec"];
  if (paramSpec === undefined || paramSpec === null) return { engineKey };
  if (typeof paramSpec !== "object" || Array.isArray(paramSpec)) return null;
  return { engineKey, paramSpec: paramSpec as Record<string, unknown> };
}

export function toPoolQuestions(rows: readonly PoolRow[]): PoolMappingResult {
  const pool: unknown[] = [];
  const rejected: { questionId: string; reason: string }[] = [];

  for (const row of rows) {
    const common = {
      questionId: row.question_id,
      questionVersionId: row.version_id,
      skillId: row.skill_id,
      difficulty: row.difficulty,
      maxPoints: Number(row.max_points),
      gradingMode: row.grading_mode,
      format: row.format,
    };

    if (row.kind === "static") {
      // `body` y `answer_spec` los valida el propio motor con
      // `renderedBody`/`answerKey`; aquí no se duplica esa comprobación, solo
      // se cambia la forma.
      pool.push({ ...common, kind: "static", body: row.body, answerSpec: row.answer_spec });
      continue;
    }

    const generated = readGeneratedBody(row.body);
    if (!generated) {
      rejected.push({
        questionId: row.question_id,
        reason: "body de pregunta generada sin engine_key legible",
      });
      continue;
    }
    pool.push({
      ...common,
      kind: "generated",
      body:
        generated.paramSpec === undefined
          ? { engineKey: generated.engineKey }
          : { engineKey: generated.engineKey, paramSpec: generated.paramSpec },
    });
  }

  return { pool, rejected };
}
