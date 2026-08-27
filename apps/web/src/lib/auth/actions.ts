/**
 * Server Actions de autenticación.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * PRINCIPIO DE MENSAJES DE ERROR
 * ---------------------------------------------------------------------------
 * Todo fallo de credenciales devuelve EL MISMO código, `bad_credentials`, tanto
 * si el código de alumno no existe, como si el PIN es incorrecto, como si la
 * cuenta está bloqueada o suspendida. Motivo: si "código desconocido" y "PIN
 * incorrecto" fueran distinguibles, cualquiera podría enumerar los códigos de
 * alumno válidos de un colegio — es decir, averiguar qué menores están
 * matriculados — sin acertar un solo PIN.
 *
 * Consecuencia deliberada: el bloqueo por intentos fallidos TAMPOCO se anuncia.
 * Anunciarlo confirmaría que ese código existe. El único mensaje distinto es el
 * de rate limit por dispositivo, que no depende de que la cuenta exista.
 */
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { homeForRole, ROUTES } from "@/lib/routes";
import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

import {
  pinChangeSchema,
  registrationSchema,
  staffLoginSchema,
  studentLoginSchema,
} from "./schemas";

// Los tipos y `IDLE_STATE` viven en `./state`: un modulo "use server" solo
// puede exportar funciones async (ver la cabecera de ese fichero).
import { type ActionState, type AuthErrorCode } from "./state";

function fail(error: AuthErrorCode, field?: string): ActionState {
  return field === undefined ? { status: "error", error } : { status: "error", error, field };
}

/**
 * Registra en el servidor lo que NO se le cuenta al usuario. Sin esto, un
 * mensaje deliberadamente vago dejaría al equipo a ciegas ante un incidente.
 */
function logInternal(context: string, detail: unknown): void {
   
  console.warn(`[auth] ${context}`, detail instanceof Error ? detail.message : detail);
}

/* ========================================================================== */
/* Alumno: colegio + código + PIN (AD-3)                                      */
/* ========================================================================== */

/**
 * CONTRATO CON LA VÍA A (supabase/functions/auth-pin):
 *
 *   POST {SUPABASE_URL}/functions/v1/auth-pin
 *   body: { schoolId: uuid, studentCode: string, pin: string }
 *
 *   200 -> { ok: true,  session: { access_token: string, refresh_token: string } }
 *   200 -> { ok: false, reason: "bad_credentials" | "locked" | "rate_limited"
 *                               | "school_unavailable" }
 *
 * La Edge Function es la ÚNICA que puede leer `students.pin_hash`: RLS no
 * concede SELECT sobre esa columna a nadie más (DATA_MODEL §1). Verifica el
 * Argon2id, aplica lockout, escribe en `auth_attempts` y emite una sesión real
 * de Supabase. La app web nunca ve el hash.
 */
interface AuthPinResponse {
  ok: boolean;
  session?: { access_token?: string; refresh_token?: string };
  reason?: string;
}

export async function signInStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = studentLoginSchema.safeParse({
    schoolId: formData.get("schoolId"),
    studentCode: formData.get("studentCode"),
    pin: formData.get("pin"),
  });

  // Un formulario inválido devuelve el MISMO error que unas credenciales
  // incorrectas. Si devolviera "el código tiene formato inválido", ya estaría
  // filtrando qué formatos de código usa el colegio.
  if (!parsed.success) return fail("bad_credentials");

  const headerStore = await headers();
  const clientKey = clientKeyFromHeaders(headerStore);

  // 10 intentos por minuto y dispositivo. Un niño que se equivoca dos veces no
  // lo nota; un script que prueba 10.000 PIN, sí.
  const limited = rateLimit(`student-login:${clientKey}`, 10, 60_000);
  if (!limited.allowed) return fail("rate_limited");

  let payload: AuthPinResponse;
  try {
    const response = await fetch(`${getSupabaseUrl()}/functions/v1/auth-pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // La Edge Function exige la clave publicable para rechazar tráfico que
        // no venga de un cliente Supabase legítimo.
        authorization: `Bearer ${getSupabaseAnonKey()}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });

    if (!response.ok) {
      logInternal("auth-pin non-2xx", response.status);
      return fail("unexpected");
    }
    payload = (await response.json()) as AuthPinResponse;
  } catch (error) {
    logInternal("auth-pin unreachable", error);
    return fail("unexpected");
  }

  if (!payload.ok || !payload.session?.access_token || !payload.session.refresh_token) {
    // `locked` y `bad_credentials` se colapsan en el mismo mensaje a propósito
    // (ver cabecera del fichero). `rate_limited` no depende de que la cuenta
    // exista, así que sí se puede distinguir sin filtrar nada.
    if (payload.reason === "rate_limited") return fail("rate_limited");
    if (payload.reason === "school_unavailable") return fail("school_unavailable");
    logInternal("auth-pin rejected", payload.reason ?? "unknown");
    return fail("bad_credentials");
  }

  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  });

  if (sessionError) {
    logInternal("setSession failed", sessionError);
    return fail("unexpected");
  }

  // `redirect()` lanza una excepción de control de flujo: debe quedar FUERA de
  // cualquier try/catch, o el catch se la tragaría y la acción devolvería
  // "unexpected" después de haber iniciado sesión correctamente.
  redirect(ROUTES.studentHome);
}

