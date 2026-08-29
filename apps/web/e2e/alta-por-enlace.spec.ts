/**
 * E2E — la cadena de invitación completa, de punta a punta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE FICHERO EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La cadena tiene cinco eslabones —invitar, darse de alta, crear al hijo,
 * generar su enlace, canjearlo— y cada uno tiene sus propias pruebas. Ninguna
 * de ellas puede fallar por el motivo que más miedo da: que los eslabones no
 * encajen entre sí. Un token que se genera con un formato y se busca con otro,
 * una cookie que se escribe en un sitio y se lee en otro, una redirección que
 * falta. Esta es la única prueba capaz de ver eso.
 *
 * Es UN SOLO `test()` y no ocho, a propósito: cada tramo consume lo que produjo
 * el anterior. Un enlace de hijo no existe hasta que un tutor existe, y el tutor
 * no existe hasta que alguien le invitó. Partirlo en ocho tests independientes
 * obligaría a sembrar a mano el estado intermedio, que es exactamente lo que
 * esta prueba existe para NO hacer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESCRIBE DATOS DE VERDAD. LÉASE ANTES DE EJECUTARLA
 * ─────────────────────────────────────────────────────────────────────────────
 * No hay base de datos de pruebas en este proyecto, así que esta prueba crea un
 * tutor, un menor y un dispositivo REALES en la base a la que apunte el
 * servidor. Por eso:
 *
 *   · No se ejecuta sola. Exige `CET_E2E_ALTA=1` además de las credenciales del
 *     superadmin. Un `pnpm test:e2e` distraído no debe dar de alta a nadie.
 *   · Todo lo que crea es reconocible de un vistazo: el correo del tutor lleva
 *     el dominio `@cet-e2e.invalid` y el nombre del menor empieza por `E2E`.
 *   · Solo corre en `chromium`. Con los dos proyectos del config, `mobile`
 *     repetiría el alta entera.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VARIABLES DE ENTORNO
 * ─────────────────────────────────────────────────────────────────────────────
 *   CET_E2E_ALTA=1              consentimiento explícito para escribir datos
 *   CET_E2E_ADMIN_EMAIL=...     superadmin, el único rol que puede invitar
 *   CET_E2E_ADMIN_PASSWORD=...
 *
 * Y el servidor bajo prueba necesita `SUPABASE_SERVICE_ROLE_KEY`: las acciones
 * de la cadena escriben en tablas que no tienen política RLS para nadie.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const EMAIL = process.env["CET_E2E_ADMIN_EMAIL"];
const PASSWORD = process.env["CET_E2E_ADMIN_PASSWORD"];
const CONSENTIDO = process.env["CET_E2E_ALTA"] === "1";

test.skip(
  !CONSENTIDO || EMAIL === undefined || PASSWORD === undefined,
  "la cadena de invitación crea datos reales: exige CET_E2E_ALTA=1 y las credenciales del superadmin",
);

/** Cuatro cifras —Year 6 es primaria— y ninguna de las que `esPinDebil` rechaza. */
const PIN = "2846";

/** El saludo del canje usa solo el nombre de pila, así que el de pila es el que se comprueba. */
const NOMBRE_PILA = "E2E";
const NOMBRE_HIJO = `${NOMBRE_PILA} Enlace ${Date.now()}`;

/**
 * Saca la URL de un enlace de la pantalla que lo enseña UNA vez.
 *
 * Se localiza por su TEXTO y no por su clase CSS: `font-mono` es una decisión
 * de estilo y puede cambiar mañana sin que nadie se acuerde de esta prueba;
 * que el enlace contenga su propia ruta, no.
 */
