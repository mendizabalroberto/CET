/**
 * Constantes del panel de staff compartidas entre servidor y cliente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Viven aparte de `queries.ts` porque ese módulo lleva `import "server-only"`.
 * Un componente de cliente que importe de él un VALOR (no un tipo) arrastra el
 * módulo entero al bundle y el build falla — que es precisamente lo que
 * `server-only` existe para provocar: sin esa barrera, la capa de acceso a la
 * base de datos habría acabado en el navegador sin que nadie se enterara.
 *
 * Los tipos sí se pueden seguir importando de `queries.ts` con `import type`:
 * se borran al compilar y no arrastran nada.
 */

/** Umbral de evidencia para el diagnóstico de destrezas (modules/analytics §2). */
export const MIN_MASTERY_OBSERVATIONS = 5;
