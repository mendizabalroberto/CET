"use client";

/**
 * @cet/ui — LessonTimeBreakdown: donde se concentra el esfuerzo.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * BARRAS HORIZONTALES, Y NO UN QUESO
 * ===========================================================================
 * La pregunta es «¿donde se le va el tiempo?», que es comparar magnitudes con
 * nombres largos. Un sector circular obliga a comparar angulos —que se compara
 * mal— y no tiene donde poner «Sumar y restar fracciones con distinto
 * denominador» sin una leyenda de colores que ademas seria el unico canal. Barras
 * horizontales sobre un eje comun: los nombres caben, la comparacion es de
 * longitud y se lee de arriba abajo.
 *
 * Ordenadas de mas a menos: asi la respuesta esta en la primera fila y el orden
 * es el propio dato. Entre iguales se conserva el orden de entrada (`sort` es
 * estable).
 *
 * ===========================================================================
 * UNA SERIE, UN EJE, NINGUNA LEYENDA
 * ===========================================================================
 * Todas las barras miden lo mismo —minutos— contra el mismo maximo, que sale de
 * la propia lista. Una sola serie no necesita leyenda: el titulo del panel dice
 * lo que se pinta, y una caja con un solo cuadradito de color repetiria el
 * titulo gastando sitio. El tono es `currentColor` en todas: no distingue nada,
 * porque lo que distingue las filas es el nombre escrito al lado y la longitud.
 *
 * Los minutos van ESCRITOS al final de cada barra. No es redundancia con el
 * dibujo: la barra responde «¿donde se concentra?» de un vistazo y la cifra
 * responde «¿cuanto?» —dos preguntas distintas—, y es lo unico que queda si el
 * dibujo no se puede ver.
 *
 * ===========================================================================
 * SIN NI UN MINUTO NO SE PINTA NADA
 * ===========================================================================
 * Una lista de lecciones a cero es la consulta vacia dibujada como resultado.
 * Misma regla que el resto de los indicadores de la casa.
 *
 * ===========================================================================
 * EL NOMBRE NO COMPARTE FILA CON LA BARRA
 * ===========================================================================
 * Nombre arriba en su renglon, barra y cifra debajo. Los nombres de leccion son
 * lo mas largo que hay en el producto y no ceden sitio a nada; ver obs003 y la
 * cabecera de `TopicCard`.
 */

import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { hayTiempoPorLeccion, type LessonTime } from "./scorecard-data.js";

/** Alto de barra. Por debajo del tope de 24 px de la casa para marcas de dato. */
const GRUESO = 12;
/** Suelo visible: una leccion con un minuto tiene que existir en pantalla. */
const MIN_VISIBLE = 2;

export interface LessonTimeBreakdownProps {
  /** Las lecciones en cualquier orden: aqui se ordenan de mas a menos tiempo. */
  readonly items: readonly LessonTime[];
  readonly className?: string | undefined;
}

/** Minutos utilizables. Lo que no es un numero valido cuenta como cero. */
function minutosDe(item: LessonTime): number {
  return Number.isFinite(item.minutes) && item.minutes > 0 ? item.minutes : 0;
}

export function LessonTimeBreakdown({ items, className }: LessonTimeBreakdownProps): ReactNode {
  // Ni un minuto en toda la lista: no hay reparto que pintar. Ver la cabecera.
  // La condicion la decide `hayTiempoPorLeccion`, que es la misma que consulta
  // el scorecard para saber si monta el panel: una sola definicion.
  if (!hayTiempoPorLeccion(items)) return null;

  const maximo = Math.max(...items.map(minutosDe), 1);

  const ordenadas = [...items].sort((a, b) => minutosDe(b) - minutosDe(a));

  return (
    <ul data-cet-lista="tiempo-por-leccion" className={cn("m-0 flex list-none flex-col gap-3 p-0", className)}>
      {ordenadas.map((leccion, index) => {
        const parte = minutosDe(leccion) / maximo;
        return (
          <li key={`${index}-${leccion.name}`} data-cet-fila="leccion" className="flex flex-col gap-1">
            {/* Renglon propio. Ver la cabecera. */}
            <span className="text-body-sm font-semibold">{leccion.name}</span>
            <span className="flex items-center gap-2">
              <svg
                width="100%"
                height={GRUESO}
                viewBox={`0 0 100 ${GRUESO}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                // `overflow-visible`: el trazo de la barra hueca va centrado en el
              // borde y medio pixel cae fuera del viewBox; recortado, el guion
              // de arriba y el de abajo se pierden.
              className="block h-3 min-w-0 flex-1 overflow-visible"
              >
                {/* La pista: mismo tono, muy atenuada. Rejilla, no dato. */}
                <rect x={0} y={0} width={100} height={GRUESO} rx={2} fill="currentColor" opacity={0.12} />
                <rect
                  data-cet-barra="minutos"
                  x={0}
                  y={0}
                  width={Math.max(MIN_VISIBLE, parte * 100)}
                  height={GRUESO}
                  rx={2}
                  fill="currentColor"
                />
              </svg>
              {/* La cifra, siempre escrita. Es lo unico que sobrevive si el
                  dibujo no se ve, y responde una pregunta que la barra no. */}
              <span className="shrink-0 tabular-nums text-body-sm font-semibold">
                {leccion.minutesText}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
