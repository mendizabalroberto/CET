/**
 * Taxonomía de skills.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los trainers ya traen una taxonomía implícita: la clave de categoría con la
 * que filtran el banco (`c:"ps"`, `t:'acid'`, `Q.amz`). Eso es exactamente un
 * skill, solo que abreviado y sin jerarquía. Aquí se hace explícito.
 *
 * Reglas del código:
 *   - `materia.familia[.detalle]`, en minúsculas y con `_` como separador
 *     interno (`math.fractions.simplify`, `science.acid_rain`);
 *   - un skill hoja siempre cuelga de una familia, y la familia de la materia;
 *   - el código es la clave estable frente a la base de datos
 *     (`unique (course_id, code)` en §2 de DATA_MODEL), así que RENOMBRAR un
 *     código es una migración, no una edición.
 *
 * El mapa `y6aKey` es el puente con el material original: es lo que permite
 * decir "esta pregunta salió de la categoría `ps` del trainer de English".
 */

import type { I18nText } from "@cet/shared";

export interface SkillDef {
  readonly code: string;
  readonly parentCode: string | null;
  readonly name: I18nText;
  /** Clave de categoría en el trainer Y6A, si la hay. */
  readonly y6aKey?: string;
}

const en = (text: string): I18nText => ({ en: text });
const es = (text: string): I18nText => ({ es: text });

/* -------------------------------------------------------------------------- */
/* Math                                                                       */
/* -------------------------------------------------------------------------- */

export const MATH_SKILLS: readonly SkillDef[] = [
  { code: "math.fractions", parentCode: null, name: en("Fractions") },
  { code: "math.fractions.simplify", parentCode: "math.fractions", name: en("Simplifying fractions"), y6aKey: "simplify" },
  { code: "math.fractions.compare", parentCode: "math.fractions", name: en("Comparing fractions"), y6aKey: "compare" },
  { code: "math.fractions.operations", parentCode: "math.fractions", name: en("Adding, subtracting, multiplying and dividing fractions"), y6aKey: "fracop" },
  { code: "math.fractions.mixed", parentCode: "math.fractions", name: en("Improper fractions and mixed numbers"), y6aKey: "mixed" },
  { code: "math.decimals", parentCode: null, name: en("Decimals") },
  { code: "math.decimals.multiply_divide", parentCode: "math.decimals", name: en("Multiplying and dividing decimals"), y6aKey: "decimal" },
  { code: "math.decimals.powers_of_ten", parentCode: "math.decimals", name: en("Multiplying and dividing by 10, 100 and 1,000"), y6aKey: "powten" },
  { code: "math.measurement", parentCode: null, name: en("Measurement") },
  { code: "math.measurement.metric", parentCode: "math.measurement", name: en("Metric unit conversions"), y6aKey: "metric" },
  { code: "math.geometry", parentCode: null, name: en("Geometry") },
  { code: "math.geometry.compound_shapes", parentCode: "math.geometry", name: en("Compound shapes: area and perimeter"), y6aKey: "shape" },
  { code: "math.problem_solving", parentCode: null, name: en("Problem solving") },
  { code: "math.problem_solving.word", parentCode: "math.problem_solving", name: en("Word problems"), y6aKey: "word" },
];

/**
 * CONTRATO CON `@cet/engine` (vía B del Hito 1).
 * Estos nombres NO se inventan aquí: son los que el motor registra. Cambiar uno
 * sin cambiar el otro rompe la materialización del examen en tiempo de
 * ejecución, no en compilación — por eso van juntos y con un test de contrato.
 */
export const MATH_ENGINE_KEYS: Readonly<Record<string, string>> = {
  simplify: "math.simplify",
  compare: "math.compare",
  fracop: "math.fracop",
  mixed: "math.mixed",
  decimal: "math.decimal",
  powten: "math.powten",
  metric: "math.metric",
  shape: "math.shape",
  word: "math.word",
};