/* ========================================================================== */
/* Personal: email + contraseña                                               */
/* ========================================================================== */

export async function signInStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = staffLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return fail("staff_bad_credentials");

  const headerStore = await headers();
  const limited = rateLimit(`staff-login:${clientKeyFromHeaders(headerStore)}`, 10, 60_000);
  if (!limited.allowed) return fail("rate_limited");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    logInternal("staff sign-in rejected", error);
    // Mismo mensaje exista o no la cuenta: si no, se puede enumerar el
    // claustro de un colegio probando direcciones.
    return fail("staff_bad_credentials");
  }

  // El rol se lee de la base de datos, no del formulario ni del claim, para
  // decidir la portada. Un usuario no elige a qué panel entra.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    // Cuenta pendiente de aprobación o suspendida: se cierra la sesión recién
    // abierta para no dejar una cookie válida de un usuario que no debe entrar.
    await supabase.auth.signOut();
    return fail("staff_bad_credentials");
  }

  const role = profile.role as Parameters<typeof homeForRole>[0];
  redirect(homeForRole(role));
}

/* ========================================================================== */
/* Cambio de PIN obligatorio en el primer acceso (AD-4)                       */
/* ========================================================================== */

/**
 * CONTRATO CON LA VÍA A: función RPC `app.change_student_pin(current_pin, new_pin)`,
 * `security definer` con `search_path` fijado. Verifica el PIN actual, escribe
 * el nuevo hash Argon2id, pone `pin_must_change = false` y registra el evento.
 * El hash NUNCA se calcula en la app web.
 */
export async function changePin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = pinChangeSchema.safeParse({
    currentPin: formData.get("currentPin"),
    newPin: formData.get("newPin"),
    confirmPin: formData.get("confirmPin"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "pin_mismatch") return fail("pin_mismatch", "confirmPin");
    if (issue?.message === "pin_too_weak") return fail("pin_too_weak", "newPin");
    return fail("pin_wrong_length", (issue?.path[0] as string | undefined) ?? "newPin");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { data, error } = await supabase.rpc("change_student_pin", {
    p_current_pin: parsed.data.currentPin,
    p_new_pin: parsed.data.newPin,
  });

  if (error) {
    logInternal("change_student_pin failed", error);
    return fail("unexpected");
  }
  if (data !== true) return fail("bad_credentials", "currentPin");

  redirect(ROUTES.studentHome);
}

/* ========================================================================== */
/* Solicitud de registro (queda pendiente de aprobación)                      */
/* ========================================================================== */

export async function submitRegistration(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registrationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    fullName: formData.get("fullName"),
    requestedYearLevel: formData.get("requestedYearLevel"),
    guardianEmail: formData.get("guardianEmail"),
    note: formData.get("note") ?? "",
    consent: formData.get("consent"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] as string | undefined;
    if (field === "consent") return fail("consent_required", "consent");
    if (field === "guardianEmail") return fail("invalid_email", "guardianEmail");
    return fail("required", field ?? "fullName");
  }

  const headerStore = await headers();
  // 5 solicitudes por hora y dispositivo: suficiente para una familia con
  // varios hijos, insuficiente para inundar la bandeja del administrador.
  const limited = rateLimit(`register:${clientKeyFromHeaders(headerStore)}`, 5, 3_600_000);
  if (!limited.allowed) return fail("rate_limited");

  const supabase = await createClient();

  // Se inserta con el cliente ANÓNIMO, no con service role: la política RLS de
  // `registration_requests` concede INSERT a `anon` con `status = 'pending'` y
  // nada más. Así, una solicitud jamás puede crear una cuenta ni tocar otra
  // tabla, por mucho que se manipule el formulario.
  const { error } = await supabase.from("registration_requests").insert({
    school_id: parsed.data.schoolId,
    full_name: parsed.data.fullName,
    requested_year_level: parsed.data.requestedYearLevel,
    guardian_email: parsed.data.guardianEmail,
    note: parsed.data.note || null,
    status: "pending",
  });

  if (error) {
    logInternal("registration insert failed", error);
    // No se distingue "ese colegio no existe" de "fallo de base de datos": lo
    // primero permitiría enumerar los colegios dados de alta.
    return fail("unexpected");
  }

  redirect(ROUTES.registerSent);
}

/* ========================================================================== */
/* Cierre de sesión                                                           */
/* ========================================================================== */

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.home);
}
