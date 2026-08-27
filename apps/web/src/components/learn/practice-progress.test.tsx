/**
 * Progreso por grupo de práctica: que el número que ve el alumno salga de sus
 * respuestas y de ninguna otra parte.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es `.tsx` y no `.ts` para que corra en jsdom: importa `masteryLevel` de
 * `@cet/ui`, cuyo barril arrastra componentes de cliente. Que los umbrales de
 * nivel vengan de allí y no de una copia local es justamente lo que prueba el
 * bloque "paridad de umbrales": dos declaraciones del mismo umbral divergen el
 * día que alguien retoca una (regla R3 de `VERIFICATION_PLAN.md`).
 */
import { describe, expect, it } from "vitest";
import { masteryLevel } from "@cet/ui";

import {
  MIN_EVIDENCE,
  WINDOW,
  correctsToReach,
  nextStepFor,
  readAnsweredEvents,
  summarisePracticeEvents,
  type AnsweredEvent,
} from "./practice-progress";
import { nextStepTargets, nextStepText } from "./practice-progress-text";
import { getLearnDictionary } from "./dictionary";

/** Fila tal y como la devuelve PostgREST para `select("payload")`. */
const fila = (engineKey: string, isCorrect: boolean): unknown => ({
  payload: { engineKey, topicId: engineKey, skillCode: "x", isCorrect, pointsAwarded: 1 },
});

const evento = (engineKey: string, isCorrect: boolean): AnsweredEvent => ({ engineKey, isCorrect });

/* -------------------------------------------------------------------------- */

