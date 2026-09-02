/**
 * Playwright — solo `e2e/plan.spec.ts`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Config aparte y no un segundo proyecto dentro de `playwright.config.ts`
 * porque los proyectos de Playwright comparten `webServer`: no hay forma de
 * decirle a un proyecto "arranca la app con esta variable de entorno" y a
 * otro "con esta otra". `plan.spec.ts` necesita `DEEP_SEEK_URL` apuntando al
 * mock de `mock-deepseek.mjs` y el resto de la suite necesita precisamente
 * que esa variable NO exista, para no enmascarar un error de producción con
 * un mock que nadie pidió.
 *
 * Dos `webServer`: el mock de DeepSeek (puerto fijo, no descubierto — la app
 * necesita conocer la URL ANTES de arrancar, así que un puerto aleatorio
 * obligaría a una coreografía que un puerto fijo hace innecesaria) y `next
 * dev` de la propia app, con `DEEP_SEEK_URL` apuntando a ese puerto y
 * `DEEP_SEEK_API` a cualquier valor no vacío (el mock no comprueba la clave).
 *
 * `next dev` y no `next build && next start`: este fichero lo arranca quien
 * está iterando sobre el e2e, y un ciclo de `next build` de un minuto por
 * cada intento no es razonable. CI, si algún día corre este spec, puede
 * apuntar `PLAYWRIGHT_BASE_URL` a un servidor ya construido y este config
 * omite `webServer` igual que el general.
 *
 * `workers: 1`: igual que `staff-session.spec.ts`, el login del tutor y el
 * del superadmin comparten limitador de intentos; una ejecución en paralelo
 * de más de un test en este fichero lo dispara. `plan.spec.ts` es, además, UN
 * SOLO `test()`, así que esto es más una declaración de intención que un
 * cambio de comportamiento.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** Puerto fijo del mock de DeepSeek. No 3000 ni 3200 (reservados en este
 * entorno), y distinto del de la app para poder correr ambos a la vez. */
const MOCK_DEEPSEEK_PORT = Number(process.env.MOCK_DEEPSEEK_PORT ?? 3101);
const mockDeepSeekUrl = `http://127.0.0.1:${MOCK_DEEPSEEK_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/plan.spec.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "en-GB",
    extraHTTPHeaders: { "accept-language": "en-GB,en;q=0.9" },
  },

  // Un solo proyecto: la cadena de invitación ya solo corre en chromium en
  // alta-por-enlace.spec.ts, por el mismo motivo (no repetir el alta).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: [
          {
            command: `node e2e/mock-deepseek.mjs ${MOCK_DEEPSEEK_PORT}`,
            url: mockDeepSeekUrl,
            reuseExistingServer: !process.env.CI,
            timeout: 20_000,
          },
          {
            command: "pnpm dev",
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              PORT: String(PORT),
              DEEP_SEEK_URL: `${mockDeepSeekUrl}/chat/completions`,
              DEEP_SEEK_API: "e2e-mock",
            },
          },
        ],
      }),
});
