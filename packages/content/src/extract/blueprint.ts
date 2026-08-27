/**
 * Simulacros de Y6A -> `exam_blueprints` + `exam_blueprint_sections`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cada trainer expresa su simulacro de una forma distinta:
 *
 *   English / Español  var MPARTS=[{c:"ps", n:9, t:"Part 1 · Present simple"}]
 *   Socials / ICT      var plan={amz:5, pol:5, ...}   (dentro de buildMock)
 *   Science            implícito: 4 preguntas por cada clave de TOPICNAMES
 *   Math               var MOCK_PLAN=['simplify', {k:'fracop',op:'+'}, ...]
 *
 * Las cuatro se normalizan a la misma lista de secciones. El límite de tiempo
 * sale del `mkLeft` / `MOCK.left` de cada fichero cuando existe; Socials e ICT
 * cronometran pero no cortan, y ahí `durationSeconds` es `null` — que es un
 * dato, no un olvido.
 */

import type { I18nText, Locale } from "@cet/shared";
import type { JsValue } from "../js-literal.ts";
import { sanitizeHtml } from "../sanitize.ts";
import { stableId } from "../ids.ts";
import type { BlueprintSection, ExamBlueprint, SourceRef } from "../schema.ts";

function i18n(locale: Locale, text: string): I18nText {
  return locale === "es" ? { es: text } : { en: text };
}

export interface BlueprintInput {
  readonly code: string;
  readonly title: string;
  readonly description?: string;
  readonly locale: Locale;
  readonly durationSeconds: number | null;
  readonly source: SourceRef;
  readonly sections: readonly SectionInput[];
  readonly shuffleQuestions?: boolean;
  readonly shuffleOptions?: boolean;
}

export interface SectionInput {
  readonly title: string;
  readonly itemCount: number;
  readonly skillCodes: readonly string[];
  readonly source: "bank" | "generated" | "mixed";
  readonly engineKey?: string;
  readonly params?: Record<string, unknown>;
}

export function buildBlueprint(input: BlueprintInput): ExamBlueprint {
  const sections: BlueprintSection[] = input.sections.map((s, ord) => ({
    id: stableId("blueprint-section", input.source.file, input.code, ord),
    ord,
    title: i18n(input.locale, sanitizeHtml(s.title)),
    itemCount: s.itemCount,
    selection: {
      skillCodes: [...s.skillCodes],
      ...(s.engineKey !== undefined ? { engineKey: s.engineKey } : {}),
      ...(s.params !== undefined ? { params: s.params } : {}),
    },
    source: s.source,
    pointsPerItem: 1,
  }));

  if (sections.length === 0) {
    throw new Error(`blueprint ${input.code} sin secciones: revisa el extractor`);
  }

  return {
    id: stableId("blueprint", input.source.file, input.code),
    code: input.code,
    title: i18n(input.locale, sanitizeHtml(input.title)),
    ...(input.description !== undefined
      ? { description: i18n(input.locale, sanitizeHtml(input.description)) }
      : {}),
    durationSeconds: input.durationSeconds,
    shuffleQuestions: input.shuffleQuestions ?? true,
    shuffleOptions: input.shuffleOptions ?? true,
    // Los trainers no dejan volver atrás porque no guardan estado; la
    // plataforma sí puede, y para un niño de 11 años poder revisar es mejor
    // pedagogía. Es una decisión consciente, no una herencia del original.
    allowBack: true,
    feedbackMode: "after_submit",
    passThreshold: 0.6,
    maxAttempts: null,
    sections,
    source: input.source,
  };
}

/** `MPARTS=[{c,n,t}]` de English y Español. */
export function sectionsFromMparts(
  mparts: readonly JsValue[],
  skillOf: (category: string) => string,
): SectionInput[] {
  return mparts.map((raw, i) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`MPARTS[${i}] no es un objeto`);
    }
    const p = raw as Record<string, JsValue>;
    const category = p["c"];
    const count = p["n"];
    const title = p["t"];
    if (typeof category !== "string") throw new Error(`MPARTS[${i}].c ausente`);
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
      throw new Error(`MPARTS[${i}].n debe ser un entero positivo`);
    }
    if (typeof title !== "string") throw new Error(`MPARTS[${i}].t ausente`);
    return { title, itemCount: count, skillCodes: [skillOf(category)], source: "bank" };
  });
}

