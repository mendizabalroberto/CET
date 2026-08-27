"use client";

/**
 * @cet/ui — fraccion accesible.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useLocale } from "../lib/i18n.js";
import { fractionToWords } from "../lib/fraction-words.js";

export interface FractionTextProps {
  readonly numerator: number;
  readonly denominator: number;
  /** Parte entera de un numero mixto (`2 1/5`). */
  readonly whole?: number | undefined;
  /**
   * Sustituye el texto anunciado por el lector de pantalla. Solo para casos que
   * la tabla de nombres no cubre bien; por defecto se calcula.
   */
  readonly ariaLabel?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Fraccion apilada: numerador sobre denominador, con su barra.
 *
 * ACCESIBILIDAD — es el motivo por el que este componente existe.
 * Dos <span> apilados los lee un lector de pantalla como "tres cuatro", que
 * para un nino que depende del audio es directamente una respuesta equivocada.
 * El nodo entero es un `role="img"` con `aria-label` ("tres cuartos") y todo lo
 * visual va `aria-hidden`, para que se anuncie una vez y bien. Un numero mixto
 * es UN solo nodo, no un "2" suelto seguido de una fraccion: se anuncia "dos y
 * un quinto".
 *
 * COMPOSICION — por que la barra es un elemento y no un `border-top`.
 * Tres razones, todas ellas fallos que se han visto en pantalla:
 *
 *   1. El preflight de Tailwind (`*, ::before, ::after { border: 0 solid }`)
 *      borra cualquier borde que llegue desde una capa anterior, y `tokens.css`
 *      entra en `@layer cet-tokens`, que va antes. La fraccion se quedaba SIN
 *      raya —"5" encima de "6"— y hubo que rescatarla con una regla dentro de
 *      la app. Un fondo no lo resetea nadie: la barra deja de depender de un
 *      fichero de otro paquete para existir.
 *   2. Un `border-top` sobre el denominador mide lo que mide el denominador.
 *      En `12/5` la barra salia mas corta que el numerador, que sobresalia por
 *      los dos lados. Aqui la barra ocupa la columna de la rejilla, que mide lo
 *      que el MAS ANCHO de los dos numeros: no puede desalinearse.
 *   3. Un elemento propio se puede redondear y engrosar con el tamano del
 *      texto; un borde de 2px fijos se ve grueso a 14px y anemico a 32px.
 *
 * @example
 * <FractionText numerator={3} denominator={4} />           // "tres cuartos"
 * <FractionText whole={2} numerator={1} denominator={5} /> // "dos y un quinto"
 */
export const FractionText = forwardRef<HTMLSpanElement, FractionTextProps>(function FractionText(
  { numerator, denominator, whole, ariaLabel, className },
  ref,
): ReactNode {
  const locale = useLocale();
  const label =
    ariaLabel ??
    fractionToWords(whole === undefined ? { numerator, denominator } : { numerator, denominator, whole }, locale);

  return (
    <span ref={ref} role="img" aria-label={label} className={cn("cet-frac-wrap", className)}>
      {whole !== undefined && whole !== 0 ? (
        <span className="cet-frac-whole" aria-hidden="true">
          {whole}
        </span>
      ) : null}
      <span className="cet-frac" aria-hidden="true">
        <span className="cet-frac-n">{numerator}</span>
        {/* La barra. Es un elemento real con fondo, no un borde: ver cabecera. */}
        <span className="cet-frac-bar" />
        <span className="cet-frac-d">{denominator}</span>
      </span>
    </span>
  );
});
