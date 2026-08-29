/**
 * Pruebas del corredor de pgTAP, scripts/db-test.mjs.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * NINGUNA de estas pruebas se conecta a una base de datos: `pg` se sustituye por
 * un doble, como en `scripts/db-apply.test.mjs`.
 *
 * EL DOBLE NO ES UN `query` QUE DEVUELVE FILAS. Es una MÁQUINA DE ESTADOS DE
 * SESIÓN, y tiene que serlo, porque el fallo que estas pruebas persiguen es
 * precisamente que el estado de la sesión sobrevive de un fichero al siguiente.
 * Un doble sin memoria daría verde con el corredor roto: el fichero siguiente se
 * ejecutaría igual de bien detrás de un ERROR que en solitario, que es justo lo
 * que en la base real NO pasa.
 *
 * Lo que el doble reproduce, medido contra la base de verdad:
 *
 *   - un error deja la sesión en «transacción abortada»: todo lo que se le mande
 *     después revienta con `current transaction is aborted` hasta que llegue un
 *     `rollback`;
 *   - un fichero que se olvida su `rollback;` final —`retencion_telemetria.sql`
 *     lo hace hoy— deja la transacción ABIERTA y con el `plan()` de pgTAP ya
 *     puesto, así que el `select plan(N)` del fichero siguiente muere con
 *     «You tried to plan twice!». Ese es el fallo que se midió el 29 de agosto
 *     de 2026 sobre `rls_answer_key_hidden.sql`, que en solitario da `ok (19)`.
 *     Y no lo ve ningún `try/catch`: el fichero que ensucia termina en VERDE;
 *   - un `set` o un `set role` que se escape de la transacción es residuo de
 *     SESIÓN: el `rollback` no lo toca y solo se lo lleva `discard all`.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  ORDENES_DE_AISLAMIENTO,
  SENTENCIA_SEARCH_PATH,
  correrFicheros,
  evaluarTap,
  leerContrasena,
  lineasTap,
  resolverIncludes,
  resolverRutas,
} from "./db-test.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const dirPruebas = join(raiz, "supabase", "tests");

// ---------------------------------------------------------------------------
// El doble de sesión
// ---------------------------------------------------------------------------

const TAP_VERDE = (n) => ({
  rows: [{ tap: Array.from({ length: n }, (_, i) => `ok ${i + 1} - assert ${i + 1}`).join("\n") }],
});
const TAP_ROJO = { rows: [{ tap: "ok 1 - uno\nnot ok 2 - dos\n# Failed test 2" }] };

/**
 * Sesión de mentira con memoria.
 *
 * `guion` mapea el SQL de cada fichero a lo que hace la base:
 *   { tipo: "verde", asserts: n }  ejecuta y hace su rollback: sesión limpia.
 *   { tipo: "rojo" }               asserts en rojo, pero la sesión queda limpia.
 *   { tipo: "revienta" }           excepción y la sesión queda ABORTADA.
 *   { tipo: "sin-rollback" }       verde, pero deja la transacción ABIERTA.
 *   { tipo: "ensucia-sesion" }     verde, pero deja residuo de SESIÓN: un `set`
 *                                  que sobrevive al `rollback`.
 */
function sesionDoble(guion, { fallaElAislamiento = false } = {}) {
  const ordenes = [];
  let estado = "limpia";
  let residuoDeSesion = false;
  return {
    ordenes,
    get estado() {
      return estado;
    },
    async end() {},
    async query(sql) {
      ordenes.push(sql);

      if (sql === "rollback") {
        if (fallaElAislamiento) throw new Error("no se pudo hacer rollback");
        estado = "limpia";
        return { rows: [] };
      }
      if (sql === "discard all") {
        if (fallaElAislamiento) {
          throw new Error("Unsupported statement in transaction pooling mode: DISCARD ALL");
        }
        estado = "limpia";
        residuoDeSesion = false;
        return { rows: [] };
      }
      if (sql === SENTENCIA_SEARCH_PATH) return { rows: [] };

      // A partir de aquí es el SQL de un fichero de prueba.
      if (residuoDeSesion) {
        throw new Error("permission denied for table profiles");
      }
      if (estado === "abortada") {
        throw new Error(
          "current transaction is aborted, commands ignored until end of transaction block",
        );
      }
      if (estado === "en-transaccion") {
        throw new Error("You tried to plan twice!");
      }

      const paso = guion[sql];
      if (!paso) throw new Error(`el guion no contempla este SQL: ${sql}`);
      if (paso.tipo === "revienta") {
        estado = "abortada";
        throw new Error(paso.mensaje ?? 'relation "no_existe" does not exist');
      }
      if (paso.tipo === "ensucia-sesion") {
        residuoDeSesion = true;
        return TAP_VERDE(paso.asserts ?? 3);
      }
      if (paso.tipo === "sin-rollback") {
        estado = "en-transaccion";
        return TAP_VERDE(paso.asserts ?? 3);
      }
      if (paso.tipo === "rojo") return TAP_ROJO;
      return TAP_VERDE(paso.asserts ?? 3);
    },
  };
}

