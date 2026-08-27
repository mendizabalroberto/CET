/**
 * auth-pin — login de alumno por colegio + código + PIN (AD-3, AD-4)
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ESQUELETO. Ver modules/auth/CLAUDE.md para el contrato completo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * ─────────────────────────────────────────────────────────────────────────────
 *   slug de colegio + código de alumno + PIN
 *        -> valida entrada (Zod)
 *        -> rate limit por código Y por IP
 *        -> comprueba lockout
 *        -> verifica Argon2id
 *        -> canjea por una sesión REAL de Supabase
 *
 * Es la ÚNICA pieza del sistema que lee `students.pin_hash`. Corre con
 * `service_role`, que es el único rol con SELECT sobre esa columna (0013_grants).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA SESIÓN REAL Y NO UN TOKEN PROPIO
 * ─────────────────────────────────────────────────────────────────────────────
 * Toda la seguridad del producto es RLS, y la RLS gira sobre `auth.uid()`. Un
 * token propio obligaría a reimplementar la verificación en cada frontera y a
 * mantener dos sistemas de sesión en paralelo. Así que el alumno tiene un
 * `auth.users` de verdad, con email sintético en un dominio `.invalid`
 * (RFC 2606: nunca resuelve en DNS, luego no puede recibir correo) y una
 * contraseña que él nunca ve ni teclea:
 *
 *     email    = s.<student_code>@<school_slug>.students.cet.invalid
 *     password = base64( HMAC-SHA256( STUDENT_PASSWORD_SECRET, profile_id ) )
 *
 * El PIN NO es la contraseña. El PIN es lo que esta función verifica contra
 * Argon2id; la contraseña sintética es solo el mecanismo interno para pedirle a
 * GoTrue una sesión. Consecuencia deseada: cambiar el PIN no toca `auth.users`,
 * y filtrar la tabla `students` no da acceso a ninguna cuenta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIEMPO CONSTANTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Si "código inexistente" respondiera en 5 ms y "PIN incorrecto" en 90 ms,
 * cualquiera enumeraría el listado completo de alumnos de un colegio con un
 * script y un cronómetro — y con eso ya solo quedan 10.000 PIN que probar.
 * Dos medidas, y las dos son necesarias:
 *   1. Cuando el código no existe, se verifica igualmente el PIN contra un hash
 *      señuelo, para gastar la MISMA CPU (Argon2id es cara a propósito).
 *   2. Toda respuesta se retiene hasta un suelo fijo de MIN_RESPONSE_MS.
 * Y el cuerpo de la respuesta es idéntico para todos los fallos de credencial.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { argon2Verify } from "https://esm.sh/hash-wasm@4.11.0";

/* -------------------------------------------------------------------------- */
/* Configuración                                                              */
/* -------------------------------------------------------------------------- */

/** Fallos permitidos contra un mismo código antes de bloquear la cuenta (AD-4). */
const LOCKOUT_THRESHOLD = 5;
/** Cuánto dura el bloqueo. Largo para el atacante, tolerable para un niño. */
const LOCKOUT_MINUTES = 15;
/** Ventana del rate limit por código. */
const RATE_WINDOW_MINUTES = 15;
/** Fallos por IP en la ventana antes de rechazar sin ni siquiera mirar la DB. */
const IP_RATE_LIMIT = 30;
/** Suelo de tiempo de respuesta. Por encima del coste real de un Argon2id. */
const MIN_RESPONSE_MS = 350;

/**
 * Hash señuelo con los MISMOS parámetros de coste que los reales. Verificar
 * contra él cuesta lo mismo que verificar contra uno de verdad, que es
 * justamente el punto. No corresponde a ningún PIN.
 */
const DECOY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZGVjb3lkZWNveWRlY295ZA$3aMPu3Q1u5oQpXk0Wm7Xr0nJZ8sVQe0h1sK9d2tXqYo";

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Zod en la frontera, sin excepción (MASTER_PLAN §3). El PIN se acota a 4–8
 * dígitos ANTES de tocar la base de datos: sin este límite, un "PIN" de 10 MB
 * llegaría hasta el verificador de Argon2id y sería una denegación de servicio
 * gratuita (cada verificación reserva 19 MiB de memoria).
 */
const loginInput = z.object({
  // El colegio se identifica por su UUID y no por su slug: `schools.id` es la
  // clave de tenant en TODO el modelo de datos, y es lo que devuelve el selector
  // de colegio de la app. El slug es una preocupacion de presentacion (vive en
  // la URL de login) y aqui se deriva, no se recibe.
  schoolId: z.string().uuid(),
  studentCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9._-]+$/),
  pin: z.string().regex(/^[0-9]{4,8}$/),
});

