/**
 * Doble en memoria del repositorio de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * NO es un mock que devuelve lo que le pidan: reproduce las CONSTRAINTS reales
 * de `0009_attempts.sql`, que es donde vive la mitad de la corrección de este
 * módulo.
 *
 *   · `unique (assignment_id, student_id, attempt_number)`
 *   · `unique (attempt_item_id, revision)`
 *   · el índice parcial UNIQUE `where is_final`
 *   · `attempt_gradings_current_uniq`
 *   · el UPDATE condicional de `claimSubmission`
 *
 * Un doble que aceptara dos `is_final` haría pasar un test sobre un código que
 * en producción reventaría contra el índice. El doble tiene que ser tan
 * estricto como Postgres o no prueba nada.
 */
import { UniqueViolation, type ExamRepository, type FinishGradingInput, type NewAttempt, type NewAttemptItem, type NewGrading, type NewResponse } from "../repository";
import type {
  AssignmentRow,
  AttemptRow,
  BlueprintRow,
  BlueprintSectionRow,
  GradingItemRow,
  GradingRow,
  PoolRow,
  ResponseRow,
  StudentItemRow,
} from "../types";

interface StoredItem {
  id: string;
  attempt_id: string;
  ord: number;
  section_ord: number | null;
  question_id: string;
  question_version_id: string;
  item_seed: number;
  rendered_body: unknown;
  option_order: number[] | null;
  answer_key: unknown;
  skill_id: string | null;
  difficulty: number | null;
  max_points: number;
  grading_mode: "auto" | "partial" | "manual";
}

export interface FakeRepoSeed {
  readonly assignments?: readonly AssignmentRow[];
  readonly blueprints?: readonly BlueprintRow[];
  readonly sections?: Readonly<Record<string, readonly BlueprintSectionRow[]>>;
  readonly pool?: readonly PoolRow[];
  /** `grading_mode` por `question_version_id`, para los items materializados. */
  readonly gradingModeByVersion?: Readonly<Record<string, "auto" | "partial" | "manual">>;
}

export class FakeExamRepository implements ExamRepository {
  readonly attempts: AttemptRow[] = [];
  readonly items: StoredItem[] = [];
  readonly responses: (ResponseRow & { attempt_id: string })[] = [];
  readonly gradings: (GradingRow & { attempt_id: string })[] = [];
  readonly heartbeats: string[] = [];

  /** Contadores para poder afirmar "no se creó un segundo intento". */
  insertAttemptCalls = 0;
  insertItemsCalls = 0;
  insertGradingsCalls = 0;

  /** Fallos inyectables, para probar los caminos de limpieza. */
  failInsertItems = false;

  private idCounter = 0;

