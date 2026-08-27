/**
 * Materializacion del examen. Aqui se comprueba lo que hace posible la
 * reconstruccion forense: mismo (blueprint, banco, semilla) -> mismo examen.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { materializeExam, totalMaxPoints, type ExamBlueprint } from "../blueprint.js";
import { InsufficientPoolError } from "../errors.js";
import { deriveItemSeed } from "../seed.js";
import { registry } from "../generators/index.js";

function staticQuestion(index: number, skill = "skill-a", difficulty = 3): unknown {
  return {
    questionId: `q-${index}`,
    questionVersionId: `qv-${String(index).padStart(3, "0")}`,
    skillId: skill,
    kind: "static",
    format: "mcq_single",
    difficulty,
    maxPoints: 1,
    gradingMode: "auto",
    tags: index % 2 === 0 ? ["par"] : ["impar"],
    body: {
      stem: `Pregunta ${index}`,
      options: [
        { id: "a", html: "Opcion A" },
        { id: "b", html: "Opcion B" },
        { id: "c", html: "Opcion C" },
        { id: "d", html: "Opcion D" },
      ],
    },
    answerSpec: { type: "choice", correctIds: ["b"] },
  };
}

function generatedQuestion(index: number, engineKey = "math.fracop"): unknown {
  return {
    questionId: `g-${index}`,
    questionVersionId: `gv-${String(index).padStart(3, "0")}`,
    skillId: "skill-gen",
    kind: "generated",
    format: "fraction",
    difficulty: 3,
    maxPoints: 2,
    gradingMode: "auto",
    body: { engineKey, paramSpec: {} },
  };
}

const POOL = [
  ...Array.from({ length: 12 }, (_, i) => staticQuestion(i + 1)),
  ...Array.from({ length: 6 }, (_, i) => generatedQuestion(i + 1)),
];

const BLUEPRINT: ExamBlueprint = {
  shuffleQuestions: true,
  shuffleOptions: true,
  locale: "en",
  sections: [
    { ord: 1, itemCount: 4, source: "bank", selection: {} },
    { ord: 2, itemCount: 3, source: "generated", selection: {}, pointsPerItem: 5 },
  ],
};

describe("materializeExam", () => {
  it("es determinista: misma semilla, mismo examen byte a byte", () => {
    const a = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 555 });
    const b = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 555 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("el orden del banco no altera el resultado (Postgres no garantiza orden)", () => {
    const a = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 777 });
    const b = materializeExam({ blueprint: BLUEPRINT, pool: [...POOL].reverse(), rootSeed: 777 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("semillas distintas dan examenes distintos", () => {
    const a = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 1 });
    const b = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 2 });
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it("numera los items desde 1 y sin huecos", () => {
    const items = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 3 });
    expect(items.map((i) => i.ord)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(items.filter((i) => i.sectionOrd === 1)).toHaveLength(4);
    expect(items.filter((i) => i.sectionOrd === 2)).toHaveLength(3);
  });

  it("la semilla de cada item se deriva de la raiz y su posicion", () => {
    const items = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 4242 });
    for (const item of items) {
      expect(item.itemSeed).toBe(deriveItemSeed(4242, item.ord));
    }
  });

  it("no repite preguntas entre secciones", () => {
    const blueprint: ExamBlueprint = {
      ...BLUEPRINT,
      sections: [
        { ord: 1, itemCount: 6, source: "bank", selection: {} },
        { ord: 2, itemCount: 6, source: "bank", selection: {} },
      ],
    };
    const items = materializeExam({ blueprint, pool: POOL, rootSeed: 9 });
    expect(new Set(items.map((i) => i.questionId)).size).toBe(12);
  });

  it("guarda la permutacion de opciones y la aplica de verdad", () => {
    const items = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 31 });
    const withOptions = items.filter((i) => i.renderedBody.options !== undefined);
    expect(withOptions.length).toBeGreaterThan(0);
    for (const item of withOptions) {
      const order = item.optionOrder;
      expect(order).not.toBeNull();
      expect([...(order ?? [])].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
      // Sin option_order, "eligio la B" no significa nada: la permutacion tiene
      // que reconstruir exactamente lo que vio el alumno.
      const original = ["a", "b", "c", "d"];
      const shown = (item.renderedBody.options ?? []).map((o) => o.id);
      expect(shown).toEqual((order ?? []).map((index) => original[index]));
    }
  });

  it("sin shuffleOptions la permutacion es la identidad", () => {
    const items = materializeExam({
      blueprint: { ...BLUEPRINT, shuffleOptions: false },
      pool: POOL,
      rootSeed: 31,
    });
    for (const item of items.filter((i) => i.renderedBody.options !== undefined)) {
      expect(item.optionOrder).toEqual([0, 1, 2, 3]);
    }
  });

  it("resuelve los generadores con la semilla del item", () => {
    const items = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 8080 });
    const generated = items.filter((i) => i.sectionOrd === 2);
    expect(generated).toHaveLength(3);
    for (const item of generated) {
      const expected = registry.generate(
        "math.fracop",
        { locale: "en", difficulty: 3 },
        item.itemSeed,
      );
      expect(item.renderedBody.stem).toBe(expected.body.stem);
      expect(JSON.stringify(item.answerKey)).toBe(JSON.stringify(expected.answerKey));
      expect(item.maxPoints).toBe(5); // pointsPerItem manda sobre el de la pregunta
    }
  });

  it("suma correctamente la puntuacion maxima", () => {
    const items = materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 12 });
    expect(totalMaxPoints(items)).toBe(4 * 1 + 3 * 5);
  });

  it("una seccion con item_count 0 no aporta items", () => {
    const items = materializeExam({
      blueprint: {
        ...BLUEPRINT,
        sections: [
          { ord: 1, itemCount: 0, source: "bank", selection: {} },
          { ord: 2, itemCount: 2, source: "bank", selection: {} },
        ],
      },
      pool: POOL,
      rootSeed: 5,
    });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.ord)).toEqual([1, 2]);
  });

  it("falla explicitamente cuando el banco no llega", () => {
    expect(() =>
      materializeExam({
        blueprint: {
          ...BLUEPRINT,
          sections: [{ ord: 1, itemCount: 99, source: "bank", selection: {} }],
        },
        pool: POOL,
        rootSeed: 1,
      }),
    ).toThrow(InsufficientPoolError);
  });

  it("el error dice cuantas faltan y con que filtros", () => {
    try {
      materializeExam({
        blueprint: {
          ...BLUEPRINT,
          sections: [
            {
              ord: 7,
              itemCount: 5,
              source: "bank",
              selection: { skillIds: ["no-existe"] },
            },
          ],
        },
        pool: POOL,
        rootSeed: 1,
      });
      throw new Error("deberia haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientPoolError);
      const failure = error as InsufficientPoolError;
      expect(failure.sectionOrd).toBe(7);
      expect(failure.required).toBe(5);
      expect(failure.available).toBe(0);
      expect(failure.criteria).toContain("no-existe");
    }
  });

  it("respeta los filtros de seleccion", () => {
    const items = materializeExam({
      blueprint: {
        ...BLUEPRINT,
        sections: [
          { ord: 1, itemCount: 3, source: "bank", selection: { tags: ["par"] } },
        ],
      },
      pool: POOL,
      rootSeed: 21,
    });
    expect(items).toHaveLength(3);
    for (const item of items) {
      const index = Number(item.questionId.replace("q-", ""));
      expect(index % 2).toBe(0);
    }
  });

  it("rechaza un banco con question_version_id duplicado", () => {
    expect(() =>
      materializeExam({
        blueprint: BLUEPRINT,
        pool: [staticQuestion(1), staticQuestion(1)],
        rootSeed: 1,
      }),
    ).toThrow(/repetido/);
  });

  it("rechaza una pregunta del banco que no cumple el contrato", () => {
    expect(() =>
      materializeExam({
        blueprint: BLUEPRINT,
        pool: [{ questionId: "roto" }],
        rootSeed: 1,
      }),
    ).toThrow(/no cumple el contrato/);
  });

  it("falla si el banco apunta a un generador que no existe", () => {
    expect(() =>
      materializeExam({
        blueprint: {
          shuffleQuestions: false,
          shuffleOptions: false,
          sections: [{ ord: 1, itemCount: 1, source: "generated", selection: {} }],
        },
        pool: [
          {
            ...(generatedQuestion(1) as Record<string, unknown>),
            body: { engineKey: "math.no_existe", paramSpec: {} },
          },
        ],
        rootSeed: 1,
      }),
    ).toThrow(/No hay generador registrado/);
  });

  it("falla si el paramSpec del banco no cumple el esquema del generador", () => {
    expect(() =>
      materializeExam({
        blueprint: {
          shuffleQuestions: false,
          shuffleOptions: false,
          sections: [{ ord: 1, itemCount: 1, source: "generated", selection: {} }],
        },
        pool: [
          {
            ...(generatedQuestion(1) as Record<string, unknown>),
            body: { engineKey: "math.fracop", paramSpec: { ops: [] } },
          },
        ],
        rootSeed: 1,
      }),
    ).toThrow(/Parametros invalidos/);
  });

  it("rechaza una semilla raiz invalida", () => {
    expect(() => materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: -1 })).toThrow();
    expect(() => materializeExam({ blueprint: BLUEPRINT, pool: POOL, rootSeed: 1.5 })).toThrow();
  });

  it("sanea el contenido estatico del banco antes de persistirlo", () => {
    const items = materializeExam({
      blueprint: {
        shuffleQuestions: false,
        shuffleOptions: false,
        sections: [{ ord: 1, itemCount: 1, source: "bank", selection: {} }],
      },
      pool: [
        {
          ...(staticQuestion(1) as Record<string, unknown>),
          body: {
            stem: '<script>alert(1)</script><b>ok</b>',
            options: [{ id: "a", html: '<img src=x onerror=alert(1)>' }],
          },
        },
      ],
      rootSeed: 1,
    });
    const stem = items[0]?.renderedBody.stem ?? "";
    expect(stem).not.toContain("<script>");
    expect(stem).toContain("<b>ok</b>");
    expect(items[0]?.renderedBody.options?.[0]?.html ?? "").not.toContain("<img");
  });

  it("sin shuffleQuestions el orden es estable e independiente de la semilla", () => {
    const blueprint: ExamBlueprint = { ...BLUEPRINT, shuffleQuestions: false };
    const a = materializeExam({ blueprint, pool: POOL, rootSeed: 100 });
    const b = materializeExam({ blueprint, pool: POOL, rootSeed: 100 });
    expect(a.map((i) => i.questionVersionId)).toEqual(b.map((i) => i.questionVersionId));
    const sectionOne = a.filter((i) => i.sectionOrd === 1).map((i) => i.questionVersionId);
    expect(sectionOne).toEqual([...sectionOne].sort());
  });
});
