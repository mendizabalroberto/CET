/**
 * E2E — la landing carga y cumple lo que promete.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { expect, test } from "@playwright/test";

test.describe("landing pública", () => {
  test("carga, muestra las seis materias y el aviso de copyright", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Las seis materias del producto (MASTER_PLAN §5, Hito 4).
    for (const subject of ["Mathematics", "Science", "English", "Español", "Social Studies", "ICT"]) {
      await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
    }

    // Requisito explícito de MASTER_PLAN §9.
    await expect(
      page.getByText("© 2026 Roberto Mendizabal. Todos los derechos reservados.").first(),
    ).toBeVisible();
  });

  test("los enlaces legales llevan a páginas reales", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Privacy|Privacidad/);
    // Contenido de verdad, no relleno.
    await expect(page.getByText(/row level security|seguridad a nivel de fila/i)).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Terms|Términos/);
  });

  test("emite las cabeceras de seguridad", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=");

    // La CSP tiene que existir Y ser real: nonce presente y sin
    // `unsafe-inline` en `script-src`.
    const csp = headers["content-security-policy"];
    expect(csp).toBeTruthy();
    if (csp === undefined) throw new Error("sin Content-Security-Policy");
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  test("el enlace de salto al contenido es accesible por teclado", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Skip to main content|Saltar al contenido/ })).toBeFocused();
  });
});
