/**
 * Materia: Math (Grade 5 Maths Exam Trainer).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es la materia piloto del Hito 2, y la única de las seis que NO tiene banco
 * estático: todas sus preguntas salen de generadores paramétricos
 * (`GEN.simplify`, `GEN.fracop`…). Extraerlas como preguntas fijas destruiría
 * justo lo que las hace valiosas — que cada intento es un examen nuevo.
 *
 * Por eso Math emite preguntas `kind:'generated'` que apuntan a un `engine_key`
 * de `@cet/engine` (§4 de DATA_MODEL). Este paquete NO reimplementa la
 * aritmética: solo declara el contrato. La lógica es de la vía B.
 *
 * Lo que sí se extrae literalmente: las 8 lecciones (`LESSONS[]`), el blueprint
 * del simulacro (`MOCK_PLAN[]`) y el plan de estudio de 5 días.
 */

import type { I18nText } from "@cet/shared";
import { extractBlocks } from "../extract/blocks.ts";
import { overviewFromSection } from "../extract/accordion.ts";
import { buildBlueprint, sectionsFromMockPlan } from "../extract/blueprint.ts";
import {
  extractInlineScripts,
  readSymbolArray,
  sliceElementById,
} from "../extract/html.ts";
import { planFromPanel } from "../extract/plan.ts";
import { stableId } from "../ids.ts";
import { assemblePack } from "../pack.ts";
import { sanitizeHtml, sanitizeToText } from "../sanitize.ts";
import type { ContentPack, Gap, Lesson, Question } from "../schema.ts";
import { MATH_ENGINE_KEYS, MATH_PARAM_NAMES, MATH_SKILLS, skillResolver } from "../skills.ts";

export const MATH_FILE = "Y6A/Math/Grade 5 Maths Exam Trainer.html";

const en = (text: string): I18nText => ({ en: text });

/** Etiqueta legible de cada generador. Es el `LBL` que el propio trainer usa. */
const GENERATOR_LABELS: Readonly<Record<string, string>> = {
  simplify: "Simplifying fractions",
  compare: "Comparing fractions",
  fracop: "Fraction operations",
  mixed: "Improper and mixed numbers",
  decimal: "Multiplying and dividing decimals",
  powten: "Multiplying and dividing by 10, 100 and 1,000",
  metric: "Metric conversions",
  shape: "Compound shapes",
  word: "Word problems",
};

/** `simplify` -> `math.fractions.simplify`. */
const skillOf = skillResolver(MATH_SKILLS, "math");

/**
 * Qué skill enseña cada lección de `LESSONS[]`, por posición. El trainer no lo
 * declara, pero el orden de las lecciones sigue exactamente el de los temas.
 */
const LESSON_SKILLS: readonly (readonly string[])[] = [
  ["math.fractions.simplify", "math.fractions.compare"],
  ["math.fractions.operations"],
  ["math.fractions.mixed"],
  ["math.decimals.multiply_divide"],
  ["math.decimals.powers_of_ten"],
  ["math.measurement.metric"],
  ["math.geometry.compound_shapes"],
  ["math.problem_solving.word"],
];

