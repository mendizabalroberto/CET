/**
 * Comprueba que TODA politica de 0012_rls_policies.sql esta clasificada en
 * supabase/POLITICAS.md. Una politica sin clasificar es trabajo sin borde.
 * Uso: node scripts/clasificar-politicas.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "supabase/migrations/0012_rls_policies.sql"), "utf8");
const doc = readFileSync(join(root, "supabase/POLITICAS.md"), "utf8");

const politicas = [...sql.matchAll(/create policy\s+"?([a-z0-9_]+)"?/gi)].map((m) => m[1]);
const clasificadas = new Map(
  [...doc.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|[^|]*\|\s*(intacta|reescrita|nueva)\s*\|/gim)]
    .map((m) => [m[1], m[2]]),
);

const faltan = politicas.filter((p) => !clasificadas.has(p));
if (faltan.length > 0) {
  console.error(`Sin clasificar (${faltan.length}):\n  ${faltan.join("\n  ")}`);
  process.exit(1);
}
console.log(`${politicas.length} politicas, todas clasificadas.`);
