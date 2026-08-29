/**
 * Pruebas de la lógica nueva de scripts/db-apply.mjs.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * NINGUNA de estas pruebas se conecta a una base de datos. Las que ejercitan el
 * bucle de aplicación usan un cliente doble que apunta cada `query` recibida,
 * porque lo que hay que demostrar no es «devuelve la lista correcta» sino «NO
 * llegó a ejecutarse el SQL». Una prueba sobre el plan y no sobre las órdenes
 * emitidas pasaría igual si el bucle se saltara el plan.
 *
 * La prueba de la guarda de producción lanza el script DE VERDAD como
 * subproceso, sin banderas: si la guarda no estuviera, esa invocación es
 * exactamente la que rompió producción. Se comprueba además que no llegó ni a
 * intentar conectarse.
 */

import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TABLA_REGISTRO,
  clasificarDestino,
  comprobarGuardaDeProduccion,
  ejecutarPlan,
  huellaDeContenido,
  leerArgumentos,
  main,
  mensajeDeAlterados,
  planificar,
  resolverDestino,
} from "./db-apply.mjs";

const ejecutar = promisify(execFile);
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const SCRIPT = join(aqui, "db-apply.mjs");

/** Cliente de mentira: guarda todo lo que se le pide, no habla con nadie. */
function clienteDoble({ fallaEn = null } = {}) {
  const ordenes = [];
  return {
    ordenes,
    async query(sql, params) {
      ordenes.push({ sql, params });
      if (fallaEn && sql.includes(fallaEn)) {
        const e = new Error('relation "no_existe" does not exist');
        e.position = "1";
        throw e;
      }
      return { rows: [] };
    },
  };
}

// ---------------------------------------------------------------------------

describe("huellaDeContenido", () => {
  it("no depende del final de línea ni del espacio final del fichero", () => {
    // Si dependiera, la misma migración daría «alterada» al pasar de Windows
    // (CRLF en disco) al CI (LF), y la defensa se volvería ruido.
    expect(huellaDeContenido("select 1;\r\nselect 2;\r\n")).toBe(
      huellaDeContenido("select 1;\nselect 2;"),
    );
  });

  it("cambia si cambia una sola letra del SQL", () => {
    expect(huellaDeContenido("select 1;")).not.toBe(huellaDeContenido("select 2;"));
  });
});

describe("leerArgumentos", () => {
  it("mantiene la forma antigua: carpeta y prefijo posicionales", () => {
    expect(leerArgumentos(["migrations", "0056", "--dry"])).toMatchObject({
      carpeta: "migrations",
      prefijo: "0056",
      dry: true,
      produccionDeVerdad: false,
      marcarAplicadas: false,
    });
  });

  it("por defecto no hay ninguna bandera activa", () => {
    expect(leerArgumentos([])).toMatchObject({
      carpeta: "migrations",
      dry: false,
      marcarAplicadas: false,
      produccionDeVerdad: false,
      desconocidas: [],
    });
  });

  it("una bandera mal escrita no se ignora en silencio", () => {
    // `--produccion` NO es `--produccion-de-verdad`. Si se ignorara, alguien
    // creería haber autorizado producción y no habría autorizado nada.
    expect(leerArgumentos(["--produccion"]).desconocidas).toEqual(["--produccion"]);
    expect(leerArgumentos(["--produccion"]).produccionDeVerdad).toBe(false);
  });
});

describe("clasificarDestino", () => {
  it("reconoce la base del proyecto como producción por las dos vías", () => {
    expect(clasificarDestino("db.clcutoqjdgeggvgyreud.supabase.co")).toBe("produccion");
    expect(clasificarDestino("clcutoqjdgeggvgyreud.pooler.supabase.com")).toBe("produccion");
  });

  it("reconoce lo local", () => {
    expect(clasificarDestino("localhost")).toBe("local");
    expect(clasificarDestino("127.0.0.1")).toBe("local");
  });

  it("lo que no reconoce lo trata como producción, no como local", () => {
    expect(clasificarDestino("una-base-cualquiera.example.com")).toBe("desconocido");
    expect(clasificarDestino("")).toBe("desconocido");
  });

  it("reconoce una base declarada de pruebas, y solo si está declarada", () => {
    const env = { CET_DB_REF_PRUEBAS: "nfeiimhcqqlcyjkpoirf" };
    expect(clasificarDestino("db.nfeiimhcqqlcyjkpoirf.supabase.co", env)).toBe("pruebas");
    // Sin la declaración, la misma base sigue siendo desconocida.
    expect(clasificarDestino("db.nfeiimhcqqlcyjkpoirf.supabase.co", {})).toBe("desconocido");
  });

  it("declarar producción como base de pruebas NO la degrada", () => {
    // El orden de las comprobaciones es la defensa: producción se decide antes
    // de mirar la declaración, así que esta variable no puede desarmar la guarda.
    const env = { CET_DB_REF_PRUEBAS: "clcutoqjdgeggvgyreud" };
    expect(clasificarDestino("db.clcutoqjdgeggvgyreud.supabase.co", env)).toBe("produccion");
  });
});

