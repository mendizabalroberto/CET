/**
 * Vitest — pruebas unitarias de la lógica de apps/web.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Aquí NO se prueban componentes de React: para eso está Playwright, que ejerce
 * la app de verdad. Vitest cubre la lógica pura (cola de telemetría, matriz de
 * rutas, esquemas Zod), que es donde viven los fallos silenciosos.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Los e2e son de Playwright; si se colaran aquí, arrancarían un navegador
    // dentro de la suite unitaria.
    exclude: ["e2e/**", "node_modules/**"],
  },
});
