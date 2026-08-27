/**
 * @cet/ui — que kinds de bloque sabe pintar el design system.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ESTO NO VIVE EN `LessonBlock.tsx`
 * ===========================================================================
 * Vivia alli, y por eso la pagina de leccion reventaba en produccion.
 *
 * `LessonBlock.tsx` es `"use client"`. Un modulo con esa directiva no exporta
 * funciones al servidor: exporta REFERENCIAS que React solo sabe renderizar
 * como componente o pasar como prop. `block-mapping.ts` de la app es servidor a
 * proposito y llamaba a `isRenderableBlockKind(row.kind)`:
 *
 *   Error: Attempted to call isRenderableBlockKind() from the server but
 *   isRenderableBlockKind is on the client.
 *
 * Compilaba, pasaba el typecheck y pasaba `next build`. Solo fallaba al abrir
 * una leccion de verdad. La cura no es marcar el servidor como cliente —la
 * leccion se pinta en el servidor por diseno— sino que el dato viva en un
 * modulo SIN directiva, que los dos lados puedan importar.
 *
 * Regla que deja este fichero: en un paquete de UI, lo que es dato o predicado
 * puro no comparte fichero con lo que es componente de cliente.
 * `apps/web/src/lib/rsc-boundary.test.ts` lo vigila para toda la familia.
 */

import { blockKind, type BlockKind } from "@cet/shared";

/**
 * Los `lesson_blocks.kind` que `LessonBlock` tiene variante para pintar.
 *
 * Se DERIVAN del enum de @cet/shared en vez de copiarse a mano. La lista
 * original era once comparaciones `kind === "..."` escritas una a una, que es
 * la clase de duplicado que se queda corto en silencio: anadir un kind al enum
 * habria dejado los bloques nuevos invisibles en la leccion sin romper nada.
 *
 * Que la cobertura sea total y no parcial lo garantiza el `switch` exhaustivo
 * de `LessonBlock.tsx`: si algun dia hubiera un `BlockKind` que el componente
 * no supiera pintar, ese fichero dejaria de compilar y habria que separar las
 * dos listas explicitamente.
 */
export const RENDERABLE_BLOCK_KINDS: readonly BlockKind[] = blockKind.options;

/**
 * Traduce un `kind` crudo de la base de datos al `BlockKind` que entiende
 * `LessonBlock`. Existe para que la aplicacion descarte de forma explicita un
 * bloque que no sabe pintar, en vez de dejar un hueco mudo en mitad de una
 * leccion.
 */
export function isRenderableBlockKind(kind: string): kind is BlockKind {
  return (RENDERABLE_BLOCK_KINDS as readonly string[]).includes(kind);
}
