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

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--")) ?? "migrations";
const prefix = args.filter((a) => !a.startsWith("--"))[1] ?? null;
const dryRun = args.includes("--dry");
const dir = join(root, "supabase", folder);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => prefix === null || f.startsWith(prefix))
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

// DOS VIAS, en este orden:
//   1. directa  db.<ref>.supabase.co:5432, usuario `postgres`
//   2. pooler   aws-0-us-east-1.pooler.supabase.com:5432 en modo SESION
//
// La directa solo resuelve a IPv6 desde agosto de 2026: en una red sin IPv6 no
// da un error de credenciales, da un ETIMEDOUT de 30 s que lo parece. El pooler
// en modo SESION (5432) SI admite DDL; el de modo transaccion (6543) no, y por
// eso no se usa el 6543 aqui.
const ROUTES = [
  { label: "directa", host: `db.${PROJECT_REF}.supabase.co`, user: "postgres" },
  { label: "pooler", host: "aws-0-us-east-1.pooler.supabase.com", user: `postgres.${PROJECT_REF}` },
];

async function connectAny() {
  const password = readPassword();
  const problems = [];
  for (const route of ROUTES) {
    const candidate = new pg.Client({
      host: route.host,
      port: 5432,
      database: "postgres",
      user: route.user,
      password,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 120_000,
      connectionTimeoutMillis: 8_000,
    });
    try {
      await candidate.connect();
      console.log(`\nConectado (via ${route.label}).\n`);
      return candidate;
    } catch (error) {
      problems.push(`${route.label}: ${error instanceof Error ? error.message : String(error)}`);
      await candidate.end().catch(() => undefined);
    }
  }
  throw new Error(`No se pudo conectar por ninguna via.\n  ${problems.join("\n  ")}`);
}

let applied = 0;
const client = await connectAny();

try {
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
