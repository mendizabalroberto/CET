/**
 * Lista pública de colegios para los selectores de login y registro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Va por el RPC `public.list_active_schools()` y NO por un SELECT sobre la tabla.
 *
 * Motivo: este selector se dibuja ANTES de que exista sesión, así que lo
 * consulta el rol `anon`, y `anon` no tiene —ni debe tener— acceso a `schools`:
 * con él se podría enumerar la lista completa de colegios de la plataforma, que
 * es información comercial.
 *
 * La función es `security definer` y devuelve exactamente las cuatro columnas
 * que el desplegable necesita. Lo que se expone es una proyección, no un
 * permiso; `settings` no sale de ahí bajo ningún concepto.
 *
 * (Antes esto hacía un `.from("schools").select(...)` y fallaba con
 *  `permission denied for table schools`: el desplegable salía vacío y ningún
 *  alumno podía entrar. Lo detectaron los e2e la primera vez que se ejecutaron.)
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SchoolOption } from "@/components/auth/StudentLoginForm";

export async function listActiveSchools(): Promise<readonly SchoolOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_active_schools");

  if (error || !data) {
    // Un fallo aquí deja el desplegable vacío, no rompe la página: el alumno
    // ve "pregunta a tu profesor" en vez de una pantalla de error.
     
    console.error("[schools] no se pudo listar", error?.message);
    return [];
  }

  return (data as readonly Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    pinLengthPrimary: (row.pin_length_primary as number) ?? 4,
    pinLengthSecondary: (row.pin_length_secondary as number) ?? 6,
  }));
}
