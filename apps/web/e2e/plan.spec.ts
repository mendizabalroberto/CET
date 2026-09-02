/**
 * E2E — el plan de estudio de punta a punta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE FICHERO EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `docs/superpowers/plans/2026-09-02-plan-automatico-con-ia.md` (§2) pide el
 * flujo nuevo, de un solo clic tras subir: subir el PDF del boletín →
 * «Analizando el boletín…» → el plan sale solo (extracción, confirmación de
 * notas, propuesta y reparto encadenados en el servidor, sin que el tutor
 * confirme nada a mano) → editar (minutos/día) → borrar → crear otro →
 * corregir una nota y regenerar → el alumno ve `/learn/hoy` con tareas, con
 * la llamada a DeepSeek mockeada. Es la única prueba que ve la cadena
 * completa: extracción validada contra el texto real del PDF, propuesta con
 * la forma que `validarPropuesta` exige, reparto contra el catálogo publicado
 * de verdad, y las tareas resultantes llegando al alumno. Cualquier eslabón
 * roto por separado (un `validarExtraccion` que ya no reconoce una materia,
 * un `repartir` que deja de generar tareas para Year 6) puede seguir en verde
 * en Vitest y romper esta cadena igual.
 *
 * Es UN SOLO `test()`, por el mismo motivo que `alta-por-enlace.spec.ts`: cada
 * tramo consume lo que dejó el anterior — no hay plan que editar o borrar sin
 * haberlo creado, ni nota que corregir sin un boletín ya leído.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL MOCK DE DEEPSEEK, POR URL
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/web/src/lib/plan/deepseek.ts` no tiene una bandera "modo test": la URL
 * sale de `DEEP_SEEK_URL` (por defecto, la real). Este fichero corre bajo
 * `playwright.plan.config.ts`, que arranca DOS servidores — el mock
 * (`e2e/mock-deepseek.mjs`, puerto fijo) y `next dev` con `DEEP_SEEK_URL`
 * apuntando a él — y no bajo `playwright.config.ts`, que no define esa
 * variable. Correr este fichero con el config general llamaría a la DeepSeek
 * real sin clave y fallaría con `DeepSeekError("sin_clave")`; por eso
 * `playwright.config.ts` lo excluye con `testIgnore`.
 *
 * El mock devuelve las mismas seis materias, carácter a carácter, que
 * `apps/web/e2e/__fixtures__/generar-boletin-e2e-pdf.mjs` escribe en el PDF:
 * `validarExtraccion` exige que cada `materia` que el modelo inventa aparezca
 * literal en el texto extraído, y un desajuste entre ambos ficheros hace que
 * este e2e falle en el paso de «Leer el boletín» con un mensaje que apunta
 * exactamente ahí.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESCRIBE DATOS DE VERDAD, Y CONTRA EL CATÁLOGO DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────
 * Igual que `alta-por-enlace.spec.ts`: crea un tutor, un menor y un
 * dispositivo REALES en la base a la que apunte el servidor. Además, el hijo
 * se da de alta en Year 6 a propósito — `inventarioDeContenido()` (§`lib/plan/
 * consultas.ts`) filtra el catálogo publicado a `year_level = 6`, así que sin
 * Year 6 no hay contenido con el que `repartir()` pueda construir una sola
 * tarea, y el plan saldría vacío (`planSinContenido`) sin que hubiera nada mal
 * en el código bajo prueba.
 *
 *   · No se ejecuta sola. Exige `CET_E2E_ALTA=1` además de las credenciales
 *     del superadmin — las mismas variables que `alta-por-enlace.spec.ts`.
 *   · El correo del tutor lleva el dominio `@cet-e2e.invalid` y el nombre del
 *     menor empieza por `E2E`, igual que allí.
 *   · Solo corre en `chromium` (el único proyecto de este config).
 *   · No hay mecanismo de limpieza en este repositorio para estos datos de
 *     prueba (tampoco lo hay en `alta-por-enlace.spec.ts`): el tutor, el
 *     menor, su boletín y sus planes quedan en la base. Es una decisión ya
 *     tomada por ese fichero, no una nueva.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VARIABLES DE ENTORNO
 * ─────────────────────────────────────────────────────────────────────────────
 *   CET_E2E_ALTA=1              consentimiento explícito para escribir datos
 *   CET_E2E_ADMIN_EMAIL=...     superadmin, el único rol que puede invitar
 *   CET_E2E_ADMIN_PASSWORD=...
 *
 * Y el servidor bajo prueba necesita `SUPABASE_SERVICE_ROLE_KEY` (las
 * acciones del plan escalan a `service_role` para Storage, `boletines` y
 * `planes_de_estudio`) y `DEEP_SEEK_URL`/`DEEP_SEEK_API`, que pone
 * `playwright.plan.config.ts` — no hace falta exportarlas a mano.
 */
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const EMAIL = process.env["CET_E2E_ADMIN_EMAIL"];
const PASSWORD = process.env["CET_E2E_ADMIN_PASSWORD"];
const CONSENTIDO = process.env["CET_E2E_ALTA"] === "1";

