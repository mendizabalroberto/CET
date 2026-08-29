/**
 * INVARIANTE: el umbral de cohorte es UN número, no uno por capa.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA CAZA ESTE FICHERO
 * ===========================================================================
 * «No enseñar la comparación cuando la clase es demasiado pequeña» es UNA
 * decisión, y se aplica en dos sitios: la base decide si devuelve la media
 * (`c_min_cohorte` en `0062_informes_series.sql`) y la pantalla decide si la
 * pinta (`MIN_COHORTE`). Si los dos números se separan, no falla nada visible:
 * simplemente el producto empieza a comportarse según el más estricto y nadie
 * sabe cuál manda.
 *
 * Pasó de verdad. Los dos se escribieron en paralelo y salieron distintos —3 en
 * la base, 5 en la pantalla—, cada uno con un motivo correcto y distinto:
 * privacidad (con 2 alumnos la media despeja el dato del único compañero) y
 * estadística (con menos de 5 un compañero mueve la media más de un 20 %). Se
 * unificaron en 5, que cubre los dos.
 *
 * Este test lee el SQL de verdad en vez de repetir el número: copiarlo aquí
 * sería una TERCERA copia, y el fichero que vigila que no haya copias no puede
 * ser una de ellas.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MIN_COHORTE } from "../src/reports/scorecard-data.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRACION = join(RAIZ, "supabase", "migrations", "0062_informes_series.sql");

/** El umbral tal como lo declara la migración. */
function umbralDelSql(): number {
  const sql = readFileSync(MIGRACION, "utf8");
  const m = sql.match(/c_min_cohorte\s+constant\s+integer\s*:=\s*(\d+)\s*;/);
  if (!m?.[1]) {
    throw new Error(
      `No se encontró 'c_min_cohorte constant integer := N;' en ${MIGRACION}. ` +
        "Si la migración cambió de forma, este test hay que actualizarlo — pero " +
        "no borrarlo: sin él los dos umbrales vuelven a separarse en silencio.",
    );
  }
  return Number(m[1]);
}

describe("invariante — el umbral de cohorte es uno solo", () => {
  it("la migración y la pantalla dicen el mismo número", () => {
    expect(
      umbralDelSql(),
      "El umbral de la base y el de la pantalla se han separado. No es un fallo " +
        "visible: el producto obedecería al más estricto y nadie sabría cuál manda. " +
        "Cámbialos a la vez, o justifica por escrito por qué deben diferir.",
    ).toBe(MIN_COHORTE);
  });

  it("y ese número no baja de 5 sin que alguien lo decida a mano", () => {
    // Los casos del umbral están parametrizados por la constante, así que se
    // adaptarían solos a un valor menor. Este assert es el que obliga a tocar
    // este fichero —y a leer el motivo— antes de bajarlo.
    expect(MIN_COHORTE).toBeGreaterThanOrEqual(5);
  });

  it("el fichero de la migración existe donde este test cree", () => {
    // Si alguien renumera o mueve la migración, el `readFileSync` de arriba
    // reventaría con un error de fichero y podría leerse como «infraestructura
    // rota» en vez de como «el invariante ya no vigila nada».
    expect(() => umbralDelSql()).not.toThrow();
  });
});
