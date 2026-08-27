/**
 * TAXONOMÍA CANÓNICA DE SKILLS.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE FICHERO
 * ─────────────────────────────────────────────────────────────────────────────
 * El código de una skill viaja por TRES sitios que se construyeron por separado:
 *
 *   1. `@cet/engine`  — cada generador declara su `skillCode`
 *   2. `@cet/content` — el extractor etiqueta cada pregunta con una skill
 *   3. `supabase/seed` y la tabla `skills` — la taxonomía persistida
 *
 * Los tres inventaron nombres ligeramente distintos para lo mismo:
 * `math.fractions.arithmetic` / `operations`, `math.fractions.mixed` /
 * `mixed_numbers`, `math.measurement.metric` / `metric_conversion`,
 * `math.decimals.powers_of_ten` / `math.place_value.powers_of_ten`.
 *
 * El fallo que eso produce es SILENCIOSO y caro: la pregunta se genera bien, se
 * responde bien y se califica bien, pero su `skill_id` no resuelve — así que el
 * modelo de mastery no registra nada, las recomendaciones adaptativas se
 * construyen sobre un vacío, y nadie se entera hasta que un profesor pregunta
 * por qué el panel dice que su clase no ha practicado fracciones.
 *
 * A partir de aquí hay UNA lista, y un test de paridad la hace cumplir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE ELIGIERON LOS NOMBRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Se derivan de los generadores `GEN.*` del trainer original de Y6A, que es la
 * fuente real del currículo. La jerarquía la expresa el propio código: el padre
 * de `a.b.c` es `a.b`. No hay tabla de traducción y no debe haberla.
 */

/** Skills de Matemáticas Y6, derivadas de los generadores del trainer Y6A. */
export const MATH_Y6_SKILLS = [
  // Raíces temáticas
  "math.fractions",
  "math.decimals",
  "math.measurement",
  "math.geometry",
  "math.problem_solving",

  // GEN.simplify / GEN.compare
  "math.fractions.simplify",
  "math.fractions.compare",

  // GEN.fracop — la familia y sus cuatro operaciones.
  // `operations` y no `arithmetic`: es el término que usan el motor y el
  // extractor, y describe mejor lo que el ejercicio pide hacer.
  "math.fractions.operations",
  "math.fractions.operations.add",
  "math.fractions.operations.subtract",
  "math.fractions.operations.multiply",
  "math.fractions.operations.divide",

  // GEN.mixed
  "math.fractions.mixed",

  // GEN.decimal / GEN.powten
  // `powers_of_ten` cuelga de `decimals` y no de un `place_value` aparte: en el
  // trainer es la misma lección y comparte el mismo error clásico del alumno
  // (mover la coma en vez de mover las cifras).
  "math.decimals.multiply_divide",
  "math.decimals.powers_of_ten",

  // GEN.metric
  "math.measurement.metric",
  "math.measurement.metric.length",
  "math.measurement.metric.mass",
  "math.measurement.metric.capacity",

  // GEN.shape
  "math.geometry.compound_shapes",
  "math.geometry.compound_shapes.area",
  "math.geometry.compound_shapes.perimeter",

  // GEN.word
  "math.problem_solving.word",
] as const;

export type MathY6Skill = (typeof MATH_Y6_SKILLS)[number];

/** Toda skill canónica del sistema. Crecerá al incorporar las otras materias. */
export const CANONICAL_SKILLS: readonly string[] = MATH_Y6_SKILLS;

const CANONICAL_SET = new Set<string>(CANONICAL_SKILLS);

/** ¿Es este código una skill canónica? */
export function isCanonicalSkill(code: string): boolean {
  return CANONICAL_SET.has(code);
}

/**
 * Código de la skill madre, o `null` si es raíz.
 * La jerarquía vive en el propio código: el padre de `a.b.c` es `a.b`.
 */
export function parentSkillCode(code: string): string | null {
  const cut = code.lastIndexOf(".");
  if (cut < 0) return null;
  const parent = code.slice(0, cut);
  // `math.fractions` tiene padre `math`, que NO es una skill: es la materia.
  return CANONICAL_SET.has(parent) ? parent : null;
}

/**
 * Comprueba una lista de códigos contra la taxonomía y devuelve los que sobran.
 * Lo usan los tests de paridad de `@cet/engine` y `@cet/content`.
 */
export function unknownSkillCodes(codes: Iterable<string>): string[] {
  const bad = new Set<string>();
  for (const code of codes) if (!CANONICAL_SET.has(code)) bad.add(code);
  return [...bad].sort();
}