/** `plan={amz:5, pol:5, ...}` de Socials e ICT. */
export function sectionsFromPlanObject(
  plan: Record<string, JsValue>,
  labels: Record<string, JsValue>,
  skillOf: (category: string) => string,
): SectionInput[] {
  return Object.entries(plan).map(([key, count]) => {
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
      throw new Error(`plan.${key} debe ser un entero positivo`);
    }
    const label = labels[key];
    return {
      title: typeof label === "string" ? label : key,
      itemCount: count,
      skillCodes: [skillOf(key)],
      source: "bank",
    };
  });
}

/**
 * Secciones uniformes: N preguntas de cada categoría. Es el caso de Science,
 * cuyo `buildMock()` recorre `TOPICNAMES` y coge 4 de cada.
 */
export function sectionsUniform(
  categories: readonly string[],
  perCategory: number,
  labels: Record<string, JsValue>,
  skillOf: (category: string) => string,
): SectionInput[] {
  return categories.map((key) => {
    const label = labels[key];
    return {
      title: typeof label === "string" ? label : key,
      itemCount: perCategory,
      skillCodes: [skillOf(key)],
      source: "bank",
    };
  });
}

/**
 * `MOCK_PLAN` de Math: 20 ranuras, cada una un generador (a veces con un
 * argumento fijo: `{k:'fracop',op:'+'}`). Las ranuras CONSECUTIVAS con el mismo
 * (generador, argumento) se agrupan en una sección — que es exactamente lo que
 * significan: "tres conversiones métricas seguidas".
 */
export function sectionsFromMockPlan(
  mockPlan: readonly JsValue[],
  opts: {
    readonly engineKeyOf: (generatorKey: string) => string;
    readonly skillOf: (generatorKey: string) => string;
    readonly labelOf: (generatorKey: string, param: string | number | undefined) => string;
    /** Traduce el parametro del trainer a los que espera el motor. */
  readonly paramsFor: (
    generatorKey: string,
    param: string | number | undefined,
  ) => Record<string, unknown> | undefined;
  },
): SectionInput[] {
  interface Slot {
    key: string;
    param: string | number | undefined;
  }
  const slots: Slot[] = mockPlan.map((raw, i) => {
    if (typeof raw === "string") return { key: raw, param: undefined };
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, JsValue>;
      const k = o["k"];
      if (typeof k !== "string") throw new Error(`MOCK_PLAN[${i}].k ausente`);
      const op = o["op"];
      // `{k:'word',op:0}` es un marcador de posición: el trainer sortea el tipo
      // en tiempo de ejecución. Se trata como "sin parámetro fijo".
      const param =
        typeof op === "string" ? op : typeof op === "number" && op !== 0 ? op : undefined;
      return { key: k, param };
    }
    throw new Error(`MOCK_PLAN[${i}] no es ni string ni objeto`);
  });

  const sections: SectionInput[] = [];
  for (const slot of slots) {
    const last = sections[sections.length - 1];
    const params = opts.paramsFor(slot.key, slot.param);
    const engine = opts.engineKeyOf(slot.key);

    if (
      last !== undefined &&
      last.engineKey === engine &&
      JSON.stringify(last.params ?? null) === JSON.stringify(params ?? null)
    ) {
      sections[sections.length - 1] = { ...last, itemCount: last.itemCount + 1 };
      continue;
    }
    sections.push({
      title: opts.labelOf(slot.key, slot.param),
      itemCount: 1,
      skillCodes: [opts.skillOf(slot.key)],
      source: "generated",
      engineKey: engine,
      ...(params !== undefined ? { params } : {}),
    });
  }
  return sections;
}
