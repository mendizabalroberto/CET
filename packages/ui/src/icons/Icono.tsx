/**
 * @cet/ui — Icono.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import { ICONOS, type NombreDeIcono } from "./registro.js";

export interface IconoProps {
  readonly nombre: NombreDeIcono;
  /** Lado del cuadro, en pixeles. */
  readonly tamano?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Icono del design system.
 *
 * Decisiones:
 *  - `aria-hidden` SIEMPRE: el icono nunca va solo, siempre acompana al texto
 *    del boton, que ya da el nombre accesible. Un icono anunciado lo diria dos
 *    veces.
 *  - `focusable="false"` ademas del `aria-hidden`: en algunos navegadores un
 *    `<svg>` entra en el orden de tabulacion aunque este oculto para el lector.
 *  - El tamano va por la prop `size` del componente de Lucide, que acaba en el
 *    atributo `width`/`height` del `<svg>` y no pasa por `cn`: una clase de
 *    Tailwind (`h-4 w-4`, `size-5`...) podria entrar en conflicto con lo que ya
 *    compone `Button` (ver `boton-conserva-su-tinta.test.ts`).
 *  - Sin `"use client"`: la leccion se pinta en el SERVIDOR y este componente
 *    entra ahi. No tiene estado ni manejadores.
 */
export function Icono({ nombre, tamano = 18, className }: IconoProps): ReactNode {
  const Dibujo = ICONOS[nombre];
  return (
    <Dibujo
      size={tamano}
      strokeWidth={2}
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      aria-hidden="true"
      focusable="false"
    />
  );
}
