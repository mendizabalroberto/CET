/**
 * Vitest — pruebas unitarias y de componente de apps/web.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * DOS ENTORNOS, A PROPÓSITO
 *
 *   `src/**\/*.test.ts`   → Node. Lógica pura: cola de telemetría, matriz de
 *                          rutas, esquemas Zod, motor de examen. Rápido y sin
 *                          DOM, que es donde viven los fallos silenciosos.
 *
 *   `src/**\/*.test.tsx`  → jsdom. El CABLEADO de los componentes: que el foco
 *                          vaya donde debe tras responder, que el input de PIN
 *                          avance solo, que un `aria-describedby` apunte a algo
 *                          que existe.
 *
 * Antes solo existía el primero, porque `@testing-library/react` no estaba
 * instalado y los agentes tenían prohibido añadir dependencias. La consecuencia
 * fue que toda la lógica se extrajo a módulos puros —lo cual está bien— pero el
 * JSX que los une quedó sin probar: exactamente donde vive un `aria-labelledby`
 * que apunta a un id inexistente o un foco que se cae al `<body>`.
 *
 * Los e2e son de Playwright y se excluyen aquí: si se colaran, arrancarían un
 * navegador dentro de la suite unitaria.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Sin esto, el JSX de los .test.tsx se compila al transform clasico y falla
  // con `React is not defined`: Next usa el runtime automatico y aqui no hay
  // configuracion de Next que lo aporte.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["./vitest.setup.ts"],
    environmentMatchGlobs: [
      ["src/**/*.test.tsx", "jsdom"],
      ["src/**/*.test.ts", "node"],
    ],
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
