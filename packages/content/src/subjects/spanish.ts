/**
 * Materia: Español (Entrenador de Examen — Español Y6).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El ÚNICO pack en `es`. Todo su `I18nText` lleva la clave `es`, nunca `en`.
 * Es también el único donde tildes, `ñ`, `¿` y `«»` son contenido y no adorno:
 * cualquier pérdida ahí es una errata visible para el alumno, así que hay un
 * test dedicado a ello.
 *
 * `PLAN[]` viene en la forma ANIDADA — `[título, [tareas…]]` — al contrario que
 * English. El extractor de planes tolera las dos.
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
import { SPANISH_SKILLS, skillResolver } from "../skills.ts";

export const SPANISH_FILE = "Y6A/Español/Entrenador de Examen - Español Y6.html";

const es = (text: string): I18nText => ({ es: text });
const skillOf = skillResolver(SPANISH_SKILLS, "spanish");

const LESSON_SKILLS: readonly (readonly string[])[] = [
  ["spanish.verbos.regulares"],
  ["spanish.ortografia.diptongo_hiato"],
  ["spanish.ortografia.tilde_diacritica"],
];

export function extractSpanish(html: string): ContentPack {
  const script = extractInlineScripts(html);

  const { lessons, overview, gaps } = lessonsFromAccordions(html, {
    locale: "es",
    file: SPANISH_FILE,
    sectionId: "learn",
    skillCodesByIndex: LESSON_SKILLS,
  });

  const modules = [
    {
      id: stableId("module", SPANISH_FILE, 0),
      ord: 0,
      title: es("Todo lo que entra en el examen"),
      description: es("Temas 21, 22 y 23: verbos regulares, diptongo e hiato, y tilde diacrítica."),
      overview,
      lessons,
    },
  ];

  const bank = readSymbolArray(script, "BANK", SPANISH_FILE);
  const questions = normalizeBank(bank, "BANK", "c").map((entry) =>
    toStaticQuestion(entry, { locale: "es", file: SPANISH_FILE, skillOf }),
  );

  const mparts = readSymbolArray(script, "MPARTS", SPANISH_FILE);
  const blueprint = buildBlueprint({
    code: "spanish.y6.mock",
    title: "Examen simulacro — 20 preguntas",
    description: "Verbos regulares, diptongo e hiato, y tilde diacrítica. 15 minutos.",
    locale: "es",
    durationSeconds: 15 * 60, // `mkLeft=900`
    source: { file: SPANISH_FILE, symbol: "MPARTS" },
    sections: sectionsFromMparts(mparts, skillOf),
    shuffleQuestions: false,
    shuffleOptions: true,
  });

  const plan = readSymbolArray(script, "PLAN", SPANISH_FILE);
  const studyPlan = planFromArray(plan, {
    locale: "es",
    title: "Plan de estudio de 5 días",
    source: { file: SPANISH_FILE, symbol: "PLAN" },
  });

  const allGaps: Gap[] = [
    ...gaps,
    {
      area: "los 5 juegos",
      symbol: "VERBS / PRON / ENDS / CONJNAME / DHW / TILQ / MPAIRS / ERRS",
      reason:
        "máquina de conjugar, clasificador diptongo/hiato, memoria de monosílabos y cazador de errores. Formatos `cloze`, `matching` y `hotspot` fuera del alcance actual del pipeline.",
    },
    {
      area: "desbloqueo del simulacro por progreso",
      symbol: "GOAL / answered / isUnlocked",
      reason:
        "el trainer exige el 90% de la práctica antes de abrir el examen. Es una regla de progresión que corresponde a `exam_assignments` y a la capa de analítica, no al contenido.",
    },
  ];

  return assemblePack({
    subject: { code: "spanish", name: es("Español"), icon: "🇪🇸", color: "#c0392b", ord: 3 },
    courseCode: "spanish.y6",
    courseName: es("Español — Year 6"),
    yearLevel: 6,
    locale: "es",
    file: SPANISH_FILE,
    skills: SPANISH_SKILLS,
    modules,
    questions,
    blueprints: [blueprint],
    studyPlan,
    gaps: allGaps,
  });
}