describe("lectura de eventos crudos", () => {
  it("descarta lo que no tenga la forma esperada en vez de contarlo como fallo", () => {
    // El payload es `jsonb`: la base no puede garantizar su forma. Un evento de
    // otra época NO puede contaminar un contador ni en un sentido ni en el otro.
    const rows: unknown[] = [
      fila("math.compare", true),
      { payload: { engineKey: "math.compare" } }, // sin isCorrect
      { payload: { isCorrect: true } }, // sin engineKey
      { payload: { engineKey: "", isCorrect: true } }, // clave vacía
      { payload: { engineKey: "math.compare", isCorrect: "sí" } }, // no booleano
      { payload: null },
      null,
      "basura",
    ];
    expect(readAnsweredEvents(rows)).toEqual([{ engineKey: "math.compare", isCorrect: true }]);
  });

  it("sin filas no hay ningún grupo: no se inventa una entrada a cero", () => {
    // Es LA regresión que persigue este fichero. Si algún día esto devolviera un
    // grupo con nivel "starting", la pantalla pintaría una escalera a un alumno
    // que no ha practicado nunca, y le diría que va mal sin ningún dato.
    expect(summarisePracticeEvents(readAnsweredEvents([])).size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("agregación por grupo", () => {
  it("agrupa por engineKey, no por topicId: la mezcla acredita al grupo real", () => {
    // `practice-machine.ts` emite `topicId: "mix"` con el `engineKey` real. Si se
    // agrupara por topicId, todo el trabajo hecho en la mezcla acabaría en un
    // grupo llamado "Mezcla" que el alumno no puede practicar por separado.
    const rows: unknown[] = [
      { payload: { topicId: "mix", engineKey: "math.compare", isCorrect: true } },
      { payload: { topicId: "mix", engineKey: "math.compare", isCorrect: true } },
      { payload: { topicId: "mix", engineKey: "math.powten", isCorrect: false } },
    ];
    const out = summarisePracticeEvents(readAnsweredEvents(rows));
    expect([...out.keys()].sort()).toEqual(["math.compare", "math.powten"]);
    expect(out.get("mix")).toBeUndefined();
    expect(out.get("math.compare")?.totalAnswered).toBe(2);
  });

  it("la ventana son las WINDOW respuestas MÁS RECIENTES, no las primeras", () => {
    // Contrato con `getPracticeProgress`, que consulta `order(server_ts desc)`.
    // Un alumno que fallaba y ahora acierta tiene que verlo hoy, no dentro de
    // trescientas preguntas.
    const recientesAcertadas = Array.from({ length: WINDOW }, () => evento("math.compare", true));
    const viejasFalladas = Array.from({ length: 40 }, () => evento("math.compare", false));
    const out = summarisePracticeEvents([...recientesAcertadas, ...viejasFalladas]);
    const g = out.get("math.compare");

    expect(g?.windowAnswered).toBe(WINDOW);
    expect(g?.windowCorrect).toBe(WINDOW);
    expect(g?.recentAccuracy).toBe(1);
    expect(g?.level).toBe("mastered");
    // El total sí es el histórico completo: es la evidencia que se le enseña.
    expect(g?.totalAnswered).toBe(WINDOW + 40);
    expect(g?.totalCorrect).toBe(WINDOW);
  });

  it("con menos de MIN_EVIDENCE respuestas no hay nivel y el objetivo es conseguir evidencia", () => {
    const out = summarisePracticeEvents([evento("math.compare", true)]);
    const g = out.get("math.compare");
    expect(g?.level).toBeNull();
    expect(g?.recentAccuracy).toBeNull();
    expect(g?.nextStep).toEqual({ kind: "need_evidence", questions: MIN_EVIDENCE - 1 });
  });

  it("un solo acierto NO produce 'Dominado'", () => {
    // Sin el mínimo de evidencia, 1/1 = 100 % y la escalera saldría llena. Es
    // mentira la primera vez y desmoralizante la segunda, cuando baje sola.
    const out = summarisePracticeEvents([evento("math.compare", true)]);
    expect(out.get("math.compare")?.level).not.toBe("mastered");
  });
});

/* -------------------------------------------------------------------------- */

describe("paridad de umbrales con @cet/ui", () => {
  it("el nivel de un grupo es exactamente masteryLevel(aciertos/respuestas)", () => {
    for (let correct = 0; correct <= WINDOW; correct += 1) {
      const rows = [
        ...Array.from({ length: correct }, () => evento("g", true)),
        ...Array.from({ length: WINDOW - correct }, () => evento("g", false)),
      ];
      const g = summarisePracticeEvents(rows).get("g");
      expect(g?.level).toBe(masteryLevel(correct / WINDOW));
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("«cuánto esfuerzo más» — el objetivo nunca puede ser grande", () => {
  it("jamás pide más de WINDOW aciertos, sea cual sea el punto de partida", () => {
    // Es LA defensa de diseño: "te faltan 200 preguntas" hace abandonar a un
    // niño de once años. Si alguien cambia el cálculo por una distancia al total,
    // este test lo para.
    for (let answered = 0; answered <= WINDOW; answered += 1) {
      for (let correct = 0; correct <= answered; correct += 1) {
        const step = nextStepFor(answered, correct);
        expect(nextStepTargets(step)).toBeLessThanOrEqual(WINDOW);
        expect(nextStepTargets(step)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("el objetivo apunta al peldaño SIGUIENTE, no a la cima", () => {
    // 3 de 10 = "learning". El siguiente es "solid", nunca "mastered".
    const step = nextStepFor(10, 3);
    expect(step).toMatchObject({ kind: "to_next_level", level: "solid" });
  });

  it("los aciertos que promete bastan de verdad para subir de peldaño", () => {
    // Un objetivo que se cumple y no sube de nivel es peor que no dar objetivo.
    for (let answered = MIN_EVIDENCE; answered <= WINDOW; answered += 1) {
      for (let correct = 0; correct <= answered; correct += 1) {
        const step = nextStepFor(answered, correct);
        if (step.kind !== "to_next_level") continue;

        let a = answered;
        let c = correct;
        for (let k = 0; k < step.correct; k += 1) {
          if (a >= WINDOW) c = Math.max(0, c - (c >= a ? 1 : 0)) + 1;
          else {
            a += 1;
            c += 1;
          }
        }
        const alcanzado = masteryLevel(c / a);
        expect(
          ["solid", "mastered", step.level].includes(alcanzado) &&
            alcanzado !== masteryLevel(correct / answered),
          `Desde ${correct}/${answered} prometía ${step.correct} aciertos para llegar a ` +
            `${step.level} y se queda en ${alcanzado}`,
        ).toBe(true);
      }
    }
  });

  it("dominado no pide nada: EffortMeter no pinta un objetivo inventado", () => {
    const step = nextStepFor(WINDOW, WINDOW);
    expect(step).toEqual({ kind: "mastered" });
    expect(nextStepTargets(step)).toBe(0);
  });

  it("correctsToReach devuelve el MÍNIMO, no un número cómodo", () => {
    // 6/10 con umbral 0.85. Un acierto menos que el devuelto no puede bastar.
    const k = correctsToReach(10, 6, 0.85);
    expect(k).not.toBeNull();
    expect(k).toBeGreaterThan(0);
    expect(correctsToReach(4, 4, 0.85)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("la frase que lee el niño", () => {
  const es = getLearnDictionary("es");

  it("no contiene ningún porcentaje", () => {
    // "Te falta el 40 %" no es accionable a los once años. Si alguien reintroduce
    // un porcentaje en esta frase, este test lo dice.
    for (let answered = 0; answered <= WINDOW; answered += 1) {
      for (let correct = 0; correct <= answered; correct += 1) {
        expect(nextStepText(nextStepFor(answered, correct), es, "es")).not.toMatch(/%/);
      }
    }
  });

  it("el número que dice la frase es el mismo que dibuja EffortMeter", () => {
    // Si el texto promete 3 y el dibujo enseña 5, el dibujo es decoración y el
    // alumno aprende a no mirarlo.
    for (let answered = 0; answered <= WINDOW; answered += 1) {
      for (let correct = 0; correct <= answered; correct += 1) {
        const step = nextStepFor(answered, correct);
        const targets = nextStepTargets(step);
        if (targets <= 1) continue; // las formas "1" van sin cifra en el texto
        expect(nextStepText(step, es, "es")).toContain(String(targets));
      }
    }
  });

  it("singular y plural están escritos, no generados con una 's'", () => {
    expect(nextStepText({ kind: "need_evidence", questions: 1 }, es, "es")).toContain("1 pregunta ");
    expect(nextStepText({ kind: "to_next_level", correct: 1, level: "solid" }, es, "es")).toContain(
      "1 acierto ",
    );
  });
});
