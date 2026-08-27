/**
 * Middleware de borde: sesión, autorización de rutas y CSP con nonce.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se ejecuta antes de renderizar cualquier ruta navegable. Hace tres cosas, en
 * este orden:
 *
 *   1. Refresca la sesión de Supabase (si no, el alumno pierde el examen a
 *      mitad cuando caduca el token).
 *   2. Aplica la matriz de autorización de `src/lib/routes.ts`.
 *   3. Emite la Content-Security-Policy con un nonce nuevo para esta petición.
 *
 * DEFENSA EN PROFUNDIDAD — este middleware NO es la única barrera. Cada layout
 * privilegiado vuelve a comprobar el rol contra `profiles` en la base de datos
 * (`requireRole()` en src/lib/auth/session.ts), y por debajo de todo está RLS.
 * El middleware es rápido pero trabaja con claims de un JWT que puede ir un
 * ciclo de refresco por detrás; nunca debe ser lo único que separa a un alumno
 * de los datos de otro colegio.
 */
import { NextResponse, type NextRequest } from "next/server";

import { findProtectedArea, homeForRole, isApiPath, isPublicPath, ROUTES } from "@/lib/routes";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/middleware";

/** Ruta interna a la que se reescribe una denegación que debe parecer un 404. */
const NOT_FOUND_REWRITE = "/not-found";

function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "'self'";
  try {
    return new URL(url).origin;
  } catch {
    return "'self'";
  }
}

/**
 * Crea una respuesta distinta (redirect o rewrite) SIN perder las cookies de
 * sesión que acaba de escribir `updateSession`. Olvidar este paso es el bug
 * clásico: el token se refresca, la respuesta se descarta y el usuario acaba
 * en un bucle de login.
 */
function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildContentSecurityPolicy({ nonce, isDev, supabaseOrigin: supabaseOrigin() });

  // El nonce viaja también en la petición: Next.js lo lee de la cabecera CSP
  // entrante para firmar sus propios <script>. Sin esto, la app no arranca bajo
  // una CSP estricta.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const { response, claims } = await updateSession(request, requestHeaders);

  const applySecurity = (res: NextResponse): NextResponse => {
    res.headers.set("content-security-policy", csp);
    res.headers.set("x-nonce", nonce);
    return res;
  };

  // --- 0. Rutas de API: se refresca la sesión y se deja pasar ---------------
  // La autorización la hace la propia Route Handler, que puede responder 401,
  // 403 o 429 con JSON. Reescribirlas a la página 404 rompería la ingesta de
  // telemetría de forma silenciosa: el cliente recibiría HTML donde espera
  // JSON y reintentaría en bucle.
  if (isApiPath(pathname)) {
    return applySecurity(response);
  }

  const area = findProtectedArea(pathname);

  // --- 1. Ruta pública: pasa, pero con CSP ---------------------------------
  //
  // AQUÍ NO SE DESVÍA EL LOGIN.
  //
  // Existió un atajo: "si ya tienes sesión y vas al login, te mando a tu
  // portada". Encerró al superadmin fuera de producción. El navegador guardaba
  // una cookie cuyo token seguía siendo válido —firma correcta, sin caducar—
  // pero cuya sesión ya no existía en Auth (`session_not_found`). `getClaims()`
  // solo verifica la firma en local, así que el borde veía sesión donde no la
  // había; y como ese token era anterior al claim `cet_role`, `homeForRole(null)`
  // devolvía `/`. Cada clic en "Iniciar sesión" acababa en la portada pública.
  // Sin error, sin pista, y sin manera de entrar.
  //
  // Es el fallo del paso 4 —AUSENTE NO ES DENEGADO— cometido aquí arriba: una
  // decisión tomada a partir de un claim que no estaba.
  //
  // La conveniencia vive ahora en las propias páginas de login, que llaman a
  // `getSessionState()`: consulta al servidor de Auth y a `profiles`, y sabe
  // distinguir una sesión viva de una cookie muerta. Un poco más lenta, pero es
  // la única capa que puede acertar. El middleware nunca deja a nadie fuera del
  // login: es la única puerta de vuelta.
  if (!area && isPublicPath(pathname)) {
    return applySecurity(response);
  }

  // --- 2. Sin sesión -------------------------------------------------------
  if (!claims?.userId) {
    if (area?.onDeny === "not-found") {
      // Un anónimo tampoco debe descubrir que /admin existe.
      const url = request.nextUrl.clone();
      url.pathname = NOT_FOUND_REWRITE;
      url.search = "";
      return applySecurity(carryCookies(response, NextResponse.rewrite(url)));
    }
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.login;
    // `next` permite volver a donde iba. Se guarda solo la ruta relativa: un
    // `next=https://otro-sitio` sería un open redirect.
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return applySecurity(carryCookies(response, NextResponse.redirect(url)));
  }

  // --- 3. Con sesión, ruta no catalogada -----------------------------------
  // Lista blanca: si la ruta no es pública y no está en la matriz, se deniega.
  // Añadir una página nueva sin registrarla la deja cerrada, no abierta.
  if (!area) {
    const url = request.nextUrl.clone();
    url.pathname = NOT_FOUND_REWRITE;
    url.search = "";
    return applySecurity(carryCookies(response, NextResponse.rewrite(url)));
  }

  // --- 4. Con sesión, rol insuficiente -------------------------------------
  //
  // AUSENTE NO ES DENEGADO.
  //
  // Si el JWT todavía no trae `cet_role` —un token emitido antes de que el claim
  // existiera, un hook recién configurado, una sesión vieja— eso no significa
  // "este usuario no tiene permiso". Significa "el borde no lo sabe".
  //
  // Denegar ahí costó un 404 a un superadmin en su propio panel, sin ninguna
  // pista de por qué: el 404 es deliberadamente mudo para no confirmar que la
  // ruta existe, así que el usuario legítimo se queda sin nada que mirar.
  //
  // Cuando el claim falta se deja pasar y decide el LAYOUT, que consulta
  // `profiles` con RLS y es la autoridad de verdad. El claim sirve para denegar
  // barato en el borde a quien SÍ sabemos que no puede pasar; nunca para
  // conceder, y nunca para denegar por ignorancia.
  if (claims.role !== null && claims.role !== undefined && !area.allow.includes(claims.role)) {
    if (area.onDeny === "not-found") {
      const url = request.nextUrl.clone();
      url.pathname = NOT_FOUND_REWRITE;
      url.search = "";
      return applySecurity(carryCookies(response, NextResponse.rewrite(url)));
    }
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(claims.role);
    url.search = "";
    return applySecurity(carryCookies(response, NextResponse.redirect(url)));
  }

  return applySecurity(response);
}

export const config = {
  /**
   * Se excluyen los assets estáticos: no tienen sesión que refrescar y
   * ejecutar el middleware sobre ellos multiplica por diez las invocaciones.
   * Las cabeceras de seguridad de esos ficheros ya las pone `next.config.ts`.
   *
   * `/api/:path*` SÍ pasa por aquí a propósito: `/api/events` necesita la
   * sesión refrescada, y la CSP no estorba en una respuesta JSON.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
