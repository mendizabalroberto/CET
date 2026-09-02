/**
 * Playwright — end-to-end.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Alcance del Hito 1: que la landing cargue y que el flujo de login se pueda
 * recorrer. Nada más — un e2e que dependiera de datos sembrados fallaría en
 * cada PR por motivos ajenos al cambio y acabaría desactivado, que es la peor
 * forma de tener tests.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // plan.spec.ts necesita el mock de DeepSeek y next dev con DEEP_SEEK_URL
  // apuntando a él: tiene su propio config (playwright.plan.config.ts) y su
  // propio script (`pnpm test:e2e:plan`). Aquí, contra `pnpm start` y sin ese
  // mock, llamaría a la DeepSeek real o fallaría por falta de clave.
  testIgnore: ["**/plan.spec.ts"],
  fullyParallel: true,
  // Un `test.only` olvidado en un PR haría pasar el CI sin ejecutar la suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // `exactOptionalPropertyTypes` prohibe pasar undefined explicito: en local se
  // omite la clave para que Playwright aplique su propio valor por defecto.
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // La app es bilingüe; se fija el idioma para que los selectores por texto
    // sean deterministas.
    locale: "en-GB",
    extraHTTPHeaders: { "accept-language": "en-GB,en;q=0.9" },
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Un alumno usa una tableta. Si el login no funciona en móvil, no funciona.
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],

  // Si PLAYWRIGHT_BASE_URL apunta a un servidor ya en marcha (preview de Vercel,
  // por ejemplo), la clave se OMITE en vez de valer undefined: con
  // `exactOptionalPropertyTypes`, `webServer: undefined` no es lo mismo que no
  // declarar webServer, y Playwright solo acepta lo segundo.
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "pnpm start",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