const nada = () => {};
const silencio = { log: nada, logError: nada, escribir: nada };

// ---------------------------------------------------------------------------
// 1, 2 y 3: aislamiento entre ficheros. Éstas son las que hoy salen rojas.
// ---------------------------------------------------------------------------

describe("un fichero no puede contaminar al siguiente", () => {
  const sqlDe = (f) => `-- sql de ${f}`;

  it("tras un ERROR, el fichero siguiente se ejecuta y se ejecuta LIMPIO", async () => {
    const cliente = sesionDoble({
      "-- sql de mastery_job.sql": { tipo: "revienta" },
      "-- sql de rls_answer_key_hidden.sql": { tipo: "verde", asserts: 19 },
    });

    const { resultados } = await correrFicheros({
      cliente,
      ficheros: ["mastery_job.sql", "rls_answer_key_hidden.sql"],
      sqlDe,
      ...silencio,
    });

    // Se llegó a emitir su SQL...
    expect(cliente.ordenes).toContain("-- sql de rls_answer_key_hidden.sql");
    // ...y salió con sus 19 asserts, no con el error heredado del anterior.
    expect(resultados[1]).toMatchObject({ estado: "ok", pasados: 19 });
    // La sesión quedó saneada ANTES de mandarle el segundo fichero.
    const i = cliente.ordenes.indexOf("-- sql de rls_answer_key_hidden.sql");
    expect(cliente.ordenes.slice(0, i)).toContain("rollback");
  });

  it("un fichero que se deja la transacción abierta tampoco contamina al siguiente", async () => {
    // Éste es el caso REAL medido: `retencion_telemetria.sql` termina sin
    // `rollback;` y el siguiente por orden alfabético es
    // `rls_answer_key_hidden.sql`. Un `try/catch` no lo ve: el fichero sucio
    // termina en VERDE.
    const cliente = sesionDoble({
      "-- sql de retencion_telemetria.sql": { tipo: "sin-rollback", asserts: 8 },
      "-- sql de rls_answer_key_hidden.sql": { tipo: "verde", asserts: 19 },
    });

    const { resultados, ficherosRojos } = await correrFicheros({
      cliente,
      ficheros: ["retencion_telemetria.sql", "rls_answer_key_hidden.sql"],
      sqlDe,
      ...silencio,
    });

    expect(resultados[0]).toMatchObject({ estado: "ok", pasados: 8 });
    expect(resultados[1]).toMatchObject({ estado: "ok", pasados: 19 });
    expect(ficherosRojos).toBe(0);
  });

  it("el residuo de SESIÓN, que el rollback no se lleva, tampoco contamina", async () => {
    // Un `set role` o un `set` sin `local` que se escape de la transacción
    // sobrevive al `rollback` y solo lo borra `discard all`. Es lo único que
    // separa «una conexión saneada» de «una conexión nueva».
    const cliente = sesionDoble({
      "-- sql de sucio.sql": { tipo: "ensucia-sesion", asserts: 4 },
      "-- sql de siguiente.sql": { tipo: "verde", asserts: 19 },
    });

    const { resultados, ficherosRojos } = await correrFicheros({
      cliente,
      ficheros: ["sucio.sql", "siguiente.sql"],
      sqlDe,
      ...silencio,
    });

    expect(resultados[1]).toMatchObject({ estado: "ok", pasados: 19 });
    expect(ficherosRojos).toBe(0);
  });

  it("el que reventó se reporta fallido y el siguiente según SU propio resultado", async () => {
    const cliente = sesionDoble({
      "-- sql de a_revienta.sql": { tipo: "revienta" },
      "-- sql de b_sano.sql": { tipo: "verde", asserts: 19 },
      "-- sql de c_rojo.sql": { tipo: "rojo" },
    });

    const { resultados } = await correrFicheros({
      cliente,
      ficheros: ["a_revienta.sql", "b_sano.sql", "c_rojo.sql"],
      sqlDe,
      ...silencio,
    });

    expect(resultados.map((r) => [r.fichero, r.estado])).toEqual([
      ["a_revienta.sql", "error"],
      ["b_sano.sql", "ok"],
      ["c_rojo.sql", "rojo"],
    ]);
  });

  it("el resumen cuenta bien: un ERROR ajeno no infla el número de rojos", async () => {
    const cliente = sesionDoble({
      "-- sql de a_revienta.sql": { tipo: "revienta" },
      "-- sql de b_sano.sql": { tipo: "verde", asserts: 19 },
      "-- sql de c_sano.sql": { tipo: "verde", asserts: 5 },
      "-- sql de d_sano.sql": { tipo: "verde", asserts: 5 },
    });

    const { ficherosRojos } = await correrFicheros({
      cliente,
      ficheros: ["a_revienta.sql", "b_sano.sql", "c_sano.sql", "d_sano.sql"],
      sqlDe,
      ...silencio,
    });

    // Uno roto de cuatro. Con la sesión compartida y sin sanear eran cuatro.
    expect(ficherosRojos).toBe(1);
  });

  it("un rojo de verdad detrás de un ERROR sigue contándose", async () => {
    // La otra mitad del mismo defecto: al contaminar, un rojo real quedaba
    // disfrazado de ERROR heredado y se perdía la línea `not ok`.
    const cliente = sesionDoble({
      "-- sql de a_revienta.sql": { tipo: "revienta" },
      "-- sql de b_rojo.sql": { tipo: "rojo" },
    });

    const { resultados, ficherosRojos } = await correrFicheros({
      cliente,
      ficheros: ["a_revienta.sql", "b_rojo.sql"],
      sqlDe,
      ...silencio,
    });

    expect(ficherosRojos).toBe(2);
    expect(resultados[1].estado).toBe("rojo");
    expect(resultados[1].fallos.map((l) => l.trim())).toEqual(["not ok 2 - dos"]);
  });

  it("el orden de las órdenes de saneo es rollback, discard all y search_path", async () => {
    // `rollback` primero porque `discard all` no puede correr dentro de una
    // transacción, y el `search_path` al final porque `discard all` lo borra:
    // sin reponerlo, el fichero siguiente moriría con
    // `function plan(integer) does not exist`.
    expect(ORDENES_DE_AISLAMIENTO).toEqual(["rollback", "discard all", SENTENCIA_SEARCH_PATH]);

    const cliente = sesionDoble({ "-- sql de x.sql": { tipo: "verde" } });
    await correrFicheros({ cliente, ficheros: ["x.sql"], sqlDe, ...silencio });
    expect(cliente.ordenes).toEqual(["-- sql de x.sql", ...ORDENES_DE_AISLAMIENTO]);
  });

  it("si el saneo barato falla, se abre una conexión nueva y el siguiente corre igual", async () => {
    // Un pooler en modo transacción rechaza `DISCARD ALL`. Que la barrera no se
    // pueda ejecutar no puede llevarse por delante el resto de la batería.
    const sucia = sesionDoble(
      {
        "-- sql de a.sql": { tipo: "verde", asserts: 2 },
        "-- sql de b.sql": { tipo: "verde", asserts: 7 },
      },
      { fallaElAislamiento: true },
    );
    const limpia = sesionDoble({ "-- sql de b.sql": { tipo: "verde", asserts: 7 } });
    let reconexiones = 0;

    const { resultados, cliente } = await correrFicheros({
      cliente: sucia,
      ficheros: ["a.sql", "b.sql"],
      sqlDe,
      reconectar: async () => {
        reconexiones += 1;
        return limpia;
      },
      ...silencio,
    });

    expect(reconexiones).toBe(1);
    expect(resultados[1]).toMatchObject({ estado: "ok", pasados: 7 });
    // El segundo fichero salió por la conexión NUEVA, no por la inservible.
    expect(sucia.ordenes).not.toContain("-- sql de b.sql");
    expect(limpia.ordenes).toContain("-- sql de b.sql");
    // Y quien llame se queda con la conexión viva, para poder cerrarla.
    expect(cliente).toBe(limpia);
  });
});

