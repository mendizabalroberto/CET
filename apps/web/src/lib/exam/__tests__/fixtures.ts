/**
 * Datos de prueba del motor de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Un banco de preguntas ESTÁTICAS de tipo `choice`. Se eligen estáticas a
 * propósito: los generadores ya tienen su propia batería de tests de
 * determinismo en `packages/engine`, y aquí lo que se prueba es el ciclo de
 * vida del intento, no el motor.
 */
import type { AssignmentRow, BlueprintRow, BlueprintSectionRow, PoolRow } from "../types";

export const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_SCHOOL_ID = "22222222-2222-4222-8222-222222222222";
export const STUDENT_ID = "33333333-3333-4333-8333-333333333333";
export const OTHER_STUDENT_ID = "44444444-4444-4444-8444-444444444444";
export const ASSIGNMENT_ID = "55555555-5555-4555-8555-555555555555";
export const BLUEPRINT_ID = "66666666-6666-4666-8666-666666666666";
export const COURSE_ID = "77777777-7777-4777-8777-777777777777";

/** Instante fijo. Ningún test lee el reloj real: el reloj es un argumento. */
export const NOW = new Date("2026-05-04T09:00:00.000Z");

export function assignment(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: ASSIGNMENT_ID,
    blueprint_id: BLUEPRINT_ID,
    blueprint_version: 1,
    school_id: SCHOOL_ID,
    section_id: "88888888-8888-4888-8888-888888888888",
    opens_at: "2026-05-04T08:00:00.000Z",
    closes_at: "2026-05-04T12:00:00.000Z",
    max_attempts: 1,
    time_limit_override_seconds: null,
    ...overrides,
  };
}

export function blueprint(overrides: Partial<BlueprintRow> = {}): BlueprintRow {
  return {
    id: BLUEPRINT_ID,
    course_id: COURSE_ID,
    school_id: SCHOOL_ID,
    title: { es: "Fracciones", en: "Fractions" },
    duration_seconds: 1800,
    // Sin barajar: los tests comprueban el ciclo de vida, y un orden estable
    // hace que un fallo se lea de un vistazo. El barajado ya está cubierto por
    // los tests de determinismo de @cet/engine.
    shuffle_questions: false,
    shuffle_options: false,
    allow_back: true,
    feedback_mode: "after_submit",
    pass_threshold: 50,
    max_attempts: 1,
    version: 1,
    ...overrides,
  };
}

export function section(overrides: Partial<BlueprintSectionRow> = {}): BlueprintSectionRow {
  return {
    ord: 1,
    title: { es: "Parte 1", en: "Part 1" },
    item_count: 3,
    selection: {},
    source: "bank",
    points_per_item: 1,
    ...overrides,
  };
}

/** `n` preguntas estáticas de opción única, con la `a` siempre correcta. */
export function poolOf(n: number, skillId = "skill-fractions"): PoolRow[] {
  return Array.from({ length: n }, (_, index) => ({
    question_id: `question-${index + 1}`,
    kind: "static" as const,
    skill_id: skillId,
    // El motor ORDENA el banco por `question_version_id` antes de sortear, así
    // que se rellena a la izquierda para que el orden lexicográfico coincida
    // con el numérico y los tests sean legibles.
    version_id: `version-${String(index + 1).padStart(3, "0")}`,
    format: "mcq_single",
    body: {
      stem: `¿Cuánto es ${index + 1} + 1?`,
      options: [
        { id: "a", html: String(index + 2) },
        { id: "b", html: String(index + 5) },
      ],
    },
    answer_spec: { type: "choice", correctIds: ["a"] },
    difficulty: 3,
    max_points: 1,
    grading_mode: "auto" as const,
  }));
}

/** El mismo banco, pero con la pregunta indicada corregida a mano. */
export function poolWithManual(n: number, manualIndex: number): PoolRow[] {
  const pool = poolOf(n);
  const target = pool[manualIndex];
  if (!target) throw new Error(`[fixtures] índice ${manualIndex} fuera del banco`);
  pool[manualIndex] = {
    ...target,
    format: "long_text",
    body: { stem: "Explica cómo has llegado a la respuesta." },
    answer_spec: { type: "manual", rubric: { es: "Rúbrica", en: "Rubric" } },
    grading_mode: "manual",
  };
  return pool;
}
