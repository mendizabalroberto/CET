/**
 * @cet/ui — composicion de clases.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases condicionales (clsx) y resuelve conflictos de Tailwind
 * (tailwind-merge), de modo que `className` desde fuera siempre gana sobre el
 * default del componente.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