describe("resolverDestino", () => {
  it("sin CET_DB_URL apunta a la base del proyecto (producción)", () => {
    const { hostVisible } = resolverDestino({});
    expect(clasificarDestino(hostVisible)).toBe("produccion");
  });

  it("con CET_DB_URL apunta a esa base y deja de ser producción", () => {
    const { hostVisible, rutas } = resolverDestino({
      CET_DB_URL: "postgres://postgres:x@localhost:54322/postgres",
    });
    expect(hostVisible).toBe("localhost");
    expect(clasificarDestino(hostVisible)).toBe("local");
    expect(rutas).toHaveLength(1);
  });
});

describe("comprobarGuardaDeProduccion", () => {
  const base = {
    clase: "produccion",
    host: "db.clcutoqjdgeggvgyreud.supabase.co",
    carpeta: "migrations",
    cuantosFicheros: 50,
    accion: "ejecutar SQL de supabase/migrations/",
  };

  it("sin la bandera, contra producción, no permite escribir", () => {
    const r = comprobarGuardaDeProduccion({ ...base, escribe: true, produccionDeVerdad: false });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain("no se ha ejecutado ni una sola línea de SQL");
    expect(r.motivo).toContain("db.clcutoqjdgeggvgyreud.supabase.co");
    expect(r.motivo).toContain("--produccion-de-verdad");
  });

  it("con la bandera, permite", () => {
    expect(
      comprobarGuardaDeProduccion({ ...base, escribe: true, produccionDeVerdad: true }).permitido,
    ).toBe(true);
  });

  it("--dry no escribe, así que no necesita bandera", () => {
    expect(
      comprobarGuardaDeProduccion({ ...base, escribe: false, produccionDeVerdad: false }).permitido,
    ).toBe(true);
  });

  it("contra una base local no pide nada", () => {
    expect(
      comprobarGuardaDeProduccion({
        ...base,
        clase: "local",
        host: "localhost",
        escribe: true,
        produccionDeVerdad: false,
      }).permitido,
    ).toBe(true);
  });

  it("contra una base declarada de pruebas tampoco pide nada", () => {
    // Es lo que la propia guarda promete en su mensaje: «si querías trabajar
    // contra otra base, exporta CET_DB_URL». Antes de esto, hacerlo no
    // desbloqueaba nada y el consejo era falso.
    expect(
      comprobarGuardaDeProduccion({
        ...base,
        clase: "pruebas",
        host: "db.nfeiimhcqqlcyjkpoirf.supabase.co",
        escribe: true,
        produccionDeVerdad: false,
      }).permitido,
    ).toBe(true);
  });

  it("un destino remoto desconocido también queda bloqueado", () => {
    const r = comprobarGuardaDeProduccion({
      ...base,
      clase: "desconocido",
      host: "otra.example.com",
      escribe: true,
      produccionDeVerdad: false,
    });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain("otra.example.com");
  });
});

describe("planificar", () => {
  const huellas = new Map([
    ["0001.sql", "aaa"],
    ["0002.sql", "bbb"],
    ["0003.sql", "ccc"],
  ]);

  it("lo registrado con la misma huella se salta; lo no registrado queda pendiente", () => {
    const plan = planificar(
      ["0001.sql", "0002.sql", "0003.sql"],
      huellas,
      new Map([["0001.sql", "aaa"]]),
    );
    expect(plan.yaAplicados).toEqual(["0001.sql"]);
    expect(plan.pendientes).toEqual(["0002.sql", "0003.sql"]);
    expect(plan.alterados).toEqual([]);
  });

  it("lo registrado con otra huella sale como alterado, no como pendiente", () => {
    const plan = planificar(["0001.sql"], huellas, new Map([["0001.sql", "huella-vieja"]]));
    expect(plan.pendientes).toEqual([]);
    expect(plan.yaAplicados).toEqual([]);
    expect(plan.alterados).toEqual([
      { fichero: "0001.sql", huellaAnotada: "huella-vieja", huellaActual: "aaa" },
    ]);
  });
});

