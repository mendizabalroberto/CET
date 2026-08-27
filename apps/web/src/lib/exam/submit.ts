/**
 * `POST /api/attempts/[attemptId]/submit` — entrega y corrección autoritativa.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * IDEMPOTENCIA: DÓNDE ESTÁ DE VERDAD
 * ===========================================================================
 * El contrato del módulo cita tres capas contra el doble submit: botón
 * deshabilitado, token de idempotencia y `SELECT … FOR UPDATE`. "La única que
 * cuenta es la tercera; las otras dos son cortesía."
 *
 * PostgREST no expone transacciones entre llamadas, así que aquí la tercera
 * capa es un **UPDATE condicional**:
 *
 *     update exam_attempts set status='submitted' … where id=? and status='in_progress'
 *
 * Postgres ejecuta ese UPDATE bajo un lock de fila. De dos peticiones
 * simultáneas —el temporizador y el alumno pulsando a la vez— una casa y la
 * otra ve cero filas. La que pierde NO corrige: relee y devuelve el resultado
 * que escribió la ganadora. Exactamente la misma garantía que `FOR UPDATE`,
 * sin transacción explícita.
 *
 * Y por si acaso, una segunda red: el índice parcial
 * `attempt_gradings_current_uniq` impide dos notas vigentes para el mismo item.
 * Aunque dos procesos llegaran a corregir, solo uno persiste.
 *
 * ===========================================================================
 * `is_final` ANTES DE CORREGIR
 * ===========================================================================
 * El autosave ya deja marcada la última revisión de cada item. Se vuelve a
 * comprobar igualmente: si un autoguardado se quedó a medias (proceso cortado
 * entre `clearFinalFlag` e `insertResponse`), un item podría tener revisiones y
 * ninguna final, y se corregiría como respuesta en blanco un examen que el
 * alumno sí contestó. Eso no puede pasar por un fallo de infraestructura.
 */
import { ExamError } from "./errors";
import { SEQ_ATTEMPT_SUBMIT, type ExamEventEmitter } from "./events";
import { gradeAttempt } from "./grade";
import { assertAttemptBelongsToStudent, isExpired } from "./guards";
import { composeResult } from "./result";
import { UniqueViolation, type ExamRepository, type NewGrading } from "./repository";
import { readSnapshot } from "./snapshot";
import type { AttemptResultPayload, AttemptRow } from "./types";

export interface SubmitInput {
  readonly attemptId: string;
  /** SIEMPRE de la sesión. */
  readonly studentId: string;
  readonly schoolId: string;
  /**
   * `student` = pulsó Entregar. `timer` = lo cerró el deadline del SERVIDOR.
   * El cliente NO elige esto: lo decide la ruta según qué comprobación falló.
   */
  readonly submittedBy: "student" | "timer";
}

export interface SubmitDeps {
  readonly repo: ExamRepository;
  readonly events: ExamEventEmitter;
  readonly now: Date;
}

/**
 * Garantiza que cada item con respuestas tenga exactamente una `is_final`.
 * Devuelve `true` si tuvo que arreglar algo (solo para el log).
 */
async function ensureFinalResponses(repo: ExamRepository, attemptId: string): Promise<boolean> {
  const responses = await repo.listResponses(attemptId);
  const byItem = new Map<string, typeof responses>();
  for (const response of responses) {
    const bucket = byItem.get(response.attempt_item_id);
    if (bucket) bucket.push(response);
    else byItem.set(response.attempt_item_id, [response]);
  }

  let repaired = false;
  for (const [, group] of byItem) {
    if (group.some((r) => r.is_final)) continue;
    // La revisión más alta es la última opinión del alumno.
    const latest = group.reduce((best, current) => (current.revision > best.revision ? current : best));
    await repo.markResponseFinal(latest.id);
    repaired = true;
  }
  return repaired;
}

/**
 * Cierra un intento cuyas notas YA están escritas pero cuyos totales no.
 *
 * Recalcula desde `attempt_gradings`, que es la fuente autoritativa de la nota
 * de cada item (M10 §3: "los totales se recalculan enteros, nunca se ajustan a
 * mano"). No vuelve a corregir: corregir otra vez podría dar un resultado
 * distinto del que ya está persistido y firmado.
 */
async function finishFromExistingGradings(
  repo: ExamRepository,
  attempt: AttemptRow,
  passThreshold: number,
  now: Date,
): Promise<AttemptRow> {
  const gradings = await repo.listGradings(attempt.id);
  if (gradings.length === 0) {
    throw new ExamError("internal", `[exam] El intento ${attempt.id} no tiene calificaciones que sumar`);
  }

  const scoreRaw = Math.round(gradings.reduce((sum, g) => sum + Number(g.points_awarded), 0) * 100) / 100;
  const scoreMax = Math.round(gradings.reduce((sum, g) => sum + Number(g.max_points), 0) * 100) / 100;
  const scorePct = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 10000) / 100 : 0;
  const pending = gradings.filter((g) => g.is_correct === null && g.graded_by === "auto").length;
  const status = pending > 0 ? "grading" : "graded";

  return repo.finishGrading(attempt.id, {
    status,
    scoreRaw,
    scoreMax,
    scorePct,
    passed: scorePct >= passThreshold,
    gradedAt: status === "graded" ? now.toISOString() : null,
  });
}

