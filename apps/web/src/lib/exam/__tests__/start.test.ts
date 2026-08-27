/**
 * Arranque y reanudación de un intento.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los casos que se prueban aquí son, uno a uno, los que rompen un motor de
 * examen en producción: la red que se cae, la segunda pestaña, el banco que no
 * llega y el blueprint mal configurado.
 */
import { describe, expect, it } from "vitest";

import { isExamError } from "../errors";
import { noopEventEmitter } from "../events";
import { startAttempt } from "../start";
import { FakeExamRepository } from "./fake-repo";
import {
  ASSIGNMENT_ID,
  BLUEPRINT_ID,
  NOW,
  OTHER_SCHOOL_ID,
  SCHOOL_ID,
  STUDENT_ID,
  assignment,
  blueprint,
  poolOf,
  section,
} from "./fixtures";

interface RepoOverrides {
  assignments?: ReturnType<typeof assignment>[];
  sections?: ReturnType<typeof section>[];
  pool?: ReturnType<typeof poolOf>;
  blueprints?: ReturnType<typeof blueprint>[];
}

function repoWith(overrides: RepoOverrides = {}): FakeExamRepository {
  return new FakeExamRepository({
    assignments: overrides.assignments ?? [assignment()],
    blueprints: overrides.blueprints ?? [blueprint()],
    sections: { [BLUEPRINT_ID]: overrides.sections ?? [section()] },
    pool: overrides.pool ?? poolOf(6),
  });
}

const input = {
  assignmentId: ASSIGNMENT_ID,
  studentId: STUDENT_ID,
  schoolId: SCHOOL_ID,
  userAgent: "test",
  ipHash: null,
} as const;

function deps(repo: FakeExamRepository, now = NOW, seedValue = 123_456_789) {
  return { repo, events: noopEventEmitter, now, generateSeed: () => seedValue };
}

/**
 * Afirma que la promesa rechaza con un `ExamError` de ESE código.
 *
 * Se comprueba el código y no el mensaje: el código es el contrato con el
 * cliente (y con `exam-api.*.ts`); el mensaje es para el log del servidor y
 * puede reescribirse sin romper nada.
 */
async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(isExamError(error) ? error.code : error).toBe(code);
    return;
  }
  throw new Error(`Se esperaba un ExamError con code="${code}" y la promesa resolvió`);
}

