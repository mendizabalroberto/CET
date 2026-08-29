/**
 * El bucle de práctica: racha, aciertos, pistas y solución.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se prueba la máquina, no el componente. Es exactamente la lógica que Y6A tenía
 * en `var P={topic,cur,ask,right,streak,best,answered}` y que nadie podía probar
 * porque vivía dentro de un `<script>` de 1.400 líneas.
 */
import { describe, expect, it } from "vitest";
import { generate } from "@cet/engine";
import type { GeneratedItem } from "@cet/shared";

import {
  accuracyPercent,
  canonicalOf,
  initialPracticeState,
  practiceReducer,
  type PracticeAction,
  type PracticeEffect,
  type PracticeQuestion,
  type PracticeState,
} from "./practice-machine";

const SEED = 987_654_321;

function makeQuestion(ord: number, seed = SEED + ord): PracticeQuestion {
  const item: GeneratedItem = generate("math.simplify", { locale: "en" }, seed);
  return { ord, seed, engineKey: "math.simplify", item };
}

/** Encadena acciones y acumula todos los eventos emitidos por el camino. */
function run(
  state: PracticeState,
  actions: readonly PracticeAction[],
): { state: PracticeState; effects: PracticeEffect[] } {
  let current = state;
  const effects: PracticeEffect[] = [];
  for (const action of actions) {
    const step = practiceReducer(current, action);
    current = step.state;
    effects.push(...step.effects);
  }
  return { state: current, effects };
}

function correctAnswerFor(question: PracticeQuestion): string {
  return canonicalOf(question.item.answerKey);
}

function askAndAnswer(
  state: PracticeState,
  ord: number,
  answer: (question: PracticeQuestion) => string,
): { state: PracticeState; effects: PracticeEffect[]; question: PracticeQuestion } {
  const question = makeQuestion(ord);
  const result = run(state, [
    { type: "question_shown", question, now: 1_000 * ord },
    { type: "answer_changed", value: answer(question), now: 1_000 * ord + 500 },
    { type: "submit", now: 1_000 * ord + 900 },
  ]);
  return { ...result, question };
}

describe("practiceReducer — racha", () => {
  it("acertar sube la racha, los aciertos y la mejor racha", () => {
    let state = initialPracticeState("math.simplify");
    for (let ord = 1; ord <= 3; ord += 1) {
      state = askAndAnswer(state, ord, correctAnswerFor).state;
    }

    expect(state.asked).toBe(3);
    expect(state.correct).toBe(3);
    expect(state.streak).toBe(3);
    expect(state.bestStreak).toBe(3);
    expect(accuracyPercent(state)).toBe(100);
  });

  it("fallar rompe la racha pero conserva la mejor", () => {
    let state = initialPracticeState("math.simplify");
    state = askAndAnswer(state, 1, correctAnswerFor).state;
    state = askAndAnswer(state, 2, correctAnswerFor).state;
    expect(state.streak).toBe(2);

    state = askAndAnswer(state, 3, () => "999/1000").state;

    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(2);
    expect(state.asked).toBe(3);
    expect(state.correct).toBe(2);
    expect(state.result?.isCorrect).toBe(false);
    expect(accuracyPercent(state)).toBe(67);
  });

  it("emite practice_streak solo cuando la racha sube", () => {
    let state = initialPracticeState("math.simplify");
    const first = askAndAnswer(state, 1, correctAnswerFor);
    state = first.state;
    expect(first.effects.filter((e) => e.eventType === "practice_streak")).toHaveLength(1);
    // El payload lleva además el contexto de la pregunta desde
    // `skill-id-de-practica.test.ts`: una racha sin `skillCode` entraba en
    // `learning_events` con `skill_id` NULL y no contaba para ninguna destreza.
    // Se sigue comprobando ENTERO —no `toMatchObject`— para que un campo de más
    // o de menos siga siendo un fallo.
    expect(first.effects.find((e) => e.eventType === "practice_streak")?.payload).toEqual({
      topicId: "math.simplify",
      engineKey: "math.simplify",
      skillCode: "math.fractions.simplify",
      seed: SEED + 1,
      params: { locale: "en" },
      streak: 1,
    });

    const second = askAndAnswer(state, 2, () => "nonsense");
    expect(second.effects.filter((e) => e.eventType === "practice_streak")).toHaveLength(0);
  });

  it("una respuesta en blanco no corrige, no rompe la racha y avisa", () => {
    let state = initialPracticeState("math.simplify");
    state = askAndAnswer(state, 1, correctAnswerFor).state;

    const question = makeQuestion(2);
    const step = run(state, [
      { type: "question_shown", question, now: 5_000 },
      { type: "answer_changed", value: "   ", now: 5_100 },
      { type: "submit", now: 5_200 },
    ]);

    expect(step.state.notice).toBe("blank-answer");
    expect(step.state.phase).toBe("answering");
    expect(step.state.asked).toBe(1);
    expect(step.state.streak).toBe(1);
    expect(step.effects.filter((e) => e.eventType === "answer_submitted")).toHaveLength(0);
  });

  it("responder dos veces la misma pregunta no cuenta dos veces", () => {
    const state = initialPracticeState("math.simplify");
    const question = makeQuestion(1);
    const step = run(state, [
      { type: "question_shown", question, now: 0 },
      { type: "answer_changed", value: correctAnswerFor(question), now: 100 },
      { type: "submit", now: 200 },
      { type: "submit", now: 300 },
      { type: "submit", now: 400 },
    ]);

    expect(step.state.asked).toBe(1);
    expect(step.state.streak).toBe(1);
    expect(step.effects.filter((e) => e.eventType === "answer_submitted")).toHaveLength(1);
  });
});

