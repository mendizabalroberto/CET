"use client";

/**
 * @cet/ui — SkillList: donde va fuerte y donde va flojo, ordenado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * NO INVENTA UN SEGUNDO LENGUAJE PARA EL NIVEL
 * ===========================================================================
 * El nivel de una destreza ya tiene dibujo en esta casa: `MasteryLadder`, cuatro
 * peldanos de altura creciente con la palabra al lado. Aqui se REUTILIZA tal
 * cual. Un porcentaje, un anillo o unos puntos de colores serian un tercer
 * vocabulario para lo mismo, y el profesor tendria que aprender a traducir entre
 * la pantalla del alumno y la suya para hablar de la misma destreza.
 *
 * Por eso este fichero no dibuja nada propio: ordena y rotula.
 *
 * ===========================================================================
 * EL ORDEN ES EL DATO
 * ===========================================================================
 * «Fortalezas y flojeras» no es una etiqueta que ponga alguien: es lo que sale
 * de ordenar por nivel. Arriba lo dominado, abajo lo que se atraganta, y las
 * destrezas sin evidencia al final —no son flojas, es que no se han medido, y
 * mezclarlas con las flojas convertiria «no lo sabemos» en «va mal»—. El orden
 * de entrada se conserva entre iguales (`sort` es estable), asi que dos
 * destrezas del mismo nivel salen en el orden que la aplicacion decidio.
 *
 * ===========================================================================
 * SIN NINGUNA DESTREZA MEDIDA NO SE PINTA NADA
 * ===========================================================================
 * Una lista de nombres sin un solo nivel no es un informe de destrezas: es la
 * consulta vacia pintada como si fuera un resultado. Misma regla que
 * `MasteryOverview` y que `__tests__/progreso-viene-de-datos.test.tsx`.
 *
 * ===========================================================================
 * EL NOMBRE NO COMPARTE FILA CON EL INDICADOR
 * ===========================================================================
 * Nombre en su renglon; escalera, palabra y evidencia debajo. Es exactamente lo
 * que costo obs003 en produccion —«Comparar» y «Lo llevas bien» pintados uno
 * encima del otro—, y aqui los nombres son peores todavia: «Sumar y restar
 * fracciones con distinto denominador» no cede sitio a nada.
 */

import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { MasteryLadder, MASTERY_STEPS } from "../progress/MasteryLadder.js";
import type { MasteryLevel } from "../data/mastery-level.js";
import { hayDestrezasMedidas, type SkillEntry } from "./scorecard-data.js";

export interface SkillListProps {
  /** Las destrezas en cualquier orden: aqui se ordenan de mas a menos nivel. */
  readonly items: readonly SkillEntry[];
  readonly className?: string | undefined;
}

/** Peso de orden. Sin evidencia va al final, nunca entre las flojas. */
function peso(level: MasteryLevel | null): number {
  return level === null ? -1 : MASTERY_STEPS.indexOf(level);
}

export function SkillList({ items, className }: SkillListProps): ReactNode {
  const t = useI18n();

  // Ni una sola medida: no hay informe que dar. Ver la cabecera. La condicion
  // la decide `hayDestrezasMedidas`, que es la misma que consulta el scorecard
  // para saber si monta el panel: una sola definicion.
  if (!hayDestrezasMedidas(items)) return null;

  const ordenadas = [...items].sort((a, b) => peso(b.level) - peso(a.level));

  return (
    <ul data-cet-lista="destrezas" className={cn("m-0 flex list-none flex-col gap-3 p-0", className)}>
      {ordenadas.map((destreza, index) => {
        const nombre = t(destreza.name);
        const evidencia = t(destreza.evidence);
        return (
          <li key={`${index}-${nombre}`} className="flex flex-col gap-1">
            {/* Renglon propio. Ver la cabecera. */}
            <span className="text-body-sm font-semibold">{nombre}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
              {/* Sin nivel no hay escalera: no existe un «nivel cero», y cuatro
                  peldanos vacios le dirian al profesor que la destreza va mal
                  cuando lo que pasa es que no se ha medido. La evidencia de al
                  lado —«sin practicar»— es la que habla en ese caso. */}
              {destreza.level === null ? null : (
                <MasteryLadder level={destreza.level} groupLabel={destreza.name} showLabel />
              )}
              {evidencia.length > 0 ? <span>{evidencia}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
