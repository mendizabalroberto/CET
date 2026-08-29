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
 * ===========================================================================
 * POR QUÉ ESTE FICHERO CAMBIÓ (28/08/2026) — LEER ANTES DE TOCARLO
 * ===========================================================================
 * La versión anterior recorría `supabase/migrations/*.sql` y ejecutaba LOS 50
 * FICHEROS, EN ORDEN, EN CADA LLAMADA, sin llevar ningún registro de lo ya
 * aplicado, y contra la base de PRODUCCIÓN por defecto.
 *
 * El motor de contratos lo invocaba como paso de verificación
 * (`verify: node scripts/db-apply.mjs migrations && node scripts/db-test.mjs …`).
 * Consecuencia real, con víctimas reales:
 *
 *   1. Migraciones escritas por un agente, SIN REVISAR y SIN COMMITEAR,
 *      acabaron aplicadas en producción por el simple hecho de existir en el
 *      directorio. Una de ellas citaba una tabla nueva en una política sin
 *      darle `grant`, y toda lectura de `profiles` murió con
 *      «permission denied»: TODOS los alumnos se quedaron fuera.
 *   2. Una migración de un contrato que terminó en ROJO quedó igualmente
 *      aplicada, porque `db-apply` corre ANTES de la prueba que decide el
 *      color. El rollback del contrato no deshace el esquema.
 *
 * Las tres defensas que impiden que eso se repita:
 *
 *   A. REGISTRO. `app.migraciones_aplicadas` guarda fichero + huella + fecha.
 *      Lo ya aplicado no se reaplica. Un fichero cuyo contenido cambió DESPUÉS
 *      de aplicarse para el proceso con un error explícito: eso es una
 *      migración editada a posteriori, y el esquema real ya no se corresponde
 *      con el repositorio. Es un aviso, no una rutina, y por eso NO hay
 *      bandera para saltárselo.
 *   B. GUARDA DE PRODUCCIÓN. Contra la base de producción el script se niega a
 *      escribir salvo que reciba `--produccion-de-verdad` en la línea de
 *      órdenes. Sin ella: explica qué iba a hacer y contra qué, y sale con
 *      código distinto de cero.
 *   C. `--dry` de verdad útil: dice qué aplicaría y qué se salta por estar ya
 *      aplicado. No escribe nada, así que no necesita la bandera.
 *
 * POR QUÉ UNA BANDERA Y NO UNA VARIABLE DE ENTORNO
 * ------------------------------------------------
 * Porque el fallo que hay que impedir es exactamente «alguien lo invocó sin
 * darse cuenta de contra qué apuntaba». Una variable de entorno se exporta una
 * vez y contamina en silencio TODAS las invocaciones posteriores de esa sesión,
 * del motor de contratos y de sus subprocesos; nadie la vuelve a ver. Una
 * bandera tiene que estar escrita, carácter a carácter, en la orden concreta
 * que se ejecuta — y en el caso del motor de contratos eso significa escrita en
 * la línea `verify:` de un fichero de `contracts/`, donde se revisa en el diff.
 * El precio (teclear más) es el punto, no el defecto.
 *
 * ===========================================================================
 * USO
 * ===========================================================================
 *   node scripts/db-apply.mjs migrations --dry
 *       Lista lo pendiente y lo ya aplicado. No escribe. No hace falta bandera.
 *
 *   node scripts/db-apply.mjs migrations --produccion-de-verdad
 *       Aplica SOLO las migraciones pendientes contra producción.
 *
 *   node scripts/db-apply.mjs migrations --marcar-aplicadas --produccion-de-verdad
 *       ADOPCIÓN: registra los ficheros como aplicados SIN EJECUTARLOS. Es lo
 *       que hay que correr una vez contra la producción actual, cuyo esquema ya
 *       tiene 0001–0059 dentro aunque no exista registro de ello.
 *
 *   node scripts/db-apply.mjs migrations 0056 --dry
 *       El segundo posicional sigue siendo un filtro por prefijo de nombre.
 *
 *   node scripts/db-apply.mjs seed --produccion-de-verdad
 *       Las semillas NO llevan registro (ver «SEMILLAS» más abajo).
 *
 * DESTINO
 *   Por defecto, la base del proyecto `clcutoqjdgeggvgyreud` = PRODUCCIÓN.
 *   `CET_DB_URL=postgres://…` apunta a otra base (local, rama de Supabase).
 *   La contraseña se lee de PGPASSWORD o de secrets/database.env. Nunca se
 *   imprime.
 *
 *   `CET_DB_REF_PRUEBAS=<ref>` declara qué proyecto remoto es la base de
 *   PRUEBAS. Solo entonces se puede escribir en ella sin la bandera. Sin esa
 *   declaración, cualquier host remoto que no sea producción sigue siendo
 *   `desconocido`, y `desconocido` se trata como producción. Declarar el ref de
 *   producción aquí NO la degrada: se comprueba después, y hay una prueba que
 *   lo fija.
 *
 * SEMILLAS
 *   El registro se aplica solo a `migrations`. Las semillas están escritas para
 *   ser re-ejecutables (`on conflict do nothing`) y resembrar es un flujo
 *   legítimo; anotarlas en el registro rompería ese flujo sin ganar nada. La
 *   guarda de producción, en cambio, SÍ las cubre: sembrar producción por
 *   accidente también es un incidente.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "clcutoqjdgeggvgyreud";