describe("mensajeDeAlterados", () => {
  it("dice qué fichero y que no se ha aplicado nada", () => {
    const texto = mensajeDeAlterados([
      {
        fichero: "0056_x.sql",
        huellaAnotada: "1111111111111111",
        huellaActual: "2222222222222222",
      },
    ]);
    expect(texto).toContain("0056_x.sql");
    expect(texto).toContain("No se ha aplicado nada de esta tanda.");
    expect(texto).toContain(TABLA_REGISTRO);
  });
});

describe("ejecutarPlan", () => {
  const nada = () => {};

  it("solo emite el SQL de los ficheros que le entrega el plan", async () => {
    const cliente = clienteDoble();
    const r = await ejecutarPlan({
      cliente,
      pendientes: ["0002.sql"],
      sqlDe: () => "create table nueva();",
      huellas: new Map([["0002.sql", "bbb"]]),
      log: nada,
      logError: nada,
      escribir: nada,
    });
    expect(r).toEqual({ hechos: 1, fallo: null });

    const sqls = cliente.ordenes.map((o) => o.sql);
    // El fichero saltado (0001) nunca aparece: su SQL jamás se emitió.
    expect(sqls.some((s) => s.includes("create table vieja"))).toBe(false);
    expect(sqls).toContain("create table nueva();");
    expect(sqls[0]).toBe("begin");
    expect(sqls.at(-1)).toBe("commit");
    // Y queda anotado en el registro dentro de la MISMA transacción.
    const anotacion = cliente.ordenes.find((o) => o.sql.startsWith("insert into"));
    expect(anotacion.sql).toContain(TABLA_REGISTRO);
    expect(anotacion.params).toEqual(["0002.sql", "bbb", false]);
  });

  it("--marcar-aplicadas anota sin ejecutar el SQL (adopción)", async () => {
    const cliente = clienteDoble();
    await ejecutarPlan({
      cliente,
      pendientes: ["0055_rol_guardian.sql"],
      sqlDe: () => "drop table profiles;", // si esto llegara a correr, se nota
      huellas: new Map([["0055_rol_guardian.sql", "hhh"]]),
      marcarAplicadas: true,
      log: nada,
      logError: nada,
      escribir: nada,
    });
    const sqls = cliente.ordenes.map((o) => o.sql);
    expect(sqls.some((s) => s.includes("drop table"))).toBe(false);
    expect(sqls).toEqual(["begin", expect.stringContaining("insert into"), "commit"]);
    expect(cliente.ordenes[1].params).toEqual(["0055_rol_guardian.sql", "hhh", true]);
  });

  it("un fallo hace rollback y detiene el resto de la tanda", async () => {
    const cliente = clienteDoble({ fallaEn: "create table rota" });
    const r = await ejecutarPlan({
      cliente,
      pendientes: ["0002.sql", "0003.sql"],
      sqlDe: (f) => (f === "0002.sql" ? "create table rota();" : "create table sana();"),
      huellas: new Map([
        ["0002.sql", "bbb"],
        ["0003.sql", "ccc"],
      ]),
      log: nada,
      logError: nada,
      escribir: nada,
    });
    expect(r).toEqual({ hechos: 0, fallo: "0002.sql" });
    const sqls = cliente.ordenes.map((o) => o.sql);
    expect(sqls).toContain("rollback");
    expect(sqls.some((s) => s.includes("create table sana"))).toBe(false);
    expect(sqls.some((s) => s.startsWith("insert into"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El script de verdad, como subproceso. Sin red: la guarda corta antes.
// ---------------------------------------------------------------------------

describe("el script completo, invocado como lo invocaba el motor de contratos", () => {
  async function correr(args, env = {}) {
    try {
      const { stdout, stderr } = await ejecutar(process.execPath, [SCRIPT, ...args], {
        cwd: raiz,
        env: { ...process.env, ...env },
        timeout: 20_000,
      });
      return { code: 0, stdout, stderr };
    } catch (error) {
      return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
  }

  it("«node scripts/db-apply.mjs migrations» se niega y no aplica nada", async () => {
    // Esta es LITERALMENTE la orden del `verify:` de contracts/ref-03..ref-06.
    const { code, stdout, stderr } = await correr(["migrations"]);
    const todo = stdout + stderr;
    expect(code).not.toBe(0);
    expect(todo).toContain("DETENIDO: no se ha ejecutado ni una sola línea de SQL.");
    expect(todo).toContain("db.clcutoqjdgeggvgyreud.supabase.co");
    expect(todo).toContain("--produccion-de-verdad");
    // No llegó siquiera a intentar la conexión.
    expect(todo).not.toContain("Conectado");
  });

  it("marcar como aplicadas tampoco se cuela sin la bandera", async () => {
    const { code, stdout, stderr } = await correr(["migrations", "--marcar-aplicadas"]);
    const todo = stdout + stderr;
    expect(code).not.toBe(0);
    expect(todo).toContain("MARCAR migraciones como aplicadas");
    expect(todo).not.toContain("Conectado");
  });

  it("una bandera casi correcta no autoriza nada", async () => {
    const { code, stdout, stderr } = await correr(["migrations", "--produccion"]);
    expect(code).not.toBe(0);
    expect(stdout + stderr).toContain("Bandera desconocida");
  });

  it("con CET_DB_URL a otra base, la guarda deja pasar y llega a conectar", async () => {
    // CET_DB_URL apunta a un puerto cerrado de la máquina local A PROPÓSITO:
    // esta suite no habla con producción bajo ningún concepto. Lo que se
    // comprueba es que la guarda NO fue lo que detuvo la ejecución, y que el
    // script sí intentó la conexión (falla en la conexión, no en la guarda).
    const { code, stdout, stderr } = await correr(["migrations"], {
      CET_DB_URL: "postgres://postgres:x@127.0.0.1:1/postgres",
      PGPASSWORD: "x",
    });
    const todo = stdout + stderr;
    expect(todo).not.toContain("DETENIDO: no se ha ejecutado ni una sola línea de SQL.");
    expect(todo).toContain("Destino: 127.0.0.1 (local)");
    expect(todo).toContain("No se pudo conectar por ninguna via");
    expect(code).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Las migraciones reales del repositorio son huellables.
// ---------------------------------------------------------------------------

describe("huellas de las migraciones reales", () => {
  it("las 50 migraciones del repositorio producen un sha256 estable", () => {
    const dir = join(raiz, "supabase", "migrations");
    const ficheros = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(ficheros.length).toBeGreaterThan(0);
    for (const f of ficheros) {
      const sql = readFileSync(join(dir, f), "utf8");
      expect(huellaDeContenido(sql)).toMatch(/^[0-9a-f]{64}$/);
      // El árbol de trabajo de Windows ya trae CRLF: se normaliza primero a LF
      // y se compara contra su reconversión a CRLF. Ese es el viaje real
      // Windows <-> CI, y las dos puntas tienen que dar la misma huella.
      const lf = sql.replace(/\r\n?/g, "\n");
      expect(huellaDeContenido(lf)).toBe(huellaDeContenido(lf.replace(/\n/g, "\r\n")));
    }
  });
});

// ---------------------------------------------------------------------------
// main() de punta a punta, con `pg` sustituido por un doble.
//
// Las pruebas de `planificar` demuestran que el PLAN es correcto; estas
// demuestran que main() OBEDECE al plan. Son cosas distintas: el incidente que
// motivó este fichero fue exactamente un bucle que ignoraba cualquier plan.
// El doble de `pg` no abre ningún socket, así que no se toca producción.
// ---------------------------------------------------------------------------

const registroFalso = { filas: [] };
const consultas = [];

vi.mock("pg", () => ({
  default: {
    Client: class {
      async connect() {}
      async end() {}
      async query(sql, params) {
        consultas.push({ sql, params });
        if (sql.includes("select fichero, huella")) return { rows: registroFalso.filas };
        return { rows: [] };
      }
    },
  },
}));

describe("main() con la base simulada", () => {
  const dirMigraciones = join(raiz, "supabase", "migrations");
  const todas = readdirSync(dirMigraciones)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const huellaReal = (f) => huellaDeContenido(readFileSync(join(dirMigraciones, f), "utf8"));

  let salida;
  beforeEach(() => {
    consultas.length = 0;
    registroFalso.filas = [];
    salida = [];
    vi.spyOn(console, "log").mockImplementation((...a) => salida.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a) => salida.push(a.join(" ")));
    vi.spyOn(process.stdout, "write").mockImplementation((t) => {
      salida.push(String(t));
      return true;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** ¿Se ha llegado a emitir el SQL de este fichero de migración? */
  const seEjecuto = (fichero) => {
    const sql = readFileSync(join(dirMigraciones, fichero), "utf8");
    return consultas.some((c) => c.sql === sql);
  };

  it("un fichero ya aplicado no se vuelve a ejecutar", async () => {
    const yaAplicado = todas[0];
    registroFalso.filas = [{ fichero: yaAplicado, huella: huellaReal(yaAplicado) }];

    const codigo = await main(["migrations", "--produccion-de-verdad"], {});

    expect(codigo).toBe(0);
    expect(salida.join("\n")).toContain("Ya aplicados, se saltan (1)");
    // La comprobación que importa: su SQL no salió por el cable.
    expect(seEjecuto(yaAplicado)).toBe(false);
    // Y el siguiente, que no estaba registrado, sí.
    expect(seEjecuto(todas[1])).toBe(true);
  });

  it("con todo registrado no ejecuta ni una migración", async () => {
    registroFalso.filas = todas.map((f) => ({ fichero: f, huella: huellaReal(f) }));

    const codigo = await main(["migrations", "--produccion-de-verdad"], {});

    expect(codigo).toBe(0);
    expect(salida.join("\n")).toContain("Nada pendiente. La base está al día.");
    for (const f of todas) expect(seEjecuto(f)).toBe(false);
  });

  it("un fichero cuyo contenido cambió para el proceso con error y sin aplicar NADA", async () => {
    const editado = todas[0];
    registroFalso.filas = [
      {
        fichero: editado,
        huella: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    ];

    const codigo = await main(["migrations", "--produccion-de-verdad"], {});

    expect(codigo).toBe(1);
    const texto = salida.join("\n");
    expect(texto).toContain("hay migraciones que cambiaron DESPUÉS de haberse aplicado");
    expect(texto).toContain(editado);
    expect(texto).toContain("No se ha aplicado nada de esta tanda.");
    // Ni el fichero alterado ni los demás pendientes, que estaban sanos.
    for (const f of todas) expect(seEjecuto(f)).toBe(false);
    expect(consultas.some((c) => c.sql === "begin")).toBe(false);
  });

  it("--dry lista pendientes y saltados sin ejecutar ni crear la tabla", async () => {
    const yaAplicado = todas[0];
    registroFalso.filas = [{ fichero: yaAplicado, huella: huellaReal(yaAplicado) }];

    // Sin bandera de producción: --dry no escribe, así que no la necesita.
    const codigo = await main(["migrations", "--dry"], {});

    expect(codigo).toBe(0);
    const texto = salida.join("\n");
    expect(texto).toContain("Ya aplicados, se saltan (1)");
    expect(texto).toContain(`Pendientes (${todas.length - 1})`);
    expect(texto).toContain("--dry: no se ha ejecutado nada.");
    for (const f of todas) expect(seEjecuto(f)).toBe(false);
    // Mirar no deja rastro: ni `create table`, ni transacciones.
    expect(consultas.some((c) => c.sql.includes("create table if not exists"))).toBe(false);
    expect(consultas.some((c) => c.sql === "begin")).toBe(false);
  });

  it("--marcar-aplicadas adopta el estado actual sin ejecutar ninguna migración", async () => {
    const codigo = await main(["migrations", "--marcar-aplicadas", "--produccion-de-verdad"], {});

    expect(codigo).toBe(0);
    for (const f of todas) expect(seEjecuto(f)).toBe(false);
    const anotaciones = consultas.filter((c) => c.sql.startsWith("insert into"));
    expect(anotaciones).toHaveLength(todas.length);
    expect(anotaciones.every((a) => a.params[2] === true)).toBe(true);
    expect(anotaciones.map((a) => a.params[0])).toEqual(todas);
    expect(anotaciones[0].params[1]).toBe(huellaReal(todas[0]));
  });

  it("el filtro por prefijo sigue funcionando para adoptar solo un tramo", async () => {
    const codigo = await main(
      ["migrations", "0055", "--marcar-aplicadas", "--produccion-de-verdad"],
      {},
    );

    expect(codigo).toBe(0);
    const anotados = consultas
      .filter((c) => c.sql.startsWith("insert into"))
      .map((c) => c.params[0]);
    expect(anotados).toEqual(todas.filter((f) => f.startsWith("0055")));
    expect(anotados.length).toBeGreaterThan(0);
  });
});
