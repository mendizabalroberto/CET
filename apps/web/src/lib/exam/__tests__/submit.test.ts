/**
 * Entrega y corrección autoritativa.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { autosaveAnswer } from "../autosave";
import { isExamError } from "../errors";
import { noopEventEmitter } from "../events";
import { getAttemptResult } from "../result";
import { startAttempt } from "../start";
import { submitAttempt } from "../submit";
import { FakeExamRepository } from "./fake-repo";
import {
  ASSIGNMENT_ID,
  BLUEPRINT_ID,
  NOW,
  OTHER_SCHOOL_ID,
  OTHER_STUDENT_ID,
  SCHOOL_ID,
  STUDENT_ID,
  assignment,
  blueprint,
  poolOf,
  poolWithManual,
  section,
} from "./fixtures";
import type { BlueprintRow, PoolRow } from "../types";

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(isExamError(error) ? error.code : error).toBe(code);
    return;
  }
  throw new Error(`Se esperaba un ExamError con code="${code}" y la promesa resolvió`);
}

interface Scenario {
  readonly repo: FakeExamRepository;
  readonly attemptId: string;
  readonly itemIds: readonly string[];
}

async function scenario(
  options: { pool?: PoolRow[]; blueprintOverrides?: Partial<BlueprintRow>; itemCount?: number } = {},
): Promise<Scenario> {
  const repo = new FakeExamRepository({
    assignments: [assignment()],
    blueprints: [blueprint(options.blueprintOverrides ?? {})],
    sections: { [BLUEPRINT_ID]: [section({ item_count: options.itemCount ?? 3 })] },
    pool: options.pool ?? poolOf(3),
    gradingModeByVersion: Object.fromEntries(
      (options.pool ?? poolOf(3)).map((q) => [q.version_id, q.grading_mode]),
    ),
  });

  const payload = await startAttempt(
    {
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
      userAgent: null,
      ipHash: null,
    },
    { repo, events: noopEventEmitter, now: NOW, generateSeed: () => 555_000 },
  );

  return { repo, attemptId: payload.attemptId, itemIds: payload.items.map((i) => i.id) };
}

async function answerItem(
  repo: FakeExamRepository,
  attemptId: string,
  attemptItemId: string,
  selected: string,
): Promise<void> {
  await autosaveAnswer(
    {
      attemptId,
      attemptItemId,
      response: { type: "choice", selectedIds: [selected] },
      clientTs: null,
      timeOnItemMs: 1000,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
    },
    { repo, events: noopEventEmitter, now: NOW },
  );
}

function submitDeps(repo: FakeExamRepository, now = NOW) {
  return { repo, events: noopEventEmitter, now };
}

const submitInput = (attemptId: string) =>
  ({
    attemptId,
    studentId: STUDENT_ID,
    schoolId: SCHOOL_ID,
    submittedBy: "student" as const,
  });

describe("submitAttempt", () => {
  it("UN ITEM SIN RESPONDER PUNTÚA 0 y sigue contando en score_max", async () => {
    const { repo, attemptId, itemIds } = await scenario();
    // Solo responde una de las tres. Las otras dos no se saltan: valen 0.
    await answerItem(repo, attemptId, itemIds[0] as string, "a");

    const result = await submitAttempt(submitInput(attemptId), submitDeps(repo));

    expect(result).toMatchObject({ scoreRaw: 1, scoreMax: 3, scorePct: 33.33, passed: false });
    expect(result.status).toBe("graded");

    const gradings = await repo.listGradings(attemptId);
    expect(gradings).toHaveLength(3);
    expect(gradings.filter((g) => g.points_awarded === 0)).toHaveLength(2);
  });

  it("un examen entero en blanco da 0, no un error", async () => {
    const { repo, attemptId } = await scenario();
    const result = await submitAttempt(submitInput(attemptId), submitDeps(repo));
    expect(result).toMatchObject({ scoreRaw: 0, scoreMax: 3, scorePct: 0, passed: false });
    expect((await repo.listGradings(attemptId))).toHaveLength(3);
  });

  it("DOBLE SUBMIT SIMULTÁNEO: una sola calificación", async () => {
    const { repo, attemptId, itemIds } = await scenario();
    for (const id of itemIds) await answerItem(repo, attemptId, id, "a");

    // El temporizador y el alumno pulsando a la vez.
    const [a, b] = await Promise.all([
      submitAttempt(submitInput(attemptId), submitDeps(repo)),
      submitAttempt({ ...submitInput(attemptId), submittedBy: "timer" }, submitDeps(repo)),
    ]);

    expect(a.scoreRaw).toBe(b.scoreRaw);
    expect(a.scorePct).toBe(b.scorePct);
    expect(a.attemptId).toBe(b.attemptId);
    // TRES calificaciones, una por item. Ni seis, ni un error.
    expect(await repo.listGradings(attemptId)).toHaveLength(3);
    expect(repo.attempts[0]?.status).toBe("graded");
  });

  it("DOBLE SUBMIT en serie: el segundo devuelve el resultado existente sin recalificar", async () => {
    const { repo, attemptId, itemIds } = await scenario();
    await answerItem(repo, attemptId, itemIds[0] as string, "a");

    const first = await submitAttempt(submitInput(attemptId), submitDeps(repo));
    const callsAfterFirst = repo.insertGradingsCalls;
    const second = await submitAttempt(submitInput(attemptId), submitDeps(repo));

    expect(second.scoreRaw).toBe(first.scoreRaw);
    expect(second.submittedAt).toBe(first.submittedAt);
    // Ni una inserción más: el camino rápido ni siquiera llega al UPDATE.
    expect(repo.insertGradingsCalls).toBe(callsAfterFirst);
  });

  it("`submitted_by` queda registrado y no se reescribe en la segunda llamada", async () => {
    const { repo, attemptId } = await scenario();
    const first = await submitAttempt(
      { ...submitInput(attemptId), submittedBy: "timer" },
      submitDeps(repo),
    );
    expect(first.submittedBy).toBe("timer");

    const second = await submitAttempt(submitInput(attemptId), submitDeps(repo));
    // La historia no se reescribe: lo cerró el temporizador y así se queda.
    expect(second.submittedBy).toBe("timer");
  });

  it("UN ITEM MANUAL no se autocalifica: el intento queda en `grading`", async () => {
    const pool = poolWithManual(3, 1);
    const { repo, attemptId, itemIds } = await scenario({ pool });
    for (const id of itemIds) await answerItem(repo, attemptId, id, "a");

    const result = await submitAttempt(submitInput(attemptId), submitDeps(repo));

    expect(result.status).toBe("grading");
    expect(result.pendingManualReview).toBe(1);
    expect(result.gradedAt).toBeNull();
    // La revisión NO se enseña con el intento a medio calificar, aunque
    // `feedback_mode` sea `after_submit`: media nota es peor que ninguna.
    expect(result.items).toBeNull();

    const gradings = await repo.listGradings(attemptId);
    const manual = gradings.find((g) => g.is_correct === null);
    expect(manual).toBeDefined();
    expect(manual?.points_awarded).toBe(0);
  });

  it("aprueba según el pass_threshold del SNAPSHOT", async () => {
    const { repo, attemptId, itemIds } = await scenario({
      blueprintOverrides: { pass_threshold: 60 },
    });
    await answerItem(repo, attemptId, itemIds[0] as string, "a");
    await answerItem(repo, attemptId, itemIds[1] as string, "a");

    const result = await submitAttempt(submitInput(attemptId), submitDeps(repo));
    // 2/3 = 66,67 % >= 60 %.
    expect(result.scorePct).toBe(66.67);
    expect(result.passed).toBe(true);
  });

  it("rechaza el intento de otro alumno y el de otro colegio con 404", async () => {
    const { repo, attemptId } = await scenario();
    await expectCode(
      submitAttempt({ ...submitInput(attemptId), studentId: OTHER_STUDENT_ID }, submitDeps(repo)),
      "not_found",
    );
    await expectCode(
      submitAttempt({ ...submitInput(attemptId), schoolId: OTHER_SCHOOL_ID }, submitDeps(repo)),
      "not_found",
    );
    expect(await repo.listGradings(attemptId)).toHaveLength(0);
  });

  it("rechaza un attemptId inexistente con 404", async () => {
    const { repo } = await scenario();
    await expectCode(
      submitAttempt(submitInput("00000000-0000-4000-8000-000000000000"), submitDeps(repo)),
      "not_found",
    );
  });

  it("no entrega un intento anulado", async () => {
    const { repo, attemptId } = await scenario();
    await repo.voidAttempt(attemptId);
    await expectCode(
      submitAttempt(submitInput(attemptId), submitDeps(repo)),
      "attempt_not_in_progress",
    );
  });

  it("HALLAZGO P2: recupera un intento con notas escritas pero SIN totales", async () => {
    // El caso: la petición ganadora murió entre `insertGradings` y
    // `finishGrading`. Antes, cada reintento chocaba con
    // `attempt_gradings_current_uniq`, salía por el atajo y NUNCA calificaba:
    // el alumno entregaba y no recibía nota jamás.
    const { repo, attemptId, itemIds } = await scenario();
    await answerItem(repo, attemptId, itemIds[0] as string, "a");
    await repo.claimSubmission(attemptId, NOW.toISOString(), "student");
    // Las notas ya están escritas; los totales no.
    await repo.insertGradings(
      itemIds.map((id, index) => ({
        attemptId,
        attemptItemId: id,
        pointsAwarded: index === 0 ? 1 : 0,
        maxPoints: 1,
        isCorrect: index === 0,
        partialRatio: index === 0 ? 1 : 0,
        rationale: null,
        rubricSnapshot: null,
      })),
    );

    const result = await submitAttempt(submitInput(attemptId), submitDeps(repo));

    expect(result.status).toBe("graded");
    expect(result.scoreRaw).toBe(1);
    expect(result.scoreMax).toBe(3);
    // Y sin duplicar ni una nota.
    expect(await repo.listGradings(attemptId)).toHaveLength(3);
  });

  it("recupera una entrega que se quedó a medias (submitted sin calificar)", async () => {
    const { repo, attemptId, itemIds } = await scenario();
    await answerItem(repo, attemptId, itemIds[0] as string, "a");
    // Simula el proceso muerto justo después del UPDATE condicional.
    await repo.claimSubmission(attemptId, NOW.toISOString(), "student");

    const result = await submitAttempt(submitInput(attemptId), submitDeps(repo));
    expect(result.status).toBe("graded");
    expect(result.scoreRaw).toBe(1);
  });
});

describe("feedback_mode", () => {
  it("`after_submit`: la revisión llega con la respuesta canónica", async () => {
    const { repo, attemptId, itemIds } = await scenario();
    await answerItem(repo, attemptId, itemIds[0] as string, "a");
    await submitAttempt(submitInput(attemptId), submitDeps(repo));

    const result = await getAttemptResult(
      { attemptId, studentId: STUDENT_ID, schoolId: SCHOOL_ID },
      { repo },
    );

    expect(result.items).toHaveLength(3);
    expect(result.items?.[0]?.correctAnswer).toBe("a");
    expect(result.items?.[0]?.isCorrect).toBe(true);
    expect(result.items?.[1]?.isCorrect).toBe(false);
  });

  it("`never`: ni revisión ni respuesta canónica, solo la nota", async () => {
    const { repo, attemptId, itemIds } = await scenario({
      blueprintOverrides: { feedback_mode: "never" },
    });
    await answerItem(repo, attemptId, itemIds[0] as string, "a");
    const submitted = await submitAttempt(submitInput(attemptId), submitDeps(repo));

    expect(submitted.items).toBeNull();
    expect(submitted.scoreRaw).not.toBeNull();

    const result = await getAttemptResult(
      { attemptId, studentId: STUDENT_ID, schoolId: SCHOOL_ID },
      { repo },
    );
    expect(result.items).toBeNull();
    // Ni por descuido en la serialización.
    expect(JSON.stringify(result)).not.toContain("correctIds");
  });

  it("un intento en curso no tiene resultado que enseñar", async () => {
    const { repo, attemptId } = await scenario();
    await expectCode(
      getAttemptResult({ attemptId, studentId: STUDENT_ID, schoolId: SCHOOL_ID }, { repo }),
      "attempt_not_submitted",
    );
  });

  it("el resultado de otro alumno responde 404", async () => {
    const { repo, attemptId } = await scenario();
    await submitAttempt(submitInput(attemptId), submitDeps(repo));
    await expectCode(
      getAttemptResult({ attemptId, studentId: OTHER_STUDENT_ID, schoolId: SCHOOL_ID }, { repo }),
      "not_found",
    );
  });
});
