/**
 * Sesión autoritativa del lado servidor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El middleware decide rápido con los claims del JWT. AQUÍ se decide de verdad,
 * leyendo `profiles` con RLS activa. Diferencia importante:
 *
 *   - Un claim puede ir un ciclo de refresco por detrás: un profesor al que se
 *     acaba de suspender seguiría teniendo `cet_role = 'teacher'` en su token
 *     hasta una hora. RLS y esta consulta lo ven suspendido de inmediato.
 *   - Nada que conceda acceso a datos de alumno se apoya solo en un claim.
 */
import "server-only";

import { notFound, redirect } from "next/navigation";
import type { ProfileStatus, UserRole } from "@cet/shared";

import { homeForRole, ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface SessionProfile {
  readonly id: string;
  readonly schoolId: string | null;
  readonly role: UserRole;
  readonly fullName: string;
  readonly locale: string;
  readonly status: ProfileStatus;
  /**
   * El personal creado con una contrasena inicial la cambia al primer acceso.
   *
   * Vive en `auth.users.raw_app_meta_data` y NO en `profiles`, y eso importa:
   * un usuario PUEDE hacer UPDATE de su propia fila de profiles (lo permite la
   * politica `profiles_update_own`), asi que ahi se quitaria la marca solo con
   * la consola del navegador y sin cambiar la contrasena. `app_metadata` solo
   * lo escribe `service_role`, y ademas viaja firmado dentro del JWT.
   */
  readonly mustChangePassword: boolean;
}

/**
 * Estado de la sesión. Los tres casos NO son intercambiables:
 *
 *  - `anonymous`: no hay cookie válida. Se manda al login.
 *  - `stale`: hay una sesión de Auth VÁLIDA, pero el perfil está `pending` o
 *    `suspended`, o directamente no existe. Aquí NO se puede mandar al login:
 *    la cookie sigue viva, el middleware vería claims correctos y rebotaría al
 *    usuario de vuelta a su portada — un bucle infinito de redirecciones.
 *    Hay que CERRAR la sesión primero (`/logout`).
 *  - `active`: todo en orden.
 *
 * Distinguir `stale` de `anonymous` es lo que evita ese bucle. Es un fallo que
 * solo aparece cuando un administrador suspende a alguien, es decir, en el peor
 * momento posible.
 */
export type SessionState =
  | { readonly kind: "anonymous" }
  | { readonly kind: "stale" }
  | { readonly kind: "active"; readonly profile: SessionProfile };

/**
 * `getUser()` (no `getSession()`) valida el token contra el servidor de Auth.
 * `getSession()` se limita a decodificar una cookie, y una cookie es
 * exactamente el dato que un atacante controla.
 */
export async function getSessionState(): Promise<SessionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { kind: "anonymous" };

  // RLS garantiza que esta consulta solo puede devolver el propio perfil.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, school_id, role, full_name, locale, status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return { kind: "stale" };
  if (data.status !== "active") return { kind: "stale" };

  return {
    kind: "active",
    profile: {
      id: data.id as string,
      schoolId: (data.school_id as string | null) ?? null,
      role: data.role as UserRole,
      fullName: data.full_name as string,
      locale: (data.locale as string) ?? "en",
      status: data.status as ProfileStatus,
      mustChangePassword: user.app_metadata?.["must_change_password"] === true,
    },
  };
}

/**
 * Quién hay ya dentro cuando alguien abre una pantalla de acceso.
 *
 * ===========================================================================
 * ANTES ESTO EXPULSABA, Y ERA UNA TRAMPA
 * ===========================================================================
 * Se llamaba `redirectIfSignedIn()` y hacía literalmente eso: si había sesión
 * activa, `redirect(homeForRole(...))` y fuera. La intención era buena —a quien
 * ya ha entrado no se le vuelve a pedir que entre— pero convertía el login en
 * una puerta de un solo sentido:
 *
 *   con la sesión del TUTOR viva, abrir `/login/staff` te devolvía a `/tutor`
 *   ANTES de dejarte escribir nada.
 *
 * No es que no pudieras entrar como superadmin: es que la pantalla no te dejaba
 * intentarlo, y sin decir por qué. La única salida era adivinar que primero
 * había que cerrar sesión. Medido con una persona real el 02/09/2026.
 *
 * Y la avería crece con el producto: quien administra y además es tutor de sus
 * propios hijos tiene DOS cuentas por diseño —no hay un rol que sea las dos— y
 * necesita ir de una a otra a diario.
 *
 * ===========================================================================
 * LO QUE HACE AHORA
 * ===========================================================================
 * Informa, no decide. Devuelve el perfil activo, si lo hay, y es la PÁGINA la
 * que enseña las dos salidas: seguir como quien ya eres, o entrar con otra
 * cuenta. Es lo que hace cualquier producto con cuentas múltiples, y es
 * honesto: el usuario ve su estado en vez de sufrirlo.
 *
 * ===========================================================================
 * POR QUE NO SE FIA DEL JWT
 * ===========================================================================
 * Esta comprobación vivió en el middleware y hubo que traerla aquí. El borde
 * decide con `getClaims()`, que solo verifica la firma en local: una cookie
 * cuya sesión ya fue revocada en Auth le sigue pareciendo válida. Con eso, el
 * atajo expulsaba del login a quien más lo necesitaba —alguien con una cookie
 * muerta— y lo dejaba dando vueltas hasta la portada sin un solo mensaje.
 *
 * `getSessionState()` pregunta al servidor de Auth (`getUser()`) y lee
 * `profiles`. Ante la duda —cookie muerta, perfil suspendido, perfil
 * inexistente— devuelve `null` y la página pinta el formulario a secas, que es
 * lo que permite salir del atolladero.
 */