type LoginInput = z.infer<typeof loginInput>;

/** Motivos de fallo. Se registran en telemetría; NUNCA se devuelven al cliente. */
type FailureReason =
  | "bad_pin"
  | "locked"
  | "unknown_code"
  | "school_suspended"
  | "rate_limited";

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

const enc = new TextEncoder();

async function hmacBase64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `ip_hash = sha256(ip + salt)` (DATA_MODEL §6). El salt vive en el entorno y no
 * en la base de datos: el espacio IPv4 tiene 2^32 direcciones, así que un hash
 * sin salt secreto se revierte con una tabla precalculada en minutos.
 */
async function hashIp(req: Request, salt: string): Promise<string | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return null;
  return await sha256Hex(`${ip}${salt}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Respuesta idéntica para TODOS los fallos de credencial. */
function genericFailure(): Response {
  return new Response(
    JSON.stringify({
      error: "invalid_credentials",
      // Mensaje pensado para un niño de 11 años: dice qué hacer, no qué falló.
      message: {
        es: "No hemos podido entrar. Revisa tu código y tu PIN, o pide ayuda a tu profe.",
        en: "We couldn't sign you in. Check your code and PIN, or ask your teacher for help.",
      },
    }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request): Promise<Response> => {
  const startedAt = performance.now();

  /** Retiene la respuesta hasta el suelo de tiempo. Se llama en TODAS las salidas. */
  const respond = async (res: Response): Promise<Response> => {
    const elapsed = performance.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) await sleep(MIN_RESPONSE_MS - elapsed);
    return res;
  };

  if (req.method !== "POST") {
    return await respond(new Response("Method not allowed", { status: 405 }));
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const passwordSecret = Deno.env.get("CET_STUDENT_PASSWORD_SECRET")!;
  const ipSalt = Deno.env.get("CET_IP_HASH_SALT")!;

  // Cliente administrativo: es quien puede leer pin_hash y escribir en las
  // tablas de auditoría. `persistSession: false` porque una Edge Function es
  // efímera y no debe arrastrar estado entre invocaciones.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ipHash = await hashIp(req, ipSalt);

  /* --- 1. Validación de entrada ------------------------------------------- */
  let input: LoginInput;
  try {
    input = loginInput.parse(await req.json());
  } catch {
    // Entrada mal formada: ni siquiera se registra como intento de login contra
    // un código, porque no hay código válido contra el que registrarlo.
    return await respond(genericFailure());
  }

  /* --- 2. Rate limit por IP ----------------------------------------------- */
  // Va PRIMERO y es el eje que la mayoría de implementaciones olvida: un
  // atacante que prueba UN PIN contra QUINIENTOS códigos distintos no dispara
  // nunca el límite por código ni bloquea ninguna cuenta, pero sí este.
  if (ipHash) {
    const { count } = await admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .eq("success", false)
      .gte("created_at", new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString());

    if ((count ?? 0) >= IP_RATE_LIMIT) {
      return await respond(genericFailure());
    }
  }

  /* --- 3. Colegio ---------------------------------------------------------- */
  const { data: school } = await admin
    .from("schools")
    .select("id, slug, status, pin_length_primary, pin_length_secondary")
    .eq("id", input.schoolId)
    .maybeSingle();

  // Colegio inexistente o suspendido: se sigue el MISMO camino de coste que un
  // login normal (verificación señuelo incluida) para no filtrar por tiempo qué
  // slugs existen.
  if (!school || school.status !== "active") {
    await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
    return await respond(genericFailure());
  }

  /* --- 4. Rate limit por código ------------------------------------------- */
  // Consulta directa a la tabla y no `rpc("recent_failed_attempts")`: los
  // helpers viven en el esquema `app`, que NO está expuesto por PostgREST (y no
  // debe estarlo). `service_role` sí puede consultar la tabla directamente, y el
  // índice `auth_attempts_lookup_idx` convierte esto en un lookup.
  const { count: codeFailures } = await admin
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("school_id", school.id)
    .eq("student_code", input.studentCode)
    .eq("success", false)
    .gte("created_at", new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString());

  if ((codeFailures ?? 0) >= LOCKOUT_THRESHOLD * 2) {
    await recordAttempt(admin, school.id, input.studentCode, false, ipHash);
    return await respond(genericFailure());
  }

  /* --- 5. Alumno ----------------------------------------------------------- */
  const { data: student } = await admin
    .from("students")
    .select("profile_id, pin_hash, failed_pin_attempts, locked_until, pin_must_change, stage")
    .eq("school_id", school.id)
    .eq("student_code", input.studentCode)
    .maybeSingle();

  let reason: FailureReason | null = null;

  if (!student) {
    // Código inexistente: se gasta la MISMA CPU que en un login real.
    await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
    reason = "unknown_code";
  } else if (student.locked_until && new Date(student.locked_until) > new Date()) {
    // Cuenta bloqueada: TAMBIÉN se verifica el PIN, aunque el resultado se
    // descarte. Sin esto, "bloqueado" respondería más rápido que "PIN erróneo" y
    // el atacante sabría que ese código existe y que le va quedando poco.
    await argon2Verify({ password: input.pin, hash: student.pin_hash }).catch(() => false);
    reason = "locked";
  } else {
    const ok = await argon2Verify({ password: input.pin, hash: student.pin_hash }).catch(
      () => false,
    );
    if (!ok) reason = "bad_pin";
  }

  /* --- 6. Fallo: contar, bloquear, registrar ------------------------------- */
  if (reason !== null) {
    if (student && reason === "bad_pin") {
      const failed = student.failed_pin_attempts + 1;
      await admin
        .from("students")
        .update({
          failed_pin_attempts: failed,
          locked_until:
            failed >= LOCKOUT_THRESHOLD
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
              : null,
        })
        .eq("profile_id", student.profile_id);
    }

    await recordAttempt(admin, school.id, input.studentCode, false, ipHash);

    // Telemetría: SOLO si el alumno existe. Un `login_failed` de un código
    // inexistente no tiene student_id al que colgarse (learning_events.student_id
    // es NOT NULL), y ese caso ya queda registrado en auth_attempts, que es la
    // tabla diseñada precisamente para códigos que no existen.
    if (student) {
      await admin.from("learning_events").insert({
        school_id: school.id,
        student_id: student.profile_id,
        session_id: crypto.randomUUID(),
        seq: 0,
        event_type: "login_failed",
        payload: { reason },
      });
    }

    return await respond(genericFailure());
  }

  /* --- 7. Éxito: sesión real ---------------------------------------------- */
  const email = `s.${input.studentCode}@${school.slug}.students.cet.invalid`;
  const password = await hmacBase64(passwordSecret, student!.profile_id);

  // Cliente ANÓNIMO a propósito: la sesión debe emitirla GoTrue por la vía
  // normal, con su rotación de refresh tokens y su expiración. Un token firmado
  // a mano por esta función sería un segundo sistema de sesión que mantener.
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: session, error: signInError } = await publicClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.session) {
    // El PIN era correcto pero la cuenta sintética no existe o está rota. Es un
    // fallo del SERVIDOR, no de la credencial: 500, y no se cuenta como intento
    // fallido (sería castigar al alumno por un bug nuestro).
    console.error("auth-pin: la cuenta sintética falló pese a un PIN válido", signInError);
    return await respond(
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
  }

  // Contador a cero y sello de última actividad.
  await admin
    .from("students")
    .update({ failed_pin_attempts: 0, locked_until: null })
    .eq("profile_id", student!.profile_id);

  await recordAttempt(admin, school.id, input.studentCode, true, ipHash);

  await admin.from("learning_events").insert({
    school_id: school.id,
    student_id: student!.profile_id,
    session_id: crypto.randomUUID(),
    seq: 0,
    event_type: "login_success",
    payload: { stage: student!.stage },
  });

  return await respond(
    new Response(
      JSON.stringify({
        session: session.session,
        // El cliente debe redirigir al cambio de PIN si es el primer acceso (AD-4).
        pinMustChange: student!.pin_must_change,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
});

/* -------------------------------------------------------------------------- */

/**
 * Registra el intento en `auth_attempts`. Se llama SIEMPRE que hay un colegio
 * identificado, con éxito o sin él: la tabla existe para detectar patrones, y un
 * patrón con la mitad de los datos no se detecta.
 */
async function recordAttempt(
  admin: ReturnType<typeof createClient>,
  schoolId: string,
  studentCode: string,
  success: boolean,
  ipHash: string | null,
): Promise<void> {
  await admin.from("auth_attempts").insert({
    school_id: schoolId,
    student_code: studentCode,
    success,
    ip_hash: ipHash,
  });
}
