/**
 * Recorrido de un miembro del personal CON SESIÓN.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTE FICHERO EXISTE PARA ATRAPAR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un superadmin inició sesión correctamente y su propio panel le devolvió un
 * 404. El middleware de borde decidía leyendo un claim `cet_role` del JWT que
 * nunca se había implementado: el rol llegaba nulo y se denegaba por ignorancia.
 *
 * Ninguna prueba lo vio. Había 976 tests unitarios, 46 e2e y un despliegue
 * verde. Pero TODOS los e2e eran anónimos: comprobaban que `/admin` devuelve 404
 * sin sesión —que es lo correcto— y nadie comprobaba que devuelve la página CON
 * sesión. El agujero no estaba en la lógica, estaba en el catálogo de casos.
 *
 * De ahí que estas pruebas hagan login de verdad, contra la base de datos de
 * verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CREDENCIALES
 * ─────────────────────────────────────────────────────────────────────────────
 * Se leen del entorno y NUNCA se escriben en el repositorio. Si faltan, el
 * fichero entero se salta: en un fork o en un CI sin secretos no debe fallar,
 * debe decir que no puede comprobarlo.
 *
 *   CET_E2E_ADMIN_EMAIL=...
 *   CET_E2E_ADMIN_PASSWORD=...
 */
import { expect, test } from "@playwright/test";

const EMAIL = process.env["CET_E2E_ADMIN_EMAIL"];
const PASSWORD = process.env["CET_E2E_ADMIN_PASSWORD"];

test.skip(
  EMAIL === undefined || PASSWORD === undefined,
  "faltan CET_E2E_ADMIN_EMAIL / CET_E2E_ADMIN_PASSWORD: no se puede probar con sesión",
);

/** Inicia sesión por la interfaz, como lo haría una persona. */
async function iniciarSesion(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login/staff");
  await page.getByLabel(/Email|Correo/i).fill(EMAIL!);
  await page.getByLabel(/Password|Contraseña/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /Sign in|Entrar|Iniciar/i }).click();
  // La redirección posterior al login es la que fallaba.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/**
 * EN SERIE, y no por comodidad.
 *
 * Con los 8 workers por defecto, las seis pruebas inician sesion a la vez como
 * el MISMO usuario y desde la misma IP, y disparan el limitador de intentos de
 * login. Los tests fallaban y el producto estaba haciendo justo lo que debe:
 * diez intentos por minuto y a la calle.
 *
 * Bajar el limite o exceptuar al entorno de pruebas seria debilitar una defensa
 * real para que un test verde mienta. La alternativa correcta es no pedirle a la
 * aplicacion algo que ningun usuario real hace: seis logins simultaneos de la
 * misma persona.
 */
test.describe.configure({ mode: "serial" });

test.describe("personal con sesión", () => {
  test("tras iniciar sesión NO acaba en un 404", async ({ page }) => {
    await iniciarSesion(page);

    // El sintoma exacto que se reporto: se entra bien y la pagina de destino
    // dice "We could not find that page".
    await expect(page.locator("body")).not.toContainText(/could not find that page/i);
    await expect(page.locator("body")).not.toContainText(/no hemos encontrado esa página/i);
  });

  test("un superadmin alcanza /admin", async ({ page }) => {
    await iniciarSesion(page);

    const response = await page.goto("/admin");
    expect(response?.status(), "un superadmin no puede recibir 404 en su propio panel").toBe(200);
  });

  test("un superadmin alcanza /teach", async ({ page }) => {
    await iniciarSesion(page);

    const response = await page.goto("/teach");
    expect(response?.status()).toBe(200);
  });

  test("el personal NO entra en las áreas de alumno", async ({ page }) => {
    await iniciarSesion(page);

    // No es 404: no hay nada que ocultarle a un profesor sobre /learn. Se le
    // manda a su sitio, que es lo util.
    await page.goto("/learn");
    await expect(page).not.toHaveURL(/\/learn/);
  });

  test("cerrar sesión devuelve al estado anónimo", async ({ page }) => {
    await iniciarSesion(page);
    await page.goto("/logout");

    const response = await page.goto("/admin");
    expect(response?.status(), "tras cerrar sesión, /admin vuelve a ser 404").toBe(404);
  });

  test("la sesión no filtra la clave de servicio al navegador", async ({ page }) => {
    await iniciarSesion(page);
    await page.goto("/admin");

    const html = await page.content();
    // `sb_secret_` es el prefijo de la clave service_role moderna. Si aparece en
    // el HTML, la RLS deja de existir para cualquiera que abra el inspector.
    expect(html).not.toContain("sb_secret_");
    expect(html).not.toContain("service_role");
  });
});
