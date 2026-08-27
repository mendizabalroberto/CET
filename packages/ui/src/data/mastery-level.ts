/**
 * @cet/ui — los cuatro tramos de dominio. Logica PURA, sin "use client".
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ESTO NO VIVE YA EN `MasteryMeter.tsx`
 * ===========================================================================
 * Vivia alli, y era una bomba con espoleta. `MasteryMeter.tsx` empieza por
 * `"use client"`, y en un modulo de cliente TODO lo exportado —tambien una
 * funcion pura de tres lineas— se convierte, visto desde el servidor, en una
 * REFERENCIA de cliente. No es una funcion: llamarla desde un Server Component
 * lanza en produccion. Ni el typecheck ni el build lo ven, porque los tipos son
 * correctos y el modulo existe.
 *
 * Este proyecto ya se lo comio entero: `isRenderableBlockKind` era un type-guard
 * puro atrapado en un fichero `"use client"`, `block-mapping.ts` lo llamaba
 * desde el servidor, y la pagina de leccion se caia con la pantalla roja. La
 * solucion fue `learning/block-kind.ts`, y este fichero es su gemelo: mismo
 * problema, mismo patron.
 *
 * Lo caza `apps/web`, con el invariante de frontera RSC. Si mueves algo de aqui
 * a un fichero de componente, ese test se pone rojo — y tiene razon.
 *
 * `MasteryMeter.tsx`, `MasteryLadder.tsx` y el calculo de progreso de practica
 * de la aplicacion importan los umbrales de AQUI, que es lo que garantiza que
 * "Lo llevas bien" signifique lo mismo en las tres pantallas.
 */

export type MasteryLevel = "starting" | "learning" | "solid" | "mastered";

/** Cuatro tramos. Deliberadamente pocos: un porcentaje al 1 % no significa nada. */
export function masteryLevel(mastery: number): MasteryLevel {
  if (mastery >= 0.85) return "mastered";
  if (mastery >= 0.6) return "solid";
  if (mastery >= 0.3) return "learning";
  return "starting";
}