export async function submitAttempt(
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<AttemptResultPayload> {
  const { repo, now } = deps;

  const attempt = assertAttemptBelongsToStudent(
    await repo.findAttempt(input.attemptId),
    input.studentId,
    input.schoolId,
  );

  // --- Estados terminales --------------------------------------------------
  if (attempt.status === "voided" || attempt.status === "abandoned") {
    // Un intento anulado por un profesor no se entrega ni se corrige. Devolver
    // "resultado" aquí daría una nota a algo que se decidió que no cuenta.
    throw new ExamError("attempt_not_in_progress", `El intento está ${attempt.status}`, {
      attemptId: attempt.id,
    });
  }

  // Ya calificado (o esperando a un profesor): DEVOLVER lo que hay. Esta es la
  // idempotencia vista desde el camino rápido — el doble clic normal ni
  // siquiera llega al UPDATE condicional.
  if (attempt.status === "grading" || attempt.status === "graded") {
    return composeResult(attempt, repo);
  }

  // --- La carrera ----------------------------------------------------------
  // HALLAZGO DE LA PASADA 2. Quién cierra el intento lo decide el SERVIDOR
  // comparando el deadline con su propio reloj, y se decide AQUÍ —después de
  // comprobar la propiedad— y no en la Route Handler. Antes la ruta leía el
  // intento con service_role solo para mirar su deadline, es decir, cargaba en
  // memoria la fila de un alumno cualquiera antes de saber si era suyo.
  //
  // Si el llamante ya pidió `timer` (la entrega automática desde `/answer`), se
  // respeta. Lo que no puede pasar es lo contrario: que una entrega fuera de
  // plazo se registre como `student`.
  const submittedBy: "student" | "timer" =
    input.submittedBy === "timer" || isExpired(attempt, now) ? "timer" : "student";

  let working: AttemptRow;
  if (attempt.status === "in_progress") {
    const claimed = await repo.claimSubmission(attempt.id, now.toISOString(), submittedBy);
    if (!claimed) {
      // Perdimos: otro proceso lo cerró entre nuestro SELECT y nuestro UPDATE.
      const fresh = await repo.findAttempt(attempt.id);
      if (!fresh) throw new ExamError("not_found", "El intento ha desaparecido durante la entrega");
      if (fresh.status === "grading" || fresh.status === "graded") {
        return composeResult(fresh, repo);
      }
      // Está en `submitted`: la ganadora está corrigiendo ahora mismo, o murió
      // a mitad. Se sigue adelante; el índice único de `attempt_gradings`
      // decidirá cuál de las dos persiste.
      working = fresh;
    } else {
      working = claimed;
    }
  } else {
    // `submitted` sin corregir: recuperación de una entrega que se quedó a
    // medias. Se retoma desde la corrección sin volver a marcar `submitted_at`,
    // que ya es historia y no se reescribe.
    working = attempt;
  }

  // --- Corrección ----------------------------------------------------------
  const snapshot = readSnapshot(working.blueprint_snapshot);

  const repaired = await ensureFinalResponses(repo, working.id);
  if (repaired) {
    console.warn(`[exam] Intento ${working.id}: se marcó is_final en revisiones huérfanas`);
  }

  const [items, responses] = await Promise.all([
    repo.listItemsForGrading(working.id),
    repo.listResponses(working.id),
  ]);

  const result = gradeAttempt(items, responses, snapshot.passThreshold);

  const gradingRows: NewGrading[] = result.items.map((item) => ({
    attemptId: working.id,
    attemptItemId: item.attemptItemId,
    pointsAwarded: item.pointsAwarded,
    maxPoints: item.maxPoints,
    // `null` en un item pendiente de un humano: "todavía no se sabe" no es
    // "incorrecto", y un `false` aquí se convertiría en un suspenso en cualquier
    // informe que cuente aciertos.
    isCorrect: item.requiresManualReview ? null : item.isCorrect,
    partialRatio: item.partialRatio,
    rationale: item.rationale === "" ? null : item.rationale,
    rubricSnapshot: item.rubricSnapshot,
  }));

  try {
    await repo.insertGradings(gradingRows);
  } catch (cause) {
    if (cause instanceof UniqueViolation) {
      // La otra petición ya insertó las notas. No se insiste ni se duplica.
      //
      // HALLAZGO DE LA PASADA 2: aquí ANTES se devolvía el resultado y punto.
      // Pero si la petición ganadora murió entre `insertGradings` y
      // `finishGrading`, el intento se quedaba en `submitted` sin nota PARA
      // SIEMPRE: cada reintento volvía a chocar con el índice único y volvía a
      // salir por aquí sin avanzar. El alumno entregaba y no recibía nota nunca.
      //
      // Ahora se cierra el ciclo: si sigue sin calificar, se recalculan los
      // totales a partir de las notas que YA están escritas (que son las
      // autoritativas) y se termina.
      const fresh = await repo.findAttempt(working.id);
      if (!fresh) throw cause;
      if (fresh.status === "grading" || fresh.status === "graded") {
        return composeResult(fresh, repo);
      }
      return composeResult(await finishFromExistingGradings(repo, fresh, snapshot.passThreshold, now), repo);
    }
    throw cause;
  }

  const finished = await repo.finishGrading(working.id, {
    status: result.status,
    scoreRaw: result.scoreRaw,
    scoreMax: result.scoreMax,
    scorePct: result.scorePct,
    passed: result.passed,
    // `graded_at` SOLO cuando de verdad está calificado. El CHECK
    // `exam_attempts_graded_has_score` exige que un intento `graded` lo tenga, y
    // ponerlo en un intento que espera a un profesor mentiría sobre el estado.
    gradedAt: result.status === "graded" ? now.toISOString() : null,
  });

  await deps.events.emit(input.schoolId, input.studentId, [
    {
      eventType: "attempt_submitted",
      attemptId: working.id,
      seq: SEQ_ATTEMPT_SUBMIT,
      payload: {
        submittedBy,
        scorePct: result.scorePct,
        passed: result.passed,
        itemCount: items.length,
        pendingManualReview: result.pendingManualReview,
      },
    },
  ]);

  return composeResult(finished, repo);
}