  constructor(private readonly seed: FakeRepoSeed = {}) {}

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${String(this.idCounter).padStart(4, "0")}`;
  }

  /* --- Lectura ------------------------------------------------------------ */

  async findAssignmentVisibleToStudent(assignmentId: string): Promise<AssignmentRow | null> {
    return (this.seed.assignments ?? []).find((a) => a.id === assignmentId) ?? null;
  }

  async findBlueprint(blueprintId: string): Promise<BlueprintRow | null> {
    return (this.seed.blueprints ?? []).find((b) => b.id === blueprintId) ?? null;
  }

  async listBlueprintSections(blueprintId: string): Promise<BlueprintSectionRow[]> {
    return [...(this.seed.sections?.[blueprintId] ?? [])];
  }

  async listPool(): Promise<PoolRow[]> {
    return [...(this.seed.pool ?? [])];
  }

  async findAttempt(attemptId: string): Promise<AttemptRow | null> {
    return this.attempts.find((a) => a.id === attemptId) ?? null;
  }

  async findInProgressAttempt(assignmentId: string, studentId: string): Promise<AttemptRow | null> {
    return (
      this.attempts.find(
        (a) =>
          a.assignment_id === assignmentId &&
          a.student_id === studentId &&
          a.status === "in_progress",
      ) ?? null
    );
  }

  async countAttempts(assignmentId: string, studentId: string): Promise<number> {
    return this.attempts.filter(
      (a) => a.assignment_id === assignmentId && a.student_id === studentId && a.status !== "voided",
    ).length;
  }

  /**
   * La VISTA `attempt_items_student`. Se construye campo a campo a propósito:
   * si algún día alguien añadiera `answer_key` al `StudentItemRow`, este método
   * seguiría sin devolverla y el test de no-filtración seguiría siendo honesto.
   */
  async listStudentItems(attemptId: string): Promise<StudentItemRow[]> {
    return this.items
      .filter((i) => i.attempt_id === attemptId)
      .sort((a, b) => a.ord - b.ord)
      .map((i) => ({
        id: i.id,
        attempt_id: i.attempt_id,
        ord: i.ord,
        section_ord: i.section_ord,
        question_id: i.question_id,
        question_version_id: i.question_version_id,
        rendered_body: i.rendered_body,
        option_order: i.option_order,
        skill_id: i.skill_id,
        difficulty: i.difficulty,
        max_points: i.max_points,
      }));
  }

  async formatsForVersions(versionIds: readonly string[]): Promise<Map<string, string>> {
    const wanted = new Set(versionIds);
    return new Map(
      (this.seed.pool ?? [])
        .filter((q) => wanted.has(q.version_id))
        .map((q) => [q.version_id, q.format]),
    );
  }

  async listItemsForGrading(attemptId: string): Promise<GradingItemRow[]> {
    return this.items
      .filter((i) => i.attempt_id === attemptId)
      .sort((a, b) => a.ord - b.ord)
      .map((i) => ({
        id: i.id,
        ord: i.ord,
        answer_key: i.answer_key,
        max_points: i.max_points,
        grading_mode: i.grading_mode,
      }));
  }

  async findAttemptItem(attemptItemId: string): Promise<{ id: string; attempt_id: string; ord: number } | null> {
    const item = this.items.find((i) => i.id === attemptItemId);
    return item ? { id: item.id, attempt_id: item.attempt_id, ord: item.ord } : null;
  }

  async listResponses(attemptId: string): Promise<ResponseRow[]> {
    return this.responses
      .filter((r) => r.attempt_id === attemptId)
      .sort((a, b) => a.revision - b.revision)
      .map((r) => ({ ...r }));
  }

  async listGradings(attemptId: string): Promise<GradingRow[]> {
    return this.gradings.filter((g) => g.attempt_id === attemptId).map((g) => ({ ...g }));
  }

  /* --- Escritura ---------------------------------------------------------- */

  async insertAttempt(attempt: NewAttempt): Promise<AttemptRow> {
    this.insertAttemptCalls += 1;
    // `exam_attempts_uniq`.
    const clash = this.attempts.some(
      (a) =>
        a.assignment_id === attempt.assignmentId &&
        a.student_id === attempt.studentId &&
        a.attempt_number === attempt.attemptNumber,
    );
    if (clash) throw new UniqueViolation("exam_attempts_uniq");

    const row: AttemptRow = {
      id: this.nextId("attempt"),
      assignment_id: attempt.assignmentId,
      student_id: attempt.studentId,
      school_id: attempt.schoolId,
      attempt_number: attempt.attemptNumber,
      blueprint_snapshot: attempt.blueprintSnapshot,
      seed: attempt.seed,
      status: "in_progress",
      started_at: attempt.startedAt,
      server_deadline_at: attempt.serverDeadlineAt,
      submitted_at: null,
      graded_at: null,
      submitted_by: null,
      score_raw: null,
      score_max: null,
      score_pct: null,
      passed: null,
    };
    this.attempts.push(row);
    return row;
  }

  async insertItems(items: readonly NewAttemptItem[]): Promise<void> {
    this.insertItemsCalls += 1;
    if (this.failInsertItems) throw new Error("insertItems falló a propósito (test)");

    for (const item of items) {
      // `attempt_items_ord_uniq`.
      if (this.items.some((i) => i.attempt_id === item.attemptId && i.ord === item.ord)) {
        throw new UniqueViolation("attempt_items_ord_uniq");
      }
      this.items.push({
        id: this.nextId("item"),
        attempt_id: item.attemptId,
        ord: item.ord,
        section_ord: item.sectionOrd,
        question_id: item.questionId,
        question_version_id: item.questionVersionId,
        item_seed: item.itemSeed,
        rendered_body: item.renderedBody,
        option_order: item.optionOrder === null ? null : [...item.optionOrder],
        answer_key: item.answerKey,
        skill_id: item.skillId,
        difficulty: item.difficulty,
        max_points: item.maxPoints,
        grading_mode: this.seed.gradingModeByVersion?.[item.questionVersionId] ?? "auto",
      });
    }
  }

  async deleteAttempt(attemptId: string): Promise<void> {
    const index = this.attempts.findIndex((a) => a.id === attemptId);
    if (index >= 0) this.attempts.splice(index, 1);
    // CASCADE.
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      if (this.items[i]?.attempt_id === attemptId) this.items.splice(i, 1);
    }
  }

  async voidAttempt(attemptId: string): Promise<void> {
    this.replaceAttempt(attemptId, { status: "voided" });
  }

  async maxRevision(attemptItemId: string): Promise<number | null> {
    const revisions = this.responses
      .filter((r) => r.attempt_item_id === attemptItemId)
      .map((r) => r.revision);
    return revisions.length === 0 ? null : Math.max(...revisions);
  }

  async clearFinalFlag(attemptItemId: string): Promise<void> {
    for (let i = 0; i < this.responses.length; i += 1) {
      const row = this.responses[i];
      if (row && row.attempt_item_id === attemptItemId && row.is_final) {
        this.responses[i] = { ...row, is_final: false };
      }
    }
  }

  async insertResponse(response: NewResponse): Promise<ResponseRow> {
    // `attempt_responses_revision_uniq`.
    if (
      this.responses.some(
        (r) => r.attempt_item_id === response.attemptItemId && r.revision === response.revision,
      )
    ) {
      throw new UniqueViolation("attempt_responses_revision_uniq");
    }
    // `attempt_responses_final_uniq` (parcial, `where is_final`).
    if (this.responses.some((r) => r.attempt_item_id === response.attemptItemId && r.is_final)) {
      throw new UniqueViolation("attempt_responses_final_uniq");
    }

    const row: ResponseRow & { attempt_id: string } = {
      id: this.nextId("response"),
      attempt_id: response.attemptId,
      attempt_item_id: response.attemptItemId,
      revision: response.revision,
      response: response.response,
      is_final: true,
      server_ts: new Date(Date.now()).toISOString(),
    };
    this.responses.push(row);
    return { ...row };
  }

  async markResponseFinal(responseId: string): Promise<void> {
    const index = this.responses.findIndex((r) => r.id === responseId);
    const row = this.responses[index];
    if (!row) return;
    if (this.responses.some((r) => r.attempt_item_id === row.attempt_item_id && r.is_final)) {
      throw new UniqueViolation("attempt_responses_final_uniq");
    }
    this.responses[index] = { ...row, is_final: true };
  }

  async touchHeartbeat(_attemptId: string, at: string): Promise<void> {
    this.heartbeats.push(at);
  }

  async claimSubmission(
    attemptId: string,
    submittedAt: string,
    submittedBy: "student" | "timer",
  ): Promise<AttemptRow | null> {
    const attempt = this.attempts.find((a) => a.id === attemptId);
    // `where id = ? and status = 'in_progress'`: cero filas si otro ya cerró.
    if (!attempt || attempt.status !== "in_progress") return null;
    return this.replaceAttempt(attemptId, {
      status: "submitted",
      submitted_at: submittedAt,
      submitted_by: submittedBy,
    });
  }

  async insertGradings(rows: readonly NewGrading[]): Promise<void> {
    this.insertGradingsCalls += 1;
    for (const row of rows) {
      // `attempt_gradings_current_uniq`.
      if (this.gradings.some((g) => g.attempt_item_id === row.attemptItemId)) {
        throw new UniqueViolation("attempt_gradings_current_uniq");
      }
      this.gradings.push({
        attempt_id: row.attemptId,
        attempt_item_id: row.attemptItemId,
        points_awarded: row.pointsAwarded,
        max_points: row.maxPoints,
        is_correct: row.isCorrect,
        partial_ratio: row.partialRatio,
        rationale: row.rationale,
        graded_by: "auto",
      });
    }
  }

  async finishGrading(attemptId: string, input: FinishGradingInput): Promise<AttemptRow> {
    return this.replaceAttempt(attemptId, {
      status: input.status,
      score_raw: input.scoreRaw,
      score_max: input.scoreMax,
      score_pct: input.scorePct,
      passed: input.passed,
      graded_at: input.gradedAt,
    });
  }

  /* --- Utilidades para los tests ----------------------------------------- */

  private replaceAttempt(attemptId: string, patch: Partial<AttemptRow>): AttemptRow {
    const index = this.attempts.findIndex((a) => a.id === attemptId);
    const current = this.attempts[index];
    if (!current) throw new Error(`[fake] intento ${attemptId} inexistente`);
    const next = { ...current, ...patch } as AttemptRow;
    this.attempts[index] = next;
    return next;
  }

  /** Expone `answer_key` e `item_seed`, que la vista NO devuelve. Solo para asertos. */
  rawItems(attemptId: string): readonly StoredItem[] {
    return this.items.filter((i) => i.attempt_id === attemptId);
  }
}
