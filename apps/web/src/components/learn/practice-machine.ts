/**
 * El bucle de práctica de Y6A, como máquina de estados pura.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ UNA MÁQUINA PURA Y NO `useState` SUELTO
 * ===========================================================================
 * AD-5 dice que la práctica corre en el CLIENTE: feedback por debajo de 50 ms y
 * tolerante a que la red se caiga. Eso significa que toda la lógica —racha,
 * aciertos, pistas, corrección— vive en el navegador. Si vive dentro de un
 * componente, la única forma de probarla es montar un navegador.
 *
 * Aquí el estado y los EVENTOS que produce cada transición son una función pura
 * de `(estado, acción)`. El componente se limita a: generar la pregunta,
 * despachar, y mandar los efectos a la cola de telemetría. Se puede demostrar
 * con un test de milisegundos que acertar sube la racha, que fallar la rompe,
 * que la pista se cuenta y que ver la solución se registra.
 *
 * ===========================================================================
 * SEMILLA
 * ===========================================================================
 * La semilla de cada pregunta se genera en el CLIENTE y viaja en el payload del
 * evento. Con `(engineKey, params, seed)` se reconstruye exactamente lo que vio
 * el alumno, que es el principio rector del MASTER_PLAN. En práctica no hay
 * problema de seguridad porque no puntúa: nada de lo que diga el cliente entra
 * en una nota.
 */
import { grade } from "@cet/engine";
import type { AnswerKey, GeneratedItem, LearningEventType } from "@cet/shared";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

export interface PracticeQuestion {
  /** Posición en la sesión, base 1. */
  readonly ord: number;
  /** Semilla generada en el cliente. Es lo que hace reproducible la pregunta. */
  readonly seed: number;
  readonly engineKey: string;
  readonly item: GeneratedItem;
}

export interface PracticeResult {
  readonly isCorrect: boolean;
  /** `canonical` de la clave, para el mensaje "la respuesta es …". */
  readonly canonical: string;
  readonly rationale: string | undefined;
}

export type PracticePhase = "awaiting-question" | "answering" | "answered";

export interface PracticeState {
  /** `engineKey` del generador, o `mix`. */
  readonly topicId: string;
  readonly question: PracticeQuestion | null;
  readonly answer: string;
  readonly phase: PracticePhase;

  readonly asked: number;
  readonly correct: number;
  readonly streak: number;
  readonly bestStreak: number;

  readonly result: PracticeResult | null;
  readonly hintOpen: boolean;
  readonly solutionOpen: boolean;

  /** Pistas pedidas en la pregunta ACTUAL. Entra en `answer_submitted`. */
  readonly hintsUsedThisQuestion: number;
  /** Cambios de opinión en la pregunta actual. */
  readonly changeCount: number;
  /**
   * `clientTs` del `question_shown`. Base de todos los `timeOnItemMs`.
   * `null` —y no 0— cuando no hay pregunta en curso: `0` es un instante
   * perfectamente válido (el origen de un reloj monotónico o de un test) y
   * usarlo como centinela hacía que todos los tiempos salieran a cero.
   */
  readonly shownAt: number | null;

  readonly totalHints: number;
  readonly totalSolutions: number;

  /** Aviso al alumno que no es un error del sistema. */
  readonly notice: "none" | "blank-answer";
}

/** Lo que sobrevive a cambiar de tema. Ver `restore`. */
export interface PracticeTally {
  readonly asked: number;
  readonly correct: number;
  readonly streak: number;
  readonly bestStreak: number;
}

export type PracticeAction =
  | { readonly type: "restore"; readonly tally: PracticeTally }
  | { readonly type: "start"; readonly now: number }
  | { readonly type: "question_shown"; readonly question: PracticeQuestion; readonly now: number }
  | { readonly type: "answer_changed"; readonly value: string; readonly now: number }
  | { readonly type: "submit"; readonly now: number }
  | { readonly type: "hint_toggled"; readonly open: boolean; readonly now: number }
  | { readonly type: "solution_toggled"; readonly open: boolean; readonly now: number }
  | { readonly type: "skip"; readonly now: number };

/** Un evento de `learning_events` listo para la cola. Sin `sessionId` ni `seq`. */
export interface PracticeEffect {
  readonly eventType: LearningEventType;
  readonly payload: Record<string, unknown>;
}

