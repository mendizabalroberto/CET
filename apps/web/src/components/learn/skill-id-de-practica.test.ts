/**
 * Todo evento de práctica que hable de una pregunta dice DE QUÉ DESTREZA habla.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ EXISTE ESTE FICHERO
 * ===========================================================================
 * Recuento de `learning_events` en producción (29/08/2026):
 *
 *     event_type                filas   con skill_id
 *     practice_item_answered      26        0
 *     question_shown             126       26
 *
 * `practice_item_answered` es el evento del que cuelga cualquier medida de
 * dominio por destreza. Con `skill_id` NULL se sabe QUE el alumno respondió,
 * no DE QUÉ; por eso «áreas fortalecidas» del scorecard sale vacía.
 *
 * `learning_events.skill_id` no lo escribe esta máquina —es un uuid que solo
 * existe en la base—: lo RESUELVE la ingesta (`/api/events`) buscando en
 * `skills` el código que viaja en `payload.skillCode`, y el job de mastery hace
 * lo mismo (`0052_mastery_job.sql`: `s.code = le.payload ->> 'skillCode'`). Por
 * eso lo que se prueba aquí es lo único que decide la máquina: que ese código
 * viaje, que sea el de SU pregunta, y que cuando no lo hay no se invente nada.
 *
 * ===========================================================================
 * LA DISTINCIÓN QUE NO SE PUEDE FUNDIR
 * ===========================================================================
 * `topicId` / `engineKey` es la clave del GENERADOR (`math.simplify`);
 * `skillCode` es el identificador de la DESTREZA (`math.fractions.simplify`),
 * lo único que la base sabe resolver a `skills.id`. Hoy hay uno por generador y
 * se parecen; el día que dejen de parecerse, fundirlos falsearía hacia atrás una
 * serie histórica que ya existe. Las aserciones de abajo comprueban SIEMPRE que
 * el valor emitido no es el `engineKey` ni el `topicId`.
 */
import { describe, expect, it } from "vitest";
import { generate } from "@cet/engine";
import type { GeneratedItem } from "@cet/shared";

import {
  initialPracticeState,
  practiceReducer,
  type PracticeAction,
  type PracticeEffect,
  type PracticeQuestion,
  type PracticeState,
} from "./practice-machine";

/* -------------------------------------------------------------------------- */
/* Utillaje                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * La destreza EXACTAMENTE como la lee la ingesta, sin normalizar nada:
 *
 *     .filter((code): code is string => typeof code === "string")   // route.ts
 *     skill_id: ... skillIdByCode.get(event.payload.skillCode as string) ?? null
 *
 * Normalizar aquí sería hacerle a la prueba el trabajo que tiene que hacer la
 * máquina: un `skillCode: ""` limpiado por el ayudante saldría verde y seguiría
 * viajando a `learning_events` como un identificador que no identifica nada.
 */
function destrezaDe(effect: PracticeEffect): string | null {
  const raw = (effect.payload as { skillCode?: unknown }).skillCode;
  return typeof raw === "string" ? raw : null;
}

function eventos(effects: readonly PracticeEffect[], tipo: string): PracticeEffect[] {
  return effects.filter((effect) => effect.eventType === tipo);
}

function uno(effects: readonly PracticeEffect[], tipo: string): PracticeEffect {
  const encontrados = eventos(effects, tipo);
  expect(encontrados, `se esperaba exactamente un '${tipo}'`).toHaveLength(1);
  return encontrados[0]!;
}

