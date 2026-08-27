/**
 * Paridad entre las skills del extractor y la taxonomía canónica.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Gemelo del test que vive en `@cet/engine`. Los dos existen porque el código de
 * una skill viaja por tres sitios construidos por separado (motor, extractor y
 * seed) y los tres inventaron nombres distintos para lo mismo. El fallo que eso
 * produce es silencioso: la pregunta funciona, pero su `skill_id` no resuelve y
 * el modelo de mastery no registra nada.
 *
 * Solo se comprueban las skills de Matemáticas: es la única materia con
 * taxonomía canónica declarada (Hito 2). Las otras cinco entran en el Hito 4 y
 * este test debe ampliarse entonces — la lista de materias cubiertas está abajo
 * y es deliberadamente explícita para que ampliarla sea un acto consciente.
 */

import { describe, expect, it } from "vitest";
import { unknownSkillCodes, isCanonicalSkill } from "@cet/shared";
import { MATH_SKILLS } from "../src/skills.js";

/** Materias cuya taxonomía ya está congelada en `@cet/shared`. */
const COVERED_SUBJECTS = ["math"] as const;

function coveredSkillCodes(): string[] {
  return MATH_SKILLS.map((s) => s.code).filter((code) =>
    COVERED_SUBJECTS.some((subject) => code === subject || code.startsWith(`${subject}.`)),
  );
}

describe("paridad de skills extractor <-> taxonomía canónica", () => {
  it("el extractor declara skills de las materias cubiertas", () => {
    expect(coveredSkillCodes().length).toBeGreaterThan(0);
  });

  it("toda skill de Matemáticas del extractor es canónica", () => {
    const unknown = unknownSkillCodes(coveredSkillCodes());
    expect(
      unknown,
      `el extractor usa codigos que no existen en CANONICAL_SKILLS: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("la jerarquía declarada por el extractor coincide con la del código", () => {
    // El extractor lleva un `parentCode` explicito; la taxonomia lo deriva del
    // propio codigo. Si discrepan, el arbol de mastery se dibuja mal.
    for (const skill of MATH_SKILLS) {
      if (!isCanonicalSkill(skill.code)) continue;
      const derived = skill.code.includes(".")
        ? skill.code.slice(0, skill.code.lastIndexOf("."))
        : null;
      const expected = derived && isCanonicalSkill(derived) ? derived : null;
      expect(
        skill.parentCode ?? null,
        `${skill.code}: parentCode declarado "${skill.parentCode ?? "null"}" ` +
          `pero el codigo implica "${expected ?? "null"}"`,
      ).toBe(expected);
    }
  });
});
