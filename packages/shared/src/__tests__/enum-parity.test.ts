/**
 * Paridad entre los enums de TypeScript y los de Postgres.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ EXISTE ESTE TEST
 * `packages/shared/src/enums.ts` y `supabase/migrations/0002_enums.sql` declaran
 * los mismos enums dos veces, en dos lenguajes. Nada obliga a que coincidan, y
 * el día que dejen de hacerlo el fallo no aparece al compilar ni al testear: sale
 * en produccion como `invalid input value for enum` en mitad de un examen.
 *
 * El orden tambien importa. En Postgres el orden de declaracion de un enum ES su
 * orden de comparacion, asi que un `order by status` cambia de significado si
 * alguien reordena los miembros en un lado y no en el otro.
 *
 * Este test lee el SQL real y lo compara con la fuente TypeScript.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type z } from "zod";

import {
  attemptStatus,
  blockKind,
  blueprintSectionSource,
  contentStatus,
  feedbackMode,
  gradingActor,
  gradingMode,
  profileStatus,
  questionFormat,
  questionKind,
  registrationStatus,
  responseSource,
  schoolStage,
  sectionRole,
  schoolStatus,
  submittedBy,
  userRole,
} from "../enums.js";
import { learningEventType } from "../events.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, "../../../../supabase/migrations/0002_enums.sql");

/** Extrae `create type public.<nombre> as enum (...)` del SQL, en orden. */
function parseSqlEnums(sql: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /create\s+type\s+public\.(\w+)\s+as\s+enum\s*\(([^)]*)\)/gis;

  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const name = match[1];
    const body = match[2];
    if (!name || body === undefined) continue;

    const members = body
      // Un `--` dentro del parentesis comentaria el resto de la linea.
      .replace(/--[^\n]*/g, "")
      .split(",")
      .map((raw) => raw.trim())
      .filter((raw) => raw.length > 0)
      .map((raw) => raw.replace(/^'|'$/g, ""));

    out.set(name, members);
  }
  return out;
}

/** Nombre del tipo en Postgres -> el `z.enum` de @cet/shared que le corresponde. */
const PAIRS: ReadonlyArray<readonly [string, z.ZodEnum<[string, ...string[]]>]> = [
  ["user_role", userRole],
  ["profile_status", profileStatus],
  ["school_status", schoolStatus],
  ["school_stage", schoolStage],
  ["content_status", contentStatus],
  ["block_kind", blockKind],
  ["question_kind", questionKind],
  ["question_format", questionFormat],
  ["grading_mode", gradingMode],
  ["grading_actor", gradingActor],
  ["feedback_mode", feedbackMode],
  ["attempt_status", attemptStatus],
  ["submitted_by", submittedBy],
  ["response_source", responseSource],
  ["registration_status", registrationStatus],
  ["blueprint_section_source", blueprintSectionSource],
  ["section_role", sectionRole],
  ["learning_event_type", learningEventType],
];

describe("paridad de enums TypeScript <-> Postgres", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const sqlEnums = parseSqlEnums(sql);

  it("la migracion declara al menos un enum (el parser funciona)", () => {
    expect(sqlEnums.size).toBeGreaterThan(0);
  });

  for (const [typeName, schema] of PAIRS) {
    it(`${typeName} coincide miembro a miembro y en orden`, () => {
      const fromSql = sqlEnums.get(typeName);
      expect(fromSql, `el tipo public.${typeName} no existe en 0002_enums.sql`).toBeDefined();
      // El orden se compara a proposito: en Postgres es el orden de comparacion.
      expect(fromSql).toEqual([...schema.options]);
    });
  }

  it("no hay enums en el SQL que TypeScript desconozca", () => {
    const declared = new Set(PAIRS.map(([name]) => name));
    const orphans = [...sqlEnums.keys()].filter((name) => !declared.has(name));
    expect(
      orphans,
      `estos tipos existen en Postgres pero no en @cet/shared: ${orphans.join(", ")}`,
    ).toEqual([]);
  });
});