describe("startAttempt", () => {
  it("materializa el intento entero al arrancar", async () => {
    const repo = repoWith();
    const payload = await startAttempt(input, deps(repo));

    expect(payload.resumed).toBe(false);
    expect(payload.items).toHaveLength(3);
    // "Si el alumno pierde la red en la pregunta 7, las 20 preguntas ya existen
    // en la DB." Los items se escriben ENTEROS, no pregunta a pregunta.
    expect(repo.rawItems(payload.attemptId)).toHaveLength(3);
    expect(payload.items.map((i) => i.ord)).toEqual([1, 2, 3]);
  });

  it("NO devuelve answer_key ni item_seed al cliente", async () => {
    const repo = repoWith();
    const payload = await startAttempt(input, deps(repo));

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("answer_key");
    expect(serialized).not.toContain("answerKey");
    expect(serialized).not.toContain("item_seed");
    expect(serialized).not.toContain("itemSeed");
    // Y la clave correcta tampoco puede aparecer por otra vía: las preguntas
    // del banco tienen `correctIds: ["a"]`.
    expect(serialized).not.toContain("correctIds");

    // Pero en la base de datos SÍ están: son la prueba forense.
    for (const item of repo.rawItems(payload.attemptId)) {
      expect(item.answer_key).toBeDefined();
      expect(typeof item.item_seed).toBe("number");
    }
  });

  it("HALLAZGO P2: envía `format`, para que el cliente no tenga que adivinarlo", async () => {
    // Sin este campo, `inferFormat` del cliente manda `fraction`, `ordering` y
    // `matching` a un campo de texto libre, y el alumno no puede responder
    // aunque sepa hacerlo.
    const repo = repoWith();
    const payload = await startAttempt(input, deps(repo));
    for (const item of payload.items) {
      expect(item.format).toBe("mcq_single");
      expect(item.questionVersionId).toBeTruthy();
    }
  });

  it("REANUDA: dos llamadas seguidas devuelven el MISMO intento y no crean otro", async () => {
    const repo = repoWith();
    const first = await startAttempt(input, deps(repo));
    const second = await startAttempt(input, deps(repo, new Date(NOW.getTime() + 30_000)));

    expect(second.attemptId).toBe(first.attemptId);
    expect(second.resumed).toBe(true);
    expect(repo.attempts).toHaveLength(1);
    expect(repo.insertAttemptCalls).toBe(1);
    // Las mismas preguntas, en el mismo orden. "El alumno no ve preguntas
    // distintas": los items ya estaban escritos.
    expect(second.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
  });

  it("REANUDA aunque el contador de intentos esté agotado", async () => {
    // El caso real: `max_attempts = 1`, el alumno ya arrancó, se le cae la red.
    // Si la comprobación de intentos fuera antes que la de reanudación, se
    // quedaría fuera de SU PROPIO examen a medias.
    const repo = repoWith();
    await startAttempt(input, deps(repo));
    const resumed = await startAttempt(input, deps(repo));
    expect(resumed.resumed).toBe(true);
  });

  it("el segundo intento se rechaza cuando max_attempts = 1", async () => {
    const repo = repoWith();
    const first = await startAttempt(input, deps(repo));
    // El primero deja de estar `in_progress`: ya no hay nada que reanudar.
    await repo.finishGrading(first.attemptId, {
      status: "graded",
      scoreRaw: 3,
      scoreMax: 3,
      scorePct: 100,
      passed: true,
      gradedAt: NOW.toISOString(),
    });

    await expectCode(startAttempt(input, deps(repo)), "max_attempts_reached");
    expect(repo.attempts).toHaveLength(1);
  });

  it("rechaza la asignación de otro colegio con 404, no con 403", async () => {
    const repo = repoWith({ assignments: [assignment({ school_id: OTHER_SCHOOL_ID })] });
    await expectCode(startAttempt(input, deps(repo)), "not_found");
  });

  it("rechaza una asignación que no existe con 404", async () => {
    const repo = repoWith({ assignments: [] });
    await expectCode(startAttempt(input, deps(repo)), "not_found");
  });

  it("rechaza fuera de la ventana, según el reloj del SERVIDOR", async () => {
    const repo = repoWith();
    await expectCode(
      startAttempt(input, deps(repo, new Date("2026-05-04T07:00:00.000Z"))),
      "window_not_open",
    );
    await expectCode(
      startAttempt(input, deps(repo, new Date("2026-05-04T13:00:00.000Z"))),
      "window_closed",
    );
    expect(repo.attempts).toHaveLength(0);
  });

  it("recorta el deadline al cierre de la ventana", async () => {
    // Examen de 30 min arrancado a falta de 10: la ventana manda. Sin recorte,
    // el alumno seguiría respondiendo 20 minutos después del cierre.
    const repo = repoWith();
    const payload = await startAttempt(input, deps(repo, new Date("2026-05-04T11:50:00.000Z")));
    expect(payload.serverDeadlineAt).toBe("2026-05-04T12:00:00.000Z");
    expect(payload.remainingMs).toBe(10 * 60 * 1000);
  });

  it("no arranca a falta de menos de un minuto", async () => {
    const repo = repoWith();
    await expectCode(
      startAttempt(input, deps(repo, new Date("2026-05-04T11:59:30.000Z"))),
      "window_closed",
    );
  });

  it("POOL INSUFICIENTE: falla explícito y NO deja un intento a medias", async () => {
    const repo = repoWith({ sections: [section({ item_count: 10 })], pool: poolOf(3) });

    await expectCode(startAttempt(input, deps(repo)), "insufficient_pool");

    // Ni intento, ni items, ni una oportunidad consumida. La materialización va
    // ANTES del INSERT precisamente para esto.
    expect(repo.attempts).toHaveLength(0);
    expect(repo.items).toHaveLength(0);
    expect(repo.insertAttemptCalls).toBe(0);
  });

  it("BLUEPRINT SIN SECCIONES: se rechaza sin tocar la base de datos", async () => {
    const repo = repoWith({ sections: [] });
    await expectCode(startAttempt(input, deps(repo)), "blueprint_invalid");
    expect(repo.attempts).toHaveLength(0);
  });

  it("una sección con item_count = 0 no cuenta como sección", async () => {
    const repo = repoWith({ sections: [section({ item_count: 0 })] });
    await expectCode(startAttempt(input, deps(repo)), "blueprint_invalid");
    expect(repo.attempts).toHaveLength(0);
  });

  it("si los items no se pueden escribir, el intento NO sobrevive", async () => {
    const repo = repoWith();
    repo.failInsertItems = true;

    await expect(startAttempt(input, deps(repo))).rejects.toThrow();

    // Un intento sin items sería un examen en blanco que consume una
    // oportunidad y que no se puede corregir. Se borra.
    expect(repo.attempts).toHaveLength(0);
    expect(repo.items).toHaveLength(0);
  });

  it("el intento reanudado con el tiempo agotado se rechaza con deadline_passed", async () => {
    const repo = repoWith();
    const first = await startAttempt(input, deps(repo));
    const wayLater = new Date(NOW.getTime() + 60 * 60 * 1000);

    await expectCode(startAttempt(input, deps(repo, wayLater)), "deadline_passed");
    expect(repo.attempts).toHaveLength(1);
    expect(repo.attempts[0]?.id).toBe(first.attemptId);
  });

  it("la duración de la asignación gana sobre la del blueprint", async () => {
    const repo = repoWith({
      assignments: [assignment({ time_limit_override_seconds: 600 })],
    });
    const payload = await startAttempt(input, deps(repo));
    expect(payload.durationSeconds).toBe(600);
    expect(payload.remainingMs).toBe(600_000);
  });

  it("congela el blueprint: el snapshot no depende del blueprint vivo", async () => {
    const repo = repoWith();
    const payload = await startAttempt(input, deps(repo));
    const stored = repo.attempts[0];

    expect(stored?.blueprint_snapshot).toMatchObject({
      blueprintId: BLUEPRINT_ID,
      blueprintVersion: 1,
      feedbackMode: "after_submit",
      passThreshold: 50,
      durationSeconds: 1800,
    });
    expect(payload.feedbackMode).toBe("after_submit");
  });

  it("la semilla raíz se guarda y está en el rango seguro de JS", async () => {
    const repo = repoWith();
    await startAttempt(input, deps(repo, NOW, 9_007_199_254_740_991));
    expect(repo.attempts[0]?.seed).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(repo.attempts[0]?.seed)).toBe(true);
  });

  it("con la misma semilla, el examen materializado es idéntico", async () => {
    // El principio rector: `seed` + `blueprint_snapshot` reproducen el examen.
    const a = repoWith();
    const b = repoWith();
    const first = await startAttempt(input, deps(a, NOW, 424_242));
    const second = await startAttempt(input, deps(b, NOW, 424_242));

    expect(second.items.map((i) => i.renderedBody)).toEqual(first.items.map((i) => i.renderedBody));
    expect(b.rawItems(second.attemptId).map((i) => i.item_seed)).toEqual(
      a.rawItems(first.attemptId).map((i) => i.item_seed),
    );
  });
});
