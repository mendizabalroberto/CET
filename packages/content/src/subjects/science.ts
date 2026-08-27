/**
 * Materia: Science (Grade 5 Science Exam Trainer).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Estructura: `TOPICS[{id,c,t,sub,html}]` para las lecciones, `BANK[]` con la
 * categoría en la clave `t` (no `c`, como English), `TOPICNAMES` para las
 * etiquetas y un `buildMock()` que coge 4 preguntas de cada tema sin declarar
 * ninguna constante — el blueprint hay que leerlo del código, no de un dato.
 */

import type { I18nText } from "@cet/shared";
import { normalizeBank, toStaticQuestion } from "../extract/bank.ts";
import { extractBlocks } from "../extract/blocks.ts";
import { overviewFromSection } from "../extract/accordion.ts";
import { buildBlueprint, sectionsUniform } from "../extract/blueprint.ts";
import {
  extractInlineScripts,
  readSymbolArray,
  readSymbolObject,
  sliceElementById,
} from "../extract/html.ts";
import { planFromPanel } from "../extract/plan.ts";
import { stableId } from "../ids.ts";
import { assemblePack } from "../pack.ts";
import { sanitizeHtml, sanitizeToText } from "../sanitize.ts";
import type { ContentPack, Gap, Lesson } from "../schema.ts";
import { SCIENCE_SKILLS, skillResolver } from "../skills.ts";

export const SCIENCE_FILE = "Y6A/Science/Grade 5 Science Exam Trainer.html";

const en = (text: string): I18nText => ({ en: text });
const skillOf = skillResolver(SCIENCE_SKILLS, "science");

/** `buildMock()` hace `pool.slice(0,4)` por cada clave de TOPICNAMES. */
const MOCK_ITEMS_PER_TOPIC = 4;

/**
 * `sym(kind, w)` dibuja un símbolo de circuito en SVG dentro del HTML de las
 * lecciones. Es código, y el parser restringido no ejecuta código: se declara
 * aquí una sustitución explícita.
 *
 * Se emite un marcador de texto, NO el SVG. Razones:
 *   - el SVG original trae `class`, `stroke-width` y `<line>`, que la allowlist
 *     del saneador elimina de todas formas;
 *   - dejar un hueco visible es honesto; dibujar medio símbolo, no.
 * Los símbolos reales los repondrá `@cet/ui` con un componente propio, usando
 * el `kind` que este marcador conserva.
 */
const CIRCUIT_SYMBOL_NAMES: Readonly<Record<string, string>> = {
  cell: "cell",
  battery: "battery",
  bulb: "bulb",
  motor: "motor",
  switchOpen: "open switch",
  switchClosed: "closed switch",
  wire: "wire",
  gap: "broken wire",
};

