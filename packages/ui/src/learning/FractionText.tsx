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
 * Fraccion apilada, portada de `<span class="f">` de los trainers Y6A.
 *
 * Visualmente es lo mismo que ya funcionaba con los alumnos: numerador sobre
 * denominador con una barra. Para un lector de pantalla NO es "tres cuatro"
 * sino "tres cuartos": el nodo entero es un `role="img"` con `aria-label`, y
 * los digitos van marcados `aria-hidden` para que no se lean dos veces.
 *
 * @example
 * <FractionText numerator={3} denominator={4} />        // "tres cuartos"
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
    <span ref={ref} role="img" aria-label={label} className={cn("cet-mixed-number", className)}>
      {whole !== undefined && whole !== 0 ? (
        <span aria-hidden="true">{whole}</span>
      ) : null}
      <span className="cet-fraction" aria-hidden="true">
        <span className="cet-fraction-num">{numerator}</span>
        <span className="cet-fraction-den">{denominator}</span>
      </span>
    </span>
  );
});