const BANDERA_PRODUCCION = "--produccion-de-verdad";

// La tabla de control vive en `app`, no en `public`, por tres razones:
//   1. `public` lo publica PostgREST: una tabla ahí es un endpoint HTTP y entra
//      en la caché de esquema, en los tipos generados y en las auditorías RLS.
//      El inventario de migraciones no es dato de la aplicación.
//   2. `app` ya existe (0001_extensions.sql) y su contrato declarado es
//      «superficie privada del servidor, no expuesta».
//   3. `revoke all … from public` deja la tabla fail-closed como el resto de
//      `app`: solo la alcanza quien se conecta como superusuario de la base,
//      que es exactamente quien corre este script.
export const TABLA_REGISTRO = "app.migraciones_aplicadas";

const SQL_CREAR_REGISTRO = `
create schema if not exists app;
create table if not exists app.migraciones_aplicadas (
  fichero     text        primary key,
  huella      text        not null,
  aplicada_en timestamptz not null default now(),
  adoptada    boolean     not null default false
);
revoke all on table app.migraciones_aplicadas from public;
comment on table app.migraciones_aplicadas is
  'Inventario de scripts/db-apply.mjs: qué migración entró, con qué contenido y cuándo. adoptada = se marcó sin ejecutar (--marcar-aplicadas).';
`;

// ---------------------------------------------------------------------------
// Piezas puras. Todo lo que decide algo vive aquí, sin base de datos delante,
// para que las pruebas puedan comprobarlo sin conectarse a ningún sitio.
// ---------------------------------------------------------------------------

/**
 * Huella del CONTENIDO de una migración, no de sus bytes en disco.
 *
 * `.gitattributes` fuerza LF en el repositorio, pero el árbol de trabajo de
 * Windows tiene CRLF (`core.autocrlf=true`). Si la huella dependiera del final
 * de línea, la misma migración aplicada desde Windows daría «contenido
 * cambiado» al mirarla desde el CI en Linux, y la defensa A se convertiría en
 * un falso positivo permanente — es decir, en ruido que alguien acabaría
 * desactivando. Se normalizan CRLF y el espacio final del fichero.
 */
export function huellaDeContenido(sql) {
  // /\r\n?/ y no solo /\r\n/: un fichero con finales mezclados, o con CR
  // sueltos, tiene que dar la misma huella que su versión en LF; si no, la
  // defensa vuelve a producir falsos positivos.
  const normalizado = String(sql).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  return createHash("sha256").update(normalizado, "utf8").digest("hex");
}

/** Lee los argumentos de la línea de órdenes. Sin efectos. */
export function leerArgumentos(argv) {
  const posicionales = argv.filter((a) => !a.startsWith("--"));
  const banderas = argv.filter((a) => a.startsWith("--"));
  const desconocidas = banderas.filter(
    (b) => ![BANDERA_PRODUCCION, "--dry", "--marcar-aplicadas"].includes(b),
  );
  return {
    carpeta: posicionales[0] ?? "migrations",
    prefijo: posicionales[1] ?? null,
    dry: banderas.includes("--dry"),
    marcarAplicadas: banderas.includes("--marcar-aplicadas"),
    produccionDeVerdad: banderas.includes(BANDERA_PRODUCCION),
    desconocidas,
  };
}

