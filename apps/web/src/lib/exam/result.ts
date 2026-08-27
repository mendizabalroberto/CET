/**
 * `GET /api/attempts/[attemptId]/result` — la nota y, si procede, la revisión.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * `feedback_mode` NO ES UNA PREFERENCIA DE INTERFAZ
 * ===========================================================================
 * Es una regla de seguridad. Con `never`, el enunciado, la respuesta canónica y
 * el desglose por pregunta NO salen de este servidor — da igual lo que pida el
 * cliente. Un examen que se reutiliza en tres clases distintas a lo largo de la
 * semana se filtra entero si la primera clase puede exportar la revisión.
 *
 * Y se lee del `blueprint_snapshot` del INTENTO, no de `exam_blueprints`: si el
 * profesor cambia el blueprint a `after_submit` mañana, este intento sigue
 * rigiéndose por lo que se le prometió al alumno cuando lo hizo.
 *
 * ===========================================================================
 * DOS CONDICIONES, NO UNA
 * ===========================================================================
 * La revisión se emite si `feedback_mode` la permite **Y** el intento está
 * `graded`. Un intento en `grading` (esperando corrección humana) no enseña
 * nada por pregunta: la mitad de las notas todavía no existen, y enseñar medio
 * examen corregido es peor que no enseñar nada.
 */
import { ExamError } from "./errors";
import { assertAttemptBelongsToStudent } from "./guards";
import { canonicalAnswerText } from "./grade";
import type { ExamRepository } from "./repository";
import { readSnapshot } from "./snapshot";
import type { AttemptResultPayload, AttemptRow, ItemReviewPayload } from "./types";

export interface ResultInput {
  readonly attemptId: string;
  /** SIEMPRE de la sesión. */
  readonly studentId: string;
  readonly schoolId: string;
}

export interface ResultDeps {
  readonly repo: ExamRepository;
}

/**
 * Compone el resultado de un intento YA verificado como propio del alumno.
 *
 * Se exporta para que `submit.ts` devuelva exactamente el mismo cuerpo que
 * `GET result`: si fueran dos composiciones distintas, tarde o temprano una de
 * las dos filtraría un campo que la otra oculta.
 */
export async function composeResult(
  attempt: AttemptRow,
  repo: ExamRepository,
): Promise<AttemptResultPayload> {
  const snapshot = readSnapshot(attempt.blueprint_snapshot);
  const feedbackMode = snapshot.feedbackMode;

  // Planos en la raíz y nullables uno a uno: mientras el intento no esté
  // calificado son `null`, y `null` no es lo mismo que 0. Un 0 aquí sería un
  // suspenso inventado por la capa de transporte.
  const score = {
    scoreRaw: attempt.score_raw === null ? null : Number(attempt.score_raw),
    scoreMax: attempt.score_max === null ? null : Number(attempt.score_max),
    scorePct: attempt.score_pct === null ? null : Number(attempt.score_pct),
    passed: attempt.passed,
  };

  const gradings = await repo.listGradings(attempt.id);
  // Un item calificado sin `is_correct` y con 0 puntos es, por construcción de
  // `grade.ts`, uno pendiente de un profesor.
  const pendingManualReview = gradings.filter(
    (g) => g.is_correct === null && g.graded_by === "auto",
  ).length;

  const canReview = feedbackMode !== "never" && attempt.status === "graded";
  if (!canReview) {
    return {
      attemptId: attempt.id,
      status: attempt.status,
      submittedAt: attempt.submitted_at,
      submittedBy: attempt.submitted_by,
      gradedAt: attempt.graded_at,
      feedbackMode,
      ...score,
      pendingManualReview,
      items: null,
    };
  }

  // A partir de aquí, y SOLO a partir de aquí, se lee la clave congelada — y ni
  // siquiera se serializa: se convierte en una cadena legible
  // (`canonicalAnswerText`). La `answer_key` cruda no sale de este proceso.
  const [items, responses] = await Promise.all([
    repo.listItemsForGrading(attempt.id),
    repo.listResponses(attempt.id),
  ]);

  const gradingByItem = new Map(gradings.map((g) => [g.attempt_item_id, g]));
  const finalByItem = new Map(
    responses.filter((r) => r.is_final).map((r) => [r.attempt_item_id, r]),
  );
  const studentItems = await repo.listStudentItems(attempt.id);
  const bodyByItem = new Map(studentItems.map((i) => [i.id, i]));

  const review: ItemReviewPayload[] = items.map((item) => {
    const grading = gradingByItem.get(item.id);
    const body = bodyByItem.get(item.id);
    const requiresManualReview = grading ? grading.is_correct === null && grading.graded_by === "auto" : false;

    return {
      attemptItemId: item.id,
      ord: item.ord,
      renderedBody: body ? body.rendered_body : null,
      optionOrder: body ? body.option_order : null,
      response: finalByItem.get(item.id)?.response ?? null,
      pointsAwarded: grading ? Number(grading.points_awarded) : 0,
      maxPoints: Number(item.max_points),
      isCorrect: grading ? grading.is_correct : null,
      partialRatio: grading && grading.partial_ratio !== null ? Number(grading.partial_ratio) : null,
      rationale: grading ? grading.rationale : null,
      // Nunca para un item pendiente de corrección humana: enseñar la rúbrica
      // antes de que el profesor la aplique es enseñarle el examen al alumno.
      correctAnswer: requiresManualReview ? null : canonicalAnswerText(item.answer_key),
      requiresManualReview,
    };
  });

  return {
    attemptId: attempt.id,
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    submittedBy: attempt.submitted_by,
    gradedAt: attempt.graded_at,
    feedbackMode,
    ...score,
    pendingManualReview,
    items: review.sort((a, b) => a.ord - b.ord),
  };
}

export async function getAttemptResult(
  input: ResultInput,
  deps: ResultDeps,
): Promise<AttemptResultPayload> {
  const attempt = assertAttemptBelongsToStudent(
    await deps.repo.findAttempt(input.attemptId),
    input.studentId,
    input.schoolId,
  );

  if (attempt.status === "in_progress") {
    // No hay resultado que enseñar y no se puede fingir uno: el alumno todavía
    // está haciendo el examen (probablemente en otra pestaña).
    throw new ExamError("attempt_not_submitted", "El intento aún no se ha entregado", {
      attemptId: attempt.id,
    });
  }

  return composeResult(attempt, deps.repo);
}
