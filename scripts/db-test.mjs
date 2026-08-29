/**
 * Corre las pruebas pgTAP de supabase/tests contra la base del proyecto.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ HACÍA FALTA ESCRIBIRLO
 * ===========================================================================
 * `supabase/tests/` tiene veinte ficheros pgTAP y en este repositorio NO HABÍA
 * NINGUNA FORMA DE EJECUTARLOS. El CLI de Supabase no está instalado en esta
 * máquina y `psql` tampoco, así que llevaban existiendo sin correr:
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
 * ===========================================================================
 * POR QUÉ HAY UNA BARRERA DE AISLAMIENTO Y NO UNA CONEXIÓN POR FICHERO
 * ===========================================================================
 * El 29 de agosto de 2026 el informe daba `rls_answer_key_hidden.sql` en ERROR
 * («You tried to plan twice!») y ese mismo fichero, lanzado solo, daba
 * `ok (19)`. Diecinueve asserts verdes contados como fichero roto.
 *
 * El diagnóstico, mirando los ficheros de verdad: la causa NO era «el rollback
 * del fichero que reventó no llega a correr». Eso ya estaba cubierto —había un
 * `rollback` en el `catch`—. La causa es que el estado de la sesión se hereda
 * también CUANDO EL FICHERO ANTERIOR TERMINA EN VERDE:
 *
 *   `retencion_telemetria.sql` acaba sin `select * from finish();` y sin
 *   `rollback;`. Se lo da todo por bueno, se reporta VERDE, y deja la
 *   transacción ABIERTA con el `plan()` de pgTAP ya puesto. El siguiente por
 *   orden alfabético es `rls_answer_key_hidden.sql`: su `begin;` no abre nada
 *   (ya estaba abierta) y su `select plan(19)` muere con «plan twice».
 *
 * Un `try/catch` no lo ve nunca, porque el fichero que ensucia no lanza. Por eso
 * la limpieza va en un `finally` que corre SIEMPRE, con éxito o sin él.
 *
 * ¿Y por qué no una conexión nueva por fichero, que es lo obvio?
 *
 *   - Cuesta veinte handshakes TCP+TLS+auth contra el pooler en un script que se
 *     lanza a mano varias veces por sesión de trabajo, y varias veces más en el
 *     `verify:` de cada contrato de base de datos.
 *   - No hace falta: `rollback` + `discard all` es LITERALMENTE lo que un pooler
 *     ejecuta al devolver una conexión al pool, es decir, es la definición de
 *     «conexión como recién abierta». `rollback` cierra la transacción (abierta
 *     o abortada); `discard all` se lleva lo que el rollback no toca —GUCs de
 *     sesión, `set role`, tablas temporales, planes preparados, secuencias—,
 *     que es la única diferencia real entre sanear y reconectar.
 *   - El orden importa: `discard all` no puede correr dentro de una transacción,
 *     así que el `rollback` va primero; y `discard all` borra el `search_path`,
 *     así que reponerlo va después. Sin reponerlo el fichero siguiente moriría
 *     con `function plan(integer) does not exist`.
 *
 * La conexión nueva sigue estando, pero como PLAN B en vez de como norma: si la
 * barrera barata falla —un pooler en modo transacción rechaza `DISCARD ALL`—, se
 * tira esa conexión y se abre otra. Así el caso raro se paga cuando ocurre, y no
 * en cada uno de los veinte ficheros de cada ejecución.
 *
 * Uso:
 *   node scripts/db-test.mjs                  # todos los ficheros
 *   node scripts/db-test.mjs mastery_job      # los que empiezan por eso
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "clcutoqjdgeggvgyreud";
const dir = join(root, "supabase", "tests");

/**
 * De dónde sale la contraseña. `PGPASSWORD` gana para que el motor de contratos
 * pueda verificar dentro de un worktree, donde `secrets/` no existe.
 */
export function leerContrasena() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const raw = readFileSync(join(root, "secrets", "database.env"), "utf8");
  const match = /SUPABASE_DB_PASSWORD\s*=\s*(\S+)/.exec(raw);
  if (!match?.[1]) throw new Error("No se encontró SUPABASE_DB_PASSWORD en secrets/database.env");
  return match[1];
}

/**
 * Resuelve `\ir ruta` — la meta-orden de psql para incluir otro fichero.
 *
 * No es cosmético: los ficheros de prueba comparten fixtures por ahí, y sin
 * resolverlo el driver recibe una línea que no es SQL y corta. Se resuelve
 * relativo al fichero que incluye, igual que hace psql, y de forma recursiva
 * porque un fixture puede incluir a otro.
 */
export function resolverIncludes(sql, base, vistos = new Set()) {
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
export function resolverRutas(env = process.env) {
  if (env.CET_DB_URL) {
    const url = new URL(env.CET_DB_URL);
    return [
      {
        label: `CET_DB_URL (${url.hostname})`,
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, "") || "postgres",
      },
    ];
  }
  return [
    { label: "directa", host: `db.${PROJECT_REF}.supabase.co`, user: "postgres" },
    { label: "pooler", host: "aws-0-us-east-1.pooler.supabase.com", user: `postgres.${PROJECT_REF}` },
  ];
}

async function conectar(rutas, log = console.log) {
  const { default: pg } = await import("pg");
  let contrasena;
  const problems = [];
  for (const route of rutas) {
    const candidate = new pg.Client({
      host: route.host,
      port: route.port ?? 5432,
      database: route.database ?? "postgres",
      user: route.user,
      password: route.password ?? (contrasena ??= leerContrasena()),
      ssl: { rejectUnauthorized: false },
      statement_timeout: 120_000,
      connectionTimeoutMillis: 8_000,
    });
    try {
      await candidate.connect();
      log(`\nConectado (via ${route.label}).\n`);
      return candidate;
    } catch (error) {
      problems.push(`${route.label}: ${error instanceof Error ? error.message : String(error)}`);
      await candidate.end().catch(() => undefined);
    }
  }
  throw new Error(`No se pudo conectar por ninguna via.\n  ${problems.join("\n  ")}`);
}