export function extractScience(html: string): ContentPack {
  const script = extractInlineScripts(html);
  const gaps: Gap[] = [];

  const symbolsSeen = new Set<string>();
  const parseOptions = {
    calls: {
      sym: (args: readonly unknown[]) => {
        const kind = args[0];
        if (typeof kind !== "string") throw new Error("sym() sin nombre de símbolo");
        const label = CIRCUIT_SYMBOL_NAMES[kind];
        if (label === undefined) throw new Error(`sym() con símbolo desconocido \`${kind}\``);
        symbolsSeen.add(kind);
        return `<span class="tsub">[circuit symbol: ${label}]</span>`;
      },
    },
  };

  /* ---------------- Lecciones ---------------- */

  const topics = readSymbolArray(script, "TOPICS", SCIENCE_FILE, parseOptions);
  const lessons: Lesson[] = topics.map((raw, i) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`TOPICS[${i}] no es un objeto`);
    }
    const t = raw as Record<string, unknown>;
    const id = t["id"];
    const title = t["t"];
    const body = t["html"];
    const sub = t["sub"];
    if (typeof id !== "string") throw new Error(`TOPICS[${i}].id ausente`);
    if (typeof title !== "string") throw new Error(`TOPICS[${i}].t ausente`);
    if (typeof body !== "string") throw new Error(`TOPICS[${i}].html ausente`);

    const source = { file: SCIENCE_FILE, symbol: "TOPICS", index: i, ...(typeof sub === "string" ? { note: sub } : {}) };
    const { blocks, unmapped } = extractBlocks(body, "en", source, ["lesson", SCIENCE_FILE, id]);
    for (const tag of unmapped) {
      gaps.push({
        area: `lección "${sanitizeToText(title)}"`,
        symbol: "TOPICS",
        reason: `elemento ${tag} sin mapeo a block_kind`,
      });
    }

    return {
      id: stableId("lesson", SCIENCE_FILE, id),
      ord: i,
      title: en(sanitizeHtml(title)),
      estimatedMinutes: 20,
      skillCodes: [skillOf(id)],
      blocks,
      source,
    };
  });

  // Tarjeta de introducción de #learn: contenido real que no pertenece a
  // ninguna lección. Antes se perdía sin dejar rastro.
  const overview = overviewFromSection(html, {
    locale: "en",
    file: SCIENCE_FILE,
    sectionId: "learn",
  });

  const modules = [
    {
      id: stableId("module", SCIENCE_FILE, 0),
      ord: 0,
      title: en("The 5 exam topics"),
      description: en("Acid rain, recycling, conductors and insulators, circuits and circuit symbols."),
      overview,
      lessons,
    },
  ];

  /* ---------------- Banco ---------------- */

  // El banco de circuit symbols también incrusta `sym(...)` en su campo `img`.
  const bank = readSymbolArray(script, "BANK", SCIENCE_FILE, parseOptions);
  const questions = normalizeBank(bank, "BANK", "t").map((entry) =>
    toStaticQuestion(entry, { locale: "en", file: SCIENCE_FILE, skillOf }),
  );

  /* ---------------- Blueprint ---------------- */

  const topicNames = readSymbolObject(script, "TOPICNAMES", SCIENCE_FILE);
  const blueprint = buildBlueprint({
    code: "science.y6.mock",
    title: "Mock exam — 20 questions",
    description: "4 questions from each of the 5 topics. No hints, no help. Aim for 16/20 or better.",
    locale: "en",
    // El trainer cronometra al alza pero NO corta. Se preserva ese hecho con
    // `null` en vez de inventar un límite: cuando un profesor asigne el examen,
    // `exam_assignments.time_limit_override_seconds` (§5) pondrá el suyo, y el
    // servidor calculará `server_deadline_at` a partir de ahí (§6).
    durationSeconds: null,
    source: { file: SCIENCE_FILE, symbol: "buildMock", note: "plan implícito: 4 por tema" },
    sections: sectionsUniform(Object.keys(topicNames), MOCK_ITEMS_PER_TOPIC, topicNames, skillOf),
  });

  /* ---------------- Plan ---------------- */

  const planPanel = sliceElementById(html, "plan");
  if (planPanel === null) throw new Error("no se encontró el panel #plan de Science");
  const studyPlan = planFromPanel(planPanel, {
    locale: "en",
    title: "Study plan",
    source: { file: SCIENCE_FILE, symbol: "#plan" },
  });

  if (symbolsSeen.size > 0) {
    gaps.push({
      area: "símbolos de circuito dentro de las lecciones",
      symbol: "sym()",
      reason: `${symbolsSeen.size} símbolos SVG (${[...symbolsSeen].sort().join(", ")}) sustituidos por un marcador de texto \`[circuit symbol: …]\`. El SVG original usa atributos que la allowlist del saneador elimina; los repone @cet/ui con un componente propio.`,
    });
  }

  gaps.push(
    {
      area: "Circuit Lab",
      symbol: "PARTS / SLOTNAMES / MISSIONS",
      reason:
        "simulador de circuitos con SVG y estado (ranuras, interruptor abierto/cerrado, misiones). Es una actividad interactiva, no contenido: necesita un componente propio en @cet/ui + un generador de misiones.",
    },
    {
      area: "juegos",
      symbol: "PAIRS / THINGS",
      reason:
        "listas de parejas y de objetos que alimentan mini-juegos de emparejar y clasificar. Son datos aprovechables, pero su formato de pregunta (`matching`, `drag_drop`) no está cubierto por este pipeline todavía.",
    },
  );

  return assemblePack({
    subject: { code: "science", name: en("Science"), icon: "🔬", color: "#2e9bd6", ord: 1 },
    courseCode: "science.y6",
    courseName: en("Grade 5 Science — Year 6"),
    yearLevel: 6,
    locale: "en",
    file: SCIENCE_FILE,
    skills: SCIENCE_SKILLS,
    modules,
    questions,
    blueprints: [blueprint],
    studyPlan,
    gaps,
  });
}
