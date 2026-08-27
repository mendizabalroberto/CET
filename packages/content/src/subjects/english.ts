/**
 * Materia: English (Year 6 English Exam Trainer).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Variante estructural: las lecciones NO están en un array JS, son acordeones
 * estáticos en `#learn`. El banco usa `c` como clave de categoría y el
 * blueprint sí es un dato explícito (`MPARTS`). El plan es `PLAN[]` en su
 * forma PLANA — `[título, tarea, tarea, …]` — a diferencia de Español.
 */

import type { I18nText } from "@cet/shared";
import { lessonsFromAccordions } from "../extract/accordion.ts";
import { normalizeBank, toStaticQuestion } from "../extract/bank.ts";
import { buildBlueprint, sectionsFromMparts } from "../extract/blueprint.ts";
import { extractInlineScripts, readSymbolArray } from "../extract/html.ts";
import { planFromArray } from "../extract/plan.ts";
import { stableId } from "../ids.ts";
import { assemblePack } from "../pack.ts";
import type { ContentPack, Gap } from "../schema.ts";
import { ENGLISH_SKILLS, skillResolver } from "../skills.ts";

export const ENGLISH_FILE = "Y6A/English/Year 6 English Exam Trainer.html";

const en = (text: string): I18nText => ({ en: text });
const skillOf = skillResolver(ENGLISH_SKILLS, "english");

/** Los 5 acordeones de `#learn`, en orden. */
const LESSON_SKILLS: readonly (readonly string[])[] = [
  ["english.grammar.present_simple"],
  ["english.grammar.indefinite_pronouns"],
  ["english.vocabulary.collocations"],
  ["english.vocabulary.topics"],
  ["english.skills"],
];

export function extractEnglish(html: string): ContentPack {
  const script = extractInlineScripts(html);

  const { lessons, overview, gaps } = lessonsFromAccordions(html, {
    locale: "en",
    file: ENGLISH_FILE,
    sectionId: "learn",
    skillCodesByIndex: LESSON_SKILLS,
  });

  const modules = [
    {
      id: stableId("module", ENGLISH_FILE, 0),
      ord: 0,
      title: en("Everything on the exam paper"),
      description: en("Grammar, vocabulary and skills: reading, writing and speaking."),
      overview,
      lessons,
    },
  ];

  const bank = readSymbolArray(script, "BANK", ENGLISH_FILE);
  const questions = normalizeBank(bank, "BANK", "c").map((entry) =>
    toStaticQuestion(entry, { locale: "en", file: ENGLISH_FILE, skillOf }),
  );

  const mparts = readSymbolArray(script, "MPARTS", ENGLISH_FILE);
  const blueprint = buildBlueprint({
    code: "english.y6.mock",
    title: "Mock exam — 25 questions",
    description: "Present simple, indefinite pronouns, collocations and vocabulary. 20 minutes.",
    locale: "en",
    durationSeconds: 20 * 60, // `mkLeft=1200`
    source: { file: ENGLISH_FILE, symbol: "MPARTS" },
    sections: sectionsFromMparts(mparts, skillOf),
    // El trainer agrupa por parte y las presenta en orden; se conserva.
    shuffleQuestions: false,
    shuffleOptions: true,
  });

  const plan = readSymbolArray(script, "PLAN", ENGLISH_FILE);
  const studyPlan = planFromArray(plan, {
    locale: "en",
    title: "5-day study plan",
    source: { file: ENGLISH_FILE, symbol: "PLAN" },
  });

  const allGaps: Gap[] = [
    ...gaps,
    {
      area: "los 7 mini-juegos",
      symbol: "SVERBS / DOQ / IPWORDS / IPQ / CPAIRS / ORD / MIS / QB",
      reason:
        "cada juego trae su propio banco con un formato distinto (conjugar, ordenar palabras, cazar el error, construir preguntas). Son formatos `ordering`, `cloze` y `matching` que este pipeline aún no emite; extraerlos como mcq falsearía la actividad.",
    },
    {
      area: "Writing Lab y tarjetas de speaking",
      symbol: "WL / TOM / RC / WT / SPK / PDG / VCATS / VWORDS",
      reason:
        "el corrector de escritura es heurístico (cuenta conectores, longitud, mayúsculas) y las tarjetas de speaking se evalúan en voz alta. Ambos exigen `grading_mode: manual` y una UI propia.",
    },
  ];

  return assemblePack({
    subject: { code: "english", name: en("English"), icon: "🔤", color: "#6b3fa0", ord: 2 },
    courseCode: "english.y6",
    courseName: en("English — Year 6"),
    yearLevel: 6,
    locale: "en",
    file: ENGLISH_FILE,
    skills: ENGLISH_SKILLS,
    modules,
    questions,
    blueprints: [blueprint],
    studyPlan,
    gaps: allGaps,
  });
}
