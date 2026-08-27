/**
 * Paridad entre los `skillCode` de los generadores y la taxonomía canónica.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ EXISTE
 * Cuando el motor, el extractor de contenido y el seed de la base de datos se
 * construyeron en paralelo, los tres inventaron nombres distintos para la misma
 * skill: `math.fractions.arithmetic` / `operations`, `math.fractions.mixed` /
 * `mixed_numbers`, `math.measurement.metric` / `metric_conversion`.
 *
 * El fallo que produce es SILENCIOSO: la pregunta se genera, se responde y se
 * califica correctamente, pero su `skill_id` no resuelve contra la tabla
 * `skills`. El modelo de mastery no registra nada y las recomendaciones
 * adaptativas se construyen sobre un vacío. Nadie se entera hasta que un
 * profesor pregunta por qué su clase "no ha practicado fracciones".
 *
 * Este test lo convierte en un fallo ruidoso de CI.
 */

import { describe, expect, it } from "vitest";
import { CANONICAL_SKILLS, isCanonicalSkill, parentSkillCode, unknownSkillCodes } from "@cet/shared";
import { registry } from "../generators/index.js";

/** Todos los `skillCode` que los generadores registrados pueden emitir. */
function registeredSkillCodes(): string[] {
  const codes = new Set<string>();
  for (const generator of registry.all()) codes.add(generator.skillCode);
  return [...codes].sort();
}

describe("paridad de skills motor <-> taxonomía canónica", () => {
  it("el registro expone al menos un generador", () => {
    expect(registeredSkillCodes().length).toBeGreaterThan(0);
  });

  it("todo skillCode emitido existe en la taxonomía canónica", () => {
    const unknown = unknownSkillCodes(registeredSkillCodes());
    expect(
      unknown,
      `estos skillCode no existen en CANONICAL_SKILLS de @cet/shared: ${unknown.join(", ")}.\n` +
        "O el generador usa un nombre equivocado, o falta declarar la skill en el contrato.",
    ).toEqual([]);
  });

  it("cada generador declara individualmente una skill canónica", () => {
    for (const generator of registry.all()) {
      expect(
        isCanonicalSkill(generator.skillCode),
        `${generator.key} declara "${generator.skillCode}", que no es canónica`,
      ).toBe(true);
    }
  });

  it("toda skill canónica no raíz tiene su madre también en la taxonomía", () => {
    // La jerarquía vive en el propio código (`a.b.c` cuelga de `a.b`). Una hija
    // huérfana rompe el recorrido del árbol en el dashboard de mastery.
    const orphans = CANONICAL_SKILLS.filter((code) => {
      const depth = code.split(".").length;
      if (depth <= 2) return false; // `math.fractions` cuelga de la materia, no de una skill
      return parentSkillCode(code) === null;
    });
    expect(orphans, `skills sin madre declarada: ${orphans.join(", ")}`).toEqual([]);
  });
});
