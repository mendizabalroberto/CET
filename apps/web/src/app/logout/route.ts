/**
 * GET /logout — cierra la sesión y devuelve al login.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ EXISTE COMO RUTA Y NO SOLO COMO SERVER ACTION
 * Cuando un perfil queda inservible (suspendido, pendiente de aprobación, o sin
 * fila en `profiles`) la cookie de Auth SIGUE SIENDO VÁLIDA. Si el layout
 * redirigiera al login sin más, el middleware vería claims correctos y lo
 * devolvería a su portada, que volvería a rechazarlo: bucle infinito.
 *
 * Esta ruta rompe el ciclo borrando la sesión primero. Está en la lista de
 * rutas públicas justamente porque tiene que ser alcanzable por alguien cuya
 * sesión ya no sirve.
 *
 * Es GET a propósito: es el destino de un `redirect()` desde el servidor, no un
 * enlace que un tercero pueda hacer pulsar. Un `<img src="/logout">` en otra
 * página solo conseguiría cerrarle la sesión al usuario — molesto, no peligroso
 * — y a cambio se gana un camino de salida que funciona siempre. El cierre de
 * sesión desde la interfaz sí usa la Server Action `signOut`, que va por POST.
 */
import { NextResponse } from "next/server";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(ROUTES.login, request.url);
  return NextResponse.redirect(url, {
    // 303: el navegador debe hacer un GET a /login, pase lo que pase.
    status: 303,
    headers: { "cache-control": "no-store" },
  });
}