async function urlEnPantalla(page: Page, ruta: RegExp): Promise<string> {
  const parrafo = page.getByText(ruta).first();
  await expect(parrafo).toBeVisible();
  const url = ((await parrafo.textContent()) ?? "").trim();
  expect(url, "el enlace tiene que ser una URL absoluta").toMatch(/^https?:\/\//);
  return url;
}

/**
 * Deja el contexto como el navegador del día siguiente: sin sesión de Supabase
 * y CON la cookie del dispositivo.
 *
 * Lo que se prueba es que `cet_device` basta para IDENTIFICAR y el PIN para
 * ENTRAR. Si se conservara la sesión, la prueba pasaría sin que la cookie de
 * dispositivo hiciera absolutamente nada — el falso verde más caro posible.
 */
async function soloRecuerdaElDispositivo(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  const device = cookies.filter((c) => c.name === "cet_device");
  expect(device, "sin la cookie cet_device no hay nada que probar en este tramo").toHaveLength(1);
  await context.clearCookies();
  await context.addCookies(device);
}

/**
 * El saludo por el nombre de pila, en los dos idiomas.
 *
 * La aplicacion resuelve el idioma por `profiles.locale`, que gana a la cookie
 * y a la cabecera `Accept-Language` (`lib/i18n/server.ts`). Es decir: el idioma
 * de estas pantallas lo decide la CUENTA que las mira, no el navegador de la
 * prueba. Fijar `locale: "en-GB"` en el config no cambia nada en cuanto hay
 * sesion, asi que los selectores van en los dos idiomas — como ya lo estaban
 * los de `login.spec.ts` y `staff-session.spec.ts`.
 */
function saludo(): RegExp {
  return new RegExp(`(Hi|Hola), ${NOMBRE_PILA}`);
}

/**
 * Escribe un PIN en el input segmentado que lleva esa etiqueta.
 *
 * Las casillas viven dentro de un `<fieldset>` con `<legend>`, que es un grupo
 * con nombre accesible, y se buscan por ahí y no por un `data-testid`: si un
 * día el grupo perdiera su etiqueta esta prueba tiene que fallar, porque un
 * niño con lector de pantalla se habría quedado sin saber qué está rellenando.
 */
async function escribirPin(page: Page, etiqueta: RegExp, pin: string): Promise<void> {
  const casillas = page
    .getByRole("group", { name: etiqueta })
    .locator('input[autocomplete="one-time-code"]');
  await expect(casillas).toHaveCount(pin.length);
  for (let i = 0; i < pin.length; i += 1) {
    await casillas.nth(i).fill(pin[i]!);
  }
}

test("la cadena de invitación: superadmin → tutor → hijo → enlace → dispositivo", async ({
  browser,
}, testInfo) => {
  // Un solo navegador: `mobile` daría de alta a un segundo tutor y a un
  // segundo menor por cada ejecución.
  test.skip(testInfo.project.name !== "chromium", "el alta se ejecuta una sola vez, en chromium");
  test.setTimeout(240_000);

  const correoDelTutor = `e2e-alta-${Date.now()}@cet-e2e.invalid`;

  // Tres navegadores distintos porque son tres personas distintas. Con uno
  // solo, la sesión del tutor le abriría al niño puertas que en la vida real
  // no tiene, y el tramo 6 no probaría nada.
  const admin = await browser.newContext();
  const tutor = await browser.newContext();
  const nino = await browser.newContext();

  try {
    /* ───────────────────────────────────────────────────────────────────────
     * 1 · El superadmin invita a un tutor
     * ─────────────────────────────────────────────────────────────────────── */
    const paginaAdmin = await admin.newPage();
    await paginaAdmin.goto("/login/staff");
    await paginaAdmin.getByLabel(/Email address|Correo/i).fill(EMAIL!);
    await paginaAdmin.getByLabel(/Password|Contraseña/i).fill(PASSWORD!);
    await paginaAdmin.getByRole("button", { name: /^Sign in$|Entrar/i }).click();
    await paginaAdmin.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    await paginaAdmin.goto("/admin");
    await paginaAdmin.getByLabel(/Their email address|Su dirección de correo/i).fill(correoDelTutor);
    await paginaAdmin.getByRole("button", { name: /Create invitation|Crear invitación/i }).click();

    const enlaceDelTutor = await urlEnPantalla(paginaAdmin, /\/register\?t=/);

    // El aviso va PEGADO al enlace: quien cierre esta pantalla sin copiarlo
    // tiene que crear otro, y tiene que enterarse antes de decidir.
    await expect(paginaAdmin.getByText(/will not be shown again|no se volverá a mostrar/i)).toBeVisible();

    /* ───────────────────────────────────────────────────────────────────────
     * 2 · El tutor abre su enlace y se da de alta
     *
     * El correo aparece FIJO. No es cosmética: el servidor usa el correo de la
     * fila de `guardian_invites` e ignora lo que llegue en el formulario, así
     * que un enlace reenviado por error no le fabrica una cuenta a quien lo
     * reenvió. Que el campo no se pueda editar hace visible esa decisión.
     * ─────────────────────────────────────────────────────────────────────── */
    const paginaTutor = await tutor.newPage();
    await paginaTutor.goto(enlaceDelTutor);

    const campoCorreo = paginaTutor.getByLabel(/Your email|Tu correo/i);
    await expect(campoCorreo).toHaveValue(correoDelTutor);
    await expect(campoCorreo).toHaveAttribute("readonly", "");

    await paginaTutor.getByLabel(/Your name|Tu nombre/i).fill("E2E Tutor");
    await paginaTutor.getByLabel(/Choose a password|Elige una contraseña/i).fill("cadena-de-invitacion-e2e");
    await paginaTutor.getByRole("button", { name: /Create account|Crear cuenta/i }).click();

    // Entra con la contraseña que acaba de elegir: pedírsela otra vez dos
    // segundos después no aporta seguridad y sí una vía de abandono.
    await paginaTutor.waitForURL(/\/tutor$/, { timeout: 30_000 });

    /* ───────────────────────────────────────────────────────────────────────
     * 3 · Crea un hijo
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaTutor.getByLabel(/Their full name|Su nombre completo/i).fill(NOMBRE_HIJO);
    await paginaTutor.getByLabel(/Date of birth|Fecha de nacimiento/i).fill("2015-05-04");
    await paginaTutor.getByLabel(/^Year$|^Curso$/i).selectOption("6");
    await paginaTutor.getByRole("button", { name: /^Add$|^Añadir$/i }).click();

    const fichaDelHijo = paginaTutor.getByRole("link", { name: new RegExp(NOMBRE_HIJO) });
    await expect(fichaDelHijo).toBeVisible({ timeout: 20_000 });

    // «Aprende en casa» y no «sin colegio»: un hijo dado de alta por su padre
    // no pertenece a ningún centro, y eso no es una carencia.
    await expect(fichaDelHijo).toContainText(/Learning at home|Aprende en casa/i);

    await fichaDelHijo.click();
    await paginaTutor.waitForURL(/\/tutor\/hijos\//, { timeout: 20_000 });

    /* ───────────────────────────────────────────────────────────────────────
     * 4 · Genera el enlace del hijo
     * ─────────────────────────────────────────────────────────────────────── */
    await expect(paginaTutor.getByText(/None yet|Ninguno todavía/i)).toBeVisible();
    await paginaTutor.getByRole("button", { name: /Create link|Crear enlace/i }).click();

    const enlaceDelHijo = await urlEnPantalla(paginaTutor, /\/e\//);

    /* ───────────────────────────────────────────────────────────────────────
     * 5 · El hijo abre su enlace, elige PIN y entra
     * ─────────────────────────────────────────────────────────────────────── */
    const paginaNino = await nino.newPage();
    await paginaNino.goto(enlaceDelHijo);

    // El enlace ya dice quién es: no hay colegio que elegir ni código que
    // teclear. Y el saludo lleva solo el nombre de pila.
    await expect(paginaNino.getByText(saludo())).toBeVisible();

    await escribirPin(paginaNino, /Your new PIN|Tu PIN nuevo/i, PIN);
    await escribirPin(paginaNino, /Type it again|Escríbelo otra vez/i, PIN);
    await paginaNino.getByRole("button", { name: /That.s my PIN|Este es mi PIN/i }).click();

    // Y adentro. Sin esa redirección el niño se quedaría en la página del
    // enlace, que acaba de consumirse, leyendo «este enlace ya no vale»: el
    // peor final posible para el único paso que sí le salió bien.
    await paginaNino.waitForURL(/\/learn/, { timeout: 30_000 });

    /* ───────────────────────────────────────────────────────────────────────
     * 6 · Segunda visita: solo el PIN
     * ─────────────────────────────────────────────────────────────────────── */
    await soloRecuerdaElDispositivo(nino);
    await paginaNino.goto("/login/student");

    await expect(paginaNino.getByText(saludo())).toBeVisible();
    // Ni colegio ni código. Si quedara el desplegable, el atajo no existe.
    await expect(paginaNino.getByRole("combobox")).toHaveCount(0);
    await expect(paginaNino.getByText(/Step 1 of 3|Paso 1 de 3/i)).toHaveCount(0);

    await escribirPin(paginaNino, /Enter your PIN|Escribe tu PIN/i, PIN);
    await paginaNino.getByRole("button", { name: /^Sign in$|^Entrar$/i }).click();
    await paginaNino.waitForURL(/\/learn/, { timeout: 30_000 });

    /* ───────────────────────────────────────────────────────────────────────
     * 7 · El enlace ya no vale
     *
     * Y el mensaje es el mismo para caducado, ya usado e inexistente:
     * distinguirlos convertiría esta página en un oráculo sobre qué tokens
     * llegaron a existir alguna vez.
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaNino.goto(enlaceDelHijo);
    await expect(paginaNino.getByText(/doesn.t work any more|ya no vale/i)).toBeVisible();

    /* ───────────────────────────────────────────────────────────────────────
     * 8 · El tutor olvida el dispositivo, y el atajo desaparece
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaTutor.reload();
    await expect(paginaTutor.getByText(/None yet|Ninguno todavía/i)).toHaveCount(0);
    await paginaTutor.getByRole("button", { name: /Forget this device|Olvidar este aparato/i }).click();
    await expect(paginaTutor.getByText(/None yet|Ninguno todavía/i)).toBeVisible({ timeout: 20_000 });

    await soloRecuerdaElDispositivo(nino);
    await paginaNino.goto("/login/student");

    // Vuelta al recorrido de siempre: colegio, código y PIN. Un dispositivo
    // anulado no es un error que explicarle a un niño de diez años; es, sin
    // más, un dispositivo que ya no le conoce.
    await expect(paginaNino.getByRole("combobox")).toBeVisible();
    await expect(paginaNino.getByText(/Step 1 of 3|Paso 1 de 3/i)).toBeVisible();
    await expect(paginaNino.getByText(saludo())).toHaveCount(0);
  } finally {
    // Se cierran pase lo que pase: un contexto abierto deja el navegador vivo
    // y la suite colgada.
    await admin.close();
    await tutor.close();
    await nino.close();
  }
});