export async function sesionYaAbierta(): Promise<{
  readonly profile: SessionProfile;
  readonly casa: string;
} | null> {
  const state = await getSessionState();
  if (state.kind !== "active") return null;
  return { profile: state.profile, casa: homeForRole(state.profile.role) };
}

/** Perfil activo, o `null`. Azúcar sobre `getSessionState()`. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const state = await getSessionState();
  return state.kind === "active" ? state.profile : null;
}

/**
 * Exige sesión con uno de los roles dados.
 *
 * @param opts.onDeny
 *   - `"not-found"` (por defecto): responde 404. Se usa en áreas privilegiadas:
 *     un 403 le confirmaría a un alumno que `/admin` existe.
 *   - `"home"`: le manda a su propia portada.
 */
export async function requireRole(
  allowed: readonly UserRole[],
  opts: { onDeny?: "not-found" | "home"; allowPasswordChange?: boolean } = {},
): Promise<SessionProfile> {
  const state = await getSessionState();
  const onDeny = opts.onDeny ?? "not-found";

  if (state.kind === "stale") {
    // Cookie viva pero perfil no utilizable: hay que cerrar sesión ANTES de
    // volver al login, o el middleware devolvería al usuario aquí sin fin.
    redirect(ROUTES.logout);
  }

  if (state.kind === "anonymous") {
    if (onDeny === "not-found") notFound();
    redirect(ROUTES.login);
  }

  const profile = state.profile;

  if (!allowed.includes(profile.role)) {
    if (onDeny === "not-found") notFound();
    redirect(homeForRole(profile.role));
  }

  // Contrasena inicial sin cambiar: no se le deja pasar a NINGUNA otra pantalla.
  //
  // El guard va aqui y no en un layout concreto a proposito: `requireRole` es el
  // unico punto por el que entra todo el personal, asi que no hay forma de
  // esquivarlo escribiendo otra URL. Ponerlo en el layout de `(staff)` habria
  // dejado `/account/...` y cualquier area futura sin cubrir.
  //
  // `opts.allowPasswordChange` lo usa la propia pantalla de cambio, que
  // evidentemente no puede redirigirse a si misma.
  if (profile.mustChangePassword && opts.allowPasswordChange !== true) {
    redirect(ROUTES.passwordChange);
  }

  return profile;
}

export interface StudentSession extends SessionProfile {
  readonly role: "student";
  /**
   * `null` para el hijo de un tutor, que practica en casa y no está matriculado
   * en ningún colegio. Es un estado válido, no un dato que falte.
   *
   * Sale de `students.school_id` y NO de `profiles.school_id`: desde la
   * refundación de la tenencia, la matrícula vive en
   * `student_school_memberships` y `profiles.school_id` es NULL para todo
   * alumno. `students.school_id` es la caché denormalizada de esa matrícula
   * (DATA_MODEL §3.3), y es la fila que esta consulta ya trae de todos modos.
   */
  readonly schoolId: string | null;
  readonly studentCode: string;
  readonly pinMustChange: boolean;
  readonly stage: "primary" | "secondary";
}

/**
 * Sesión de alumno con los datos de `students` que la UI necesita.
 *
 * Fuerza el cambio de PIN en el primer acceso (AD-4) redirigiendo a
 * `/account/pin`. La comprobación se hace contra la BASE DE DATOS y no contra
 * un claim: si se leyera del JWT, el alumno seguiría viendo la pantalla de
 * cambio de PIN después de haberlo cambiado, hasta el siguiente refresco.
 */
export async function requireStudent(): Promise<StudentSession> {
  const profile = await requireRole(["student"], { onDeny: "home" });
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("students")
    .select("student_code, pin_must_change, stage, school_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error || !data) {
    // Un perfil con rol `student` sin ficha en `students` es un estado
    // imposible según DATA_MODEL §1. Si ocurre, no se adivina: se corta.
    //
    // Lo que YA NO corta es no tener colegio. Antes esta condición incluía
    // `|| !profile.schoolId`, y con la matrícula fuera de `profiles` eso dejaba
    // 404 a TODO alumno. Para el hijo de un tutor, además, era un 404 correcto
    // por accidente y equivocado por diseño: no tener colegio es su estado
    // normal, no un perfil roto.
    notFound();
  }

  return {
    ...profile,
    role: "student",
    schoolId: (data.school_id as string | null) ?? null,
    studentCode: data.student_code as string,
    pinMustChange: Boolean(data.pin_must_change),
    stage: data.stage as "primary" | "secondary",
  };
}
