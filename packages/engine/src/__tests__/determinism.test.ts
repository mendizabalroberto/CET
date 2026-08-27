/**
 * EL TEST GUARDIAN.
 *
 * Si este fichero se pone en rojo, el principio rector del MASTER_PLAN esta roto:
 * un examen terminado ya no se puede reconstruir. No se "arregla" relajando la
 * asercion; se arregla quitando la fuente de indeterminismo.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "../generators/index.js";
import { deriveItemSeed, deriveStreamSeed } from "../seed.js";
import { seedList } from "./helpers.js";

const SEEDS = seedList(100);

describe("determinismo de los generadores", () => {
  for (const generator of registry.all()) {
    it(`${generator.key}: 100 semillas, dos ejecuciones, salida identica byte a byte`, () => {
      for (const seed of SEEDS) {
        const first = generator.generate({}, seed);
        const second = generator.generate({}, seed);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }
    });

    it(`${generator.key}: la salida depende de la semilla, no del orden de llamada`, () => {
      // Se generan en orden inverso: si un generador guardase estado entre
      // llamadas, aqui saldrian resultados distintos.
      const forward = SEEDS.map((seed) => JSON.stringify(generator.generate({}, seed)));
      const backward = [...SEEDS]
        .reverse()
        .map((seed) => JSON.stringify(generator.generate({}, seed)))
        .reverse();
      expect(backward).toEqual(forward);
    });

    it(`${generator.key}: los parametros tambien son parte del contrato determinista`, () => {
      const seed = SEEDS[0] ?? 1;
      const a = generator.generate({ locale: "es" }, seed);
      const b = generator.generate({ locale: "es" }, seed);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });
  }
});

describe("derivacion de semillas", () => {
  it("deriveItemSeed es estable y produce enteros seguros", () => {
    for (const root of seedList(50, 12345)) {
      for (let ord = 0; ord < 25; ord += 1) {
        const a = deriveItemSeed(root, ord);
        const b = deriveItemSeed(root, ord);
        expect(a).toBe(b);
        expect(Number.isSafeInteger(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("posiciones distintas dan semillas distintas", () => {
    const root = 987654321;
    const seen = new Set<number>();
    for (let ord = 0; ord < 500; ord += 1) seen.add(deriveItemSeed(root, ord));
    expect(seen.size).toBe(500);
  });

  it("semillas raiz consecutivas no producen examenes parecidos", () => {
    let different = 0;
    for (let root = 1000; root < 1100; root += 1) {
      expect(deriveItemSeed(root, 1)).not.toBe(deriveItemSeed(root + 1, 1));
      const a = registry.generate("math.decimal", {}, deriveItemSeed(root, 1));
      const b = registry.generate("math.decimal", {}, deriveItemSeed(root + 1, 1));
      if (a.body.stem !== b.body.stem) different += 1;
    }
    // Colisiones sueltas son estadisticamente normales; parecerse siempre, no.
    expect(different).toBeGreaterThanOrEqual(95);
  });

  it("los flujos no se pisan entre si", () => {
    const root = 42;
    const streams = [1, 2, 3, 4].map((stream) => deriveStreamSeed(root, stream, 0));
    expect(new Set(streams).size).toBe(streams.length);
  });

  it("rechaza semillas invalidas en voz alta", () => {
    expect(() => deriveItemSeed(-1, 0)).toThrow();
    expect(() => deriveItemSeed(1.5, 0)).toThrow();
    expect(() => deriveItemSeed(1, -1)).toThrow();
    expect(() => deriveItemSeed(Number.MAX_SAFE_INTEGER + 10, 0)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */

const SRC_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      sourceFiles(full, acc);
    } else if (entry.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("prohibiciones de codigo", () => {
  it("ningun fichero de produccion usa Math.random ni Date.now", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const code = readFileSync(file, "utf8");
      // Se ignoran los comentarios: los comentarios de este paquete hablan de
      // Math.random precisamente para explicar por que no se usa.
      const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/Math\s*\.\s*random/.test(stripped)) offenders.push(`${file}: Math.random`);
      if (/Date\s*\.\s*now/.test(stripped)) offenders.push(`${file}: Date.now`);
      if (/new\s+Date\s*\(/.test(stripped)) offenders.push(`${file}: new Date()`);
      if (/performance\s*\.\s*now/.test(stripped)) offenders.push(`${file}: performance.now`);
      if (/crypto\s*\.\s*getRandomValues/.test(stripped)) {
        offenders.push(`${file}: crypto.getRandomValues`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
