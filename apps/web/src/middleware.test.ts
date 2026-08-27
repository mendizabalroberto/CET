/**
 * El middleware, invocado como lo invoca Next.js.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * REGRESIÓN QUE ORIGINA ESTE FICHERO
 * ---------------------------------------------------------------------------
 * El superadmin de producción no podía iniciar sesión. El botón "Iniciar
 * sesión" parecía roto: llevaba a la portada pública, una y otra vez.
 *
 * No estaba roto. El navegador conservaba una cookie cuyo access token seguía
 * siendo VÁLIDO criptográficamente (firma correcta, sin caducar) pero cuya
 * sesión ya no existía en el servidor de Auth:
 *
 *     GET /auth/v1/user -> 403 {"error_code":"session_not_found"}
 *
 * El middleware decide con `getClaims()`, que solo verifica la firma en local,
 * así que veía "sesión". Como ese token se emitió antes de que existiera el
 * claim `cet_role`, `claims.role` era `null`, y `homeForRole(null)` devuelve
 * `/`. Resultado: toda visita a `/login` acababa en la portada. Sin forma de
 * entrar, y sin un solo mensaje de error.
 *
 * Es el mismo fallo que el propio middleware documenta en el paso 4 —AUSENTE NO
 * ES DENEGADO— cometido en el paso 1: se tomó una decisión de navegación a
 * partir de un claim que no estaba.
 *
 * La conveniencia de "ya tienes sesión, ve a tu portada" se ha movido a las
 * páginas de login, que consultan `getSessionState()` y sí distinguen una
 * sesión viva de una cookie muerta.
 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionClaims } from "@/lib/supabase/middleware";

const updateSession = vi.fn();

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (...args: unknown[]) => updateSession(...args),
}));

/** Lo que devuelve `updateSession` para unos claims dados. */
function withClaims(claims: SessionClaims | null): void {
  updateSession.mockImplementation((_request: unknown, requestHeaders: Headers) => ({
    response: NextResponse.next({ request: { headers: requestHeaders } }),
    claims,
  }));
}

async function request(pathname: string): Promise<NextResponse> {
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("./middleware");
  return middleware(new NextRequest(new URL(`https://cet.example${pathname}`)));
}

beforeEach(() => {
  updateSession.mockReset();
});

describe("middleware · página de login", () => {
  it("NO desvía el login cuando el claim de rol no está", async () => {
    // Cookie viva, rol desconocido para el borde. Es el caso real: token
    // emitido antes de que `cet_role` existiera, o sesión ya revocada en Auth.
    // Antes de este arreglo, esto respondía 307 hacia "/" y el usuario se
    // quedaba encerrado fuera de su propia aplicación.
    withClaims({ userId: "0ee8844d-fbb3-42ab-8907-09b4dd3ffa85", role: null, schoolId: null });

    const response = await request("/login/staff");

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("tampoco lo desvía con un rol conocido: eso lo decide la página", async () => {
    // El middleware solo tiene un claim, que puede describir una sesión que ya
    // no existe. La página consulta al servidor de Auth y decide con la verdad.
    withClaims({ userId: "u", role: "student", schoolId: "s" });

    const response = await request("/login");

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("deja pasar el login a un anónimo", async () => {
    withClaims(null);

    const response = await request("/login/student");

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("emite la CSP con nonce también en el login", async () => {
    withClaims(null);

    const response = await request("/login/staff");
    const csp = response.headers.get("content-security-policy");

    expect(csp).toContain(`'nonce-${response.headers.get("x-nonce")}'`);
  });
});

describe("middleware · áreas protegidas", () => {
  it("un anónimo recibe un 404 mudo en /admin, no una redirección delatora", async () => {
    withClaims(null);

    const response = await request("/admin");

    // Rewrite interno: la URL no cambia y no se confirma que /admin exista.
    expect(response.headers.get("x-middleware-rewrite")).toContain("/not-found");
  });

  it("un rol conocido e insuficiente sí se deniega en el borde", async () => {
    withClaims({ userId: "u", role: "student", schoolId: "s" });

    const response = await request("/admin");

    expect(response.headers.get("x-middleware-rewrite")).toContain("/not-found");
  });

  it("un claim ausente NO deniega: decide el layout contra la base de datos", async () => {
    withClaims({ userId: "u", role: null, schoolId: null });

    const response = await request("/admin");

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.status).toBe(200);
  });
});
