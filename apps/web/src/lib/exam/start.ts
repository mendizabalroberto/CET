/**
 * `POST /api/attempts/start` — arrancar o REANUDAR un intento.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA FRASE QUE DEFINE ESTE FICHERO
 * ===========================================================================
 * "Si ya existe un intento `in_progress`, lo devuelve. No crea uno nuevo."
 *
 * Ese único comportamiento resuelve TRES casos distintos que parecen tres
 * problemas y son uno solo:
 *   · se cayó la red y el alumno recarga  -> mismas preguntas, mismas respuestas
 *   · el alumno abre una segunda pestaña  -> un solo examen, no dos
 *   · doble clic en "Empezar"             -> un solo intento consumido
 *
 * ===========================================================================
 * EL ORDEN DE LOS PASOS NO ES CASUAL
 * ===========================================================================
 * Se materializa ANTES de insertar nada. `materializeExam` es pura y puede
 * lanzar (`InsufficientPoolError`, generador desconocido, `param_spec`
 * inválido); si se hiciera después del INSERT del intento, cada banco mal
 * configurado dejaría un intento huérfano consumiendo una de las oportunidades
 * del alumno. Materializando primero, el caso "el banco no llega" no toca la
 * base de datos en absoluto.
 *
 * Y aun así hay red de seguridad: si el INSERT de los items falla después del
 * INSERT del intento (PostgREST no da transacciones entre llamadas), el intento
 * se BORRA; si el borrado también falla, se marca `voided`. Un intento sin
 * items no puede sobrevivir a esta función.
 */
import { InsufficientPoolError, EngineError, materializeExam } from "@cet/engine";

import { ExamError } from "./errors";
import { SEQ_ATTEMPT_START, type ExamEventEmitter } from "./events";
import {
  assertAttemptsAvailable,
  assertWithinWindow,
  isExpired,
  remainingMs,
} from "./guards";
import { toPoolQuestions } from "./pool";
import { UniqueViolation, type ExamRepository, type NewAttemptItem } from "./repository";
import { buildSnapshot, readSnapshot, type BlueprintSnapshot } from "./snapshot";
import type {
  AttemptRow,
  ResponseRow,
  StartAttemptPayload,
  StudentItemPayload,
  StudentItemRow,
} from "./types";
import { generateRootSeed } from "./seed";

export interface StartAttemptInput {
  readonly assignmentId: string;
  /** SIEMPRE de la sesión. Nunca del cuerpo de la petición. */
  readonly studentId: string;
  readonly schoolId: string;
  readonly userAgent: string | null;
  /** sha256(ip + sal). Nunca la IP en claro: son datos de menores. */
  readonly ipHash: string | null;
  readonly locale?: "es" | "en";
}

export interface StartAttemptDeps {
  readonly repo: ExamRepository;
  readonly events: ExamEventEmitter;
  readonly now: Date;
  /** Inyectable para que los tests puedan fijar la semilla y comprobar el determinismo. */
  readonly generateSeed?: () => number;
}

/**
 * Ventana mínima que debe quedar para permitir arrancar.
 *
 * Ver la nota sobre el recorte del deadline más abajo: arrancar a falta de tres
 * segundos daría un examen de tres segundos, que es una nota de 0 disfrazada de
 * examen. Es más honesto decir que la ventana ya está cerrada.
 */
export const MIN_START_WINDOW_MS = 60_000;

/* -------------------------------------------------------------------------- */

function toStudentItems(
  items: readonly StudentItemRow[],
  responses: readonly ResponseRow[],
  formats: ReadonlyMap<string, string>,
): StudentItemPayload[] {
  const finalByItem = new Map<string, ResponseRow>();
  for (const response of responses) {
    if (response.is_final) finalByItem.set(response.attempt_item_id, response);
  }

  return items.map((item) => {
    const saved = finalByItem.get(item.id);
    return {
      id: item.id,
      ord: item.ord,
      sectionOrd: item.section_ord,
      maxPoints: Number(item.max_points),
      difficulty: item.difficulty,
      questionId: item.question_id,
      questionVersionId: item.question_version_id,
      skillId: item.skill_id,
      format: formats.get(item.question_version_id) ?? null,
      renderedBody: item.rendered_body,
      optionOrder: item.option_order,
      // Hidratación tras una recarga: el alumno recupera lo que ya había
      // contestado. Sin esto, "se me ha caído la red" significa "empiezo otra
      // vez", que es exactamente lo que el modelo append-only evita.
      savedResponse: saved ? saved.response : null,
      savedRevision: saved ? saved.revision : null,
    };
  });
}