/** Nombre del parámetro que el `MOCK_PLAN` de Math fija en cada generador. */
/**
 * Traduce el parametro de un slot de `MOCK_PLAN` a los PARAMETROS QUE ESPERA EL
 * MOTOR (`@cet/engine`), que no son los del trainer original.
 *
 * Esto existe porque el desajuste era invisible: el trainer escribe
 * `{k:'fracop', op:'+'}` y el generador espera `{ ops: ["add"] }`. Zod descartaba
 * la clave desconocida en silencio, `ops` quedaba undefined y el generador
 * sorteaba la operacion. El blueprint prometia una pregunta de cada operacion y
 * podia salir con cuatro multiplicaciones y ninguna division.
 *
 * Desde que `baseParams` es `.strict()`, un parametro mal nombrado revienta al
 * materializar el intento. Esta tabla es lo que hace que no reviente.
 */
const FRACOP_GLYPHS: Readonly<Record<string, string>> = {
  "+": "add",
  "−": "sub", // menos tipografico, que es el que usa el trainer
  "-": "sub",
  "×": "mul",
  "*": "mul",
  "÷": "div",
  "/": "div",
};

export function mathEngineParams(
  generatorKey: string,
  param: string | number | undefined,
): Record<string, unknown> | undefined {
  if (param === undefined) return undefined;

  switch (generatorKey) {
    case "fracop": {
      const op = FRACOP_GLYPHS[String(param)];
      if (op === undefined) {
        throw new Error(`MOCK_PLAN: operacion de fracop desconocida \`${String(param)}\``);
      }
      // El motor acepta una LISTA de operaciones permitidas, no una sola.
      return { ops: [op] };
    }
    case "shape":
      // `want` en el trainer, `target` en el motor. Los valores si coinciden.
      return { target: String(param) };
    case "word":
      // El trainer sortea la plantilla en runtime y solo manda un marcador.
      // Fijarla aqui empobreceria el examen: se deja sin parametro.
      return undefined;
    default:
      throw new Error(`MOCK_PLAN: el generador \`${generatorKey}\` no admite parametros`);
  }
}

/* -------------------------------------------------------------------------- */
/* Science                                                                    */
/* -------------------------------------------------------------------------- */

export const SCIENCE_SKILLS: readonly SkillDef[] = [
  { code: "science.environment", parentCode: null, name: en("Environment") },
  { code: "science.environment.acid_rain", parentCode: "science.environment", name: en("Acid rain"), y6aKey: "acid" },
  { code: "science.environment.recycling", parentCode: "science.environment", name: en("Recycling"), y6aKey: "recycle" },
  { code: "science.electricity", parentCode: null, name: en("Electricity") },
  { code: "science.electricity.conductors", parentCode: "science.electricity", name: en("Conductors and insulators"), y6aKey: "cond" },
  { code: "science.electricity.circuits", parentCode: "science.electricity", name: en("Electricity and circuits"), y6aKey: "elec" },
  { code: "science.electricity.symbols", parentCode: "science.electricity", name: en("Circuit symbols"), y6aKey: "sym" },
];

/* -------------------------------------------------------------------------- */
/* English                                                                    */
/* -------------------------------------------------------------------------- */

export const ENGLISH_SKILLS: readonly SkillDef[] = [
  { code: "english.grammar", parentCode: null, name: en("Grammar") },
  { code: "english.grammar.present_simple", parentCode: "english.grammar", name: en("Present simple"), y6aKey: "ps" },
  { code: "english.grammar.indefinite_pronouns", parentCode: "english.grammar", name: en("Indefinite pronouns"), y6aKey: "ip" },
  { code: "english.vocabulary", parentCode: null, name: en("Vocabulary") },
  { code: "english.vocabulary.collocations", parentCode: "english.vocabulary", name: en("Collocations"), y6aKey: "col" },
  { code: "english.vocabulary.topics", parentCode: "english.vocabulary", name: en("Topic vocabulary"), y6aKey: "voc" },
  { code: "english.skills", parentCode: null, name: en("Reading, writing and speaking") },
];

/* -------------------------------------------------------------------------- */
/* Español                                                                    */
/* -------------------------------------------------------------------------- */

