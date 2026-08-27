/**
 * Autoguardado: revisiones encadenadas y el deadline del servidor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { autosaveAnswer } from "../autosave";
import { isExamError } from "../errors";
import { noopEventEmitter } from "../events";
import { startAttempt } from "../start";
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
  section,
} from "./fixtures";

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(isExamError(error) ? error.code : error).toBe(code);
    return;
  }
  throw new Error(`Se esperaba un ExamError con code="${code}" y la promesa resolvió`);
}

async function startedAttempt() {
  const repo = new FakeExamRepository({
    assignments: [assignment()],
    blueprints: [blueprint()],
    sections: { [BLUEPRINT_ID]: [section()] },
    pool: poolOf(6),
  });
  const payload = await startAttempt(
    {
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
      userAgent: null,
      ipHash: null,
    },
    { repo, events: noopEventEmitter, now: NOW, generateSeed: () => 987_654 },
  );
  const firstItem = payload.items[0];
  if (!firstItem) throw new Error("[test] el intento se materializó sin items");
  return { repo, payload, itemId: firstItem.id };
}

function answer(selected: string) {
  return { type: "choice", selectedIds: [selected] };
}

describe("autosaveAnswer", () => {
  it("cada cambio de respuesta es una FILA NUEVA, nunca un UPDATE", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    const deps = { repo, events: noopEventEmitter, now: NOW };
    const base = {
      attemptId: payload.attemptId,
      attemptItemId: itemId,
      clientTs: null,
      timeOnItemMs: 1200,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
    };

    const r0 = await autosaveAnswer({ ...base, response: answer("a") }, deps);
    const r1 = await autosaveAnswer({ ...base, response: answer("b") }, deps);
    const r2 = await autosaveAnswer({ ...base, response: answer("a") }, deps);

    // "¿Cuántas veces cambió de opinión?" — tres filas, tres revisiones.
    expect([r0.revision, r1.revision, r2.revision]).toEqual([0, 1, 2]);
    const stored = await repo.listResponses(payload.attemptId);
    expect(stored).toHaveLength(3);

    // Y SOLO UNA es final: el índice parcial UNIQUE lo hace imposible de violar,
    // y el doble lo reproduce.
    const finals = stored.filter((r) => r.is_final);
    expect(finals).toHaveLength(1);
    expect(finals[0]?.revision).toBe(2);
  });

  it("DOS PESTAÑAS autoguardando: nada se pierde y solo queda una final", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    const deps = { repo, events: noopEventEmitter, now: NOW };
    const base = {
      attemptId: payload.attemptId,
      attemptItemId: itemId,
      clientTs: null,
      timeOnItemMs: 500,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
    };

    // El caso real: el alumno vuelve al examen por el enlace y deja la primera
    // pestaña abierta. Las dos escriben sobre los MISMOS items.
    const results = await Promise.all([
      autosaveAnswer({ ...base, response: answer("a") }, deps),
      autosaveAnswer({ ...base, response: answer("b") }, deps),
    ]);

    const stored = await repo.listResponses(payload.attemptId);
    expect(stored).toHaveLength(2);
    // Revisiones distintas: el servidor las asigna, no el cliente.
    expect(new Set(results.map((r) => r.revision)).size).toBe(2);
    expect(stored.filter((r) => r.is_final)).toHaveLength(1);
  });

  it("EL DEADLINE DEL SERVIDOR GANA: un clientTs 'a tiempo' no salva una respuesta tardía", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    // El reloj del portátil dice que faltan diez minutos...
    const clientTsMintiendo = new Date(NOW.getTime() + 5 * 60 * 1000).toISOString();
    // ...pero el servidor sabe que el examen venció hace media hora.
    const now = new Date(Date.parse(payload.serverDeadlineAt) + 30 * 60 * 1000);

    await expectCode(
      autosaveAnswer(
        {
          attemptId: payload.attemptId,
          attemptItemId: itemId,
          response: answer("a"),
          clientTs: clientTsMintiendo,
          timeOnItemMs: 100,
          studentId: STUDENT_ID,
          schoolId: SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now },
      ),
      "deadline_passed",
    );

    // Y no se guardó NADA. Rechazar y guardar sería lo peor de las dos opciones.
    expect(await repo.listResponses(payload.attemptId)).toHaveLength(0);
  });

  it("el margen de gracia absorbe la latencia, no una respuesta pensada", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    const base = {
      attemptId: payload.attemptId,
      attemptItemId: itemId,
      response: answer("a"),
      clientTs: null,
      timeOnItemMs: 100,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
    };

    // 1 s tarde: la wifi del colegio. Se acepta.
    const justLate = new Date(Date.parse(payload.serverDeadlineAt) + 1_000);
    await expect(
      autosaveAnswer(base, { repo, events: noopEventEmitter, now: justLate }),
    ).resolves.toBeDefined();

    // 10 s tarde: eso ya no es latencia. Se rechaza.
    const tooLate = new Date(Date.parse(payload.serverDeadlineAt) + 10_000);
    await expectCode(
      autosaveAnswer(base, { repo, events: noopEventEmitter, now: tooLate }),
      "deadline_passed",
    );
  });

  it("guarda el clientTs adelantado como dato forense, sin dejar que decida", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    const unaHoraAdelantado = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();

    const saved = await autosaveAnswer(
      {
        attemptId: payload.attemptId,
        attemptItemId: itemId,
        response: answer("a"),
        clientTs: unaHoraAdelantado,
        timeOnItemMs: 100,
        studentId: STUDENT_ID,
        schoolId: SCHOOL_ID,
      },
      { repo, events: noopEventEmitter, now: NOW },
    );

    // Se acepta (el SERVIDOR dice que hay tiempo) y el `server_ts` es la verdad.
    expect(saved.revision).toBe(0);
    expect(saved.serverDeadlineAt).toBe(payload.serverDeadlineAt);
  });

  it("rechaza el intento de OTRO alumno con 404", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    await expectCode(
      autosaveAnswer(
        {
          attemptId: payload.attemptId,
          attemptItemId: itemId,
          response: answer("a"),
          clientTs: null,
          timeOnItemMs: 0,
          studentId: OTHER_STUDENT_ID,
          schoolId: SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now: NOW },
      ),
      "not_found",
    );
  });

  it("rechaza el intento de OTRO colegio con 404", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    await expectCode(
      autosaveAnswer(
        {
          attemptId: payload.attemptId,
          attemptItemId: itemId,
          response: answer("a"),
          clientTs: null,
          timeOnItemMs: 0,
          studentId: STUDENT_ID,
          schoolId: OTHER_SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now: NOW },
      ),
      "not_found",
    );
  });

  it("rechaza un attemptId que no existe con 404", async () => {
    const { repo, itemId } = await startedAttempt();
    await expectCode(
      autosaveAnswer(
        {
          attemptId: "00000000-0000-4000-8000-000000000000",
          attemptItemId: itemId,
          response: answer("a"),
          clientTs: null,
          timeOnItemMs: 0,
          studentId: STUDENT_ID,
          schoolId: SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now: NOW },
      ),
      "not_found",
    );
  });

  it("rechaza un item que no es de este intento", async () => {
    const { repo, payload } = await startedAttempt();
    await expectCode(
      autosaveAnswer(
        {
          attemptId: payload.attemptId,
          attemptItemId: "item-de-otro-intento",
          response: answer("a"),
          clientTs: null,
          timeOnItemMs: 0,
          studentId: STUDENT_ID,
          schoolId: SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now: NOW },
      ),
      "not_found",
    );
  });

  it("rechaza una respuesta con forma inválida antes de tocar la base de datos", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    await expectCode(
      autosaveAnswer(
        {
          attemptId: payload.attemptId,
          attemptItemId: itemId,
          response: { type: "no_existe", loquesea: 1 },
          clientTs: null,
          timeOnItemMs: 0,
          studentId: STUDENT_ID,
          schoolId: SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now: NOW },
      ),
      "invalid_request",
    );
    expect(await repo.listResponses(payload.attemptId)).toHaveLength(0);
  });

  it("no acepta respuestas sobre un intento ya entregado", async () => {
    const { repo, payload, itemId } = await startedAttempt();
    await repo.claimSubmission(payload.attemptId, NOW.toISOString(), "student");

    await expectCode(
      autosaveAnswer(
        {
          attemptId: payload.attemptId,
          attemptItemId: itemId,
          response: answer("a"),
          clientTs: null,
          timeOnItemMs: 0,
          studentId: STUDENT_ID,
          schoolId: SCHOOL_ID,
        },
        { repo, events: noopEventEmitter, now: NOW },
      ),
      "attempt_not_in_progress",
    );
  });
});
