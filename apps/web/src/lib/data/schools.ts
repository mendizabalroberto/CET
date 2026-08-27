/**
 * Lista pública de colegios para los selectores de login y registro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * CONTRATO CON LA VÍA A: `schools` tiene una política que concede SELECT a los
 * roles `anon` y `authenticated` ÚNICAMENTE sobre las filas con
 * `status = 'active'`, y el GRANT por columna se limita a
 * (`id`, `name`, `slug`, `pin_length_primary`, `pin_length_secondary`).
 *
 * ¿Es un problema exponer los nombres de los colegios? No: un desplegable de
 * login tiene que enseñarlos, y un colegio no es un dato personal. Lo que NO
 * puede salir de aquí es `settings`, que puede contener configuración interna.
 * De ahí el `select` explícito columna a columna y nunca un `select("*")`.
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SchoolOption } from "@/components/auth/StudentLoginForm";

export async function listActiveSchools(): Promise<readonly SchoolOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("schools")
    .select("id, name, pin_length_primary, pin_length_secondary")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error || !data) {
    // Un fallo aquí deja el desplegable vacío, no rompe la página: el alumno
    // ve "pregunta a tu profesor" en vez de una pantalla de error.
     
    console.error("[schools] no se pudo listar", error?.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    pinLengthPrimary: (row.pin_length_primary as number) ?? 4,
    pinLengthSecondary: (row.pin_length_secondary as number) ?? 6,
  }));
}
