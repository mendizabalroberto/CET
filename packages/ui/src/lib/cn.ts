/**
 * @cet/ui — composicion de clases.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * La escala tipografica propia, la del preset (`tailwind-preset.ts`).
 *
 * ===========================================================================
 * POR QUE HAY QUE DECLARARLA AQUI
 * ===========================================================================
 * `tailwind-merge` no lee la configuracion de Tailwind: reconoce los nombres de
 * la escala POR DEFECTO (`text-sm`, `text-lg`, ...) y de todo lo demas que
 * empiece por `text-` decide por su cuenta. `text-body` no le suena a tamano,
 * asi que lo mete en el mismo grupo que un color arbitrario — y de dos clases
 * del mismo grupo se queda con la ultima.
 *
 * `Button` compone `text-[var(--cet-on-primary)]` (de la variante) y despues
 * `text-body` (del tamano). El resultado real, comprobado:
 *
 *   twMerge("... text-[var(--cet-on-primary)] ...", "... text-body")
 *     -> el color DESAPARECE
 *
 * En pantalla eso era «Comprobar» en tinta #12202f sobre el navy #173a63:
 * **1.53:1** donde el token prometia 11.53:1. El boton mas importante de la
 * pantalla de practica, ilegible, y el test de contraste en verde — porque ese
 * test mide los tokens, y los tokens estaban bien: lo que fallaba era que el
 * color no llegaba a aplicarse.
 *
 * Declarando la escala, `text-body` pasa al grupo `font-size` y deja de pelear
 * con el color. Si manana se anade un tamano al preset, hay que anadirlo aqui:
 * el test `boton-conserva-su-tinta.test.ts` compara las dos listas y se pone
 * rojo si divergen.
 */
export const CET_FONT_SIZES = ["body-sm", "body", "body-lg", "stem", "stem-lg"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...CET_FONT_SIZES] }],
    },
  },
});

/**
 * Combina clases condicionales (clsx) y resuelve conflictos de Tailwind
 * (tailwind-merge), de modo que `className` desde fuera siempre gana sobre el
 * default del componente.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
