"use client";

/**
 * @cet/ui — region viva para anuncios de lector de pantalla.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useEffect, useState, type ReactNode } from "react";
import { VisuallyHidden } from "./VisuallyHidden.js";

export type LiveRegionPoliteness = "polite" | "assertive";

export interface LiveRegionProps {
  /** Mensaje a anunciar. Al cambiar, se re-anuncia. */
  readonly message: string;
  /**
   * `polite` para casi todo. `assertive` solo para lo que interrumpe con razon:
   * el aviso de que el tiempo se acaba o de que el examen se ha entregado.
   * Interrumpir a un nino que esta leyendo un enunciado tiene un coste real.
   * @default "polite"
   */
  readonly politeness?: LiveRegionPoliteness | undefined;
  /** Visible tambien en pantalla. Por defecto solo para lector de pantalla. */
  readonly visible?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Anuncia cambios de estado (respuesta correcta, guardado, tiempo restante).
 *
 * Detalle que importa: el contenido se vacia y se vuelve a poner en el siguiente
 * ciclo. Sin eso, repetir el MISMO mensaje ("Guardado" dos veces seguidas) no
 * produce ningun anuncio, porque el nodo no cambio.
 */
export function LiveRegion({
  message,
  politeness = "polite",
  visible = false,
  className,
}: LiveRegionProps): ReactNode {
  const [rendered, setRendered] = useState("");

  useEffect(() => {
    setRendered("");
    if (message === "") return undefined;
    const id = globalThis.setTimeout(() => setRendered(message), 30);
    return () => {
      globalThis.clearTimeout(id);
    };
  }, [message]);

  if (visible) {
    return (
      <div role="status" aria-live={politeness} aria-atomic="true" className={className}>
        {rendered}
      </div>
    );
  }

  return (
    <VisuallyHidden as="div" className={className}>
      <span role="status" aria-live={politeness} aria-atomic="true">
        {rendered}
      </span>
    </VisuallyHidden>
  );
}