export const SPANISH_SKILLS: readonly SkillDef[] = [
  { code: "spanish.verbos", parentCode: null, name: es("Los verbos") },
  { code: "spanish.verbos.regulares", parentCode: "spanish.verbos", name: es("Verbos regulares y verbos modelo"), y6aKey: "vr" },
  { code: "spanish.ortografia", parentCode: null, name: es("Ortografía") },
  { code: "spanish.ortografia.diptongo_hiato", parentCode: "spanish.ortografia", name: es("Diptongo, hiato y la tilde en los hiatos"), y6aKey: "hi" },
  { code: "spanish.ortografia.tilde_diacritica", parentCode: "spanish.ortografia", name: es("Tilde diacrítica"), y6aKey: "td" },
];

/* -------------------------------------------------------------------------- */
/* Social Studies                                                             */
/* -------------------------------------------------------------------------- */

export const SOCIALS_SKILLS: readonly SkillDef[] = [
  { code: "socials.rivers", parentCode: null, name: en("Rivers") },
  { code: "socials.rivers.amazon", parentCode: "socials.rivers", name: en("The Amazon River"), y6aKey: "amz" },
  { code: "socials.rivers.pollution", parentCode: "socials.rivers", name: en("River pollution"), y6aKey: "pol" },
  { code: "socials.landforms", parentCode: null, name: en("Landforms and maps") },
  { code: "socials.landforms.maps", parentCode: "socials.landforms", name: en("Mountains, rivers, hills and maps"), y6aKey: "map" },
  { code: "socials.landforms.mountain_formation", parentCode: "socials.landforms", name: en("How mountains are formed"), y6aKey: "frm" },
  { code: "socials.settlements", parentCode: null, name: en("Settlements") },
  { code: "socials.settlements.city_growth", parentCode: "socials.settlements", name: en("The growth of cities"), y6aKey: "cit" },
  { code: "socials.settlements.capital_cities", parentCode: "socials.settlements", name: en("Capital cities"), y6aKey: "cap" },
];

/* -------------------------------------------------------------------------- */
/* ICT                                                                        */
/* -------------------------------------------------------------------------- */

export const ICT_SKILLS: readonly SkillDef[] = [
  { code: "ict.systems", parentCode: null, name: en("Computer systems") },
  { code: "ict.systems.hardware_software", parentCode: "ict.systems", name: en("Hardware and software selection"), y6aKey: "hw" },
  { code: "ict.systems.data_transfer", parentCode: "ict.systems", name: en("Data transfer and networks"), y6aKey: "net" },
  { code: "ict.programming", parentCode: null, name: en("Programming") },
  { code: "ict.programming.scratch", parentCode: "ict.programming", name: en("Scratch"), y6aKey: "scr" },
  { code: "ict.applications", parentCode: null, name: en("Applications") },
  { code: "ict.applications.digital_content", parentCode: "ict.applications", name: en("Digital content"), y6aKey: "dig" },
  { code: "ict.applications.spreadsheets", parentCode: "ict.applications", name: en("Spreadsheets and data"), y6aKey: "xls" },
  // Tema "bonus" del trainer: tiene lección pero NINGUNA pregunta en `Q`.
  // Se le da skill propio igualmente para que el hueco sea visible en COVERAGE
  // en vez de quedar disuelto en otro tema.
  { code: "ict.applications.industry_data", parentCode: "ict.applications", name: en("How industries use data"), y6aKey: "ind" },
];

/* -------------------------------------------------------------------------- */

/**
 * Construye el resolvedor `categoría Y6A -> código de skill`.
 * Si llega una categoría desconocida, LANZA: significa que el trainer añadió un
 * tema que la taxonomía todavía no conoce, y colocar esas preguntas bajo un
 * skill "otros" las haría invisibles para el motor de mastery.
 */
export function skillResolver(skills: readonly SkillDef[], subject: string) {
  const byKey = new Map<string, string>();
  for (const s of skills) {
    if (s.y6aKey === undefined) continue;
    if (byKey.has(s.y6aKey)) {
      throw new Error(`clave Y6A duplicada \`${s.y6aKey}\` en la taxonomía de ${subject}`);
    }
    byKey.set(s.y6aKey, s.code);
  }
  return (category: string): string => {
    const code = byKey.get(category);
    if (code === undefined) {
      throw new Error(
        `categoría Y6A desconocida \`${category}\` en ${subject}: añádela a la taxonomía de skills`,
      );
    }
    return code;
  };
}
