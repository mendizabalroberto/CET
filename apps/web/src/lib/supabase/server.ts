/**
 * Cliente de Supabase para el SERVIDOR (Server Components, Server Actions,
 * Route Handlers).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Actúa como el usuario autenticado: **RLS se aplica**. Es el cliente por
 * defecto para todo. Si un dato no se puede leer con este cliente, la respuesta
 * correcta casi siempre es arreglar la política, no escalar a `admin.ts`.
 */
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * En Next.js 15 `cookies()` es asíncrona, de ahí que esta función también lo sea.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies: React ya ha empezado
          // a hacer streaming de la respuesta. No es un error — el middleware
          // (`./middleware.ts`) es quien refresca el token en cada petición, así
          // que la sesión sigue viva. Tragarse esta excepción es el patrón
          // documentado por Supabase, no un parche.
        }
      },
    },
  });
}
