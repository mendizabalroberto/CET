/**
 * E2E — el flujo de login se puede recorrer.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * No se autentica de verdad: eso exige datos sembrados y la Edge Function
 * `auth-pin`, que entrega otra vía. Aquí se verifica que el camino existe, que
 * los pasos avanzan y —lo más importante— que las áreas privilegiadas
 * responden 404 y no 403 a un anónimo.
 */
import { expect, test } from "@playwright/test";

test.describe("flujo de login", () => {
  test("el selector de rol ofrece alumno y personal", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /I am a student|Soy alumno/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /teacher or administrator|profesor o administrador/ })).toBeVisible();
  });

  test("el alumno recorre colegio → código → PIN", async ({ page }) => {
    await page.goto("/login/student");

    // Paso 1: hasta que no se elige colegio, no se puede continuar.
    const continueButton = page.getByRole("button", { name: /Continue|Continuar/ });
    await expect(continueButton).toBeDisabled();

    const schoolSelect = page.getByRole("combobox");
    const optionCount = await schoolSelect.locator("option").count();

    // Sin colegios sembrados, el paso 1 no puede completarse: se comprueba lo
    // que sí es verificable en un entorno vacío y se deja constancia.
    test.skip(optionCount <= 1, "no hay colegios activos en este entorno");

    await schoolSelect.selectOption({ index: 1 });
    await continueButton.click();

    // Paso 2: código de alumno.
    await page.getByRole("textbox").fill("Y6A-014");
    await page.getByRole("button", { name: /Continue|Continuar/ }).click();

    // Paso 3: input segmentado de PIN, con una casilla por dígito.
    const digits = page.locator('input[autocomplete="one-time-code"]');
    await expect(digits.first()).toBeVisible();
    expect(await digits.count()).toBeGreaterThanOrEqual(4);

    // Escribir en la primera casilla mueve el foco a la segunda: es lo que
    // hace usable el input para un niño.
    await digits.first().fill("1");
    await expect(digits.nth(1)).toBeFocused();
  });

  test("el login de personal pide email y contraseña", async ({ page }) => {
    await page.goto("/login/staff");
    await expect(page.getByLabel(/Email address|Correo electrónico/)).toBeVisible();
    await expect(page.getByLabel(/Password|Contraseña/)).toBeVisible();
  });

  test("un anónimo recibe 404 en /admin, no 403", async ({ page }) => {
    const response = await page.goto("/admin");
    // 403 confirmaría que la ruta existe. 404 no dice nada.
    expect(response?.status()).toBe(404);
  });

  test("un anónimo es redirigido al login desde /learn", async ({ page }) => {
    await page.goto("/learn");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/register sin invitación no enseña ningún formulario", async ({ page }) => {
    // Esta página ERA una solicitud de acceso que un administrador aprobaba.
    // Desde la cadena de invitación, nadie entra en CET sin que alguien le
    // haya dado un enlace: sin `?t=` válido no hay campo deshabilitado ni
    // aviso al pie, no hay DONDE ESCRIBIR. Eso es lo que se comprueba.
    await page.goto("/register");
    await expect(
      page.getByText(/invitation only|se entra por invitación/i),
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});
