/**
 * El resumen de práctica que ve un padre.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se prueba el módulo puro y no la pantalla: la pantalla pinta lo que este
 * fichero decide, y lo que puede estar mal —y hacerle creer a un padre algo
 * falso sobre su hijo— son las reglas de recuento, no el `<table>`.
 */
import { describe, expect, it } from "vitest";

import { hayPractica, resumirPractica, type FilaDeEvento } from "./practica";

const OPCIONES = { maxIntentos: 10, truncado: false } as const;

/** Una fila como la devuelve PostgREST, con lo justo. */
function fila(
  event_type: string,
  payload: Record<string, unknown>,
  server_ts = "2026-09-01T10:00:00.000Z",
): FilaDeEvento {
  return { event_type, server_ts, payload };
}

describe("resumirPractica", () => {
  it("cuenta respondidas y aciertos por tema", () => {
    const { temas } = resumirPractica(
      [
        fila("practice_item_answered", { engineKey: "math.simplify", isCorrect: true }),
        fila("practice_item_answered", { engineKey: "math.simplify", isCorrect: false }),
        fila("practice_item_answered", { engineKey: "math.simplify", isCorrect: true }),
      ],
      OPCIONES,
    );

    expect(temas).toHaveLength(1);
    expect(temas[0]).toMatchObject({
      engineKey: "math.simplify",
      respondidas: 3,
      aciertos: 2,
      fallos: 1,
    });
    expect(temas[0]?.precision).toBeCloseTo(2 / 3);
  });

  it("EL EXAMEN NO SE CUELA: sin engineKey no es practica", () => {
    // `answer_submitted` lo emiten las dos superficies. Solo la practica
    // trabaja con generadores, asi que solo ella trae `engineKey`. Si esta
    // regla se rompiera, un examen entregado aparecería en la pantalla del
    // padre como «preguntas que falló practicando», que es otra cosa y se
    // corrige con otras reglas (las del servidor, AD-5).
    const { temas, intentos } = resumirPractica(
      [
        fila("answer_submitted", { isCorrect: false, response: "12", attemptId: "x" }),
        fila("practice_item_answered", { isCorrect: true }),
      ],
      OPCIONES,
    );

    expect(temas).toEqual([]);
    expect(intentos).toEqual([]);
  });

  it("un veredicto que no es booleano se descarta entero", () => {
    // Contarlo como fallo inventaría un error que el niño no cometió, y ese
    // error acabaría en una conversación real entre un padre y su hijo.
    const { temas } = resumirPractica(
      [
        fila("practice_item_answered", { engineKey: "math.compare", isCorrect: "si" }),
        fila("practice_item_answered", { engineKey: "math.compare", isCorrect: true }),
      ],
      OPCIONES,
    );

    expect(temas[0]).toMatchObject({ respondidas: 1, aciertos: 1, fallos: 0 });
  });

  it("las pistas y las soluciones cuentan aparte y no inflan las respondidas", () => {
    const { temas } = resumirPractica(
      [
        fila("hint_requested", { engineKey: "math.word", hintIndex: 0 }),
        fila("hint_requested", { engineKey: "math.word", hintIndex: 1 }),
        fila("solution_viewed", { engineKey: "math.word" }),
        fila("practice_item_answered", { engineKey: "math.word", isCorrect: false }),
      ],
      OPCIONES,
    );

    expect(temas[0]).toMatchObject({
      respondidas: 1,
      pistas: 2,
      soluciones: 1,
    });
  });

  it("un tema sin respuestas no lleva porcentaje", () => {
    // Dividir por cero daría `NaN`; un 0 % sería peor, porque es una nota que
    // nadie sacó.
    const { temas } = resumirPractica(
      [fila("hint_requested", { engineKey: "math.shape", hintIndex: 0 })],
      OPCIONES,
    );

    expect(temas[0]?.precision).toBeNull();
  });

  it("los intentos traen lo que respondio, cuanto tardo y cuanta ayuda pidio", () => {
    const { intentos } = resumirPractica(
      [
        fila(
          "answer_submitted",
          {
            engineKey: "math.simplify",
            isCorrect: false,
            response: "3/6",
            timeOnItemMs: 21400,
            hintsUsed: 1,
            changeCount: 2,
          },
          "2026-09-01T09:30:00.000Z",
        ),
      ],
      OPCIONES,
    );

    expect(intentos).toEqual([
      {
        cuando: "2026-09-01T09:30:00.000Z",
        engineKey: "math.simplify",
        acerto: false,
        respuesta: "3/6",
        segundos: 21,
        pistas: 1,
        cambios: 2,
      },
    ]);
  });

  it("una respuesta ausente se distingue de una respuesta vacia", () => {
    // Las dos se pintan como «lo dejó en blanco», pero el modelo no debe
    // inventar una cadena vacía donde el evento no traía nada.
    const { intentos } = resumirPractica(
      [
        fila("answer_submitted", { engineKey: "math.metric", isCorrect: false }),
        fila("answer_submitted", { engineKey: "math.metric", isCorrect: false, response: "  " }),
      ],
      OPCIONES,
    );

    expect(intentos.map((i) => i.respuesta)).toEqual([null, null]);
  });

  it("un contador ausente o absurdo vale cero, nunca NaN ni negativo", () => {
    const { intentos } = resumirPractica(
      [
        fila("answer_submitted", {
          engineKey: "math.decimal",
          isCorrect: true,
          hintsUsed: -3,
          changeCount: "dos",
          timeOnItemMs: -1,
        }),
      ],
      OPCIONES,
    );

    expect(intentos[0]).toMatchObject({ pistas: 0, cambios: 0, segundos: null });
  });

  it("recortar la lista de intentos NO borra el tema de la tabla", () => {
    // El tope existe para que la lista se pueda leer, no para esconder temas.
    // Un tema que solo aparece al final del periodo tiene que seguir contando.
    const filas = [
      fila("answer_submitted", { engineKey: "math.compare", isCorrect: true }),
      fila("answer_submitted", { engineKey: "math.compare", isCorrect: true }),
      fila("answer_submitted", { engineKey: "math.word", isCorrect: false }),
    ];

    const { intentos, temas } = resumirPractica(filas, { maxIntentos: 2, truncado: false });

    expect(intentos).toHaveLength(2);
    expect(temas.map((t) => t.engineKey).sort()).toEqual(["math.compare", "math.word"]);
  });

  it("los temas se ordenan por volumen y no por acierto", () => {
    // Con un tema de una sola pregunta acertada encabezando por su 100 %, el
    // tema en el que el niño lleva media hora quedaría abajo — justo el que el
    // padre ha venido a mirar.
    const filas: FilaDeEvento[] = [
      fila("practice_item_answered", { engineKey: "math.suerte", isCorrect: true }),
      ...Array.from({ length: 5 }, () =>
        fila("practice_item_answered", { engineKey: "math.duro", isCorrect: false }),
      ),
    ];

    const { temas } = resumirPractica(filas, OPCIONES);
    expect(temas.map((t) => t.engineKey)).toEqual(["math.duro", "math.suerte"]);
  });

  it("el truncado se propaga tal cual", () => {
    const { truncado } = resumirPractica([], { maxIntentos: 10, truncado: true });
    expect(truncado).toBe(true);
  });

  it("no se cae con basura", () => {
    const basura = [
      {},
      { event_type: 7, payload: {} },
      { event_type: "practice_item_answered", payload: null },
      { event_type: "practice_item_answered", payload: [] },
    ] as FilaDeEvento[];

    expect(() => resumirPractica(basura, OPCIONES)).not.toThrow();
    expect(resumirPractica(basura, OPCIONES).temas).toEqual([]);
  });
});

describe("hayPractica", () => {
  it("una pista suelta no es haber practicado", () => {
    // Pintar una tabla de ceros le dice a un padre que el producto está roto,
    // no que su hijo aún no ha empezado.
    const practica = resumirPractica(
      [fila("hint_requested", { engineKey: "math.word", hintIndex: 0 })],
      OPCIONES,
    );
    expect(hayPractica(practica)).toBe(false);
  });

  it("una respuesta si lo es", () => {
    const practica = resumirPractica(
      [fila("practice_item_answered", { engineKey: "math.word", isCorrect: false })],
      OPCIONES,
    );
    expect(hayPractica(practica)).toBe(true);
  });
});