test.skip(
  !CONSENTIDO || EMAIL === undefined || PASSWORD === undefined,
  "el plan de estudio crea datos reales: exige CET_E2E_ALTA=1 y las credenciales del superadmin",
);

/** Cuatro cifras —Year 6 es primaria— y ninguna de las que `esPinDebil` rechaza. */
const PIN = "3179";

const NOMBRE_PILA = "E2E";
const NOMBRE_HIJO = `${NOMBRE_PILA} Plan ${Date.now()}`;

const FIXTURE_PDF = fileURLToPath(new URL("./__fixtures__/boletin-e2e.pdf", import.meta.url));

/** Ver `alta-por-enlace.spec.ts`: localiza un enlace de un solo uso por su
 * texto (una URL propia), no por su clase CSS. */
async function urlEnPantalla(page: Page, ruta: RegExp): Promise<string> {
  const parrafo = page.getByText(ruta).first();
  await expect(parrafo).toBeVisible();
  const url = ((await parrafo.textContent()) ?? "").trim();
  expect(url, "el enlace tiene que ser una URL absoluta").toMatch(/^https?:\/\//);
  return url;
}

/** Ver `alta-por-enlace.spec.ts`: escribe un PIN en el input segmentado con
 * esa etiqueta accesible. */
async function escribirPin(page: Page, etiqueta: RegExp, pin: string): Promise<void> {
  const casillas = page
    .getByRole("group", { name: etiqueta })
    .locator('input[autocomplete="one-time-code"]');
  await expect(casillas).toHaveCount(pin.length);
  for (let i = 0; i < pin.length; i += 1) {
    await casillas.nth(i).fill(pin[i]!);
  }
}

test("el plan de estudio: boletín → notas → propuesta → plan → cancelar → recrear → «Hoy» del alumno", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "un solo tutor y un solo menor: se ejecuta una vez");
  test.setTimeout(300_000);

  const correoDelTutor = `e2e-plan-${Date.now()}@cet-e2e.invalid`;

  const admin: BrowserContext = await browser.newContext();
  const tutor: BrowserContext = await browser.newContext();
  const nino: BrowserContext = await browser.newContext();

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

    /* ───────────────────────────────────────────────────────────────────────
     * 2 · El tutor se da de alta y crea un hijo en Year 6
     *
     * Year 6 no es un dato cualquiera del formulario: es el curso que
     * `inventarioDeContenido()` exige para que exista contenido con el que
     * construir el plan. Ver la cabecera del fichero.
     * ─────────────────────────────────────────────────────────────────────── */
    const paginaTutor = await tutor.newPage();
    await paginaTutor.goto(enlaceDelTutor);

    await paginaTutor.getByLabel(/Your name|Tu nombre/i).fill("E2E Tutor del Plan");
    await paginaTutor.getByLabel(/Choose a password|Elige una contraseña/i).fill("plan-de-estudio-e2e");
    await paginaTutor.getByRole("button", { name: /Create account|Crear cuenta/i }).click();
    await paginaTutor.waitForURL(/\/tutor$/, { timeout: 30_000 });

    await paginaTutor.getByLabel(/Their full name|Su nombre completo/i).fill(NOMBRE_HIJO);
    await paginaTutor.getByLabel(/Date of birth|Fecha de nacimiento/i).fill("2015-05-04");
    await paginaTutor.getByLabel(/^Year$|^Curso$/i).selectOption("6");
    await paginaTutor.getByRole("button", { name: /^Add$|^Añadir$/i }).click();

    const fichaDelHijo = paginaTutor.getByRole("link", { name: new RegExp(NOMBRE_HIJO) });
    await expect(fichaDelHijo).toBeVisible({ timeout: 20_000 });
    await fichaDelHijo.click();
    await paginaTutor.waitForURL(/\/tutor\/hijos\//, { timeout: 20_000 });

    /* ───────────────────────────────────────────────────────────────────────
     * 3 · «Su plan»: sube el boletín y el plan sale solo
     *
     * `generarPlan` (§3 del plan) encadena servidor: sube+extrae → confirma
     * → propone → fija, todo tras un único clic. No hay paso de «confirmar
     * las notas» que pulsar en el camino feliz.
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaTutor.getByRole("link", { name: /^Their plan$|^Su plan$/ }).click();
    await paginaTutor.waitForURL(/\/plan$/, { timeout: 20_000 });

    await expect(
      paginaTutor.getByRole("heading", { name: /The report card|El boletín/i }),
    ).toBeVisible();
    await paginaTutor.locator('input[type="file"][name="archivo"]').setInputFiles(FIXTURE_PDF);
    await paginaTutor
      .getByRole("button", { name: /Generate the plan with AI|Generar el plan con IA/i })
      .click();

    // «Analizando el boletín…» es el estado intermedio mientras el servidor
    // hace las dos llamadas a DeepSeek (mockeadas) y fija el plan: con el
    // mock puede resolverse antes de que Playwright llegue a comprobarlo, así
    // que no se afirma su visibilidad (sería un `toBeVisible` que a veces
    // encuentra el nodo ya desmontado y falla sin que nada esté roto). Lo que
    // importa —y sí se comprueba— es el estado final.
    await expect(
      paginaTutor.getByRole("heading", { name: /Current plan|Plan actual/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(paginaTutor.getByText(/\d+ tasks|\d+ tareas/)).toBeVisible();

    // Las notas quedan a la vista en «Lo que hemos leído»: las seis materias
    // del mock, todas planificables. Si alguna no mapeara a un
    // `CodigoMateria` (mapearMateria en boletin.ts) aparecería «Not planned»
    // a su lado, señal de que el mock y el mapa de sinónimos se han
    // desincronizado.
    await expect(
      paginaTutor.getByRole("heading", { name: /What we read|Lo que hemos leído/i }),
    ).toBeVisible();
    await expect(paginaTutor.getByText("Not planned", { exact: false })).toHaveCount(0);
    await expect(paginaTutor.getByText("No se planifica", { exact: false })).toHaveCount(0);

    /* ───────────────────────────────────────────────────────────────────────
     * 4 · Edita el plan: sube los minutos/día a 45 y los guarda
     *
     * Se recarga tras guardar a propósito: `PlanDeEstudio` guarda el
     * resultado de cada `useActionState` en el propio componente, así que sin
     * recargar seguiría mostrando el estado que dejó el último clic. La
     * fuente de verdad es lo que el servidor devuelve tras `revalidatePath`.
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaTutor.getByRole("button", { name: /Edit the plan|Editar el plan/i }).click();
    await paginaTutor.getByLabel(/Minutes a day|Minutos al día/i).fill("45");
    await paginaTutor.getByRole("button", { name: /Save changes|Guardar cambios/i }).click();
    await expect(
      paginaTutor.getByText(/Changes saved|Cambios guardados/i),
    ).toBeVisible({ timeout: 20_000 });

    await paginaTutor.reload();
    await expect(
      paginaTutor.getByRole("heading", { name: /Current plan|Plan actual/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(paginaTutor.getByText("45 min", { exact: false })).toBeVisible();

    /* ───────────────────────────────────────────────────────────────────────
     * 5 · Borra el plan, crea otro, y corrige una nota para regenerarlo
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaTutor.reload();
    await expect(
      paginaTutor.getByRole("heading", { name: /Current plan|Plan actual/i }),
    ).toBeVisible({ timeout: 20_000 });

    await paginaTutor.getByRole("button", { name: /Delete this plan|Borrar este plan/i }).click();
    await paginaTutor.getByRole("button", { name: /Yes, delete|Sí, borrar/i }).click();
    await expect(
      paginaTutor.getByText(/won.t have tasks from this plan|ya no tendrá tareas de este plan/i),
    ).toBeVisible({ timeout: 20_000 });

    await paginaTutor.reload();
    await expect(
      paginaTutor.getByRole("heading", { name: /No plan yet|Todavía no hay plan/i }),
    ).toBeVisible({ timeout: 20_000 });
    // El boletín confirmado sigue ahí: borrar el plan no lo descarta, así que
    // «Generar otro plan» funciona sin volver a subir nada.
    const botonGenerarOtro = paginaTutor.getByRole("button", {
      name: /Generate another plan|Generar otro plan/i,
    });
    await expect(botonGenerarOtro).toBeVisible();
    await botonGenerarOtro.click();
    await expect(
      paginaTutor.getByRole("heading", { name: /Current plan|Plan actual/i }),
    ).toBeVisible({ timeout: 60_000 });

    // Corrige la primera nota de «Lo que hemos leído» y regenera: el
    // servidor guarda la nota, re-banda, confirma, propone y vuelve a fijar
    // el plan con el reparto recalculado.
    await paginaTutor
      .getByRole("heading", { name: /What we read|Lo que hemos leído/i })
      .scrollIntoViewIfNeeded();
    await paginaTutor.locator('input[name="nota:0"]').fill("60");
    await paginaTutor
      .getByRole("button", { name: /Save grades and regenerate the plan|Guardar notas y regenerar el plan/i })
      .click();
    await expect(
      paginaTutor.getByText(/Plan created by the assistant|Plan creado por el asistente/i),
    ).toBeVisible({ timeout: 60_000 });

    await paginaTutor.reload();
    await expect(
      paginaTutor.getByRole("heading", { name: /Current plan|Plan actual/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(paginaTutor.locator('input[name="nota:0"]')).toHaveValue("60");

    /* ───────────────────────────────────────────────────────────────────────
     * 6 · Genera el enlace del hijo y lo canjea
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaTutor.goto(paginaTutor.url().replace(/\/plan$/, ""));
    await expect(paginaTutor.getByText(/None yet|Ninguno todavía/i)).toBeVisible();
    await paginaTutor.getByRole("button", { name: /Create link|Crear enlace/i }).click();
    const enlaceDelHijo = await urlEnPantalla(paginaTutor, /\/e\//);

    const paginaNino = await nino.newPage();
    await paginaNino.goto(enlaceDelHijo);
    await expect(paginaNino.getByText(new RegExp(`(Hi|Hola), ${NOMBRE_PILA}`))).toBeVisible();

    await escribirPin(paginaNino, /Your new PIN|Tu PIN nuevo/i, PIN);
    await escribirPin(paginaNino, /Type it again|Escríbelo otra vez/i, PIN);
    await paginaNino.getByRole("button", { name: /That.s my PIN|Este es mi PIN/i }).click();
    await paginaNino.waitForURL(/\/learn/, { timeout: 30_000 });

    /* ───────────────────────────────────────────────────────────────────────
     * 7 · «Hoy»: el alumno ve las tareas de su plan
     * ─────────────────────────────────────────────────────────────────────── */
    await paginaNino.goto("/learn/hoy");
    await expect(
      paginaNino.getByRole("heading", { name: /^Your day$|^Tu día$/ }),
    ).toBeVisible({ timeout: 20_000 });

    // Ni «sin plan» ni «día libre»: hoy (2026-09-02, miércoles, sin feriado
    // en el calendario sembrado) tiene que traer al menos una tarea.
    await expect(
      paginaNino.getByRole("heading", { name: /There's no plan yet|Todavía no hay plan/i }),
    ).toHaveCount(0);
    await expect(
      paginaNino.getByRole("heading", { name: /Nothing planned for today|Hoy no hay nada planeado/i }),
    ).toHaveCount(0);
    await expect(paginaNino.getByText(/Task 1 of|Tarea 1 de/)).toBeVisible();
  } finally {
    await admin.close();
    await tutor.close();
    await nino.close();
  }
});