/**
 * Clasifica un host de destino. Fail-closed a propósito: lo que no se reconoce
 * como local o como base de pruebas DECLARADA se trata como producción.
 * Equivocarse hacia «pide confirmación» cuesta una bandera; equivocarse hacia
 * «adelante» costó el acceso de todos los alumnos una tarde entera.
 *
 * POR QUÉ EXISTE `CET_DB_REF_PRUEBAS`
 * -----------------------------------
 * El mensaje de la guarda termina diciendo «si querías trabajar contra otra
 * base, exporta CET_DB_URL con su cadena de conexión y vuelve a lanzarlo». Eso
 * era FALSO: una base remota que no fuera producción caía en `desconocido`, y
 * `desconocido` se trata como producción, así que el consejo no desbloqueaba
 * nada. Un mensaje de error que recomienda algo que no funciona manda a quien lo
 * lee a depurar el sitio equivocado.
 *
 * La declaración es por REF DE PROYECTO y no por «no es el ref de producción»
 * a propósito: exige escribir cuál es la base de pruebas, en lugar de deducir
 * que todo lo demás lo es. Y se comprueba DESPUÉS de producción, así que
 * declarar el ref de producción como base de pruebas no desarma nada — hay una
 * prueba que lo fija.
 */
export function clasificarDestino(host, env = process.env) {
  const h = String(host ?? "").toLowerCase();
  if (h.includes(PROJECT_REF)) return "produccion";
  if (["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"].includes(h)) {
    return "local";
  }
  const refDePruebas = String(env?.CET_DB_REF_PRUEBAS ?? "").toLowerCase();
  if (refDePruebas !== "" && h.includes(refDePruebas)) return "pruebas";
  return "desconocido";
}

/**
 * Decide si esta invocación puede seguir adelante.
 * `escribe` = la invocación va a modificar la base (aplicar o marcar).
 * Devuelve { permitido, motivo } — el motivo es el texto que ve una persona que
 * no conoce este script.
 */
export function comprobarGuardaDeProduccion({
  clase,
  host,
  escribe,
  produccionDeVerdad,
  carpeta,
  cuantosFicheros,
  accion,
}) {
  if (!escribe) return { permitido: true, motivo: null };
  if (clase === "local") return { permitido: true, motivo: null };
  // Una base declarada explícitamente como de pruebas en `CET_DB_REF_PRUEBAS`.
  // Es el destino que el propio mensaje de esta guarda recomienda, y para eso
  // tiene que ser alcanzable sin la bandera de producción: si exigiera la misma
  // bandera, esa bandera acabaría escrita en ficheros de `contracts/` — y desde
  // ahí, a un copia y pega de apuntar a la base de verdad.
  if (clase === "pruebas") return { permitido: true, motivo: null };
  if (produccionDeVerdad) return { permitido: true, motivo: null };

  const queEs =
    clase === "produccion"
      ? "la base de datos de PRODUCCIÓN del proyecto (la que usan los alumnos ahora mismo)"
      : "una base de datos remota que este script no reconoce, y por seguridad la trata como si fuera producción";

  return {
    permitido: false,
    motivo: [
      "",
      "DETENIDO: no se ha ejecutado ni una sola línea de SQL.",
      "",
      `  Iba a: ${accion}`,
      `  Ficheros afectados: ${cuantosFicheros} de supabase/${carpeta}/`,
      `  Contra el servidor: ${host}`,
      `  Que es: ${queEs}`,
      "",
      "  Escribir en esa base no puede pasar por accidente: aplicar una migración",
      "  sin revisar ya dejó una vez a todos los alumnos sin poder entrar.",
      "",
      "  Si es lo que quieres, dilo por escrito en la propia orden:",
      "",
      `      node scripts/db-apply.mjs ${carpeta} ${BANDERA_PRODUCCION}`,
      "",
      "  Si solo querías ver qué haría, sin tocar nada:",
      "",
      `      node scripts/db-apply.mjs ${carpeta} --dry`,
      "",
      "  Si querías trabajar contra otra base, exporta CET_DB_URL con su",
      "  cadena de conexión y vuelve a lanzarlo.",
      "",
    ].join("\n"),
  };
}