// ---------------------------------------------------------------------------
// Lo que el corredor ya hacía bien y no se puede perder
// ---------------------------------------------------------------------------

describe("resolverIncludes", () => {
  it("resuelve `\\ir` relativo al fichero que incluye, y de forma recursiva", () => {
    const sql = resolverIncludes("begin;\n\\ir helpers/fixture.psql\nselect 1;\n", dirPruebas);
    // No queda ninguna meta-orden que ejecutar (la de la línea 9 del fixture va
    // dentro de un comentario y ahí se queda: el driver nunca la ve).
    expect(sql).not.toMatch(/^\s*\\ir\s/m);
    expect(sql).toContain("pg_temp.login_as");
  });

  it("los ficheros reales que incluyen el fixture quedan sin ninguna meta-orden", () => {
    const conIr = ["debug_temp.sql", "rls_tenant_isolation.sql"];
    for (const f of conIr) {
      const crudo = readFileSync(join(dirPruebas, f), "utf8");
      expect(crudo).toMatch(/^\s*\\ir\s/m);
      expect(resolverIncludes(crudo, dirPruebas)).not.toMatch(/^\s*\\ir\s/m);
    }
  });

  it("un `\\ir` a un fichero inexistente no se ignora en silencio", () => {
    expect(() => resolverIncludes("\\ir helpers/no_existe.psql\n", dirPruebas)).toThrow(
      /no existe/,
    );
  });

  it("un `\\ir` circular se corta en vez de colgarse", () => {
    // El fixture ya está visto: incluirlo otra vez es el ciclo.
    const vistos = new Set([join(dirPruebas, "helpers", "fixture.psql")]);
    expect(() => resolverIncludes("\\ir helpers/fixture.psql\n", dirPruebas, vistos)).toThrow(
      /circular/,
    );
  });
});

