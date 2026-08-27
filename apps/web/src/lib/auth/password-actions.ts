"use server";

/**
 * Cambio de contraseña del personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Delega en la Edge Function `staff-password`, que es la única pieza capaz de
 * limpiar `app_metadata.must_change_password`: esa marca solo la escribe
 * `service_role`, y ahí está justamente su valor. Si el propio usuario pudiera
 * quitarla, no obligaría a nada.
 *
 * La contraseña en claro NO se registra en ningún log, ni siquiera en el de
 * error: `logInternal` recibe códigos, nunca el cuerpo de la petición.
 */

import { redirect } from "next/navigation";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";
import {
  type PasswordActionState,
  type PasswordErrorCode,
} from "@/lib/auth/password-state";

/** Mínimo del personal. Coincide con el de la Edge Function, que es quien manda. */
const MIN_LENGTH = 10;

function fail(error: PasswordErrorCode, field?: string): PasswordActionState {
  return field === undefined ? { status: "error", error } : { status: "error", error, field };
}

function logInternal(message: string, detail?: unknown): void {
  console.error(`[cet] ${message}`, detail instanceof Error ? detail.message : detail);
}

export async function changeStaffPassword(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // Validación de cortesía en el servidor de la app. La de verdad la repite la
  // Edge Function: esta solo evita un viaje de red para un error evidente.
  if (currentPassword.length === 0) return fail("required", "currentPassword");
  if (newPassword.length < MIN_LENGTH) return fail("too_short", "newPassword");
  if (newPassword !== confirmPassword) return fail("mismatch", "confirmPassword");

  const state = await getSessionState();
  if (state.kind !== "active") redirect(ROUTES.login);

  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (accessToken === undefined) redirect(ROUTES.login);

  let result: { ok?: boolean; error?: string };
  try {
    const response = await fetch(`${getSupabaseUrl()}/functions/v1/staff-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ op: "change", currentPassword, newPassword }),
      cache: "no-store",
    });
    result = (await response.json()) as { ok?: boolean; error?: string };
  } catch (error) {
    logInternal("staff-password inalcanzable", error);
    return fail("unexpected");
  }

  if (result.ok !== true) {
    switch (result.error) {
      case "bad_current_password":
        return fail("bad_current", "currentPassword");
      case "weak_password":
        return fail("weak", "newPassword");
      case "same_password":
        return fail("same", "newPassword");
      case "bad_request":
        return fail("too_short", "newPassword");
      default:
        logInternal("staff-password rechazado", result.error ?? "unknown");
        return fail("unexpected");
    }
  }

  // El JWT que tiene el navegador sigue llevando `must_change_password: true`
  // en sus claims hasta que se refresque. Se fuerza el refresco para que el
  // guard de `requireRole` no le devuelva aquí en la siguiente navegación.
  await supabase.auth.refreshSession();

  redirect(homeForRole(state.profile.role));
}
