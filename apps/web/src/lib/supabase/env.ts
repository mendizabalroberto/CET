/**
 * Lectura y validación de la configuración de Supabase.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Next.js sustituye `process.env.NEXT_PUBLIC_*` en tiempo de build por su valor
 * literal, PERO solo si se escribe el acceso completo y estático. Por eso aquí
 * se escriben expandidos y no con un `process.env[nombre]` dinámico: con la
 * forma dinámica el valor llegaría `undefined` al navegador.
 */

/** URL del proyecto Supabase. Pública por diseño. */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL. Copia apps/web/.env.example a .env.local y rellénalo.",
    );
  }
  return url;
}

/**
 * Clave publicable (anon). Llega al navegador y eso es correcto: su alcance lo
 * define RLS, no el secreto de la clave. Si con esta clave se lee algo que no
 * se debería, el fallo está en la política, no aquí.
 */
export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY. Copia apps/web/.env.example a .env.local y rellénalo.",
    );
  }
  return key;
}
