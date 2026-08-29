/**
 * Corre las pruebas pgTAP de supabase/tests contra la base del proyecto.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ HACÍA FALTA ESCRIBIRLO
 * ===========================================================================
 * `supabase/tests/` tiene trece ficheros pgTAP y en este repositorio NO HABÍA
 * NINGUNA FORMA DE EJECUTARLOS. El CLI de Supabase no está instalado en esta
 * máquina y `psql` tampoco, así que los trece llevaban existiendo sin correr:
 * `constraints.sql` declaraba `plan(48)` con 45 asserts escritos, y ese
 * descuadre —que pgTAP canta en la última línea— no lo había visto nadie.
 *
 * Una prueba que no se puede ejecutar no es una prueba: es un documento con
 * sintaxis de prueba, y engaña más que un fichero vacío porque parece cobertura.
 *
 * ===========================================================================
 * CÓMO LEE LOS RESULTADOS
 * ===========================================================================
 * pgTAP devuelve TAP como FILAS, no como texto de consola: cada assert es una
 * fila `ok 3 - descripción` o `not ok 3 - descripción`. Este corredor las junta
 * todas y falla si aparece una sola `not ok`, o si el `plan(N)` no cuadra con
 * los asserts ejecutados (`# Looks like you planned N but ran M`).
 *
 * Cada fichero trae su propio `begin; ... rollback;`, así que NADA de lo que
 * siembren las pruebas sobrevive. Es lo que permite correrlas contra la base
 * real sin ensuciarla.
 *
 * Uso:
 *   node scripts/db-test.mjs                  # todos los ficheros
 *   node scripts/db-test.mjs mastery_job      # los que empiezan por eso
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "clcutoqjdgeggvgyreud";
const dir = join(root, "supabase", "tests");

function readPassword() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const raw = readFileSync(join(root, "secrets", "database.env"), "utf8");
  const match = /SUPABASE_DB_PASSWORD\s*=\s*(\S+)/.exec(raw);
  if (!match?.[1]) throw new Error("No se encontró SUPABASE_DB_PASSWORD en secrets/database.env");
  return match[1];
}

const prefix = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? null;
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => prefix === null || f.startsWith(prefix))
  .sort();

if (files.length === 0) {
  console.error(`No hay ficheros .sql en ${dir}${prefix ? ` que empiecen por «${prefix}»` : ""}`);
  process.exit(1);
}

/**
 * Resuelve `\ir ruta` — la meta-orden de psql para incluir otro fichero.
 *
 * No es cosmético: los ficheros de prueba comparten fixtures por ahí, y sin
 * resolverlo el driver recibe una línea que no es SQL y corta. Se resuelve
 * relativo al fichero que incluye, igual que hace psql, y de forma recursiva
 * porque un fixture puede incluir a otro.
 */
function resolverIncludes(sql, base, vistos = new Set()) {
  return sql.replace(/^[ \t]*\\ir[ \t]+(\S+)[ \t]*$/gim, (_todo, ruta) => {
    const destino = resolve(base, ruta);
    if (!existsSync(destino)) {
      throw new Error(`\\ir apunta a un fichero que no existe: ${ruta}`);
    }
    if (vistos.has(destino)) {
      throw new Error(`\\ir circular: ${ruta}`);
    }
    vistos.add(destino);
    return resolverIncludes(readFileSync(destino, "utf8"), dirname(destino), vistos);
  });
}

/**
 * A donde se conecta. Sin `CET_DB_URL`, produccion.
 *
 * `db-apply.mjs` ya aceptaba esta variable y este fichero no: se podia aplicar
 * una migracion en una rama y verificarla contra PRODUCCION sin que nada
 * avisara, que es la peor combinacion posible — el verde diria que la migracion
 * funciona cuando lo que se ha probado es otra base. Las dos mitades del ciclo
 * tienen que apuntar al mismo sitio o ninguna de las dos significa nada.
 */
const ROUTES = process.env.CET_DB_URL
  ? [(() => {
      const url = new URL(process.env.CET_DB_URL);
      return {
        label: `CET_DB_URL (${url.hostname})`,
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, "") || "postgres",
      };
    })()]
  : [
      { label: "directa", host: `db.${PROJECT_REF}.supabase.co`, user: "postgres" },
      { label: "pooler", host: "aws-0-us-east-1.pooler.supabase.com", user: `postgres.${PROJECT_REF}` },
    ];

async function connectAny() {
  const password = readPassword();
  const problems = [];
  for (const route of ROUTES) {
    const candidate = new pg.Client({
      host: route.host,
      port: route.port ?? 5432,
      database: route.database ?? "postgres",
      user: route.user,
      password: route.password ?? password,
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

/** Aplana el TAP: node-pg devuelve un resultado por sentencia. */
function lineasTap(resultado) {
  const conjuntos = Array.isArray(resultado) ? resultado : [resultado];
  const lineas = [];
  for (const r of conjuntos) {
    for (const fila of r?.rows ?? []) {
      for (const valor of Object.values(fila)) {
        if (typeof valor === "string") lineas.push(...valor.split("\n"));
      }
    }
  }
  return lineas;
}

const client = await connectAny();

// pgTAP vive en `extensions`, que es donde Supabase pone todas las extensiones,
// y los ficheros de prueba llaman a `plan()` y a `is()` sin cualificar. Sin esta
// linea el error es `function plan(integer) does not exist`, que manda a pensar
// que la extension no esta instalada cuando lo que pasa es que no se ve.
await client.query("set search_path = public, extensions, pg_catalog");

let ficherosRojos = 0;

try {
  for (const file of files) {
    const crudo = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`  ${file} ... `);

    let lineas;
    try {
      lineas = lineasTap(await client.query(resolverIncludes(crudo, dir)));
    } catch (error) {
      // El rollback del propio fichero no llegó a correr: se deshace aquí, o la
      // conexión queda en transacción abortada y TODOS los ficheros siguientes
      // fallarían por un motivo que no es el suyo.
      await client.query("rollback").catch(() => undefined);
      console.log("ERROR");
      console.error(`\n--- ${file} ---`);
      console.error(error instanceof Error ? error.message : String(error));
      ficherosRojos += 1;
      continue;
    }

    const fallos = lineas.filter((l) => /^not ok\b/.test(l.trim()));
    const descuadre = lineas.filter((l) => /Looks like you planned/i.test(l));
    const pasados = lineas.filter((l) => /^ok\b/.test(l.trim())).length;

    if (fallos.length === 0 && descuadre.length === 0) {
      console.log(`ok (${pasados})`);
      continue;
    }

    console.log(`ROJO (${pasados} verdes, ${fallos.length} rojos)`);
    for (const f of fallos) console.error(`     ${f.trim()}`);
    for (const d of descuadre) console.error(`     ${d.trim()}`);
    // Las diagnosticas de pgTAP van en lineas que empiezan por `#` y son lo
    // unico que dice POR QUE fallo: sin ellas solo se sabe cual.
    for (const l of lineas.filter((x) => /^\s*#/.test(x))) console.error(`     ${l.trim()}`);
    ficherosRojos += 1;
  }
} finally {
  await client.end().catch(() => undefined);
}

console.log(
  ficherosRojos === 0
    ? `\n${files.length}/${files.length} ficheros en verde.\n`
    : `\n${ficherosRojos} de ${files.length} ficheros en rojo.\n`,
);
process.exit(ficherosRojos === 0 ? 0 : 1);
