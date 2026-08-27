/**
 * @cet/ui — texto solo para lectores de pantalla.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type ElementType, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface VisuallyHiddenProps {
  readonly children: ReactNode;
  readonly as?: ElementType | undefined;
  readonly className?: string | undefined;
}

/**
 * Oculta visualmente sin sacar del arbol de accesibilidad.
 * `display:none` y `visibility:hidden` tambien lo esconden del lector; por eso
 * la tecnica del rectangulo de 1px.
 */
export const VisuallyHidden = forwardRef<HTMLElement, VisuallyHiddenProps>(function VisuallyHidden(
  { children, as: Tag = "span", className },
  ref,
): ReactNode {
  return (
    <Tag
      ref={ref}
      className={cn(
        "absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0",
        "[clip:rect(0,0,0,0)] [clip-path:inset(50%)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
});
