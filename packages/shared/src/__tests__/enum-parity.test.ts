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

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type z } from "zod";

import {
  accesoTipo,
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
  membershipStatus,
  sectionRole,
  schoolStatus,
  submittedBy,
  userRole,
} from "../enums.js";
import { learningEventType } from "../events.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../../supabase/migrations");

/**
 * El SQL de los enums NO es un fichero, es una CADENA.
 *
 * Antes este test leia solo `0002_enums.sql`, y esa decision tenia una
 * consecuencia que no se ve: convertia el enum en inmutable. Cualquier
 * `alter type ... add value` posterior --que es la unica forma de ampliar un
 * enum en Postgres, porque `create type` no se puede reescribir sobre una
 * columna en uso-- rompia este test aunque la base de datos y TypeScript
 * estuvieran perfectamente de acuerdo. El aviso decia lo contrario de lo que
 * pasaba.
 *
 * Se leen TODAS las migraciones en el orden en que las aplica `db-apply.mjs`
 * (orden lexicografico de nombre de fichero), que es el orden en que Postgres
 * las va a ver.
 */
function leerMigracionesEnOrden(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");
}

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

/**
 * Aplica sobre el mapa los `alter type public.<nombre> add value [if not exists]
 * '<miembro>'` en el orden en que aparecen.
 *
 * Solo se admite la forma que APENDE. `add value ... before/after` existe en
 * Postgres e inserta el miembro en medio, lo que cambia el orden de comparacion
 * del enum y por tanto el significado de cualquier `order by` ya escrito. Este
 * test no lo simula: lo RECHAZA con un error explicito, para que quien lo
 * escriba se entere aqui y no en el informe de conducta de dentro de seis meses.
 */
function aplicarAddValue(sql: string, enums: Map<string, string[]>): void {
  const re =
    /alter\s+type\s+public\.(\w+)\s+add\s+value\s+(if\s+not\s+exists\s+)?'([^']+)'\s*(before|after)?/gis;

  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const [, name, , member, posicion] = match;
    if (!name || !member) continue;
    if (posicion) {
      throw new Error(
        `alter type public.${name} add value '${member}' ${posicion}: ` +
          "insertar un miembro en medio cambia el orden de comparacion del enum. " +
          "Los miembros nuevos se apenden al final, en el mismo orden que en @cet/shared.",
      );
    }
    const actuales = enums.get(name);
    if (!actuales) {
      throw new Error(
        `alter type public.${name} add value: el tipo no se declara con create type en ninguna migracion.`,
      );
    }
    // `if not exists` reaplicado no duplica en Postgres; aqui tampoco.
    if (!actuales.includes(member)) actuales.push(member);
  }
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
  ["membership_status", membershipStatus],
  ["acceso_tipo", accesoTipo],
  ["learning_event_type", learningEventType],
];

/**
 * Enums que viven SOLO en la base de datos y no tienen —ni deben tener— un
 * `z.enum` en `@cet/shared`.
 *
 * `@cet/shared` es el contrato que cruza la frontera cliente-servidor: todo lo
 * que hay ahí viaja en un payload que el navegador ve. Los cuatro enums del
 * corpus (0027) son de la tubería de ingesta de PDF, que corre en scripts y
 * nunca sale a un cliente. Declararlos aquí no ataría nada real y le daría al
 * navegador un mapa gratis de cómo se construye el banco de preguntas.
 *
 * La lista es EXPLÍCITA a propósito. La alternativa —quitar esta comprobación—
 * dejaría pasar el caso que sí importa: un enum de dominio nuevo que alguien
 * crea en SQL y se olvida de reflejar en TypeScript.
 */
const SOLO_SERVIDOR = new Set([
  "extraction_method",
  "span_kind",
  "candidate_status",
  "candidate_kind",
]);

describe("paridad de enums TypeScript <-> Postgres", () => {
  const sql = leerMigracionesEnOrden();
  const sqlEnums = parseSqlEnums(sql);
  aplicarAddValue(sql, sqlEnums);

  it("las migraciones declaran al menos un enum (el parser funciona)", () => {
    expect(sqlEnums.size).toBeGreaterThan(0);
  });

  it("los add value posteriores se aplican de verdad (el parser no los ignora)", () => {
    // Si `aplicarAddValue` dejara de funcionar, el resto de asserts empezaria a
    // pasar por el motivo equivocado: comparando el enum ORIGINAL contra un
    // TypeScript que tambien se hubiera quedado corto. Esta prueba fija un caso
    // concreto —0051 amplía learning_event_type— para que ese silencio no
    // pueda ocurrir.
    expect(sqlEnums.get("learning_event_type")).toContain("ui_interaction");
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
    const orphans = [...sqlEnums.keys()].filter(
      (name) => !declared.has(name) && !SOLO_SERVIDOR.has(name),
    );
    expect(
      orphans,
      `estos tipos existen en Postgres pero no en @cet/shared: ${orphans.join(", ")}`,
    ).toEqual([]);
  });
});
