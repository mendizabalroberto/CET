/**
 * Piezas puras: semilla, guardas, snapshot y corrección.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { isExamError } from "../errors";
import { canonicalAnswerText, gradeAttempt } from "../grade";
import {
  assertAttemptBelongsToStudent,
  assertAttemptsAvailable,
  assertWithinWindow,
  isExpired,
  remainingMs,
} from "../guards";
import { toPoolQuestions } from "../pool";
import { generateRootSeed, MAX_SEED } from "../seed";
import { buildSnapshot, normalizeSelection, readSnapshot } from "../snapshot";
import type { AttemptRow, GradingItemRow, PoolRow, ResponseRow } from "../types";
import { NOW, SCHOOL_ID, STUDENT_ID, assignment, blueprint, section } from "./fixtures";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return isExamError(error) ? error.code : `no-es-ExamError: ${String(error)}`;
  }
  return "no-lanzó";
}

/* -------------------------------------------------------------------------- */

describe("generateRootSeed", () => {
  it("siempre cae en [0, 2^53-1]", () => {
    for (let i = 0; i < 500; i += 1) {
      const seed = generateRootSeed();
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(MAX_SEED);
    }
  });

  it("el caso extremo (todos los bits a 1) no se sale del rango", () => {
    const seed = generateRootSeed(() => new Uint8Array([255, 255, 255, 255, 255, 255, 255]));
    expect(seed).toBe(MAX_SEED);
  });

  it("no repite: dos semillas seguidas son distintas", () => {
    const seeds = new Set(Array.from({ length: 200 }, () => generateRootSeed()));
    // Con 53 bits, 200 colisiones seguidas son imposibles salvo bug.
    expect(seeds.size).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */

describe("guardas de ventana y propiedad", () => {
  it("la ventana es [opens_at, closes_at): a la hora de cierre ya está cerrada", () => {
    const a = assignment();
    expect(() => assertWithinWindow(a, new Date("2026-05-04T08:00:00.000Z"))).not.toThrow();
    expect(codeOf(() => assertWithinWindow(a, new Date("2026-05-04T07:59:59.999Z")))).toBe(
      "window_not_open",
    );
    expect(codeOf(() => assertWithinWindow(a, new Date("2026-05-04T12:00:00.000Z")))).toBe(
      "window_closed",
    );
  });

  it("un intento ajeno o de otro colegio responde not_found, nunca forbidden", () => {
    const attempt = {
      id: "a1",
      student_id: STUDENT_ID,
      school_id: SCHOOL_ID,
      server_deadline_at: NOW.toISOString(),
    } as AttemptRow;

    expect(codeOf(() => assertAttemptBelongsToStudent(attempt, "otro", SCHOOL_ID))).toBe("not_found");
    expect(codeOf(() => assertAttemptBelongsToStudent(attempt, STUDENT_ID, "otro-colegio"))).toBe(
      "not_found",
    );
    expect(codeOf(() => assertAttemptBelongsToStudent(null, STUDENT_ID, SCHOOL_ID))).toBe("not_found");
  });

  it("el deadline no depende del reloj del cliente", () => {
    const attempt = { server_deadline_at: "2026-05-04T10:00:00.000Z" } as AttemptRow;
    expect(isExpired(attempt, new Date("2026-05-04T09:59:59.000Z"))).toBe(false);
    expect(isExpired(attempt, new Date("2026-05-04T10:00:01.000Z"))).toBe(true);
    expect(remainingMs(attempt, new Date("2026-05-04T11:00:00.000Z"))).toBe(0);
    expect(remainingMs(attempt, new Date("2026-05-04T09:59:00.000Z"))).toBe(60_000);
  });

  it("cuenta los intentos consumidos contra el máximo de la asignación", () => {
    expect(() => assertAttemptsAvailable(0, 1)).not.toThrow();
    expect(codeOf(() => assertAttemptsAvailable(1, 1))).toBe("max_attempts_reached");
    expect(codeOf(() => assertAttemptsAvailable(5, 3))).toBe("max_attempts_reached");
  });
});

/* -------------------------------------------------------------------------- */

describe("normalizeSelection", () => {
  it("TRADUCE snake_case a camelCase — sin esto el filtro se pierde en silencio", () => {
    const out = normalizeSelection(
      { skill_ids: ["s1", "s2"], question_kind: "generated", difficulty: { min: 2, max: 4 } },
      1,
    );
    expect(out).toEqual({
      skillIds: ["s1", "s2"],
      questionKind: "generated",
      difficulty: { min: 2, max: 4 },
    });
    // La forma que espera @cet/engine. Si se dejara `skill_ids`, Zod la
    // DESCARTARÍA y la sección saldría sin filtro de skill.
    expect(out["skill_ids"]).toBeUndefined();
  });

  it("acepta también la forma camelCase", () => {
    expect(normalizeSelection({ skillIds: ["s1"] }, 1)).toEqual({ skillIds: ["s1"] });
  });

  it("una selección vacía no filtra nada", () => {
    expect(normalizeSelection({}, 1)).toEqual({});
    expect(normalizeSelection(null, 1)).toEqual({});
  });

  it("una selección corrupta LANZA en vez de ignorarse", () => {
    expect(codeOf(() => normalizeSelection({ skill_ids: "s1" }, 1))).toBe("blueprint_invalid");
    expect(codeOf(() => normalizeSelection({ question_kind: "inventado" }, 1))).toBe("blueprint_invalid");
    expect(codeOf(() => normalizeSelection([], 1))).toBe("blueprint_invalid");
  });
});

describe("buildSnapshot", () => {
  it("descarta las secciones vacías y rechaza el blueprint sin ninguna útil", () => {
    expect(
      codeOf(() =>
        buildSnapshot({
          blueprint: blueprint(),
          sections: [section({ item_count: 0 })],
          blueprintVersion: 1,
          durationSeconds: 600,
          maxAttempts: 1,
        }),
      ),
    ).toBe("blueprint_invalid");
  });

  it("el snapshot se relee con la misma forma", () => {
    const snapshot = buildSnapshot({
      blueprint: blueprint(),
      sections: [section(), section({ ord: 2, item_count: 2 })],
      blueprintVersion: 3,
      durationSeconds: 900,
      maxAttempts: 2,
      locale: "es",
    });
    expect(readSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(snapshot.sections).toHaveLength(2);
    expect(snapshot.blueprintVersion).toBe(3);
  });

  it("un snapshot ilegible LANZA en vez de calcular la nota contra NaN", () => {
    expect(codeOf(() => readSnapshot({ blueprintId: "x" }))).toBe("internal");
  });
});

/* -------------------------------------------------------------------------- */

describe("toPoolQuestions", () => {
  const base: PoolRow = {
    question_id: "q1",
    kind: "generated",
    skill_id: "s1",
    version_id: "v1",
    format: "numeric",
    body: { engine_key: "math.fracop", param_spec: { max: 10 } },
    answer_spec: {},
    difficulty: 3,
    max_points: 1,
    grading_mode: "auto",
  };

  it("traduce engine_key/param_spec a la forma del motor", () => {
    const { pool } = toPoolQuestions([base]);
    expect(pool[0]).toMatchObject({
      kind: "generated",
      body: { engineKey: "math.fracop", paramSpec: { max: 10 } },
    });
  });

  it("una pregunta generada sin engine_key se DESCARTA, no revienta el examen", () => {
    const { pool, rejected } = toPoolQuestions([{ ...base, body: { nada: true } }]);
    expect(pool).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.questionId).toBe("q1");
  });
});

/* -------------------------------------------------------------------------- */

describe("gradeAttempt", () => {
  const choiceItem = (id: string, ord: number, points = 1): GradingItemRow => ({
    id,
    ord,
    answer_key: { type: "choice", correctIds: ["a"] },
    max_points: points,
    grading_mode: "auto",
  });

  const response = (itemId: string, selected: string, isFinal = true): ResponseRow => ({
    id: `r-${itemId}`,
    attempt_item_id: itemId,
    revision: 0,
    response: { type: "choice", selectedIds: [selected] },
    is_final: isFinal,
    server_ts: NOW.toISOString(),
  });

  it("un item sin respuesta puntúa 0 y NO se salta", () => {
    const result = gradeAttempt([choiceItem("i1", 1), choiceItem("i2", 2)], [response("i1", "a")], 50);
    expect(result.items).toHaveLength(2);
    expect(result.scoreRaw).toBe(1);
    expect(result.scoreMax).toBe(2);
    expect(result.items[1]?.pointsAwarded).toBe(0);
  });

  it("una revisión NO final se ignora: solo cuenta la última opinión", () => {
    const result = gradeAttempt([choiceItem("i1", 1)], [response("i1", "a", false)], 50);
    // Sin `is_final`, se corrige como respuesta en blanco.
    expect(result.scoreRaw).toBe(0);
  });

  it("una respuesta corrupta se corrige como blanco y no tumba el intento", () => {
    const corrupt: ResponseRow = {
      id: "r1",
      attempt_item_id: "i1",
      revision: 0,
      response: { type: "vete-a-saber" },
      is_final: true,
      server_ts: NOW.toISOString(),
    };
    const result = gradeAttempt([choiceItem("i1", 1), choiceItem("i2", 2)], [corrupt, response("i2", "a")], 50);
    expect(result.scoreRaw).toBe(1);
    expect(result.items[0]?.pointsAwarded).toBe(0);
  });

  it("un item manual queda pendiente y el intento en `grading`", () => {
    const manual: GradingItemRow = {
      id: "i2",
      ord: 2,
      answer_key: { type: "manual", rubric: { es: "R", en: "R" } },
      max_points: 2,
      grading_mode: "manual",
    };
    const result = gradeAttempt([choiceItem("i1", 1), manual], [response("i1", "a")], 50);

    expect(result.status).toBe("grading");
    expect(result.pendingManualReview).toBe(1);
    expect(result.items[1]?.requiresManualReview).toBe(true);
    expect(result.items[1]?.isCorrect).toBeNull();
    // Los puntos del item manual SÍ cuentan en el denominador: si no, la nota
    // provisional estaría inflada y cambiaría al corregirlo.
    expect(result.scoreMax).toBe(3);
  });

  it("un intento sin items no se califica: lanza en vez de dar un 0 silencioso", () => {
    expect(codeOf(() => gradeAttempt([], [], 50))).toBe("internal");
  });

  it("la nota nunca sale de [0, maxPoints] y el porcentaje se redondea a 2 decimales", () => {
    const result = gradeAttempt(
      [choiceItem("i1", 1), choiceItem("i2", 2), choiceItem("i3", 3)],
      [response("i1", "a")],
      50,
    );
    expect(result.scorePct).toBe(33.33);
    for (const item of result.items) {
      expect(item.pointsAwarded).toBeGreaterThanOrEqual(0);
      expect(item.pointsAwarded).toBeLessThanOrEqual(item.maxPoints);
    }
  });
});

describe("canonicalAnswerText", () => {
  it("devuelve una CADENA, jamás la clave cruda", () => {
    expect(canonicalAnswerText({ type: "choice", correctIds: ["a", "c"] })).toBe("a, c");
    expect(canonicalAnswerText({ type: "numeric", value: 1.75, canonical: "1,75" })).toBe("1,75");
    expect(canonicalAnswerText({ type: "ordering", correctOrder: ["a", "b"] })).toBe("a → b");
    expect(canonicalAnswerText({ type: "matching", pairs: [["a", "1"]] })).toBe("a → 1");
  });

  it("una clave manual no revela la rúbrica al alumno", () => {
    expect(canonicalAnswerText({ type: "manual", rubric: { es: "secreto", en: "secret" } })).toBeNull();
  });

  it("una clave ilegible devuelve null en vez de romper la revisión", () => {
    expect(canonicalAnswerText(null)).toBeNull();
    expect(canonicalAnswerText("qué")).toBeNull();
    expect(canonicalAnswerText({ type: "inventado" })).toBeNull();
  });
});
