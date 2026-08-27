/**
 * Tests del extractor sobre un trainer de muestra.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { lessonsFromAccordions } from "../src/extract/accordion.ts";
import { normalizeBank, toStaticQuestion, BankEntryError } from "../src/extract/bank.ts";
import { extractBlocks } from "../src/extract/blocks.ts";
import { sectionsFromMockPlan, sectionsFromMparts } from "../src/extract/blueprint.ts";
import { extractInlineScripts, readSymbolArray, sliceElementById } from "../src/extract/html.ts";
import { planFromArray, planFromPanel } from "../src/extract/plan.ts";
import { lessonBlock } from "../src/schema.ts";
import { MINI_TRAINER } from "./fixtures/mini-trainer.ts";

const SOURCE = { file: "__tests__/fixtures/mini-trainer.ts", symbol: "#learn .topic", index: 0 };
const skillOf = (c: string): string =>
  c === "ps" ? "english.grammar.present_simple" : "english.vocabulary.topics";

describe("lecciones desde acordeones estáticos", () => {
  const { lessons, gaps } = lessonsFromAccordions(MINI_TRAINER, {
    locale: "en",
    file: "mini.html",
    sectionId: "learn",
    skillCodesByIndex: [["english.grammar.present_simple"], ["english.vocabulary.topics"]],
  });

  it("encuentra los dos acordeones y no la tarjeta de introducción", () => {
    expect(lessons).toHaveLength(2);
  });

  it("saca el título del botón, sin el galón", () => {
    expect(lessons[0]!.title.en).toBe("🔤 1 · Present Simple — play / plays");
    expect(lessons[0]!.title.en).not.toContain("▼");
  });

  it("mapea cada clase CSS a su block_kind", () => {
    expect(lessons[0]!.blocks.map((b) => b.kind)).toEqual([
      "rule",
      "text", // <h3>
      "table",
      "tip",
      "warning",
      "steps",
      "text", // <p> con la fracción
      "example",
      // El <a href="javascript:..."> pierde la etiqueta pero conserva su texto.
      "text",
    ]);
  });

  it("cada bloque valida contra su esquema Zod", () => {
    for (const l of lessons) {
      for (const b of l.blocks) expect(lessonBlock.safeParse(b).success).toBe(true);
    }
  });

  it("todo bloque lleva trazabilidad al fichero y al índice", () => {
    for (const b of lessons[1]!.blocks) {
      expect(b.source.file).toBe("mini.html");
      expect(b.source.symbol).toBe("#learn .topic");
      expect(b.source.index).toBe(1);
    }
  });

  it("una celda de tabla vacía es `null`, no un I18nText inventado", () => {
    const table = lessons[0]!.blocks.find((b) => b.kind === "table")!;
    const rows = (table.content as { rows: unknown[][] }).rows;
    expect(rows[1]![0]).toBeNull();
  });

  it("los pasos salen como lista ordenada, no como un bloque de HTML", () => {
    const steps = lessons[0]!.blocks.find((b) => b.kind === "steps")!;
    expect((steps.content as { steps: { en: string }[] }).steps).toHaveLength(2);
  });

  it("NADA del <script>, del onerror ni del javascript: llega al pack", () => {
    const json = JSON.stringify(lessons);
    expect(json).not.toContain("alert(");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("inyectado");
    // El texto del enlace sí se conserva: se pierde la etiqueta, no el contenido.
    expect(json).toContain("no pulses");
  });

  it("conserva acentos, ñ, emoji y la fracción apilada", () => {
    const json = JSON.stringify(lessons);
    expect(json).toContain("corazón");
    expect(json).toContain("ñandú");
    expect(json).toContain("¿sí?");
    expect(json).toContain("🌧️");
    expect(json).toContain('class=\\"f\\"');
  });

  it("reporta el <script> incrustado como hueco en vez de tragárselo", () => {
    // El saneador ya lo neutraliza; el hueco existe para que quede POR ESCRITO
    // en COVERAGE.md que ahí había algo que el pipeline no convirtió en dato.
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.reason).toContain("<script>");
  });

  it("la segunda lección, bien formada, no produce ningún hueco", () => {
    const only = gaps.filter((g) => g.area.includes("Vocabulary"));
    expect(only).toEqual([]);
  });

  it("lanza si un acordeón no tiene skill asignado (tema nuevo sin taxonomía)", () => {
    expect(() =>
      lessonsFromAccordions(MINI_TRAINER, {
        locale: "en",
        file: "mini.html",
        sectionId: "learn",
        skillCodesByIndex: [["english.grammar.present_simple"]],
      }),
    ).toThrow(/no tiene skills asignados/);
  });

  it("lanza si la sección no existe, en vez de devolver cero lecciones", () => {
    expect(() =>
      lessonsFromAccordions(MINI_TRAINER, {
        locale: "en",
        file: "mini.html",
        sectionId: "no-existe",
        skillCodesByIndex: [],
      }),
    ).toThrow(/no se encontró/);
  });
});

describe("banco de preguntas", () => {
  const script = extractInlineScripts(MINI_TRAINER);
  const bank = readSymbolArray(script, "BANK", "mini.html");

  it("ignora la declaración comentada y lee el banco de verdad", () => {
    expect(bank).toHaveLength(4);
    expect(JSON.stringify(bank)).not.toContain("VIEJO");
  });

  it("normaliza con la clave `c`", () => {
    const entries = normalizeBank(bank, "BANK", "c");
    expect(entries.map((e) => e.category)).toEqual(["ps", "ps", "voc", "voc"]);
    expect(entries[0]!.answerIndex).toBe(1);
  });

  it("normaliza con la clave `t` (Science)", () => {
    const entries = normalizeBank([{ t: "acid", q: "x", o: ["a", "b"], a: 0 }], "BANK", "t");
    expect(entries[0]!.category).toBe("acid");
  });

  it("normaliza con la categoría fijada por la clave del objeto (Socials/ICT)", () => {
    const entries = normalizeBank([{ q: "x", o: ["a", "b"], a: 1 }], "Q.amz", { fixed: "amz" });
    expect(entries[0]!.category).toBe("amz");
  });

  it("convierte a pregunta con `answer_spec` apuntando a la opción correcta", () => {
    const q = toStaticQuestion(normalizeBank(bank, "BANK", "c")[0]!, {
      locale: "en",
      file: "mini.html",
      skillOf,
    });
    expect(q.kind).toBe("static");
    expect(q.format).toBe("mcq_single");
    expect(q.answerSpec).toEqual({ type: "choice", correctIds: ["o2"] });
    if (q.kind !== "static") throw new Error("unreachable");
    expect(q.body.options.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4"]);
    expect(q.body.options[1]!.html.en).toBe("works");
    expect(q.skillCode).toBe("english.grammar.present_simple");
    expect(q.source).toEqual({ file: "mini.html", symbol: "BANK", index: 0 });
  });

  it("detecta verdadero/falso y no lo trata como mcq", () => {
    const q = toStaticQuestion(
      normalizeBank([{ c: "voc", q: "x", o: ["True", "False"], a: 1 }], "BANK", "c")[0]!,
      { locale: "en", file: "mini.html", skillOf },
    );
    expect(q.format).toBe("true_false");
  });

  it("preserva la ñ y las tildes en el pack en español", () => {
    const q = toStaticQuestion(normalizeBank(bank, "BANK", "c")[3]!, {
      locale: "es",
      file: "mini.html",
      skillOf,
    });
    if (q.kind !== "static") throw new Error("unreachable");
    expect(q.body.stem.es).toBe("¿Cuál lleva tilde?");
    expect(q.body.options[0]!.html.es).toBe("corazón");
    expect(q.solution?.es).toContain("🅰️");
    expect(q.locale).toBe("es");
    expect(q.body.stem.en).toBeUndefined();
  });

  describe("falla ruidosamente ante un banco corrupto", () => {
    const cases: readonly [string, unknown][] = [
      ["sin enunciado", { c: "ps", o: ["a", "b"], a: 0 }],
      ["sin opciones", { c: "ps", q: "x", a: 0 }],
      ["una sola opción", { c: "ps", q: "x", o: ["a"], a: 0 }],
      ["sin respuesta", { c: "ps", q: "x", o: ["a", "b"] }],
      ["respuesta fuera de rango", { c: "ps", q: "x", o: ["a", "b"], a: 7 }],
      ["respuesta negativa", { c: "ps", q: "x", o: ["a", "b"], a: -1 }],
      ["respuesta no entera", { c: "ps", q: "x", o: ["a", "b"], a: 1.5 }],
      ["sin categoría", { q: "x", o: ["a", "b"], a: 0 }],
      ["opciones duplicadas", { c: "ps", q: "x", o: ["sí", "<b>sí</b>"], a: 0 }],
      ["la entrada no es un objeto", "no soy un objeto"],
    ];
    for (const [name, entry] of cases) {
      it(name, () => {
        expect(() => normalizeBank([entry as never], "BANK", "c")).toThrow(BankEntryError);
      });
    }
  });
});

describe("blueprints", () => {
  const script = extractInlineScripts(MINI_TRAINER);

  it("MPARTS -> secciones con cuenta y skill", () => {
    const sections = sectionsFromMparts(readSymbolArray(script, "MPARTS", "mini.html"), skillOf);
    expect(sections).toEqual([
      {
        title: "Part 1 · Present simple",
        itemCount: 2,
        skillCodes: ["english.grammar.present_simple"],
        source: "bank",
      },
      {
        title: "Part 2 · Vocabulary",
        itemCount: 2,
        skillCodes: ["english.vocabulary.topics"],
        source: "bank",
      },
    ]);
  });

  it("MOCK_PLAN agrupa ranuras consecutivas iguales y separa las que llevan parámetro", () => {
    const sections = sectionsFromMockPlan(
      ["metric", "metric", "metric", { k: "fracop", op: "+" }, { k: "fracop", op: "−" }, "metric"],
      {
        engineKeyOf: (k) => `math.${k}`,
        skillOf: (k) => `math.${k}`,
        labelOf: (k, p) => (p === undefined ? k : `${k} (${p})`),
        // Se traduce al parametro del MOTOR, no al del trainer: `op: "+"` no
        // existe para `@cet/engine`, que espera `ops: ["add"]`.
        paramsFor: (_k, p) =>
          p === undefined ? undefined : { ops: [p === "+" ? "add" : "sub"] },
      },
    );
    expect(sections.map((s) => [s.title, s.itemCount, s.params])).toEqual([
      ["metric", 3, undefined],
      ["fracop (+)", 1, { ops: ["add"] }],
      ["fracop (−)", 1, { ops: ["sub"] }],
      // No se fusiona con la primera: no es consecutiva.
      ["metric", 1, undefined],
    ]);
    expect(sections.every((s) => s.source === "generated")).toBe(true);
  });

  it("MPARTS corrupto lanza en vez de producir un examen corto", () => {
    expect(() => sectionsFromMparts([{ c: "ps", n: 0, t: "x" }], skillOf)).toThrow();
    expect(() => sectionsFromMparts([{ c: "ps", t: "x" }], skillOf)).toThrow();
  });
});

describe("planes de estudio", () => {
  const script = extractInlineScripts(MINI_TRAINER);

  it("PLAN plano (English): [título, tarea, tarea]", () => {
    const plan = planFromArray(readSymbolArray(script, "PLAN", "mini.html"), {
      locale: "en",
      title: "Plan",
      source: { file: "mini.html", symbol: "PLAN" },
    });
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0]!.title.en).toBe("Day 1 · Present simple");
    expect(plan.days[0]!.tasks.map((t) => t.text.en)).toEqual([
      "Read topic 1.",
      "Do 15 questions.",
    ]);
  });

  it("PLAN anidado (Español): [título, [tareas]]", () => {
    const plan = planFromArray([["Día 1", ["tarea a", "tarea b"]]], {
      locale: "es",
      title: "Plan",
      source: { file: "mini.html", symbol: "PLAN" },
    });
    expect(plan.days[0]!.tasks.map((t) => t.text.es)).toEqual(["tarea a", "tarea b"]);
  });

  it("plan en tabla estática (Math/Science/Socials/ICT), con objetivo", () => {
    const panel = sliceElementById(MINI_TRAINER, "plan")!;
    const plan = planFromPanel(panel, {
      locale: "en",
      title: "Plan",
      source: { file: "mini.html", symbol: "#plan" },
    });
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0]!.title.en).toBe("Day 1");
    expect(plan.days[0]!.tasks[0]!.text.en).toBe("Read topic 1.");
    expect(plan.days[0]!.tasks[0]!.target?.en).toBe("5 in a row");
    // El resto del panel no se tira: se guarda como notas.
    expect(plan.notes.map((n) => n.kind)).toContain("tip");
  });

  it("PLAN malformado lanza", () => {
    const src = { file: "x", symbol: "PLAN" };
    expect(() => planFromArray([["solo el titulo"]], { locale: "en", title: "P", source: src })).toThrow();
    expect(() => planFromArray([[1, "t"]] as never, { locale: "en", title: "P", source: src })).toThrow();
    expect(() => planFromArray([], { locale: "en", title: "P", source: src })).toThrow();
  });
});

describe("extractBlocks — casos límite", () => {
  const run = (html: string) => extractBlocks(html, "en", SOURCE, ["t"]);

  it("HTML sin cerrar no pierde el texto ni rompe el recorrido", () => {
    const { blocks } = run(`<div class="rule">a<div class="tip">b`);
    expect(JSON.stringify(blocks)).toContain("a");
    expect(JSON.stringify(blocks)).toContain("b");
  });

  it("un fragmento vacío produce cero bloques, no un bloque vacío", () => {
    expect(run(`   <br>  `).blocks).toHaveLength(0);
    expect(run(``).blocks).toHaveLength(0);
  });

  it("atraviesa contenedores sin semántica en vez de aplastarlos en un `text`", () => {
    const { blocks } = run(`<div class="card"><div class="rule">R</div><div class="tip">T</div></div>`);
    expect(blocks.map((b) => b.kind)).toEqual(["rule", "tip"]);
  });

  it("reporta como hueco lo que no sabe mapear, en vez de tragárselo", () => {
    const { unmapped } = run(`<div class="rule">ok</div><svg><circle/></svg>`);
    expect(unmapped).toEqual(["<svg> (figura interactiva)"]);
  });

  it("los `ord` son consecutivos aunque haya contenedores anidados", () => {
    const { blocks } = run(
      `<div class="rule">A</div><div><div class="tip">B</div><div class="warn">C</div></div><div class="eg">D</div>`,
    );
    expect(blocks.map((b) => b.ord)).toEqual([0, 1, 2, 3]);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(4);
  });
});

describe("regresión de la pasada 2 — contenido fuera de los acordeones", () => {
  it("el panel #learn aporta `overview` en vez de perderse en silencio", () => {
    const { overview } = lessonsFromAccordions(MINI_TRAINER, {
      locale: "en",
      file: "mini.html",
      sectionId: "learn",
      skillCodesByIndex: [["english.grammar.present_simple"], ["english.vocabulary.topics"]],
    });
    expect(overview.length).toBeGreaterThan(0);
    expect(JSON.stringify(overview)).toContain("Everything on the exam");
    // Y no duplica el contenido de las lecciones.
    expect(JSON.stringify(overview)).not.toContain("golden rule");
  });
});
