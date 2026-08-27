/**
 * Extractor compartido de Socials e ICT.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los dos trainers son gemelos estructurales:
 *   - `TOPICS=[{id,c,t,sub,html}]`      lecciones
 *   - `Q={ hw:[…], scr:[…] }`           banco AGRUPADO por tema: la categoría no
 *                                       está en la entrada, sino en la clave
 *   - `LBL={hw:'🖥️ Hardware & Software'}` etiquetas
 *   - `var plan={hw:6,scr:5,…}`         blueprint, escondido dentro de buildMock()
 *
 * Compartir el extractor es correcto aquí precisamente porque la estructura es
 * idéntica; lo que cambia (skills, colores, huecos) entra por parámetro.
 */

import type { I18nText } from "@cet/shared";
import { normalizeBank, toStaticQuestion } from "../extract/bank.ts";
import { extractBlocks } from "../extract/blocks.ts";
import { overviewFromSection } from "../extract/accordion.ts";
import { buildBlueprint, sectionsFromPlanObject } from "../extract/blueprint.ts";
import {
  extractInlineScripts,
  readLocalSymbolObject,
  readSymbolArray,
  readSymbolObject,
  sliceElementById,
} from "../extract/html.ts";
import { planFromPanel } from "../extract/plan.ts";
import { stableId } from "../ids.ts";
import { assemblePack } from "../pack.ts";
import { sanitizeHtml, sanitizeToText } from "../sanitize.ts";
import type { ContentPack, Gap, Lesson, Question } from "../schema.ts";
import { skillResolver, type SkillDef } from "../skills.ts";

export interface TopicKeyedConfig {
  readonly file: string;
  readonly subject: ContentPack["subject"];
  readonly courseCode: string;
  readonly courseName: I18nText;
  readonly skills: readonly SkillDef[];
  readonly moduleTitle: string;
  readonly moduleDescription: string;
  readonly blueprintCode: string;
  readonly blueprintTitle: string;
  readonly blueprintDescription: string;
  readonly planTitle: string;
  readonly gaps: readonly Gap[];
}

export function extractTopicKeyed(html: string, cfg: TopicKeyedConfig): ContentPack {
  const script = extractInlineScripts(html);
  const skillOf = skillResolver(cfg.skills, cfg.subject.code);
  const gaps: Gap[] = [...cfg.gaps];

  /* ---------------- Lecciones ---------------- */

  const topics = readSymbolArray(script, "TOPICS", cfg.file);
  const topicIds: string[] = [];
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
    topicIds.push(id);

    const source = {
      file: cfg.file,
      symbol: "TOPICS",
      index: i,
      ...(typeof sub === "string" ? { note: sub } : {}),
    };
    const { blocks, unmapped } = extractBlocks(body, "en", source, ["lesson", cfg.file, id]);
    for (const tag of unmapped) {
      gaps.push({
        area: `lección "${sanitizeToText(title)}"`,
        symbol: "TOPICS",
        reason: `elemento ${tag} sin mapeo a block_kind`,
      });
    }

    return {
      id: stableId("lesson", cfg.file, id),
      ord: i,
      title: { en: sanitizeHtml(title) },
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
    file: cfg.file,
    sectionId: "learn",
  });

  const modules = [
    {
      id: stableId("module", cfg.file, 0),
      ord: 0,
      title: { en: cfg.moduleTitle },
      description: { en: cfg.moduleDescription },
      overview,
      lessons,
    },
  ];

  /* ---------------- Banco agrupado ---------------- */

  const bankByTopic = readSymbolObject(script, "Q", cfg.file);
  const questions: Question[] = [];
  for (const [key, entries] of Object.entries(bankByTopic)) {
    if (!Array.isArray(entries)) throw new Error(`Q.${key} no es un array`);
    // La categoría viene de la CLAVE del objeto, no de la entrada.
    const normalized = normalizeBank(entries, `Q.${key}`, { fixed: key });
    for (const entry of normalized) {
      questions.push(toStaticQuestion(entry, { locale: "en", file: cfg.file, skillOf }));
    }
  }

  // Un tema con lección pero sin preguntas es un agujero silencioso: el alumno
  // lo estudia y el examen nunca se lo pregunta.
  const covered = new Set(Object.keys(bankByTopic));
  for (const id of topicIds) {
    if (!covered.has(id)) {
      gaps.push({
        area: `tema "${id}"`,
        symbol: "Q",
        reason: "tiene lección pero ninguna pregunta en el banco",
      });
    }
  }

  /* ---------------- Blueprint ---------------- */

  const labels = readSymbolObject(script, "LBL", cfg.file);
  const plan = readLocalSymbolObject(script, "plan", cfg.file);
  const blueprint = buildBlueprint({
    code: cfg.blueprintCode,
    title: cfg.blueprintTitle,
    description: cfg.blueprintDescription,
    locale: "en",
    // "There is a timer, but no time limit": se preserva la ausencia de corte.
    durationSeconds: null,
    source: { file: cfg.file, symbol: "buildMock/plan" },
    sections: sectionsFromPlanObject(plan, labels, skillOf),
  });

  /* ---------------- Plan ---------------- */

  const planPanel = sliceElementById(html, "plan");
  if (planPanel === null) throw new Error(`no se encontró el panel #plan de ${cfg.subject.code}`);
  const studyPlan = planFromPanel(planPanel, {
    locale: "en",
    title: cfg.planTitle,
    source: { file: cfg.file, symbol: "#plan" },
  });

  return assemblePack({
    subject: cfg.subject,
    courseCode: cfg.courseCode,
    courseName: cfg.courseName,
    yearLevel: 6,
    locale: "en",
    file: cfg.file,
    skills: cfg.skills,
    modules,
    questions,
    blueprints: [blueprint],
    studyPlan,
    gaps,
  });
}