describe("practiceReducer — pistas y solución", () => {
  it("la pista se cuenta, se emite una vez y viaja en answer_submitted", () => {
    const state = initialPracticeState("math.simplify");
    const question = makeQuestion(1);
    const step = run(state, [
      { type: "question_shown", question, now: 0 },
      { type: "hint_toggled", open: true, now: 4_000 },
      { type: "hint_toggled", open: false, now: 4_500 },
      { type: "answer_changed", value: correctAnswerFor(question), now: 5_000 },
      { type: "submit", now: 6_000 },
    ]);

    const hints = step.effects.filter((e) => e.eventType === "hint_requested");
    expect(hints).toHaveLength(1);
    expect(hints[0]?.payload).toMatchObject({ hintIndex: 0, timeBeforeHintMs: 4_000 });
    expect(step.state.totalHints).toBe(1);

    const submitted = step.effects.find((e) => e.eventType === "answer_submitted");
    expect(submitted?.payload).toMatchObject({ hintsUsed: 1, isCorrect: true });
  });

  it("cerrar la pista no emite nada: el alumno ya la vio", () => {
    const state = initialPracticeState("math.simplify");
    const step = run(state, [
      { type: "question_shown", question: makeQuestion(1), now: 0 },
      { type: "hint_toggled", open: true, now: 100 },
      { type: "hint_toggled", open: false, now: 200 },
      { type: "hint_toggled", open: true, now: 300 },
    ]);
    // Reabrirla SÍ cuenta como una pista nueva: es una petición de ayuda más.
    expect(step.effects.filter((e) => e.eventType === "hint_requested")).toHaveLength(2);
    expect(step.state.hintsUsedThisQuestion).toBe(2);
  });

  it("ver la solución se registra y distingue si fue antes o después de responder", () => {
    const state = initialPracticeState("math.simplify");
    const question = makeQuestion(1);

    const before = run(state, [
      { type: "question_shown", question, now: 0 },
      { type: "solution_toggled", open: true, now: 2_000 },
    ]);
    const beforeEvent = before.effects.find((e) => e.eventType === "solution_viewed");
    expect(beforeEvent?.payload).toMatchObject({ answeredFirst: false, timeOnItemMs: 2_000 });
    expect(before.state.totalSolutions).toBe(1);

    const after = run(state, [
      { type: "question_shown", question, now: 0 },
      { type: "answer_changed", value: correctAnswerFor(question), now: 500 },
      { type: "submit", now: 900 },
      { type: "solution_toggled", open: true, now: 1_500 },
    ]);
    expect(after.effects.find((e) => e.eventType === "solution_viewed")?.payload).toMatchObject({
      answeredFirst: true,
    });
  });

  it("la pregunta nueva reinicia pista, solución y cambios, pero no las estadísticas", () => {
    let state = initialPracticeState("math.simplify");
    state = run(state, [
      { type: "question_shown", question: makeQuestion(1), now: 0 },
      { type: "hint_toggled", open: true, now: 100 },
      { type: "solution_toggled", open: true, now: 200 },
      { type: "answer_changed", value: "1/2", now: 300 },
      { type: "submit", now: 400 },
      { type: "question_shown", question: makeQuestion(2), now: 500 },
    ]).state;

    expect(state.hintOpen).toBe(false);
    expect(state.solutionOpen).toBe(false);
    expect(state.hintsUsedThisQuestion).toBe(0);
    expect(state.changeCount).toBe(0);
    expect(state.answer).toBe("");
    expect(state.asked).toBe(1);
    // Los totales de sesión SÍ se conservan: son la analítica de la sesión.
    expect(state.totalHints).toBe(1);
    expect(state.totalSolutions).toBe(1);
  });
});