describe("resolverRutas", () => {
  it("sin CET_DB_URL apunta a la base del proyecto, por las dos vías", () => {
    const rutas = resolverRutas({});
    expect(rutas).toHaveLength(2);
    expect(rutas[0].host).toBe("db.clcutoqjdgeggvgyreud.supabase.co");
    expect(rutas[1].host).toContain("pooler.supabase.com");
  });

  it("con CET_DB_URL apunta SOLO a esa base, con su usuario y su contraseña", () => {
    // Esto es lo que permite verificar dentro de un worktree, donde no hay
    // `secrets/`. Si se pierde, toda la familia de contratos de base se queda
    // sin verificación.
    const rutas = resolverRutas({
      CET_DB_URL: "postgres://postgres:cla%40ve@127.0.0.1:54322/otra",
    });
    expect(rutas).toHaveLength(1);
    expect(rutas[0]).toMatchObject({
      host: "127.0.0.1",
      port: 54322,
      user: "postgres",
      password: "cla@ve",
      database: "otra",
    });
  });
});

describe("leerContrasena", () => {
  it("PGPASSWORD gana y no hace falta que exista secrets/", () => {
    const previo = process.env.PGPASSWORD;
    process.env.PGPASSWORD = "desde-el-entorno";
    try {
      expect(leerContrasena()).toBe("desde-el-entorno");
    } finally {
      if (previo === undefined) delete process.env.PGPASSWORD;
      else process.env.PGPASSWORD = previo;
    }
  });
});

describe("lineasTap y evaluarTap", () => {
  it("aplana el resultado por sentencia que devuelve node-pg", () => {
    expect(lineasTap([{ rows: [{ tap: "ok 1 - a\nok 2 - b" }] }, { rows: [{ tap: "ok 3 - c" }] }]))
      .toEqual(["ok 1 - a", "ok 2 - b", "ok 3 - c"]);
  });

  it("un solo `not ok` pone el fichero en rojo", () => {
    expect(evaluarTap(["ok 1 - a", "not ok 2 - b"])).toMatchObject({ estado: "rojo", pasados: 1 });
  });

  it("un plan descuadrado pone el fichero en rojo aunque no haya ni un `not ok`", () => {
    const r = evaluarTap(["ok 1 - a", "# Looks like you planned 48 but ran 45"]);
    expect(r.estado).toBe("rojo");
    expect(r.fallos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// El script completo, con `pg` sustituido por un doble: no abre ni un socket.
// ---------------------------------------------------------------------------

const sesionDeMain = { ordenes: [], sqlPorFichero: new Map() };

vi.mock("pg", () => ({
  default: {
    Client: class {
      async connect() {}
      async end() {}
      async query(sql) {
        sesionDeMain.ordenes.push(sql);
        return { rows: [{ tap: "ok 1 - simulado" }] };
      }
    },
  },
}));

describe("main() con la base simulada", () => {
  it("el filtro por prefijo sigue mandando solo esos ficheros, con los `\\ir` resueltos", async () => {
    const { main } = await import("./db-test.mjs");
    sesionDeMain.ordenes.length = 0;
    vi.spyOn(console, "log").mockImplementation(nada);
    vi.spyOn(console, "error").mockImplementation(nada);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const codigo = await main(["rls_answer_key_hidden"], { CET_DB_URL: "postgres://u:p@h:1/d" });
      expect(codigo).toBe(0);
    } finally {
      vi.restoreAllMocks();
    }

    const saneo = new Set([...(ORDENES_DE_AISLAMIENTO ?? []), SENTENCIA_SEARCH_PATH]);
    const deFicheros = sesionDeMain.ordenes.filter((s) => !saneo.has(s));
    const esperado = resolverIncludes(
      readFileSync(join(dirPruebas, "rls_answer_key_hidden.sql"), "utf8"),
      dirPruebas,
    );
    expect(deFicheros).toEqual([esperado]);
    expect(deFicheros[0]).not.toMatch(/^\s*\\ir\s/m);
    // El search_path se fija antes de mandar nada.
    expect(sesionDeMain.ordenes[0]).toBe(SENTENCIA_SEARCH_PATH);
  });
});
