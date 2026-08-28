/**
 * Avance por lección: que la cifra que ve el alumno salga de sus eventos y no
 * dependa del orden en que lleguen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es `.ts` y corre en Node porque la reducción es pura: no hay DOM que montar.
 * Que se pueda probar así, sin base de datos y sin navegador, es la razón de que
 * la reducción viva separada de la consulta (ver la cabecera del módulo).
 *
 * Los tres fallos que este fichero persigue, y que no son hipotéticos:
 *   1. una reducción «el último gana» que des-termina una lección cuando el
 *      alumno vuelve a abrirla para repasar;
 *   2. una fila con forma rara que se cuela en un contador o que revienta la
 *      pantalla;
 *   3. contar el mapa en vez del catálogo, y decir «13 de 12».
 */
import { describe, expect, it } from "vitest";

import {
  LOOKBACK_DAYS,
  MAX_EVENT_ROWS,
  countLessons,
  readLessonEvents,
  summariseLessonEvents,
  type LessonEvent,
} from "./lesson-progress";
import {
  LOOKBACK_DAYS as LOOKBACK_PRACTICA,
  MAX_EVENT_ROWS as MAX_FILAS_PRACTICA,
} from "./practice-progress";

/** Fila tal y como la devuelve PostgREST para `select("lesson_id, event_type")`. */
const fila = (lessonId: string, eventType: string): unknown => ({
  lesson_id: lessonId,
  event_type: eventType,
});

const abierta = (lessonId: string): LessonEvent => ({ lessonId, type: "lesson_opened" });
const terminada = (lessonId: string): LessonEvent => ({ lessonId, type: "lesson_completed" });

const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const L3 = "33333333-3333-4333-8333-333333333333";

/* -------------------------------------------------------------------------- */

describe("lectura de filas crudas", () => {
  it("lee `lesson_id` de la COLUMNA, que es donde la base lo pone", () => {
    // Migración 0010: `lesson_id` es columna de `learning_events`, no una clave
    // del `payload`. Un lector que fuera al payload compilaría y contaría cero.
    expect(readLessonEvents([fila(L1, "lesson_opened")])).toEqual([abierta(L1)]);
  });

  it("descarta lo que no tenga la forma esperada, sin excepción y sin contarlo", () => {
    const rows: unknown[] = [
      fila(L1, "lesson_completed"),
      { event_type: "lesson_opened" }, // sin lesson_id
      { lesson_id: 42, event_type: "lesson_opened" }, // lesson_id numérico
      { lesson_id: L2, event_type: "practice_item_answered" }, // otra familia
      { lesson_id: L2, event_type: "lesson_deleted" }, // tipo inventado
      { lesson_id: "", event_type: "lesson_opened" }, // id vacío
      { lesson_id: L2 }, // sin event_type
      { lesson_id: L2, event_type: 7 }, // event_type no textual
      { lesson_id: null, event_type: null },
      null,
      "basura",
      42,
    ];
    expect(readLessonEvents(rows)).toEqual([terminada(L1)]);
  });

  it("una lista vacía no inventa lecciones: cero eventos, cero entradas", () => {
    expect(readLessonEvents([])).toEqual([]);
    expect(summariseLessonEvents(readLessonEvents([])).size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("`completed` gana sobre `started`, en cualquier orden de llegada", () => {
  it("terminada y luego abierta de nuevo: sigue terminada", () => {
    // Es EL caso real: el alumno vuelve a la lección a repasar antes del examen.
    // Una reducción «el último gana» le borraría el logro por repasar.
    const progreso = summariseLessonEvents([terminada(L1), abierta(L1)]);
    expect(progreso.get(L1)).toBe("completed");
  });

  it("abierta y luego terminada: terminada", () => {
    const progreso = summariseLessonEvents([abierta(L1), terminada(L1)]);
    expect(progreso.get(L1)).toBe("completed");
  });

  it("el resultado no depende del orden del lote, sea cual sea", () => {
    // Los lotes llegan desordenados por diseño (regla 3 de `shared/events.ts`).
    // Si alguna permutación diera otra cosa, la reducción estaría mal.
    const esperado = new Map<string, string>([
      [L1, "completed"],
      [L2, "started"],
    ]);
    const permutaciones: LessonEvent[][] = [
      [abierta(L1), terminada(L1), abierta(L1), abierta(L2)],
      [abierta(L2), abierta(L1), terminada(L1), abierta(L1)],
      [abierta(L1), abierta(L1), abierta(L2), terminada(L1)],
      [terminada(L1), abierta(L2), abierta(L1), abierta(L1)],
      [abierta(L1), abierta(L2), terminada(L1), abierta(L1)],
    ];
    for (const orden of permutaciones) {
      expect(new Map(summariseLessonEvents(orden))).toEqual(esperado);
    }
  });

  it("sólo `lesson_opened` es `started`, y NO cuenta como terminada", () => {
    const progreso = summariseLessonEvents([abierta(L1), abierta(L1)]);
    expect(progreso.get(L1)).toBe("started");
    expect(countLessons([L1], progreso)).toEqual({ completed: 0, started: 1 });
  });
});

/* -------------------------------------------------------------------------- */

describe("recuento sobre el catálogo, nunca sobre el mapa", () => {
  const progreso = summariseLessonEvents([terminada(L1), abierta(L2), terminada(L3)]);

  it("cuenta terminadas y empezadas de los ids que se le dan", () => {
    expect(countLessons([L1, L2], progreso)).toEqual({ completed: 1, started: 1 });
  });

  it("una terminada no se cuenta ADEMÁS como empezada", () => {
    // Los dos rótulos se enseñan juntos («3 de 12 terminadas · 2 en marcha»);
    // sumar la misma lección en los dos daría más «en marcha» que lecciones.
    const { completed, started } = countLessons([L1, L2, L3], progreso);
    expect(completed + started).toBeLessThanOrEqual(3);
    expect({ completed, started }).toEqual({ completed: 2, started: 1 });
  });

  it("ids sin eventos dan ceros, no huecos ni excepciones", () => {
    expect(countLessons(["sin-eventos", "tampoco"], progreso)).toEqual({
      completed: 0,
      started: 0,
    });
    expect(countLessons([], progreso)).toEqual({ completed: 0, started: 0 });
    expect(countLessons([], new Map())).toEqual({ completed: 0, started: 0 });
  });

  it("NUNCA cuenta entradas del mapa que no estén en la lista de ids", () => {
    // Una lección despublicada conserva sus eventos —son hechos históricos— y
    // contar el mapa haría que la materia dijera «13 de 12».
    expect(countLessons([L2], progreso)).toEqual({ completed: 0, started: 1 });
    expect(countLessons([], progreso)).toEqual({ completed: 0, started: 0 });
  });
});

/* -------------------------------------------------------------------------- */

describe("una sola ventana para todo el progreso del alumno", () => {
  it("la ventana y el tope son LOS MISMOS que usa la práctica", () => {
    // Si esto se rompe es que alguien ha copiado las constantes en vez de
    // importarlas: dos ventanas distintas en la misma pantalla es un bug que no
    // se ve hasta que un alumno dice que su avance «se ha borrado».
    expect(LOOKBACK_DAYS).toBe(LOOKBACK_PRACTICA);
    expect(MAX_EVENT_ROWS).toBe(MAX_FILAS_PRACTICA);
  });
});
