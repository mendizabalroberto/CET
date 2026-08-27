/**
 * Qué colegio mira el panel de administración.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 * ---------------------------------------------------------------------------
 * `/admin` está scoped a un colegio, pero un superadmin no pertenece a ninguno:
 * la constraint `profiles_superadmin_has_no_school` (0003_tenancy.sql) hace
 * imposible el "superadmin de un colegio", que rompería el aislamiento de
 * tenants. Así que el superadmin tiene que ELEGIR, y esa elección llega por la
 * URL (`/admin?school=<uuid>`).
 *
 * LO PELIGROSO ES LA OTRA MITAD
 * Un `school_admin` también puede escribir esa URL. Si el parámetro se
 * respetara para él, tendríamos una escalada horizontal de libro: ver otro
 * colegio cambiando un uuid. Por eso aquí el parámetro se IGNORA para todo el
 * que no sea superadmin — su colegio es el de su perfil y no se discute.
 *
 * RLS lo impediría igualmente (las políticas de 0012 comparan contra
 * `app.current_school_id()`, no contra lo que pida el cliente), y `queries.ts`
 * filtra además a mano por `school_id`. Son tres capas independientes; esta es
 * la primera y la más barata de leer.
 *
 * Función pura y sin dependencias de servidor a propósito: es la clase de
 * decisión que hay que poder probar sin levantar media aplicación.
 */
import type { UserRole } from "@cet/shared";

export interface AdminViewer {
  readonly role: UserRole;
  readonly schoolId: string | null;
}

/**
 * @param viewer Perfil ya autenticado y autorizado por `requireRole`.
 * @param requested Valor crudo de `?school=`. No se confía en él.
 * @param allowed Colegios que el superadmin puede elegir. Se comprueba la
 *   pertenencia para que un uuid inventado no acabe en una consulta y devuelva
 *   un panel vacío con el nombre en blanco, que parece una avería.
 * @returns El colegio a cargar, o `null` si todavía hay que elegir uno.
 */
export function resolveAdminSchool(
  viewer: AdminViewer,
  requested: string | null | undefined,
  allowed: readonly { readonly id: string }[],
): string | null {
  if (viewer.role !== "superadmin") {
    // El parámetro no existe para él. Ni se valida ni se compara: se descarta.
    return viewer.schoolId;
  }

  if (requested === null || requested === undefined || requested === "") return null;

  return allowed.some((school) => school.id === requested) ? requested : null;
}