async function buildPayload(
  attempt: AttemptRow,
  snapshot: BlueprintSnapshot,
  deps: StartAttemptDeps,
  resumed: boolean,
): Promise<StartAttemptPayload> {
  const [items, responses] = await Promise.all([
    deps.repo.listStudentItems(attempt.id),
    deps.repo.listResponses(attempt.id),
  ]);

  // Un intento sin items es un estado que esta función se compromete a no
  // producir. Si aparece, es la carrera de dos pestañas: la otra acaba de
  // insertar el intento y todavía no ha escrito los items. Reintentable.
  if (items.length === 0) {
    throw new ExamError("attempt_starting", "El intento aún se está materializando", {
      attemptId: attempt.id,
    });
  }

  const formats = await deps.repo.formatsForVersions(items.map((i) => i.question_version_id));

  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attempt_number,
    status: attempt.status,
    startedAt: attempt.started_at,
    resumed,
    allowBack: snapshot.allowBack,
    feedbackMode: snapshot.feedbackMode,
    durationSeconds: snapshot.durationSeconds,
    // Los tres datos del reloj. El cliente necesita `serverNow` para medir su
    // propio desfase: sin él, un portátil con la hora adelantada pintaría un
    // cronómetro en negativo y el niño creería que ha perdido el examen.
    serverNow: deps.now.toISOString(),
    serverDeadlineAt: attempt.server_deadline_at,
    remainingMs: remainingMs(attempt, deps.now),
    items: toStudentItems(items, responses, formats),
  };
}

/* -------------------------------------------------------------------------- */

