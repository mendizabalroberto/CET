/**
 * INVARIANTE: el borde conoce TODOS los roles que existen en la base.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL FALLO QUE ESTE TEST CIERRA
 * ===========================================================================
 * `readClaims` valida el rol contra una lista escrita a mano. Lo que no está en
 * ella se lee como `null`, y `null` en este sistema significa «el borde no lo
 * sabe» — que es deliberadamente permisivo, porque denegar por ignorancia ya
 * encerró una vez a un superadmin fuera de su propio panel.
 *
 * `guardian` faltaba. Llegó con la migración 0055, cuando el producto ganó los
 * tutores, y nunca subió hasta esa lista. Dos consecuencias, las dos mudas:
 *
 *   1. `homeForRole(null)` devuelve la portada pública. Un tutor al que el
 *      middleware tuviera que reencaminar acababa en la landing, no en
 *      `/tutor`, sin un solo error por medio.
 *   2. La denegación barata del borde no se aplicaba a un tutor. Acababa en el
 *      mismo 404 del layout, así que el agujero no se veía — pero la defensa
 *      exterior estaba apagada justo para el único rol que es un adulto ajeno
 *      al centro.
 *
 * ===========================================================================
 * POR QUE SE LEEN LAS MIGRACIONES Y NO SE ESCRIBE LA LISTA DOS VECES
 * ===========================================================================
 * Copiar los cinco valores aquí sería la misma avería con un paso más: dos
 * listas escritas a mano que hay que acordarse de tocar a la vez. El enum vive
 * en `supabase/migrations/`, que es la definición de la base, y de ahí se lee.
 *
 * Corre sin Postgres y sin red, así que protege en cada `pnpm verify` y no solo
 * el día que alguien se acuerde de mirar producción.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { rolesConocidosPorElBorde } from "./middleware";

const MIGRACIONES = join(process.cwd(), "..", "..", "supabase", "migrations");

/**
 * Los valores de `public.user_role` tal y como los declaran las migraciones,
 * incluidos los que se añadieron después con `alter type ... add value`.
 */
function rolesEnLaBase(): string[] {
  const encontrados = new Set<string>();

  for (const fichero of readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRACIONES, fichero), "utf8");

    // `create type public.user_role as enum ('a', 'b', ...)`
    const creacion = /create\s+type\s+(?:public\.)?user_role\s+as\s+enum\s*\(([^)]*)\)/is.exec(sql);
    if (creacion?.[1]) {
      for (const m of creacion[1].matchAll(/'([^']+)'/g)) encontrados.add(m[1] as string);
    }

    // `alter type public.user_role add value [if not exists] 'guardian'`
    for (const m of sql.matchAll(
      /alter\s+type\s+(?:public\.)?user_role\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']+)'/gis,
    )) {
      encontrados.add(m[1] as string);
    }
  }

  return [...encontrados].sort();
}

describe("los roles que el borde reconoce", () => {
  it("las migraciones declaran un enum de roles que este test sabe leer", () => {
    // Si esta afirmación cae, el que ha cambiado es el formato del SQL y el
    // test de abajo estaría comparando contra una lista vacía —o sea, pasando
    // por no comprobar nada—. Es la guarda de la guarda.
    const enLaBase = rolesEnLaBase();
    expect(enLaBase.length).toBeGreaterThanOrEqual(4);
    expect(enLaBase).toContain("superadmin");
  });

  it("EL FALLO: ningún rol de la base se queda fuera del borde", () => {
    const enLaBase = rolesEnLaBase();
    const enElBorde = [...rolesConocidosPorElBorde].sort();

    // El mensaje nombra al que falta: con `toEqual` a secas, el día que se
    // añada el sexto rol el fallo diría «arrays distintos» y no cuál.
    const ausentes = enLaBase.filter((r) => !enElBorde.includes(r));
    expect(ausentes, `roles que la base tiene y el borde desconoce: ${ausentes.join(", ")}`).toEqual(
      [],
    );
  });

  it("y el borde no se inventa ninguno que la base no tenga", () => {
    // El reverso. Un rol de más aquí sería una autorización que la base no
    // puede respaldar: el borde dejaría pasar un claim que ninguna política RLS
    // reconoce, y el fallo aparecería mucho más adentro.
    const enLaBase = rolesEnLaBase();
    const sobrantes = [...rolesConocidosPorElBorde].filter((r) => !enLaBase.includes(r));
    expect(sobrantes, `roles del borde que la base no declara: ${sobrantes.join(", ")}`).toEqual([]);
  });
});