/** Aplana el TAP: node-pg devuelve un resultado por sentencia. */
export function lineasTap(resultado) {
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

/**
 * pgTAP vive en `extensions`, que es donde Supabase pone todas las extensiones,
 * y los ficheros de prueba llaman a `plan()` y a `is()` sin cualificar. Sin esta
 * linea el error es `function plan(integer) does not exist`, que manda a pensar
 * que la extension no esta instalada cuando lo que pasa es que no se ve.
 */
export const SENTENCIA_SEARCH_PATH = "set search_path = public, extensions, pg_catalog";

/**
 * La barrera entre un fichero y el siguiente. Ver la cabecera para el porqué de
 * cada una y de su orden.
 */
export const ORDENES_DE_AISLAMIENTO = ["rollback", "discard all", SENTENCIA_SEARCH_PATH];

/** Lee el TAP de un fichero y dice si está verde. */
export function evaluarTap(lineas) {
  const fallos = lineas.filter((l) => /^not ok\b/.test(l.trim()));
  const descuadre = lineas.filter((l) => /Looks like you planned/i.test(l));
  const pasados = lineas.filter((l) => /^ok\b/.test(l.trim())).length;
  const diagnosticas = lineas.filter((x) => /^\s*#/.test(x));
  return {
    estado: fallos.length === 0 && descuadre.length === 0 ? "ok" : "rojo",
    pasados,
    fallos,
    descuadre,
    diagnosticas,
  };
}

export async function correrFicheros({
  cliente,
  ficheros,
  sqlDe,
  reconectar = null,
  log = console.log,
  logError = console.error,
  escribir = (t) => process.stdout.write(t),
}) {
  const resultados = [];
  let ficherosRojos = 0;

  /**
   * Devuelve la sesión al estado en que se la encontró. Corre SIEMPRE, haya
   * reventado el fichero o haya salido verde: el caso medido —una transacción
   * que un fichero VERDE se deja abierta— no pasa por ningún `catch`.
   */
  async function aislar() {
    try {
      for (const orden of ORDENES_DE_AISLAMIENTO) await cliente.query(orden);
      return;
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      if (!reconectar) throw error;
      logError(`\n  No se pudo sanear la sesión (${motivo}). Se abre una conexión nueva.`);
    }
    // Plan B: la barrera barata no sirve en esta conexión, así que se paga la
    // conexión nueva — pero solo aquí, no en los veinte ficheros.
    await cliente.end().catch(() => undefined);
    cliente = await reconectar();
    await cliente.query(SENTENCIA_SEARCH_PATH);
  }

  for (const fichero of ficheros) {
    escribir(`  ${fichero} ... `);

    let lineas;
    let fallo = null;
    try {
      lineas = lineasTap(await cliente.query(sqlDe(fichero)));
    } catch (error) {
      fallo = error;
    } finally {
      await aislar();
    }

    if (fallo) {
      log("ERROR");
      logError(`\n--- ${fichero} ---`);
      logError(fallo instanceof Error ? fallo.message : String(fallo));
      ficherosRojos += 1;
      resultados.push({ fichero, estado: "error", pasados: 0, fallos: [] });
      continue;
    }

    const r = evaluarTap(lineas);
    if (r.estado === "ok") {
      log(`ok (${r.pasados})`);
      resultados.push({ fichero, estado: "ok", pasados: r.pasados, fallos: [] });
      continue;
    }

    log(`ROJO (${r.pasados} verdes, ${r.fallos.length} rojos)`);
    for (const f of r.fallos) logError(`     ${f.trim()}`);
    for (const d of r.descuadre) logError(`     ${d.trim()}`);
    // Las diagnosticas de pgTAP van en lineas que empiezan por `#` y son lo
    // unico que dice POR QUE fallo: sin ellas solo se sabe cual.
    for (const l of r.diagnosticas) logError(`     ${l.trim()}`);
    ficherosRojos += 1;
    resultados.push({ fichero, estado: "rojo", pasados: r.pasados, fallos: r.fallos });
  }

  return { resultados, ficherosRojos, cliente };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const prefix = argv.find((a) => !a.startsWith("--")) ?? null;
  const ficheros = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => prefix === null || f.startsWith(prefix))
    .sort();

  if (ficheros.length === 0) {
    console.error(`No hay ficheros .sql en ${dir}${prefix ? ` que empiecen por «${prefix}»` : ""}`);
    return 1;
  }

  const rutas = resolverRutas(env);
  const abrir = () => conectar(rutas);
  let cliente = await abrir();
  await cliente.query(SENTENCIA_SEARCH_PATH);

  let ficherosRojos;
  try {
    ({ ficherosRojos, cliente } = await correrFicheros({
      cliente,
      ficheros,
      sqlDe: (f) => resolverIncludes(readFileSync(join(dir, f), "utf8"), dir),
      reconectar: abrir,
    }));
  } finally {
    await cliente.end().catch(() => undefined);
  }

  console.log(
    ficherosRojos === 0
      ? `\n${ficheros.length}/${ficheros.length} ficheros en verde.\n`
      : `\n${ficherosRojos} de ${ficheros.length} ficheros en rojo.\n`,
  );
  return ficherosRojos === 0 ? 0 : 1;
}

// Solo se ejecuta cuando se invoca el fichero directamente. Importarlo desde
// una prueba no conecta a ninguna base.
const invocadoDirectamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoDirectamente) {
  process.exitCode = await main();
}
