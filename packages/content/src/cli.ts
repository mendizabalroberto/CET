/**
 * CLI del pipeline de contenido.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 *   pnpm --filter @cet/content extract         extrae y escribe packs/ + COVERAGE.md
 *   pnpm --filter @cet/content extract:check   no escribe; falla si packs/ está desactualizado
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPacksUpToDate, runAll, verifyIdempotence, writePacks } from "./pipeline.ts";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "..", "..");
const outDir = join(packageRoot, "packs");

const checkOnly = process.argv.includes("--check");

const results = runAll(repoRoot);
const failed = results.filter((r) => r.pack === null);

for (const r of results) {
  if (r.pack === null) {
    console.error(`  ✗ ${r.code.padEnd(8)} ${r.error}`);
  } else {
    const lessons = r.pack.modules.reduce((a, m) => a + m.lessons.length, 0);
    console.log(
      `  ✓ ${r.code.padEnd(8)} ${String(lessons).padStart(2)} lecciones · ` +
        `${String(r.pack.questions.length).padStart(3)} preguntas · ` +
        `${r.pack.blueprints.length} blueprint(s) · ${r.pack.gaps.length} hueco(s)`,
    );
  }
}

if (checkOnly) {
  const stale = checkPacksUpToDate(outDir, results);
  if (stale.length > 0) {
    console.error(`\npacks/ desactualizado: ${stale.join(", ")}. Ejecuta \`pnpm extract\`.`);
    process.exit(1);
  }
  console.log("\npacks/ al día.");
} else {
  const written = writePacks(outDir, results);
  console.log(`\nEscritos ${written.length} ficheros en ${outDir}`);

  const { ok, differing } = verifyIdempotence(repoRoot);
  if (!ok) {
    console.error(`\nIDEMPOTENCIA ROTA en: ${differing.join(", ")}`);
    process.exit(1);
  }
  console.log("Idempotencia verificada: dos ejecuciones, salida idéntica.");
}

if (failed.length > 0) process.exit(1);
