/**
 * Cabeceras de seguridad y protección de rutas, ejercidas de verdad.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE FICHERO EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * El middleware de este proyecto hace tres cosas: refresca la sesión, protege
 * las rutas por rol y emite la CSP con un nonce por petición. Estaba escrito con
 * cuidado, revisado, y COMPLETAMENTE INERTE: el fichero vivía en
 * `apps/web/middleware.ts`, pero el proyecto usa directorio `src/`, y Next.js
 * solo registra el middleware si está en `src/middleware.ts`.
 *
 * Nada lo delataba. Compilaba, los tipos pasaban, el lint pasaba, los tests
 * unitarios de la matriz de rutas pasaban —porque prueban la función, no su
 * registro— y el build no dice una palabra. Lo único que lo destapó fue pedirle
 * a un navegador de verdad una cabecera de verdad.
 *
 * De ahí la forma de estas pruebas: comprueban EFECTOS OBSERVABLES desde fuera,
 * no la existencia de código. Un test que importa `middleware()` y la invoca a
 * mano habría seguido pasando en verde durante todo el fallo.
 */
import { expect, test } from "@playwright/test";

test.describe("cabeceras de seguridad", () => {
  test("la CSP existe, lleva nonce y no permite scripts en línea", async ({ page }) => {
    const response = await page.goto("/");
    expect(response, "la landing no respondió").not.toBeNull();

    const csp = response!.headers()["content-security-policy"];
    expect(csp, "no se emitió Content-Security-Policy: el middleware no está activo").toBeTruthy();

    // Un nonce por petición es lo que permite prescindir de `unsafe-inline`.
    expect(csp).toContain("'nonce-");

    // `unsafe-inline` en `script-src` anula la CSP para el ataque que más
    // importa aquí: inyectar un <script> en el HTML de una lección.
    const scriptSrc = csp!.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc, "no hay directiva script-src").toBeTruthy();
    expect(scriptSrc).not.toContain("unsafe-inline");

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("el nonce cambia en cada petición", async ({ page }) => {
    // Un nonce fijo es un nonce inútil: si se filtra una vez, vale para siempre.
    const primera = await page.goto("/");
    const nonceA = primera!.headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];

    const segunda = await page.goto("/privacy");
    const nonceB = segunda!.headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonceA).toBeTruthy();
    expect(nonceB).toBeTruthy();
    expect(nonceA).not.toBe(nonceB);
  });

  test("emite el resto de cabeceras defensivas", async ({ page }) => {
    const response = await page.goto("/");
    const h = response!.headers();

    expect(h["x-frame-options"] ?? "").toMatch(/DENY/i);
    expect(h["referrer-policy"] ?? "").toBeTruthy();
    expect(h["x-content-type-options"] ?? "").toMatch(/nosniff/i);
  });

  test("no filtra la versión del framework", async ({ page }) => {
    const response = await page.goto("/");
    // `x-powered-by` regala la pila a cualquiera que mire las cabeceras.
    expect(response!.headers()["x-powered-by"]).toBeUndefined();
  });
});

test.describe("protección de rutas sin sesión", () => {
  // Las áreas privilegiadas responden 404 y NO 403: un 403 confirma que la ruta
  // existe, y con eso ya se puede mapear la aplicación desde fuera.
  for (const ruta of ["/admin", "/teach"]) {
    test(`${ruta} responde 404, no 403`, async ({ page }) => {
      const response = await page.goto(ruta);
      expect(response!.status()).toBe(404);
    });
  }

  // Las áreas de alumno mandan al login: aquí no hay nada que ocultar y
  // castigar a un niño con un 404 sería cruel además de inútil.
  for (const ruta of ["/learn", "/practice", "/exam"]) {
    test(`${ruta} redirige al login`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("/exam quedaba SIN filtro de rol por un plural", async ({ page }) => {
    // `routes.ts` protegía `/exams` y las rutas reales son `/exam`. Como el
    // emparejador exige coincidencia exacta o con `/` detrás, el área entera
    // pasaba sin comprobar rol. Este test fija el singular.
    await page.goto("/exam/cualquier-cosa/run");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("rutas de API", () => {
  test("/api/events no cae en la página HTML de 404", async ({ request }) => {
    // El middleware reescribía las rutas de API a la página de 404. La cola de
    // telemetría recibía HTML donde esperaba JSON y reintentaba en bucle, en
    // silencio y para siempre.
    //
    // Lo que se fija aquí es esa propiedad y solo esa: sin sesión la respuesta
    // correcta es 401 con el cuerpo VACÍO —deliberado, porque este endpoint
    // recibe un lote cada cinco segundos por alumno y un cuerpo de error sería
    // peso muerto—, así que exigir `content-type: json` seria exigir algo que
    // el diseño no promete.
    // Lote BIEN FORMADO a proposito: la ruta valida el cuerpo antes de mirar la
    // sesion (evita un viaje a la base de datos por basura, y el esquema ya es
    // publico porque viaja en el bundle). Con un lote vacio se responderia 400
    // por validacion y no se ejerceria el camino de autenticacion, que es el
    // que aqui importa.
    const response = await request.post("/api/events", {
      data: {
        events: [
          {
            sessionId: "00000000-0000-4000-8000-000000000000",
            seq: 0,
            eventType: "question_shown",
            payload: {},
            clientTs: new Date().toISOString(),
          },
        ],
      },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);

    const body = await response.text();
    expect(body).not.toContain("<html");
    expect(body).not.toContain("<!DOCTYPE");
  });

  test("/api/health responde", async ({ request }) => {
    const response = await request.get("/api/health", { failOnStatusCode: false });
    expect(response.headers()["content-type"] ?? "").toContain("json");
  });

  test("/api/attempts/start rechaza a un anónimo con JSON", async ({ request }) => {
    const response = await request.post("/api/attempts/start", {
      data: { assignmentId: "00000000-0000-4000-8000-0000000000e1" },
      failOnStatusCode: false,
    });

    expect(response.headers()["content-type"] ?? "").toContain("json");
    expect([401, 403]).toContain(response.status());

    // Y jamás una clave de respuesta ni una semilla en el cuerpo del rechazo.
    const body = await response.text();
    expect(body).not.toContain("answer_key");
    expect(body).not.toContain("item_seed");
  });
});