describe("practiceReducer — telemetría", () => {
  it("cada evento de pregunta lleva la semilla del cliente y el engineKey", () => {
    const state = initialPracticeState("math.simplify");
    const question = makeQuestion(1, 4_242);
    const step = run(state, [
      { type: "question_shown", question, now: 0 },
      { type: "answer_changed", value: "3/4", now: 100 },
      { type: "submit", now: 200 },
    ]);

    for (const effect of step.effects) {
      if (effect.eventType === "practice_streak") continue;
      expect(effect.payload).toMatchObject({ seed: 4_242, engineKey: "math.simplify" });
    }
  });

  it("cuenta los cambios de opinión y los manda en answer_submitted", () => {
    const state = initialPracticeState("math.simplify");
    const question = makeQuestion(1);
    const step = run(state, [
      { type: "question_shown", question, now: 0 },
      { type: "answer_changed", value: "1", now: 100 },
      { type: "answer_changed", value: "1/", now: 200 },
      { type: "answer_changed", value: "1/2", now: 300 },
      // Repetir el mismo valor no es un cambio de opinión.
      { type: "answer_changed", value: "1/2", now: 400 },
      { type: "submit", now: 500 },
    ]);

    expect(step.effects.filter((e) => e.eventType === "answer_changed")).toHaveLength(3);
    expect(step.effects.find((e) => e.eventType === "answer_submitted")?.payload).toMatchObject({
      changeCount: 3,
      timeOnItemMs: 500,
    });
  });

  it("saltar emite question_skipped con el tiempo en la pregunta", () => {
    const state = initialPracticeState("math.simplify");
    const step = run(state, [
      { type: "question_shown", question: makeQuestion(7), now: 1_000 },
      { type: "skip", now: 3_500 },
    ]);
    expect(step.effects.find((e) => e.eventType === "question_skipped")?.payload).toMatchObject({
      ord: 7,
      timeOnItemMs: 2_500,
    });
  });

  it("un reloj que salta hacia atrás no produce tiempos negativos", () => {
    const state = initialPracticeState("math.simplify");
    const step = run(state, [
      { type: "question_shown", question: makeQuestion(1), now: 10_000 },
      { type: "skip", now: 2_000 },
    ]);
    expect(step.effects.find((e) => e.eventType === "question_skipped")?.payload).toMatchObject({
      timeOnItemMs: 0,
    });
  });

  it("start emite practice_started con el tema", () => {
    const step = practiceReducer(initialPracticeState("mix"), { type: "start", now: 0 });
    expect(step.effects).toEqual([
      { eventType: "practice_started", payload: { topicId: "mix" } },
    ]);
  });

  it("sin pregunta en curso ninguna acción emite eventos", () => {
    const state = initialPracticeState("math.simplify");
    for (const action of [
      { type: "submit", now: 0 },
      { type: "skip", now: 0 },
      { type: "hint_toggled", open: true, now: 0 },
      { type: "solution_toggled", open: true, now: 0 },
    ] as const) {
      expect(practiceReducer(state, action).effects).toEqual([]);
    }
  });
});

describe("practiceReducer — restore", () => {
  it("recupera el marcador al cambiar de tema y no emite eventos", () => {
    const step = practiceReducer(initialPracticeState("math.compare"), {
      type: "restore",
      tally: { asked: 10, correct: 7, streak: 3, bestStreak: 5 },
    });
    expect(step.effects).toEqual([]);
    expect(step.state).toMatchObject({ asked: 10, correct: 7, streak: 3, bestStreak: 5 });
    expect(accuracyPercent(step.state)).toBe(70);
  });

  it("sanea un marcador corrupto en vez de creérselo", () => {
    // sessionStorage lo puede editar cualquiera desde el inspector. Aquí no
    // importa (la práctica no puntúa), pero un `correct > asked` rompería la
    // aritmética del porcentaje y enseñaría "140 %" a un niño.
    const step = practiceReducer(initialPracticeState("mix"), {
      type: "restore",
      tally: { asked: 5, correct: 99, streak: -3, bestStreak: 1 },
    });
    expect(step.state.correct).toBe(5);
    expect(step.state.streak).toBe(0);
    expect(accuracyPercent(step.state)).toBe(100);
  });

  it("la mejor racha nunca queda por debajo de la actual", () => {
    const step = practiceReducer(initialPracticeState("mix"), {
      type: "restore",
      tally: { asked: 9, correct: 9, streak: 9, bestStreak: 2 },
    });
    expect(step.state.bestStreak).toBe(9);
  });
});

describe("accuracyPercent", () => {
  it("es null antes de la primera pregunta: 0 % mentiría", () => {
    expect(accuracyPercent(initialPracticeState("mix"))).toBeNull();
  });
});

describe("borrar la respuesta no es cambiarla", () => {
  /** Una pregunta en pantalla y en fase de respuesta: el punto de partida. */
  function enPantalla(): PracticeState {
    return practiceReducer(initialPracticeState("math.simplify"), {
      type: "question_shown",
      question: makeQuestion(1),
      now: 1_000,
    }).state;
  }

  it("emite answer_cleared al vaciar una respuesta escrita", () => {
    const conRespuesta = practiceReducer(enPantalla(), {
      type: "answer_changed",
      value: "3/4",
      now: 1_500,
    }).state;

    const { effects } = practiceReducer(conRespuesta, {
      type: "answer_changed",
      value: "",
      now: 2_000,
    });

    expect(effects.map((e) => e.eventType)).toEqual(["answer_changed", "answer_cleared"]);
  });

  it("no lo emite si no habia nada escrito", () => {
    const { effects } = practiceReducer(enPantalla(), {
      type: "answer_changed",
      value: "  ",
      now: 1_500,
    });

    expect(effects.map((e) => e.eventType)).toEqual(["answer_changed"]);
  });
});
