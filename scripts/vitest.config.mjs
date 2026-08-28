// Vitest para los scripts de integración de `scripts/`.
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
//
// `scripts/` no es un paquete del workspace, así que no lo recoge `turbo run
// test`. Se lanza desde la raíz con `pnpm test:scripts`.
//
// `pool: "forks"` porque estas pruebas lanzan el script real como subproceso.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
    environment: "node",
    pool: "forks",
    testTimeout: 30_000,
  },
});
