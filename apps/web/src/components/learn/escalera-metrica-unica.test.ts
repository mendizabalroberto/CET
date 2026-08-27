/**
 * INVARIANTE DE FAMILIA: la escalera métrica del temario es UNA, no dos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA CIERRA ESTE FICHERO
 * ===========================================================================
 * El mismo hecho del temario —«de m a cm se multiplica por 100»— vive escrito
 * dos veces, en dos paquetes que no se conocen:
 *
 *   - `packages/engine/src/generators/math/metric.ts`, que GENERA las preguntas
 *     de práctica que el alumno responde;
 *   - `packages/ui/src/learning/lesson-figure.ts`, que DIBUJA la escalera que
 *     el alumno estudia antes de responderlas.
 *
 * Nada obligaba a que coincidieran. El día que dejaran de hacerlo, el fallo no
 * sale al compilar ni al testear: sale como una lección que enseña una cosa y
 * una práctica que corrige otra, y el niño no tiene forma de saber cuál de las
 * dos miente. Es la lección transversal del traspaso §2 —dos piezas construidas
 * por separado tienen el contrato roto hasta que se demuestre lo contrario—
 * aplicada a un hecho de contenido en vez de a una llamada de función.
 *
 * ===========================================================================
 * POR QUÉ SE LEE EL FICHERO COMO TEXTO
 * ===========================================================================
 * `CONVERSIONS` es privada del módulo del motor, y exportarla solo para un test
 * ensancharía su superficie pública para siempre. Leer el fuente es la misma
 * técnica que ya usan `enum-parity.test.ts` (lee el SQL) y `rsc-boundary`
 * (recorre los imports): compara la FUENTE DE VERDAD, no una copia.
 *
 * El guardián contra el falso verde: si el parser dejase de encontrar
 * conversiones —porque alguien reescribe la tabla con otra forma— el test falla
 * en vez de pasar en vacío.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  chainSteps,
  chainUnits,
  chainConversion,
  type ChainQuantity,
} from "@cet/ui";

/** `apps/web/src/components/learn` → cinco niveles hasta la raíz del repo. */
const METRIC_TS = fileURLToPath(
  new URL("../../../../../packages/engine/src/generators/math/metric.ts", import.meta.url),
);

interface ConversionDelMotor {
  readonly from: string;
  readonly to: string;
  readonly exponent: number;
  readonly family: string;
}

/** Extrae los `{ from, to, exponent, family }` literales de la tabla del motor. */
function leerConversionesDelMotor(): ConversionDelMotor[] {
  const fuente = readFileSync(METRIC_TS, "utf8");
  const re =
    /\{\s*from:\s*"([^"]+)"\s*,\s*to:\s*"([^"]+)"\s*,\s*exponent:\s*(-?\d+)\s*,\s*family:\s*"([^"]+)"\s*\}/g;
  const out: ConversionDelMotor[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente)) !== null) {
    out.push({
      from: m[1] as string,
      to: m[2] as string,
      exponent: Number(m[3]),
      family: m[4] as string,
    });
  }
  return out;
}

const CANTIDADES: readonly ChainQuantity[] = ["length", "mass", "capacity"];

describe("la escalera métrica del motor y la de la figura son la misma", () => {
  const delMotor = leerConversionesDelMotor();

  it("el parser encuentra la tabla del motor (si no, no está probando nada)", () => {
    expect(delMotor.length).toBeGreaterThanOrEqual(8);
  });

  it("cada peldaño de la figura existe en el motor con el MISMO exponente", () => {
    const porClave = new Map(delMotor.map((c) => [`${c.family}:${c.from}->${c.to}`, c.exponent]));

    const desacuerdos: string[] = [];
    for (const cantidad of CANTIDADES) {
      for (const paso of chainSteps(cantidad)) {
        const clave = `${cantidad}:${paso.from}->${paso.to}`;
        const delMotorExp = porClave.get(clave);
        if (delMotorExp === undefined) {
          desacuerdos.push(`${clave} está en la figura y NO en el motor`);
        } else if (delMotorExp !== paso.exponent) {
          desacuerdos.push(`${clave}: figura 10^${paso.exponent} vs motor 10^${delMotorExp}`);
        }
      }
    }

    expect(
      desacuerdos,
      "La lección dibujaría una conversión y la práctica corregiría otra.\n  " +
        desacuerdos.join("\n  "),
    ).toEqual([]);
  });

  it("las unidades de cada magnitud son las mismas en los dos sitios", () => {
    for (const cantidad of CANTIDADES) {
      const delMotorUnidades = new Set(
        delMotor.filter((c) => c.family === cantidad).flatMap((c) => [c.from, c.to]),
      );
      const ajenas = chainUnits(cantidad).filter((u) => !delMotorUnidades.has(u));
      expect(ajenas, `unidades de ${cantidad} que el motor no conoce`).toEqual([]);
    }
  });

  it("encadenar peldaños da un factor exacto, sin arrastre de coma flotante", () => {
    // `km -> mm` son tres peldaños: 10^3 · 10^2 · 10^1. Multiplicando `double`
    // el resultado es correcto hoy, pero es la trampa que el motor ya tuvo que
    // corregir; aquí se comprueba el valor entero exacto.
    expect(chainConversion("length", "km", "mm")).toEqual({ factor: 1000000, direction: "multiply" });
    expect(chainConversion("length", "mm", "km")).toEqual({ factor: 1000000, direction: "divide" });
    expect(chainConversion("mass", "t", "mg")).toEqual({ factor: 1000000000, direction: "multiply" });
    expect(Number.isInteger(chainConversion("mass", "t", "mg")?.factor)).toBe(true);
  });
});