/**
 * Reparte los ficheros en tres cubos comparando su huella actual con el
 * registro. `registro` es un Map fichero -> huella.
 */
export function planificar(ficheros, huellas, registro) {
  const pendientes = [];
  const yaAplicados = [];
  const alterados = [];
  for (const fichero of ficheros) {
    const anotada = registro.get(fichero);
    if (anotada === undefined) pendientes.push(fichero);
    else if (anotada === huellas.get(fichero)) yaAplicados.push(fichero);
    else alterados.push({ fichero, huellaAnotada: anotada, huellaActual: huellas.get(fichero) });
  }
  return { pendientes, yaAplicados, alterados };
}

/** El texto del error de huella. Aparte para que la prueba pueda leerlo. */
export function mensajeDeAlterados(alterados) {
  return [
    "",
    "DETENIDO: hay migraciones que cambiaron DESPUÉS de haberse aplicado.",
    "",
    ...alterados.flatMap(({ fichero, huellaAnotada, huellaActual }) => [
      `  ${fichero}`,
      `      se aplicó con el contenido ${huellaAnotada.slice(0, 12)}…`,
      `      y ahora en disco pone      ${huellaActual?.slice(0, 12) ?? "(ilegible)"}…`,
    ]),
    "",
    "  El esquema real de la base YA NO se corresponde con lo que dice el",
    "  repositorio, y volver a ejecutar el fichero no arreglaría eso: lo que",
    "  ya entró no se deshace ejecutando la versión nueva encima.",
    "",
    "  Esto no se resuelve con una bandera, se resuelve decidiendo:",
    "    · Si el cambio aún no debía estar en la base: escribe una migración",
    "      NUEVA con la diferencia y deja el fichero viejo como estaba.",
    "    · Si el fichero viejo solo cambió en comentarios o formato: actualiza a",
    `      mano su huella en ${TABLA_REGISTRO}, sabiendo lo que haces.`,
    "",
    "  No se ha aplicado nada de esta tanda.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Ejecución. `cliente` es cualquier cosa con .query(); en las pruebas es un
// doble que anota lo que se le pide, para poder comprobar que efectivamente NO
// se ejecuta el SQL de lo ya aplicado.
// ---------------------------------------------------------------------------

export async function crearTablaDeRegistro(cliente) {
  await cliente.query(SQL_CREAR_REGISTRO);
}

export async function leerRegistro(cliente) {
  const res = await cliente.query(`select fichero, huella from ${TABLA_REGISTRO}`);
  return new Map((res?.rows ?? []).map((f) => [f.fichero, f.huella]));
}

/**
 * Aplica (o marca) la lista de pendientes, uno por transacción, anotando cada
 * uno en el registro DENTRO de la misma transacción: si la anotación no entra,
 * la migración tampoco. Un registro que se pueda desincronizar del esquema no
 * sirve para nada.
 */
export async function ejecutarPlan({
  cliente,
  pendientes,
  sqlDe,
  huellas,
  marcarAplicadas = false,
  log = console.log,
  logError = console.error,
  escribir = (t) => process.stdout.write(t),
}) {
  let hechos = 0;
  for (const fichero of pendientes) {
    const sql = sqlDe(fichero);
    escribir(`  ${fichero} ... `);
    try {
      await cliente.query("begin");
      if (!marcarAplicadas) await cliente.query(sql);
      await cliente.query(
        `insert into ${TABLA_REGISTRO} (fichero, huella, adoptada) values ($1, $2, $3)`,
        [fichero, huellas.get(fichero), marcarAplicadas],
      );
      await cliente.query("commit");
      hechos += 1;
      log(marcarAplicadas ? "MARCADO (no ejecutado)" : "OK");
    } catch (error) {
      await cliente.query("rollback").catch(() => undefined);
      log("FALLO");
      logError(`\n--- ${fichero} ---`);
      logError(error instanceof Error ? error.message : String(error));
      if (error && typeof error === "object" && "position" in error) {
        const pos = Number(error.position);
        if (Number.isFinite(pos)) {
          const linea = sql.slice(0, pos).split("\n").length;
          logError(`  en la línea ~${linea}: ${sql.split("\n")[linea - 1]?.trim() ?? ""}`);
        }
      }
      return { hechos, fallo: fichero };
    }
  }
  return { hechos, fallo: null };
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

function leerContrasena() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const raw = readFileSync(join(root, "secrets", "database.env"), "utf8");
  const match = /SUPABASE_DB_PASSWORD\s*=\s*(\S+)/.exec(raw);
  if (!match?.[1]) throw new Error("No se encontró SUPABASE_DB_PASSWORD en secrets/database.env");
  return match[1];
}

// DOS VIAS, en este orden:
//   1. directa  db.<ref>.supabase.co:5432, usuario `postgres`
//   2. pooler   aws-0-us-east-1.pooler.supabase.com:5432 en modo SESION
//
// La directa solo resuelve a IPv6 desde agosto de 2026: en una red sin IPv6 no
// da un error de credenciales, da un ETIMEDOUT de 30 s que lo parece. El pooler
// en modo SESION (5432) SI admite DDL; el de modo transaccion (6543) no, y por
// eso no se usa el 6543 aqui.
const RUTAS_PROYECTO = [
  { etiqueta: "directa", host: `db.${PROJECT_REF}.supabase.co`, user: "postgres" },
  {
    etiqueta: "pooler",
    host: "aws-0-us-east-1.pooler.supabase.com",
    user: `postgres.${PROJECT_REF}`,
  },
];

/**
 * Devuelve las rutas a probar y el host que se le enseña a la persona. Con
 * `CET_DB_URL` el destino es el de la URL; sin ella, producción.
 */
export function resolverDestino(env = process.env) {
  if (env.CET_DB_URL) {
    const url = new URL(env.CET_DB_URL);
    return {
      hostVisible: url.hostname,
      rutas: [{ etiqueta: "CET_DB_URL", connectionString: env.CET_DB_URL }],
    };
  }
  // El pooler lleva el ref del proyecto en el usuario: para clasificar el
  // destino manda el proyecto, que es el mismo por las dos vías.
  return { hostVisible: RUTAS_PROYECTO[0].host, rutas: RUTAS_PROYECTO };
}

async function conectar(rutas, log) {
  const { default: pg } = await import("pg");
  const password = leerContrasena();
  const problemas = [];
  for (const ruta of rutas) {
    const candidato = new pg.Client({
      ...(ruta.connectionString
        ? { connectionString: ruta.connectionString }
        : { host: ruta.host, port: 5432, database: "postgres", user: ruta.user, password }),
      ssl: { rejectUnauthorized: false },
      statement_timeout: 120_000,
      connectionTimeoutMillis: 8_000,
    });
    try {
      await candidato.connect();
      log(`\nConectado (via ${ruta.etiqueta}).\n`);
      return candidato;
    } catch (error) {
      problemas.push(`${ruta.etiqueta}: ${error instanceof Error ? error.message : String(error)}`);
      await candidato.end().catch(() => undefined);
    }
  }
  throw new Error(`No se pudo conectar por ninguna via.\n  ${problemas.join("\n  ")}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opciones = leerArgumentos(argv);
  if (opciones.desconocidas.length > 0) {
    console.error(`Bandera desconocida: ${opciones.desconocidas.join(", ")}`);
    console.error(`Banderas válidas: --dry, --marcar-aplicadas, ${BANDERA_PRODUCCION}`);
    return 1;
  }

  const { carpeta, prefijo, dry, marcarAplicadas, produccionDeVerdad } = opciones;
  const dir = join(root, "supabase", carpeta);
  const ficheros = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => prefijo === null || f.startsWith(prefijo))
    .sort();

  if (ficheros.length === 0) {
    console.error(`No hay ficheros .sql en ${dir}`);
    return 1;
  }

  // El registro solo gobierna las migraciones (ver cabecera, «SEMILLAS»).
  const conRegistro = carpeta === "migrations";

  // ---- GUARDA DE PRODUCCIÓN: antes de conectar, antes de leer la contraseña.
  const { hostVisible, rutas } = resolverDestino(env);
  const clase = clasificarDestino(hostVisible, env);
  const guarda = comprobarGuardaDeProduccion({
    clase,
    host: hostVisible,
    escribe: !dry,
    produccionDeVerdad,
    carpeta,
    cuantosFicheros: ficheros.length,
    accion: marcarAplicadas
      ? "MARCAR migraciones como aplicadas en la tabla de control (sin ejecutarlas)"
      : `ejecutar SQL de supabase/${carpeta}/`,
  });
  if (!guarda.permitido) {
    console.error(guarda.motivo);
    return 1;
  }

  const huellas = new Map(
    ficheros.map((f) => [f, huellaDeContenido(readFileSync(join(dir, f), "utf8"))]),
  );

  console.log(`\nDestino: ${hostVisible} (${clase})`);
  console.log(`${ficheros.length} fichero(s) en supabase/${carpeta}.`);

  const cliente = await conectar(rutas, console.log);
  try {
    if (!conRegistro) {
      // Semillas: sin registro, comportamiento de siempre.
      if (dry) {
        console.log("\n--dry: se ejecutarían todos (las semillas no llevan registro):");
        for (const f of ficheros) console.log(`  - ${f}`);
        return 0;
      }
      let hechos = 0;
      for (const f of ficheros) {
        const sql = readFileSync(join(dir, f), "utf8");
        process.stdout.write(`  ${f} ... `);
        try {
          await cliente.query("begin");
          await cliente.query(sql);
          await cliente.query("commit");
          hechos += 1;
          console.log("OK");
        } catch (error) {
          await cliente.query("rollback").catch(() => undefined);
          console.log("FALLO");
          console.error(error instanceof Error ? error.message : String(error));
          console.log(`\n${hechos}/${ficheros.length} aplicados.\n`);
          return 1;
        }
      }
      console.log(`\n${hechos}/${ficheros.length} aplicados.\n`);
      return 0;
    }

    // En --dry no se crea nada: si la tabla no existe todavía, se informa y se
    // trata el registro como vacío. Mirar no debe dejar rastro.
    let registro = new Map();
    if (dry) {
      try {
        registro = await leerRegistro(cliente);
      } catch {
        console.log(
          `\n(${TABLA_REGISTRO} todavía no existe: se creará en la primera aplicación real.)`,
        );
      }
    } else {
      await crearTablaDeRegistro(cliente);
      registro = await leerRegistro(cliente);
    }

    const { pendientes, yaAplicados, alterados } = planificar(ficheros, huellas, registro);

    if (yaAplicados.length > 0) {
      console.log(`\nYa aplicados, se saltan (${yaAplicados.length}):`);
      for (const f of yaAplicados) console.log(`  - ${f}`);
    }

    // Los alterados paran TODA la tanda, incluso los pendientes sanos: si el
    // esquema ya no cuadra con el repositorio, apilar migraciones encima solo
    // empeora el desajuste.
    if (alterados.length > 0) {
      console.error(mensajeDeAlterados(alterados));
      return 1;
    }

    if (pendientes.length === 0) {
      console.log("\nNada pendiente. La base está al día.\n");
      return 0;
    }

    console.log(
      `\n${marcarAplicadas ? "Se marcarían como aplicados" : "Pendientes"} (${pendientes.length}):`,
    );
    for (const f of pendientes) console.log(`  - ${f}`);

    if (dry) {
      console.log("\n--dry: no se ha ejecutado nada.\n");
      return 0;
    }

    console.log("");
    const { hechos, fallo } = await ejecutarPlan({
      cliente,
      pendientes,
      sqlDe: (f) => readFileSync(join(dir, f), "utf8"),
      huellas,
      marcarAplicadas,
    });
    console.log(
      `\n${hechos}/${pendientes.length} ${marcarAplicadas ? "marcados" : "aplicados"}.\n`,
    );
    return fallo ? 1 : 0;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

// Solo se ejecuta cuando se invoca el fichero directamente. Importarlo desde
// una prueba no conecta a ninguna base ni aplica nada.
const invocadoDirectamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoDirectamente) {
  process.exitCode = await main();
}
