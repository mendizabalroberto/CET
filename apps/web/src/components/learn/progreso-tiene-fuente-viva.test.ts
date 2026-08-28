/**
 * INVARIANTE DE FAMILIA: ningún indicador de progreso se alimenta de una tabla
 * que nadie escribe.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL FALLO QUE ESTE TEST HABRÍA CAZADO, Y QUE ESTABA EN PRODUCCIÓN
 * ===========================================================================
 * `/learn` pintaba un `MasteryMeter` por curso con la media de `skill_mastery`.
 * La tabla existe, tiene RLS, tiene índices, tiene tipos, y `queries.ts` la
 * consultaba correctamente. Todo verde. Y sin embargo:
 *
 *   - `select count(*) from public.skill_mastery` -> **0**;
 *   - ninguna función de `app` ni de `public` la menciona;
 *   - sus políticas RLS son las tres de `select`: **no hay ninguna de escritura**;
 *   - `authenticated` solo tiene `grant select`;
 *   - la RPC `app.recompute_skill_mastery` que promete `modules/analytics/
 *     CLAUDE.md` **no existe** (`pg_proc` no devuelve nada con "mastery").
 *
 * O sea: un medidor de dominio que no podía medir nada, y que además hacía
 * indistinguible "este alumno no ha practicado" de "esta tabla no la rellena
 * nadie". Es la regla R3 en su forma más pura — dos piezas construidas por
 * separado y un contrato roto entre ellas — y ningún test de renderizado la
 * habría visto, porque el componente hacía exactamente lo que le pedían.
 *
 * ===========================================================================
 * CÓMO SE COMPRUEBA SIN BASE DE DATOS
 * ===========================================================================
 * Leyendo las migraciones, que son la definición de la base. Una tabla tiene
 * ESCRITOR si algo en `supabase/migrations/` la inserta, la actualiza, le da un
 * `grant insert/update`, o le crea una política `for insert/update/all`. Sin
 * ninguna de esas cuatro cosas, nada del sistema puede poner una fila dentro, y
 * cualquier indicador que la lea está garantizado vacío para siempre.
 *
 * Corre en CI sin Postgres y sin red, así que protege de verdad en cada `pnpm
 * verify` y no solo el día que alguien se acuerde de mirar producción.
 *
 * ===========================================================================
 * CÓMO SE AÑADE UN INDICADOR
 * ===========================================================================
 * Declarándolo en `FUENTES`. Uno nuevo sin declarar no lo caza este test —no
 * puede: no hay forma fiable de saber desde el texto qué consulta alimenta qué
 * píxel—, así que la declaración es el precio de pintar una barra. Es el mismo
 * contrato que `packages/ui/__tests__/estados-no-solo-color.test.tsx` ya impone
 * para el color, y por el mismo motivo: obligar a tomar la decisión en voz alta.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRACIONES = join(process.cwd(), "..", "..", "supabase", "migrations");

interface Fuente {
  /** Qué se le pinta al usuario con esto. */
  readonly indicador: string;
  /** Dónde se lee. */
  readonly fichero: string;
  /**
   * Hueco DECLARADO: se sabe que la tabla no tiene escritor y aun así se lee.
   * Solo vale para código que no es de esta vía; la razón es obligatoria y el
   * test de abajo la vigila para que el marcador no sobreviva al arreglo.
   */
  readonly huecoDeclarado?: string;
}

/** Clave: tabla de `public` que alimenta un indicador. */
const FUENTES: Readonly<Record<string, readonly Fuente[]>> = {
  learning_events: [
    {
      indicador: "Escalera de nivel y «siguiente paso» de cada grupo de práctica",
      fichero: "apps/web/src/components/learn/queries.ts :: getPracticeProgress",
    },
    {
      // No es una segunda fuente: es una PROYECCIÓN de los mismos
      // `TopicProgress` (ver `overviewLevels`). Se declara aparte porque lo que
      // este invariante vigila es el indicador, y el día que alguien lo
      // reapunte a otra tabla la declaración es donde tiene que notarse.
      indicador: "Vista de conjunto «cómo voy en general» de /practice",
      fichero: "apps/web/src/components/learn/practice-progress.ts :: overviewLevels",
    },
  ],
  skill_mastery: [
    {
      indicador: "Panel de profesor: las destrezas más flojas del colegio",
      fichero: "apps/web/src/components/staff/queries.ts :: weakestSkills",
      // El hueco declarado se ha BORRADO, y lo obligó este mismo fichero: la
      // tabla ya tiene escritor —`app.rebuild_skill_mastery`, en
      // `0052_mastery_job.sql`, programada por pg_cron cada diez minutos— y el
      // test de abajo trata un marcador que sobrevive a su arreglo como un
      // fallo. Con razón: un marcador caducado dice que el problema sigue ahí y
      // manda a nadie a arreglar lo que ya está arreglado.
    },
  ],
};

