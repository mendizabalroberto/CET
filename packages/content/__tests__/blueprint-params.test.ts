/**
 * Los parámetros de cada sección de examen tienen que valer para el motor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTE TEST HABRÍA EVITADO
 * ─────────────────────────────────────────────────────────────────────────────
 * El trainer de Y6A escribe `{k:'fracop', op:'+'}` y el generador del motor
 * espera `{ ops: ["add"] }`. El extractor copiaba el nombre del trainer tal cual.
 *
 * Zod, en su modo por defecto, DESCARTA las claves que no conoce. Así que `op`
 * se tiraba a la basura, `ops` quedaba `undefined`, y el generador sorteaba la
 * operación al azar. El resultado: el blueprint prometía «una pregunta de suma,
 * una de resta, una de multiplicación y una de división» y podía producir cuatro
 * multiplicaciones y ninguna división.
 *
 * Nada fallaba. Se generaba una pregunta perfectamente válida, se respondía, se
 * corregía bien y se guardaba bien. Simplemente no era el examen que el profesor
 * había definido, y nadie podía saberlo mirando la pantalla.
 *
 * Dos cosas lo cierran: `baseParams` es ahora `.strict()` —así un parámetro mal
 * nombrado revienta en vez de ignorarse— y este test, que lo detecta antes de
 * que llegue a la base de datos.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registry } from "@cet/engine";

const PACKS_DIR = join(import.meta.dirname, "..", "packs");

interface PackSection {
  readonly ord: number;
  readonly title?: Record<string, string>;
  readonly selection?: { readonly engineKey?: string; readonly params?: unknown };
}

interface Pack {
  readonly blueprints?: ReadonlyArray<{ readonly code: string; readonly sections: PackSection[] }>;
}

function loadPacks(): Array<{ file: string; pack: Pack }> {
  return readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => ({
      file,
      pack: JSON.parse(readFileSync(join(PACKS_DIR, file), "utf8")) as Pack,
    }));
}

describe("parámetros de blueprint <-> esquemas del motor", () => {
  const packs = loadPacks();

  it("hay packs que comprobar", () => {
    expect(packs.length).toBeGreaterThan(0);
  });

  it("todo engineKey referenciado existe en el registro", () => {
    const conocidos = new Set(registry.keys());
    const desconocidos: string[] = [];

    for (const { file, pack } of packs) {
      for (const bp of pack.blueprints ?? []) {
        for (const section of bp.sections) {
          const key = section.selection?.engineKey;
          if (key !== undefined && !conocidos.has(key)) {
            desconocidos.push(`${file} · ${bp.code} · sección ${section.ord}: ${key}`);
          }
        }
      }
    }

    expect(desconocidos, `engineKey inexistentes:\n${desconocidos.join("\n")}`).toEqual([]);
  });

  it("los parámetros de cada sección los ACEPTA el generador al que apuntan", () => {
    const rechazados: string[] = [];

    for (const { file, pack } of packs) {
      for (const bp of pack.blueprints ?? []) {
        for (const section of bp.sections) {
          const key = section.selection?.engineKey;
          const params = section.selection?.params;
          if (key === undefined || params === undefined) continue;
          if (!registry.keys().includes(key)) continue; // lo cubre el test anterior

          const generator = registry.get(key);
          // Se anade `locale` porque el motor lo acepta siempre y el pack no lo
          // fija: lo decide el intento.
          const resultado = generator.paramsSchema.safeParse({ ...(params as object) });

          if (!resultado.success) {
            rechazados.push(
              `${file} · ${bp.code} · sección ${section.ord} (${key}): ` +
                `${JSON.stringify(params)} → ${resultado.error.issues
                  .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
                  .join("; ")}`,
            );
          }
        }
      }
    }

    expect(
      rechazados,
      `secciones cuyos parámetros el motor rechaza:\n${rechazados.join("\n")}`,
    ).toEqual([]);
  });

  it("una sección con un parámetro del trainer sin traducir se detecta", () => {
    // Prueba del propio test: si alguien vuelve a emitir `op` en vez de `ops`,
    // el generador tiene que rechazarlo. Si este `expect` empezara a fallar,
    // significaria que `.strict()` se ha perdido y el test de arriba habria
    // dejado de proteger nada.
    const generator = registry.get("math.fracop");
    expect(generator.paramsSchema.safeParse({ op: "+" }).success).toBe(false);
    expect(generator.paramsSchema.safeParse({ ops: ["add"] }).success).toBe(true);
  });
});
