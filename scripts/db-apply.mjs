/**
 * Aplica los ficheros SQL de supabase/ contra la base de datos del proyecto.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Existe porque el CLI de Supabase no está instalado en esta máquina. No
 * sustituye a `supabase db push` en el flujo real: es una herramienta de
 * integración para aplicar y verificar las migraciones desde el repositorio.
 *
 * Cada fichero se aplica dentro de UNA transacción: o entra entero o no entra
 * nada. Una migración a medias deja un esquema que nadie sabe reproducir.
 *
 * Uso:
 *   node scripts/db-apply.mjs migrations       # aplica supabase/migrations/*.sql
 *   node scripts/db-apply.mjs seed             # aplica supabase/seed/*.sql
 *   node scripts/db-apply.mjs migrations --dry # solo lista lo que haría
 *
 * La contraseña se lee de PGPASSWORD o de secrets/database.env. Nunca se imprime.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "clcutoqjdgeggvgyreud";

function readPassword() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const raw = readFileSync(join(root, "secrets", "database.env"), "utf8");
  const match = /SUPABASE_DB_PASSWORD\s*=\s*(\S+)/.exec(raw);
  if (!match?.[1]) throw new Error("No se encontró SUPABASE_DB_PASSWORD en secrets/database.env");
  return match[1];
}

const folder = process.argv[2] ?? "migrations";
const dryRun = process.argv.includes("--dry");
const dir = join(root, "supabase", folder);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No hay ficheros .sql en ${dir}`);
  process.exit(1);
}

console.log(`\n${files.length} fichero(s) en supabase/${folder}:`);
for (const f of files) console.log(`  - ${f}`);
if (dryRun) {
  console.log("\n--dry: no se ha ejecutado nada.\n");
  process.exit(0);
}

// El pooler de Supabase (puerto 6543) no admite algunas sentencias DDL; se usa
// la conexión directa al puerto 5432.
const client = new pg.Client({
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: readPassword(),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

let applied = 0;
try {
  await client.connect();
  console.log("\nConectado.\n");

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`  ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      applied += 1;
      console.log("OK");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      console.log("FALLO");
      console.error(`\n--- ${file} ---`);
      console.error(error instanceof Error ? error.message : String(error));
      if (error && typeof error === "object" && "position" in error) {
        const pos = Number(error.position);
        if (Number.isFinite(pos)) {
          const upto = sql.slice(0, pos);
          const line = upto.split("\n").length;
          console.error(`  en la línea ~${line}: ${sql.split("\n")[line - 1]?.trim() ?? ""}`);
        }
      }
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

console.log(`\n${applied}/${files.length} aplicados.\n`);
