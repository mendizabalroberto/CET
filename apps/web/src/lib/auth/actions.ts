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

import { listActiveSchools } from "@/lib/data/schools";
import { fetchConPlazo, PLAZO_AUTENTICAR_MS } from "@/lib/net/plazo";
import { homeForRole, ROUTES } from "@/lib/routes";
import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Lo mismo, pero para una ESCRITURA QUE SE HA PERDIDO. Va a `console.error` y
 * arrastra el `code` de PostgREST además del mensaje.
 *
 * Existe por el fallo que arregla este fichero: el alta pública fallaba con
 * `42501 permission denied for table registration_requests` y ese código no
 * aparecía en ninguna parte, porque `logInternal` solo registra `error.message`
 * y `console.warn` se pierde entre el ruido. Un dato del usuario que no llega a
 * la base y no deja rastro con su código es la definición de fallo silencioso
 * (R4), y aquí lo perdido es la matrícula de un niño.
 */
function logLost(context: string, error: { code?: string; message?: string } | unknown): void {
  const e = error as { code?: string; message?: string; details?: string } | null;
  console.error(
    `[auth] ESCRITURA PERDIDA · ${context} ·`,
    `code=${e?.code ?? "?"}`,
    `message=${e?.message ?? String(error)}`,
    `details=${e?.details ?? "-"}`,
  );
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
  /** Presente solo en el 200. La Edge Function no devuelve ningun flag `ok`. */
  session?: { access_token?: string; refresh_token?: string };
  /** AD-4: si es el primer acceso, hay que llevarle al cambio de PIN. */
  pinMustChange?: boolean;
  /** Presente en los fallos: "invalid_credentials" | "server_error". */
  error?: string;
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
    const respuesta = await fetchConPlazo(`${getSupabaseUrl()}/functions/v1/auth-pin`, {
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
    }, PLAZO_AUTENTICAR_MS);

    // La Edge Function responde 401 a CUALQUIER fallo de credencial, y a
    // proposito no distingue entre "el codigo no existe", "el PIN es erroneo" y
    // "la cuenta esta bloqueada": distinguirlos permitiria enumerar alumnos.
    // Tratar ese 401 como error inesperado dejaria al alumno con un mensaje
    // generico de averia en vez de "revisa tu codigo y tu PIN".
    if (respuesta.status === 401) {
      return fail("bad_credentials");
    }
    if (respuesta.status === 429) {
      return fail("rate_limited");
    }
    if (!respuesta.ok) {
      logInternal("auth-pin non-2xx", respuesta.status);
      return fail("unexpected");
    }
    // Un 2xx sin cuerpo legible es una averia nuestra, no una credencial mala:
    // decirle al nino "revisa tu codigo y tu PIN" seria mandarle a buscar un
    // error que no ha cometido.
    if (respuesta.cuerpo === null) {
      logInternal("auth-pin cuerpo ilegible", respuesta.status);
      return fail("unexpected");
    }
    payload = respuesta.cuerpo as AuthPinResponse;
  } catch (error) {
    logInternal("auth-pin unreachable", error);
    return fail("unexpected");
  }

  // El exito se reconoce por la presencia de una sesion utilizable. `locked` y
  // `bad_credentials` se colapsan en el mismo mensaje a proposito: ver la
  // cabecera de este fichero y la de la Edge Function.
  if (!payload.session?.access_token || !payload.session.refresh_token) {
    logInternal("auth-pin sin sesion", payload.error ?? "unknown");
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
  //
  // AD-4: el profesor genera el PIN inicial y el alumno lo cambia en su primer
  // acceso. Mientras `pin_must_change` siga a true, no se le lleva a su portada.
  redirect(payload.pinMustChange ? ROUTES.pinChange : ROUTES.studentHome);
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
 * Cambio de PIN del alumno (AD-4).
 *
 * NO es un RPC de Postgres, aunque el contrato original lo previera así:
 * `pgcrypto` no implementa Argon2, y la constraint `students_pin_hash_is_argon2id`
 * exige ese formato. Tampoco se hashea aquí: el PIN en claro no debe pasar por
 * el servidor de Next.js, que no es el guardián de esa credencial.
 *
 * Va a la Edge Function `student-pin`, que es el ÚNICO lugar del sistema que
 * calcula y verifica hashes de PIN — el mismo que ya usa `auth-pin`.
 *
 *   POST {SUPABASE_URL}/functions/v1/student-pin
 *   body: { op: "change", currentPin, newPin }
 *   200 -> { ok: true }
 *   400 -> { error: "bad_current_pin" | "weak_pin" | "wrong_length" | "same_pin" }
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

  // El JWT del alumno viaja a la Edge Function, que deriva su identidad de ahí
  // y jamás del cuerpo: sin esto, un alumno podría cambiarle el PIN a otro.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) redirect(ROUTES.login);

  let result: { ok?: boolean; error?: string };
  try {
    const respuesta = await fetchConPlazo(`${getSupabaseUrl()}/functions/v1/student-pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({
        op: "change",
        currentPin: parsed.data.currentPin,
        newPin: parsed.data.newPin,
      }),
      cache: "no-store",
    }, PLAZO_AUTENTICAR_MS);
    // `?? {}` porque un cuerpo ilegible llega como `null` y `null.ok` reventaria
    // FUERA del try: cae al `default` del switch, que es `unexpected`.
    result = (respuesta.cuerpo ?? {}) as { ok?: boolean; error?: string };
  } catch (error) {
    logInternal("student-pin unreachable", error);
    return fail("unexpected");
  }

  if (!result.ok) {
    switch (result.error) {
      case "bad_current_pin":
        return fail("bad_credentials", "currentPin");
      case "weak_pin":
        return fail("pin_too_weak", "newPin");
      case "wrong_length":
        return fail("pin_wrong_length", "newPin");
      // `same_pin` reutiliza el mensaje de PIN débil: para el alumno, "elige otro
      // distinto" es la misma instrucción y no merece una cadena aparte.
      case "same_pin":
        return fail("pin_too_weak", "newPin");
      default:
        logInternal("student-pin rechazado", result.error ?? "unknown");
        return fail("unexpected");
    }
  }

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
  //
  // Es la PRIMERA línea, no la única: vive en la memoria de una instancia
  // serverless y se rinde ante un atacante que cambie de IP (lo dice la
  // cabecera de `lib/security/rate-limit.ts`). Las dos defensas que sí
  // sobreviven a eso están más abajo, contra la base de datos.
  const limited = rateLimit(`register:${clientKeyFromHeaders(headerStore)}`, 5, 3_600_000);
  if (!limited.allowed) return fail("rate_limited");

  // El colegio tiene que EXISTIR y estar activo. Antes lo decidía la FK a
  // `schools` cuando insertaba `anon`; con service_role la FK sigue ahí, pero
  // no distingue un colegio suspendido de uno activo, y una solicitud dirigida
  // a un colegio dado de baja no la mira nadie nunca.
  //
  // Se consulta con el cliente de SESIÓN, no con el de servicio: `anon` ya tiene
  // EXECUTE sobre `list_active_schools()` (0018), que es una proyección de
  // cuatro columnas. Escalar a service_role para leer lo que anon puede leer
  // sería escalar por costumbre.
  const schools = await listActiveSchools();
  if (!schools.some((school) => school.id === parsed.data.schoolId)) {
    logInternal("registration a colegio inexistente o inactivo", parsed.data.schoolId);
    // Mismo código que un fallo de base de datos: distinguirlos permitiría
    // enumerar qué colegios están dados de alta en la plataforma.
    return fail("unexpected");
  }

  /*
   * POR QUÉ SERVICE_ROLE AQUÍ, Y QUÉ SE PONE EN SU LUGAR
   * -------------------------------------------------------------------------
   * Este INSERT lo hacía el cliente ANÓNIMO, y el comentario que había aquí
   * afirmaba que existía una política de RLS que concedía INSERT a `anon`.
   * Nunca existió, ni la política ni el GRANT. Comprobado contra producción el
   * 27/08/2026 en una transacción revertida:
   *
   *   [ANON alta] 42501 :: permission denied for table registration_requests
   *
   * O sea: el formulario de alta pública llevaba desde siempre sin escribir una
   * sola fila. Es el mismo patrón que la telemetría (R3): dos piezas escritas
   * por separado, cada una declarando lo contrario de la otra.
   *
   * De las dos declaraciones gana la de `0012_rls_policies.sql`, que es
   * deliberada y está razonada: «Dar INSERT a `anon` sobre esta tabla sería un
   * formulario de spam abierto a internet». Conceder ese GRANT sería debilitar
   * una defensa para que el código pase, que es justo lo que no se hace aquí.
   * Se arregla el código: el alta la escribe el SERVIDOR con service_role.
   *
   * Lo que se pierde y hay que reponer: con `anon` la RLS era la segunda
   * barrera. Ya no hay ninguna detrás. Las que la sustituyen son tres, y
   * ninguna de ellas está en la base de datos:
   *   1. La validación de `registrationSchema`, endurecida por esto mismo.
   *   2. La comprobación del colegio activo de arriba.
   *   3. La deduplicación y el tope por correo de abajo.
   *
   * Y lo que NO se hace, que importa igual:
   *   - NO se pone un tope de solicitudes pendientes POR COLEGIO. Sería la
   *     defensa obvia contra una inundación, y es una trampa: cualquiera podría
   *     llenar el cupo de un colegio y dejar fuera a las familias reales.
   *     Cambiar spam por denegación del alta es un intercambio peor.
   *   - NO hay captcha, y es lo único que de verdad para a un bot distribuido.
   *     `0012` lo daba por hecho («valida el slug del colegio y un captcha») y
   *     no existe en ninguna parte del repo. Requiere una cuenta de proveedor y
   *     un secreto en el entorno: no se puede añadir desde aquí.
   *     ES UN HUECO ABIERTO Y DECLARADO, no un olvido.
   */
  const admin = createAdminClient(
    "alta publica de registration_requests: anon no tiene GRANT ni politica de INSERT (0012, a proposito)",
  );

  // Ventana y tope por CORREO DEL TUTOR, no por IP: es lo que sigue en pie
  // cuando el atacante rota de dirección. Cinco en 24 h cubre a una familia
  // numerosa que se equivoca un par de veces.
  const VENTANA_MS = 24 * 60 * 60 * 1000;
  const MAX_POR_CORREO = 5;
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();

  const { data: recientes, error: readError } = await admin
    .from("registration_requests")
    .select("id, school_id, full_name, status")
    .eq("guardian_email", parsed.data.guardianEmail)
    .gte("created_at", desde);

  if (readError) {
    // Falla CERRADO. Si esta lectura no se puede hacer, las dos defensas que
    // dependen de ella no existen, y seguir adelante sería insertar sin
    // ninguna: exactamente el formulario de spam que se está evitando.
    logInternal("registration dedup read failed", `${readError.code} :: ${readError.message}`);
    return fail("unexpected");
  }

  const filas = recientes ?? [];

  // Deduplicación: la MISMA solicitud (colegio + tutor + nombre del alumno) ya
  // está en la cola sin revisar. Se devuelve la pantalla de "enviada" sin
  // escribir nada. Es idempotente a propósito: al tutor que ha pulsado dos
  // veces no se le puede decir que ha hecho algo mal, y decirle "ya existe"
  // convertiría el formulario en un oráculo de qué alumnos están apuntados.
  const duplicada = filas.some(
    (fila) =>
      fila.status === "pending" &&
      fila.school_id === parsed.data.schoolId &&
      fila.full_name === parsed.data.fullName,
  );

  if (!duplicada && filas.length >= MAX_POR_CORREO) {
    logInternal("registration tope por correo alcanzado", filas.length);
    return fail("rate_limited");
  }

  if (!duplicada) {
    const { error } = await admin.from("registration_requests").insert({
      school_id: parsed.data.schoolId,
      full_name: parsed.data.fullName,
      requested_year_level: parsed.data.requestedYearLevel,
      guardian_email: parsed.data.guardianEmail,
      note: parsed.data.note || null,
      // Se fija aquí y no se acepta del formulario: es la única transición que
      // esta acción tiene derecho a hacer. Aprobar y rechazar son del panel.
      status: "pending",
    });

    if (error) {
      // R4: silencioso es peor que ruidoso. `console.error` y CON el código de
      // PostgREST — el 42501 de este mismo fallo llevaba meses sin aparecer en
      // ningún sitio porque lo que se registraba era solo `error.message`.
      logLost("registration insert failed", error);
      // No se distingue "ese colegio no existe" de "fallo de base de datos": lo
      // primero permitiría enumerar los colegios dados de alta.
      return fail("unexpected");
    }
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
