/**
 * Refresco de sesión en el borde.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Las cookies de sesión de Supabase caducan. Si nadie las refresca, un alumno a
 * mitad de examen pierde la sesión y con ella el intento. Este módulo se ejecuta
 * en CADA petición navegable y renueva el token antes de que la página se
 * renderice.
 *
 * REGLA DURA: `getSession()` NO se usa nunca en el servidor. Lee la cookie sin
 * validar la firma, y una cookie es exactamente lo que un atacante controla.
 * `getClaims()` verifica la firma del JWT contra las claves públicas del
 * proyecto en cada llamada, y es lo que se usa aquí.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@cet/shared";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * CONTRATO CON LA VÍA A (supabase/): el "custom access token hook" añade estos
 * claims al JWT en cada emisión. Sin ellos el middleware tendría que consultar
 * `profiles` en cada navegación — un viaje a la base de datos por request.
 *
 *   cet_role       -> user_role  ('superadmin' | 'school_admin' | 'teacher' | 'student')
 *   cet_school_id  -> uuid del colegio (null para superadmin)
 *
 * OJO: el claim estándar `role` del JWT de Supabase vale `'authenticated'` — es
 * el rol de POSTGRES, no el del dominio. Confundirlos daría permisos de
 * administrador a cualquier usuario con sesión. De ahí el prefijo `cet_`.
 *
 * Los claims viven en el JWT, así que pueden ir hasta un ciclo de refresco por
 * detrás de la base de datos. Por eso el middleware solo los usa para NEGAR
 * acceso rápido; toda decisión que conceda algo sensible se revalida contra
 * `profiles` en el servidor (`src/lib/auth/session.ts`).
 */
export interface SessionClaims {
  readonly userId: string;
  readonly role: UserRole | null;
  readonly schoolId: string | null;
}

const VALID_ROLES: readonly string[] = ["superadmin", "school_admin", "teacher", "student"];

function readClaims(raw: unknown): SessionClaims | null {
  if (typeof raw !== "object" || raw === null) return null;
  const claims = raw as Record<string, unknown>;

  const sub = claims["sub"];
  if (typeof sub !== "string" || sub.length === 0) return null;

  const appMetadata =
    typeof claims["app_metadata"] === "object" && claims["app_metadata"] !== null
      ? (claims["app_metadata"] as Record<string, unknown>)
      : {};

  // `app_metadata` solo lo escribe el servidor de Auth; `user_metadata` lo puede
  // editar el propio usuario y por eso NUNCA se lee para autorizar.
  const rawRole = claims["cet_role"] ?? appMetadata["cet_role"];
  const role = typeof rawRole === "string" && VALID_ROLES.includes(rawRole) ? (rawRole as UserRole) : null;

  const rawSchool = claims["cet_school_id"] ?? appMetadata["cet_school_id"];
  const schoolId = typeof rawSchool === "string" && rawSchool.length > 0 ? rawSchool : null;

  return { userId: sub, role, schoolId };
}

export interface UpdateSessionResult {
  /** Respuesta con las cookies renovadas. Debe devolverse (o copiar sus cookies). */
  readonly response: NextResponse;
  /** Claims verificados, o `null` si no hay sesión válida. */
  readonly claims: SessionClaims | null;
}

/**
 * @param request Petición entrante.
 * @param requestHeaders Cabeceras que deben llegar al renderizado (incluye el
 *   `content-security-policy` con el nonce: Next.js lo lee de ahí para firmar
 *   sus propios <script>). Se propagan con `NextResponse.next({ request: { headers } })`,
 *   que es la única forma soportada de reescribir cabeceras de petición.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<UpdateSessionResult> {
  const nextWithHeaders = () => NextResponse.next({ request: { headers: requestHeaders } });

  let supabaseResponse = nextWithHeaders();

  // Con cómputo fluido, el cliente NO puede vivir en una variable de módulo:
  // la instancia se reutiliza entre peticiones de usuarios distintos.
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // `requestHeaders` es una COPIA tomada antes de mutar las cookies. Si no
        // se resincroniza aquí, el Server Component recibiría el token viejo y
        // se renderizaría como usuario anónimo pese a haberse refrescado.
        requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
        supabaseResponse = nextWithHeaders();
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // No meter código entre `createServerClient` y `getClaims()`: cualquier cosa
  // que lance aquí deja al usuario con la sesión a medio refrescar y provoca
  // cierres de sesión aparentemente aleatorios.
  const { data, error } = await supabase.auth.getClaims();

  const claims = error ? null : readClaims(data?.claims);

  return { response: supabaseResponse, claims };
}