export async function startAttempt(
  input: StartAttemptInput,
  deps: StartAttemptDeps,
): Promise<StartAttemptPayload> {
  const { repo, now } = deps;

  // --- 1. ¿Puede el alumno ver esta asignación? ---------------------------
  // Con el cliente de SESIÓN: la respuesta la da la política RLS, no un `where`
  // escrito aquí. 404 tanto si no existe como si es de otra clase o de otro
  // colegio: un 403 confirmaría que el examen existe.
  const assignment = await repo.findAssignmentVisibleToStudent(input.assignmentId);
  if (!assignment || assignment.school_id !== input.schoolId) {
    throw new ExamError("not_found", "La asignación no existe o no es visible para este alumno");
  }

  // --- 2. Ventana, contra el reloj del SERVIDOR ---------------------------
  assertWithinWindow(assignment, now);

  // --- 3. ¿Hay un intento en curso? REANUDACIÓN ---------------------------
  const existing = await repo.findInProgressAttempt(assignment.id, input.studentId);
  if (existing) {
    const snapshot = readSnapshot(existing.blueprint_snapshot);

    if (isExpired(existing, now)) {
      // El alumno vuelve con el tiempo ya agotado (cerró el portátil, se fue a
      // comer). No se le devuelve un examen que no puede contestar: quien lo
      // cierra es el llamante, que tiene acceso a `submitAttempt`. Aquí solo se
      // dice, sin ambigüedad, que se acabó.
      throw new ExamError("deadline_passed", "El tiempo de este intento ya se ha agotado", {
        attemptId: existing.id,
        serverNow: now.toISOString(),
      });
    }

    const payload = await buildPayload(existing, snapshot, deps, true);
    await deps.events.emit(input.schoolId, input.studentId, [
      {
        eventType: "attempt_resumed",
        attemptId: existing.id,
        seq: SEQ_ATTEMPT_START,
        payload: { attemptNumber: existing.attempt_number, itemCount: payload.items.length },
      },
    ]);
    return payload;
  }

  // --- 4. ¿Le quedan intentos? --------------------------------------------
  // `max_attempts` lo manda la ASIGNACIÓN: es el profesor de esta clase quien
  // decide cuántas oportunidades da, no el autor del blueprint.
  const used = await repo.countAttempts(assignment.id, input.studentId);
  assertAttemptsAvailable(used, assignment.max_attempts);

  // --- 5. Congelar el blueprint -------------------------------------------
  const blueprint = await repo.findBlueprint(assignment.blueprint_id);
  if (!blueprint) {
    throw new ExamError("blueprint_invalid", `[exam] La asignación apunta a un blueprint inexistente`);
  }
  const sections = await repo.listBlueprintSections(blueprint.id);
  const durationSeconds = assignment.time_limit_override_seconds ?? blueprint.duration_seconds;

  const snapshot = buildSnapshot({
    blueprint,
    sections,
    blueprintVersion: assignment.blueprint_version,
    durationSeconds,
    maxAttempts: assignment.max_attempts,
    ...(input.locale === undefined ? {} : { locale: input.locale }),
  });

  // --- 6. El deadline ------------------------------------------------------
  // `now + duración`, RECORTADO al cierre de la ventana.
  //
  // El recorte no estaba en el encargo y es una decisión consciente (anotada en
  // REVIEW.md): sin él, un alumno que arranca a las 09:59 con un examen de 60
  // minutos lo tendría abierto hasta las 10:59, es decir, una hora después de
  // que la ventana se cerrara. La ventana dejaría de significar nada.
  const closesAtMs = Date.parse(assignment.closes_at);
  const naturalDeadlineMs = now.getTime() + durationSeconds * 1000;
  const deadlineMs = Math.min(naturalDeadlineMs, closesAtMs);

  if (deadlineMs - now.getTime() < MIN_START_WINDOW_MS) {
    throw new ExamError("window_closed", "Queda menos de un minuto de ventana: no se arranca", {
      closesAt: assignment.closes_at,
      serverNow: now.toISOString(),
    });
  }

  // --- 7. Materializar ANTES de escribir nada ------------------------------
  const poolRows = await repo.listPool(blueprint.course_id, input.schoolId);
  const { pool, rejected } = toPoolQuestions(poolRows);
  if (rejected.length > 0) {
    console.warn(
      `[exam] ${rejected.length} pregunta(s) descartadas del banco del curso ${blueprint.course_id}: ` +
        rejected.map((r) => `${r.questionId} (${r.reason})`).join("; "),
    );
  }

  const rootSeed = (deps.generateSeed ?? generateRootSeed)();
  let materialized;
  try {
    materialized = materializeExam({ blueprint: snapshot, pool, rootSeed });
  } catch (cause) {
    if (cause instanceof InsufficientPoolError) {
      // Explícito y sin crear nada: "el examen NO se materializa; un examen
      // incompleto es peor que un examen que no arranca".
      throw new ExamError(
        "insufficient_pool",
        `[exam] Banco insuficiente en la sección ${cause.sectionOrd}: ` +
          `hacen falta ${cause.required} y hay ${cause.available} {${cause.criteria}}`,
      );
    }
    if (cause instanceof EngineError) {
      throw new ExamError("blueprint_invalid", `[exam] El motor rechazó el blueprint: ${cause.message}`);
    }
    throw cause;
  }

  if (materialized.length === 0) {
    throw new ExamError("blueprint_invalid", "[exam] La materialización no produjo ningún item");
  }

  // --- 8. Escribir: intento primero, items inmediatamente después ----------
  const startedAt = now.toISOString();
  const serverDeadlineAt = new Date(deadlineMs).toISOString();

  let attempt: AttemptRow;
  try {
    attempt = await repo.insertAttempt({
      assignmentId: assignment.id,
      studentId: input.studentId,
      schoolId: input.schoolId,
      attemptNumber: used + 1,
      blueprintSnapshot: snapshot,
      seed: rootSeed,
      startedAt,
      serverDeadlineAt,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
    });
  } catch (cause) {
    if (cause instanceof UniqueViolation) {
      // `unique (assignment_id, student_id, attempt_number)` ha saltado: dos
      // pestañas han llegado hasta aquí a la vez. La otra ganó. Esta es la
      // barrera REAL contra el doble arranque — el `findInProgressAttempt` del
      // paso 3 es solo el camino rápido, y entre él y este INSERT hay una
      // ventana que ninguna comprobación previa puede cerrar.
      const winner = await repo.findInProgressAttempt(assignment.id, input.studentId);
      if (winner) {
        return await buildPayload(winner, readSnapshot(winner.blueprint_snapshot), deps, true);
      }
      throw new ExamError("attempt_starting", "Otro proceso está arrancando este intento");
    }
    throw cause;
  }

  const itemRows: NewAttemptItem[] = materialized.map((item) => ({
    attemptId: attempt.id,
    ord: item.ord,
    sectionOrd: item.sectionOrd,
    questionId: item.questionId,
    questionVersionId: item.questionVersionId,
    itemSeed: item.itemSeed,
    renderedBody: item.renderedBody,
    optionOrder: item.optionOrder,
    answerKey: item.answerKey,
    skillId: item.skillId,
    difficulty: item.difficulty,
    maxPoints: item.maxPoints,
  }));

  try {
    await repo.insertItems(itemRows);
  } catch (cause) {
    // El intento NO puede quedarse sin items: sería un examen en blanco que
    // consume una oportunidad del alumno y que no se puede corregir. Se
    // deshace; si ni siquiera el borrado funciona, se anula (`voided`), que al
    // menos lo excluye del recuento de intentos.
    try {
      await repo.deleteAttempt(attempt.id);
    } catch {
      try {
        await repo.voidAttempt(attempt.id);
      } catch {
        console.error(
          `[exam] Intento ${attempt.id} sin items y sin poder limpiarlo. Requiere intervención manual.`,
        );
      }
    }
    throw cause instanceof ExamError
      ? cause
      : new ExamError("internal", `[exam] No se pudieron materializar los items: ${String(cause)}`);
  }

  const payload = await buildPayload(attempt, snapshot, deps, false);

  await deps.events.emit(input.schoolId, input.studentId, [
    {
      eventType: "attempt_started",
      attemptId: attempt.id,
      seq: SEQ_ATTEMPT_START,
      payload: {
        attemptNumber: attempt.attempt_number,
        itemCount: payload.items.length,
        durationSeconds,
        blueprintId: snapshot.blueprintId,
      },
    },
    // NO se emite `question_shown` aquí, aunque los items ya existan. "Mostrada"
    // es un hecho del NAVEGADOR: el alumno puede no llegar nunca a la pregunta
    // 20. Emitirlas todas al arrancar inflaría el tiempo de exposición de cada
    // pregunta y contaminaría el mastery con veinte vistas que no ocurrieron.
    // Ese evento lo manda el cliente por `/api/events`.
  ]);

  return payload;
}
