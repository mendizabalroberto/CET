"use client";

/**
 * @cet/ui — hueco de respuesta dentro de un enunciado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useLocale } from "../lib/i18n.js";

export interface AnswerBlankProps {
  /**
   * Cuantos guiones bajos traia el enunciado. Solo se usa para dar al hueco un
   * ancho proporcional: `___` es un simbolo, `______` un numero de varias
   * cifras. NO se pintan guiones.
   */
  readonly length?: number | undefined;
  readonly className?: string | undefined;
}

const ETIQUETA: Readonly<Record<string, string>> = {
  es: "hueco para tu respuesta",
  en: "blank for your answer",
};

/**
 * El hueco que el alumno tiene que rellenar, dentro del enunciado.
 *
 * POR QUE UNA CAJA Y NO UNA RAYA — es un fallo de comprension, no de estetica.
 *
 * Los generadores escriben el hueco como `___`. Pintado tal cual, un guion bajo
 * repetido es una RAYA HORIZONTAL a media altura: exactamente la misma forma
 * que una barra de fraccion. El enunciado de comparar quedaba asi:
 *
 *     2        2
 *     --  ---  --
 *     10        8
 *
 * Tres rayas paralelas seguidas, y ninguna pista de cual separa numerador de
 * denominador y cual es el hueco. Un nino de once anos no tiene por que
 * adivinarlo, y el que falle ahi habra fallado por culpa de la interfaz.
 *
 * Una caja no comparte silueta con una raya:
 *
 *   - Es una forma CERRADA. Una barra de fraccion es un segmento; un rectangulo
 *     tiene cuatro lados y altura. No se pueden confundir ni de reojo ni con el
 *     zoom al 200%, donde una raya de 2px sigue pareciendo una barra.
 *   - Repite un gesto que el alumno ya tiene delante: el recuadro donde escribe
 *     la respuesta esta justo debajo, en la misma pantalla. La caja del
 *     enunciado y la caja de escribir se leen como la misma cosa — "aqui va lo
 *     que falta"— sin que nadie tenga que explicarlo.
 *   - Se anuncia. `___` el lector de pantalla lo dice como "guion bajo guion
 *     bajo guion bajo", o se lo salta entero; con `role="img"` dice "hueco para
 *     tu respuesta", que es lo que significa.
 *
 * El contorno se dibuja con `box-shadow` y no con `border` a proposito: el
 * preflight de Tailwind resetea los bordes desde una capa posterior y dejaria
 * el hueco invisible, que es justo el fallo que ya se pago con la barra de
 * fraccion.
 */
export function AnswerBlank({ length, className }: AnswerBlankProps): ReactNode {
  const locale = useLocale();
  // Ancho proporcional a los guiones, pero ACOTADO por los dos lados:
  //  - minimo 3 caracteres, para que el hueco quede siempre mas ancho que alto.
  //    Una caja mas alta que ancha se lee como una ficha o un boton; una caja
  //    apaisada se lee como un sitio donde falta algo escrito.
  //  - maximo 5, para que un enunciado con veinte guiones no se coma la linea.
  const anchura = Math.min(5, Math.max(3, Math.round((length ?? 3) * 0.8)));

  return (
    <span
      role="img"
      aria-label={ETIQUETA[locale] ?? ETIQUETA["es"] ?? "hueco"}
      className={cn("cet-blank", className)}
      style={{ minWidth: `${String(anchura)}ch` }}
    />
  );
}
