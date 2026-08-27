/**
 * Cliente de Supabase para el NAVEGADOR.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Uso: exclusivamente dentro de componentes marcados con "use client" que
 * necesiten Realtime, Storage o una suscripción viva. Para leer datos, la vía
 * por defecto es un Server Component con el cliente de `./server`.
 *
 * Este cliente escribe la sesión en cookies (no en localStorage) para que el
 * servidor pueda leerla. Esa es la razón de existir de @supabase/ssr.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * `createBrowserClient` ya memoiza internamente por (url, key), así que llamar
 * a esta función en varios componentes no abre varias conexiones.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