export interface PracticeTransition {
  readonly state: PracticeState;
  readonly effects: readonly PracticeEffect[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function initialPracticeState(topicId: string): PracticeState {
  return {
    topicId,
    question: null,
    answer: "",
    phase: "awaiting-question",
    asked: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    result: null,
    hintOpen: false,
    solutionOpen: false,
    hintsUsedThisQuestion: 0,
    changeCount: 0,
    shownAt: null,
    totalHints: 0,
    totalSolutions: 0,
    notice: "none",
  };
}

/**
 * Respuesta de referencia legible. `choice`, `ordering` y `matching` no traen
 * `canonical` en el contrato; ninguno de los nueve generadores Math los usa hoy,
 * pero devolver "" es mejor que reventar la pantalla si mañana uno lo hace.
 */
export function canonicalOf(key: AnswerKey): string {
  switch (key.type) {
    case "numeric":
    case "fraction":
    case "text":
      return key.canonical;
    default:
      return "";
  }
}

/** Milisegundos en la pregunta actual. Nunca negativo aunque el reloj salte. */
function timeOnItem(state: PracticeState, now: number): number {
  if (state.shownAt === null) return 0;
  return Math.max(0, Math.round(now - state.shownAt));
}

/** Base de payload compartida por todos los eventos de una pregunta. */
function questionContext(state: PracticeState): Record<string, unknown> {
  const question = state.question;
  if (!question) return { topicId: state.topicId };
  return {
    topicId: state.topicId,
    engineKey: question.engineKey,
    skillCode: question.item.skillCode,
    // La semilla del cliente. Con ella + engineKey + params se regenera la
    // pregunta exacta que vio el alumno.
    seed: question.seed,
    params: question.item.params,
  };
}

/* -------------------------------------------------------------------------- */
/* La transición                                                               */
/* -------------------------------------------------------------------------- */

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeTransition {
  switch (action.type) {
    /**
     * Cambiar de tema navega a otra URL y remonta el componente. En Y6A los
     * chips no navegaban y la racha sobrevivía al cambio de tema — que es
     * justamente lo que enganchaba. Sin esto, un alumno con doce seguidas que
     * quiere probar otra cosa vuelve a cero y aprende a no cambiar de tema.
     *
     * No emite eventos: restaurar no es nada que le pase al alumno.
     */
    case "restore": {
      const tally = action.tally;
      return {
        state: {
          ...state,
          asked: Math.max(0, Math.floor(tally.asked)),
          correct: Math.max(0, Math.min(Math.floor(tally.correct), Math.floor(tally.asked))),
          streak: Math.max(0, Math.floor(tally.streak)),
          bestStreak: Math.max(0, Math.floor(tally.bestStreak), Math.floor(tally.streak)),
        },
        effects: [],
      };
    }

    case "start":
      return {
        state,
        effects: [{ eventType: "practice_started", payload: { topicId: state.topicId } }],
      };

    case "question_shown": {
      const next: PracticeState = {
        ...state,
        question: action.question,
        answer: "",
        phase: "answering",
        result: null,
        hintOpen: false,
        solutionOpen: false,
        hintsUsedThisQuestion: 0,
        changeCount: 0,
        shownAt: action.now,
        notice: "none",
      };
      return {
        state: next,
        effects: [
          {
            eventType: "question_shown",
            payload: {
              ...questionContext(next),
              ord: action.question.ord,
              difficulty: action.question.item.difficulty,
            },
          },
        ],
      };
    }

    case "answer_changed": {
      // Escribir después de haber respondido no cuenta: la pregunta ya se cerró.
      if (state.phase !== "answering") return { state, effects: [] };
      if (action.value === state.answer) return { state, effects: [] };

      const changeCount = state.changeCount + 1;
      const next: PracticeState = {
        ...state,
        answer: action.value,
        changeCount,
        notice: "none",
      };
      return {
        state: next,
        effects: [
          {
            eventType: "answer_changed",
            payload: {
              ...questionContext(next),
              // En práctica no hay revisiones persistidas: la revisión es el
              // número de cambios, y el contrato exige el campo igualmente.
              revision: changeCount,
              changeCount,
              timeOnItemMs: timeOnItem(state, action.now),
            },
          },
        ],
      };
    }

    case "submit": {
      if (state.phase !== "answering" || state.question === null) return { state, effects: [] };

      // Igual que Y6A: en blanco no se corrige. Un blanco corregido como fallo
      // rompería la racha de un niño que solo pulsó Enter sin querer.
      if (state.answer.trim() === "") {
        return { state: { ...state, notice: "blank-answer" }, effects: [] };
      }

      const item = state.question.item;
      const grading = grade(
        { type: "text", value: state.answer },
        item.answerKey,
        item.maxPoints,
      );

      const streak = grading.isCorrect ? state.streak + 1 : 0;
      const next: PracticeState = {
        ...state,
        phase: "answered",
        asked: state.asked + 1,
        correct: state.correct + (grading.isCorrect ? 1 : 0),
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        result: {
          isCorrect: grading.isCorrect,
          canonical: canonicalOf(item.answerKey),
          rationale: grading.rationale,
        },
        hintOpen: false,
        notice: "none",
      };

      const effects: PracticeEffect[] = [
        {
          eventType: "answer_submitted",
          payload: {
            ...questionContext(next),
            timeOnItemMs: timeOnItem(state, action.now),
            changeCount: state.changeCount,
            hintsUsed: state.hintsUsedThisQuestion,
            // Solo en práctica: en examen lo decide el servidor (AD-5).
            isCorrect: grading.isCorrect,
            response: state.answer,
          },
        },
        {
          eventType: "practice_item_answered",
          payload: {
            ...questionContext(next),
            isCorrect: grading.isCorrect,
            pointsAwarded: grading.pointsAwarded,
            maxPoints: grading.maxPoints,
          },
        },
      ];

      // Solo al SUBIR la racha. Emitirlo también al romperla llenaría
      // `learning_events` de ceros sin información.
      if (grading.isCorrect) {
        effects.push({ eventType: "practice_streak", payload: { streak } });
      }

      return { state: next, effects };
    }

    case "hint_toggled": {
      if (state.question === null) return { state, effects: [] };
      if (state.hintOpen === action.open) return { state, effects: [] };

      // Cerrar la pista no es un evento: el alumno ya la vio.
      if (!action.open) return { state: { ...state, hintOpen: false }, effects: [] };

      const next: PracticeState = {
        ...state,
        hintOpen: true,
        hintsUsedThisQuestion: state.hintsUsedThisQuestion + 1,
        totalHints: state.totalHints + 1,
        notice: "none",
      };
      return {
        state: next,
        effects: [
          {
            eventType: "hint_requested",
            payload: {
              ...questionContext(next),
              // Base 0 según el contrato: la primera pista es la 0.
              hintIndex: state.hintsUsedThisQuestion,
              timeBeforeHintMs: timeOnItem(state, action.now),
            },
          },
        ],
      };
    }

    case "solution_toggled": {
      if (state.question === null) return { state, effects: [] };
      if (state.solutionOpen === action.open) return { state, effects: [] };
      if (!action.open) return { state: { ...state, solutionOpen: false }, effects: [] };

      const next: PracticeState = {
        ...state,
        solutionOpen: true,
        totalSolutions: state.totalSolutions + 1,
      };
      return {
        state: next,
        effects: [
          {
            eventType: "solution_viewed",
            payload: {
              ...questionContext(next),
              timeOnItemMs: timeOnItem(state, action.now),
              // Ver la solución ANTES de responder no es lo mismo que verla
              // después: la analítica de dificultad necesita distinguirlo.
              answeredFirst: state.phase === "answered",
            },
          },
        ],
      };
    }

    case "skip": {
      if (state.question === null) return { state, effects: [] };
      // Saltar una pregunta ya respondida es simplemente pasar a la siguiente.
      if (state.phase === "answered") return { state, effects: [] };

      return {
        state: { ...state, notice: "none" },
        effects: [
          {
            eventType: "question_skipped",
            payload: {
              ...questionContext(state),
              ord: state.question.ord,
              timeOnItemMs: timeOnItem(state, action.now),
            },
          },
        ],
      };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`practiceReducer: acción desconocida ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Porcentaje de acierto, redondeado. `null` cuando aún no hay preguntas. */
export function accuracyPercent(state: PracticeState): number | null {
  if (state.asked === 0) return null;
  return Math.round((state.correct / state.asked) * 100);
}