/** Encadena acciones y acumula todo lo emitido por el camino. */
function correr(
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

/** Una pregunta como la fabrica el flujo real: item del motor, semilla propia. */
function pregunta(engineKey: string, ord: number, seed: number): PracticeQuestion {
  const item: GeneratedItem = generate(engineKey, { locale: "en" }, seed);
  return { ord, seed, engineKey, item };
}

/**
 * Una pregunta cuyo generador NO declara destreza. No es hipotética: el contrato
 * `GeneratedItem` acepta `skillCode: ""`, y un generador nuevo mal registrado —o
 * un item reconstruido desde JSON, donde `undefined` desaparece— llega así.
 */
function preguntaSinDestreza(ord: number, valor: unknown): PracticeQuestion {
  const base = generate("math.compare", { locale: "en" }, 4_242 + ord);
  const item = { ...base, skillCode: valor } as unknown as GeneratedItem;
  return { ord, seed: 4_242 + ord, engineKey: "math.compare", item };
}

/** Las dos destrezas que usan estas pruebas. Distintas a propósito. */
const SIMPLIFY = { engineKey: "math.simplify", skillCode: "math.fractions.simplify" } as const;
const COMPARE = { engineKey: "math.compare", skillCode: "math.fractions.compare" } as const;

/** Responde la pregunta en curso con algo que NO puede ser correcto. */
function fallar(now: number): PracticeAction[] {
  return [
    { type: "answer_changed", value: "no-es-la-respuesta", now },
    { type: "submit", now: now + 1 },
  ];
}

/* -------------------------------------------------------------------------- */
/* 1 · El evento que sostiene el análisis por destreza                         */
/* -------------------------------------------------------------------------- */

describe("practice_item_answered dice de qué destreza habla", () => {
  it("lleva el skillCode de SU pregunta, no el del tema ni el del generador", () => {
    const q = pregunta(SIMPLIFY.engineKey, 1, 111);
    const { effects } = correr(initialPracticeState(SIMPLIFY.engineKey), [
      { type: "start", now: 0 },
      { type: "question_shown", question: q, now: 10 },
      ...fallar(20),
    ]);

    const respondido = uno(effects, "practice_item_answered");
    expect(destrezaDe(respondido)).toBe(SIMPLIFY.skillCode);
    // Y no es el generador disfrazado de destreza: son dos identificadores.
    expect(destrezaDe(respondido)).not.toBe(SIMPLIFY.engineKey);
    expect(destrezaDe(respondido)).not.toBe(respondido.payload.topicId);
  });

  it("en el chip `mix` lleva la destreza de la pregunta, no la del chip", () => {
    const q = pregunta(COMPARE.engineKey, 1, 222);
    const { effects } = correr(initialPracticeState("mix"), [
      { type: "question_shown", question: q, now: 0 },
      ...fallar(5),
    ]);

    const respondido = uno(effects, "practice_item_answered");
    expect(respondido.payload.topicId).toBe("mix");
    expect(destrezaDe(respondido)).toBe(COMPARE.skillCode);
  });
});

/* -------------------------------------------------------------------------- */
/* 2 · Sin destreza conocida no se inventa una                                 */
/* -------------------------------------------------------------------------- */

describe("una pregunta sin destreza conocida no inventa un identificador", () => {
  // Un identificador inventado es PEOR que ausente: la analítica no puede
  // distinguirlo de uno correcto y la serie histórica queda envenenada sin que
  // nadie pueda saber qué filas lo están.
  for (const [nombre, valor] of [
    ["cadena vacía", ""],
    ["solo espacios", "   "],
    ["ausente", undefined],
  ] as const) {
    it(`lo deja nulo cuando el generador trae ${nombre}`, () => {
      const q = preguntaSinDestreza(1, valor);
      const { effects } = correr(initialPracticeState(q.engineKey), [
        { type: "question_shown", question: q, now: 0 },
        ...fallar(5),
      ]);

      for (const effect of effects) {
        const codigo = destrezaDe(effect);
        expect(codigo, `${effect.eventType} inventó una destreza`).toBeNull();
        // La tentación exacta que hay que evitar: rellenar con el generador.
        expect(effect.payload.skillCode).not.toBe(q.engineKey);
        expect(effect.payload.skillCode).not.toBe("mix");
      }

      // Y el valor que sí existe —la clave del generador— sigue viajando: sin
      // destreza el evento no queda mudo, queda honesto.
      expect(uno(effects, "practice_item_answered").payload.engineKey).toBe(q.engineKey);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 3 · Dos destrezas seguidas en la misma sesión                               */
/* -------------------------------------------------------------------------- */

describe("dos preguntas seguidas de destrezas distintas no comparten skillCode", () => {
  // Este es el caso que caza el arreglo ingenuo: si el código se resuelve una
  // vez —al arrancar la sesión, al elegir el tema— y se reutiliza, todas las
  // respuestas de una sesión `mix` se atribuirían a la primera destreza.
  it("cada respuesta lleva la suya, en una sesión mix", () => {
    const q1 = pregunta(SIMPLIFY.engineKey, 1, 333);
    const q2 = pregunta(COMPARE.engineKey, 2, 444);

    const { effects } = correr(initialPracticeState("mix"), [
      { type: "start", now: 0 },
      { type: "question_shown", question: q1, now: 10 },
      ...fallar(20),
      { type: "question_shown", question: q2, now: 30 },
      ...fallar(40),
    ]);

    const respondidos = eventos(effects, "practice_item_answered");
    expect(respondidos).toHaveLength(2);
    expect(destrezaDe(respondidos[0]!)).toBe(SIMPLIFY.skillCode);
    expect(destrezaDe(respondidos[1]!)).toBe(COMPARE.skillCode);
    expect(destrezaDe(respondidos[0]!)).not.toBe(destrezaDe(respondidos[1]!));

    // Lo mismo para los `question_shown`: la serie por destreza se construye
    // emparejando mostrada y respondida, y basta con que uno de los dos mienta.
    const mostrados = eventos(effects, "question_shown");
    expect(mostrados.map(destrezaDe)).toEqual([SIMPLIFY.skillCode, COMPARE.skillCode]);
  });

  it("una destreza sin resolver no contamina la siguiente", () => {
    const sinDestreza = preguntaSinDestreza(1, "");
    const q2 = pregunta(COMPARE.engineKey, 2, 555);

    const { effects } = correr(initialPracticeState("mix"), [
      { type: "question_shown", question: sinDestreza, now: 0 },
      ...fallar(5),
      { type: "question_shown", question: q2, now: 10 },
      ...fallar(15),
    ]);

    const respondidos = eventos(effects, "practice_item_answered");
    expect(respondidos).toHaveLength(2);
    expect(destrezaDe(respondidos[0]!)).toBeNull();
    expect(destrezaDe(respondidos[1]!)).toBe(COMPARE.skillCode);
  });
});

/* -------------------------------------------------------------------------- */
/* 4 · Los hermanos del evento                                                 */
/* -------------------------------------------------------------------------- */

describe("todo evento que se refiere a una pregunta concreta lleva su destreza", () => {
  // `practice_started` no está en la lista a propósito: habla de la sesión, no
  // de una pregunta, y no hay destreza que ponerle sin inventarla.
  it("question_shown, hint_requested, solution_viewed y question_skipped", () => {
    const q = pregunta(SIMPLIFY.engineKey, 1, 666);
    const { effects } = correr(initialPracticeState(SIMPLIFY.engineKey), [
      { type: "question_shown", question: q, now: 0 },
      { type: "hint_toggled", open: true, now: 5 },
      { type: "solution_toggled", open: true, now: 6 },
      { type: "answer_changed", value: "7", now: 7 },
      { type: "answer_changed", value: "", now: 8 },
      { type: "skip", now: 9 },
    ]);

    for (const tipo of [
      "question_shown",
      "hint_requested",
      "solution_viewed",
      "answer_changed",
      "answer_cleared",
      "question_skipped",
    ]) {
      const evento = eventos(effects, tipo);
      expect(evento.length, `no se emitió ningún '${tipo}'`).toBeGreaterThan(0);
      for (const uno of evento) {
        expect(destrezaDe(uno), `'${tipo}' sin destreza`).toBe(SIMPLIFY.skillCode);
      }
    }
  });

  it("practice_streak: una racha es de una destreza, no del aire", () => {
    // La racha se emite al ACERTAR, así que hay que responder bien de verdad.
    const q = pregunta(SIMPLIFY.engineKey, 1, 777);
    const correcta = (q.item.answerKey as { canonical?: string }).canonical;
    expect(typeof correcta, "el generador debe traer respuesta canónica").toBe("string");

    const { effects } = correr(initialPracticeState(SIMPLIFY.engineKey), [
      { type: "question_shown", question: q, now: 0 },
      { type: "answer_changed", value: correcta as string, now: 1 },
      { type: "submit", now: 2 },
    ]);

    const racha = uno(effects, "practice_streak");
    expect(racha.payload.streak).toBe(1);
    // Sin esto, «lleva 12 seguidas» no se puede atribuir a nada: la fila entra
    // en `learning_events` con `skill_id` NULL y el scorecard la ignora.
    expect(destrezaDe(racha)).toBe(SIMPLIFY.skillCode);
  });
});