/* -------------------------------------------------------------------------- */

function sqlDeLasMigraciones(): string {
  return readdirSync(MIGRACIONES)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(MIGRACIONES, n), "utf8"))
    .join("\n")
    .toLowerCase();
}

/**
 * Las cuatro maneras que hay de que una fila llegue a una tabla. Si no aparece
 * ninguna, la tabla es de solo lectura para todo el sistema.
 */
function escritoresDe(tabla: string, sql: string): string[] {
  const t = `(?:public\\.)?${tabla}\\b`;
  const pruebas: readonly (readonly [string, RegExp])[] = [
    ["insert into", new RegExp(`insert\\s+into\\s+${t}`)],
    ["update ... set", new RegExp(`update\\s+(?:only\\s+)?${t}\\s+set\\b`)],
    ["grant insert/update", new RegExp(`grant[^;]*\\b(?:insert|update)\\b[^;]*\\son\\s+${t}`)],
    [
      "policy for insert/update/all",
      new RegExp(`create\\s+policy[^;]*\\son\\s+${t}[^;]*\\bfor\\s+(?:insert|update|all)\\b`),
    ],
  ];
  return pruebas.filter(([, re]) => re.test(sql)).map(([nombre]) => nombre);
}

/* -------------------------------------------------------------------------- */

describe("invariante — todo indicador de progreso lee una tabla que alguien escribe", () => {
  const sql = sqlDeLasMigraciones();

  it("las migraciones se han leído (si no, el test no prueba nada)", () => {
    expect(sql.length).toBeGreaterThan(10_000);
    // Control positivo: si el detector no encuentra escritor en una tabla que
    // evidentemente lo tiene, el detector está roto y todo lo demás es ruido.
    expect(escritoresDe("profiles", sql).length).toBeGreaterThan(0);
  });

  const vivas = Object.entries(FUENTES).filter(([, usos]) =>
    usos.some((u) => u.huecoDeclarado === undefined),
  );

  it.each(vivas)("`%s` tiene al menos un escritor en las migraciones", (tabla) => {
    const escritores = escritoresDe(tabla, sql);
    const usos = (FUENTES[tabla] ?? [])
      .filter((u) => u.huecoDeclarado === undefined)
      .map((u) => `${u.indicador}  (${u.fichero})`);
    expect(
      escritores,
      `Nada en supabase/migrations/ puede poner una fila en public.${tabla}: no hay insert, ` +
        `ni update, ni grant de escritura, ni política de insert. Los indicadores que la leen ` +
        `están garantizados vacíos para siempre:\n  ${usos.join("\n  ")}\n` +
        `O se implementa el escritor, o el indicador se quita. Pintarlo vacío enseña al ` +
        `usuario a no mirar los indicadores.`,
    ).not.toEqual([]);
  });

  const huecos = Object.entries(FUENTES).flatMap(([tabla, usos]) =>
    usos.filter((u) => u.huecoDeclarado !== undefined).map((u) => [tabla, u] as const),
  );

  it.each(huecos)(
    "el hueco declarado sobre `%s` sigue siendo un hueco (si ya no lo es, hay que borrarlo)",
    (tabla, uso) => {
      expect(uso.huecoDeclarado, "un hueco sin razón escrita es una excepción, no un hueco").toBeTruthy();
      expect(
        escritoresDe(tabla, sql),
        `public.${tabla} YA tiene escritor (${escritoresDe(tabla, sql).join(", ")}). ` +
          `El hueco declarado para "${uso.indicador}" sobra: bórralo de FUENTES y comprueba ` +
          `que el indicador enseña datos de verdad. Un marcador de hueco que sobrevive al ` +
          `arreglo es peor que no tenerlo: oculta que el problema ya se resolvió.`,
      ).toEqual([]);
    },
  );

  it("/learn ya no lee skill_mastery: el indicador muerto se quitó, no se maquilló", () => {
    // Regresión concreta del hallazgo. Si alguien vuelve a enchufar un medidor
    // de dominio del alumno a esta tabla, esto lo para.
    const queries = readFileSync(
      join(process.cwd(), "src", "components", "learn", "queries.ts"),
      "utf8",
    );
    expect(queries).not.toMatch(/\.from\(\s*["']skill_mastery["']\s*\)/);
  });
});