export function extractMath(html: string): ContentPack {
  const script = extractInlineScripts(html);
  const gaps: Gap[] = [];

  /* ---------------- Lecciones ---------------- */

  const lessonsRaw = readSymbolArray(script, "LESSONS", MATH_FILE);
  const lessons: Lesson[] = lessonsRaw.map((raw, i) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`LESSONS[${i}] no es un objeto`);
    }
    const l = raw as Record<string, unknown>;
    const title = l["t"];
    const body = l["h"];
    if (typeof title !== "string") throw new Error(`LESSONS[${i}].t ausente`);
    if (typeof body !== "string") throw new Error(`LESSONS[${i}].h ausente`);

    const source = { file: MATH_FILE, symbol: "LESSONS", index: i };
    const { blocks, unmapped } = extractBlocks(body, "en", source, ["lesson", MATH_FILE, i]);
    for (const tag of unmapped) {
      gaps.push({
        area: `lección ${i + 1} "${sanitizeToText(title)}"`,
        symbol: "LESSONS",
        reason: `elemento ${tag} sin mapeo a block_kind`,
      });
    }

    const skillCodes = LESSON_SKILLS[i];
    if (skillCodes === undefined) {
      throw new Error(
        `LESSONS[${i}] no tiene skills asignados: el trainer añadió una lección nueva`,
      );
    }

    return {
      id: stableId("lesson", MATH_FILE, i),
      ord: i,
      title: en(sanitizeHtml(title)),
      // Ocho lecciones para un plan de cinco días de 30-40 min: ~20 min cada una.
      estimatedMinutes: 20,
      skillCodes: [...skillCodes],
      blocks,
      source,
    };
  });

  // Tarjeta de introducción de #learn: contenido real que no pertenece a
  // ninguna lección. Antes se perdía sin dejar rastro.
  const overview = overviewFromSection(html, {
    locale: "en",
    file: MATH_FILE,
    sectionId: "learn",
  });

  const modules = [
    {
      id: stableId("module", MATH_FILE, 0),
      ord: 0,
      title: en("The 8 topics on your exam"),
      description: en(
        "Fractions, decimals, powers of ten, metric conversions, compound shapes and word problems.",
      ),
      overview,
      lessons,
    },
  ];

  /* ---------------- Preguntas generadas ---------------- */

  // Un template por generador. Los parámetros concretos (el `op` de fracop, el
  // `want` de shape) los fija la SECCIÓN del blueprint, no la pregunta: así una
  // misma plantilla sirve para práctica libre y para examen.
  const topics = readSymbolArray(script, "TOPICS", MATH_FILE);
  const questions: Question[] = [];
  for (const [i, raw] of topics.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`TOPICS[${i}] no es un objeto`);
    }
    const key = (raw as Record<string, unknown>)["k"];
    if (typeof key !== "string") throw new Error(`TOPICS[${i}].k ausente`);
    if (key === "mix") continue; // "🎲 Mixed" no es un tema: es un selector de UI

    const engineKey = MATH_ENGINE_KEYS[key];
    if (engineKey === undefined) {
      throw new Error(`TOPICS[${i}] usa el generador \`${key}\`, ausente de MATH_ENGINE_KEYS`);
    }

    questions.push({
      kind: "generated",
      id: stableId("question", MATH_FILE, "TOPICS", key),
      skillCode: skillOf(key),
      // Todos los generadores de Math piden una respuesta escrita que se compara
      // con `parseAns` (7/4 = 1 3/4 = 1.75). `compare` pide `>`, `<` o `=`.
      format: key === "compare" ? "short_text" : key === "simplify" || key === "fracop" || key === "mixed" ? "fraction" : "numeric",
      locale: "en",
      body: { engineKey, paramSpec: {} },
      answerSpec: { type: "engine", engineKey },
      difficulty: 3,
      maxPoints: 1,
      gradingMode: "auto",
      tags: [`y6a:${key}`, "generated"],
      source: { file: MATH_FILE, symbol: "TOPICS", index: i },
    });
  }

  /* ---------------- Blueprint del simulacro ---------------- */

  const mockPlan = readSymbolArray(script, "MOCK_PLAN", MATH_FILE);
  const sections = sectionsFromMockPlan(mockPlan, {
    engineKeyOf: (k) => {
      const key = MATH_ENGINE_KEYS[k];
      if (key === undefined) throw new Error(`MOCK_PLAN usa el generador desconocido \`${k}\``);
      return key;
    },
    skillOf,
    labelOf: (k, param) => {
      const base = GENERATOR_LABELS[k] ?? k;
      return param === undefined ? base : `${base} (${param})`;
    },
    paramNameOf: (k) => MATH_PARAM_NAMES[k] ?? "variant",
  });

  const blueprint = buildBlueprint({
    code: "math.y6.mock",
    title: "Timed mock exam — 20 marks",
    description:
      "20 questions covering all 8 topics, one point each, 25 minutes — the same pace as the real paper.",
    locale: "en",
    // `MOCK.left=25*60` en el trainer. Único simulacro de los seis con corte duro.
    durationSeconds: 25 * 60,
    // El orden de MOCK_PLAN es pedagógico (de fácil a difícil): se respeta.
    shuffleQuestions: false,
    shuffleOptions: false,
    source: { file: MATH_FILE, symbol: "MOCK_PLAN" },
    sections,
  });

  /* ---------------- Plan de estudio ---------------- */

  const planPanel = sliceElementById(html, "plan");
  if (planPanel === null) throw new Error("no se encontró el panel #plan de Math");
  const studyPlan = planFromPanel(planPanel, {
    locale: "en",
    title: "A 5-day plan to walk into that exam ready",
    source: { file: MATH_FILE, symbol: "#plan" },
  });

  /* ---------------- Huecos declarados ---------------- */

  gaps.push(
    {
      area: "Shape Lab",
      symbol: "makeShape / shapeSVG / LAB",
      reason:
        "figura SVG generada en tiempo de ejecución con lados ocultos. No es contenido estático: se reimplementa como generador `math.shape` en @cet/engine, que emite `renderedBody.figureSvg`.",
    },
    {
      area: "lógica de los generadores",
      symbol: "GEN.*",
      reason:
        "el cuerpo de cada generador es código (aritmética de fracciones, tolerancias de comparación). Se declara el contrato `engine_key` y lo implementa @cet/engine; duplicarlo aquí garantizaría que las dos copias divergieran.",
    },
    {
      area: "pistas y soluciones de los generadores",
      symbol: "GEN.*.hint / GEN.*.sol",
      reason:
        "se construyen con interpolación sobre los valores sorteados, así que no existen como texto hasta que hay una instancia. Las produce el generador junto con el enunciado.",
    },
  );

  return assemblePack({
    subject: { code: "math", name: en("Mathematics"), icon: "📐", color: "#173a63", ord: 0 },
    courseCode: "math.y6",
    courseName: en("Grade 5 Mathematics — Year 6"),
    yearLevel: 6,
    locale: "en",
    file: MATH_FILE,
    skills: MATH_SKILLS,
    modules,
    questions,
    blueprints: [blueprint],
    studyPlan,
    gaps,
  });
}
