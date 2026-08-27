/**
 * student-pin — alta y cambio de PIN de alumno (AD-4)
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA FUNCIÓN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * El contrato original preveía un RPC de Postgres `app.change_student_pin(...)`
 * que "escribe el nuevo hash Argon2id". Eso NO SE PUEDE HACER en Postgres:
 * `pgcrypto` implementa bcrypt, md5, sha y pgp, pero no Argon2. No existe una
 * extensión de Argon2 disponible en Supabase.
 *
 * Escribir el hash desde la app web tampoco vale: el PIN en claro viajaría al
 * servidor de Next.js, que no es el guardián de esa credencial, y la constraint
 * `students_pin_hash_is_argon2id` obliga igualmente a Argon2id.
 *
 * Así que el hashing vive donde ya vive la verificación: en una Edge Function
 * de Deno, con `hash-wasm`. Un solo lugar del sistema calcula y comprueba PINs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPERACIONES
 * ─────────────────────────────────────────────────────────────────────────────
 *   change    El propio alumno cambia su PIN. Exige el PIN actual.
 *   reset     Un school_admin regenera el PIN de un alumno de SU colegio.
 *             Devuelve el PIN generado UNA sola vez, para que lo entregue en
 *             mano. Nunca se puede volver a leer: solo queda el hash.
 *   provision Crea la cuenta sintética de auth de un alumno que aún no la tiene
 *             y le fija un PIN inicial. Solo school_admin.
 *
 * Todas exigen JWT válido (`verify_jwt: true`) y comprueban el rol y el tenant
 * del llamante contra la base de datos, nunca contra lo que diga el cuerpo.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { argon2id, argon2Verify } from "https://esm.sh/hash-wasm@4.11.0";

/* -------------------------------------------------------------------------- */
/* Parámetros de coste                                                        */
/* -------------------------------------------------------------------------- */
/**
 * IDÉNTICOS a los del hash señuelo de `auth-pin`. Si divergieran, verificar un
 * PIN real costaría distinto que verificar el señuelo y el tiempo de respuesta
 * volvería a revelar qué códigos de alumno existen.
 *
 * 19 MiB / 2 pasadas es el perfil "second recommended" de OWASP para Argon2id.
 * Un PIN de 4 dígitos solo tiene 10.000 combinaciones: la fuerza no está en el
 * secreto sino en el coste por intento, el lockout y el rate limit por IP.
 */
const ARGON = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

const enc = new TextEncoder();

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

const pinShape = z.string().regex(/^[0-9]{4,8}$/);

const body = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("change"),
    currentPin: pinShape,
    newPin: pinShape,
  }),
  z.object({
    op: z.literal("reset"),
    studentProfileId: z.string().uuid(),
  }),
  z.object({
    op: z.literal("provision"),
    studentProfileId: z.string().uuid(),
  }),
]);

/* -------------------------------------------------------------------------- */
/* PIN débiles                                                                */
/* -------------------------------------------------------------------------- */
/**
 * Se comprueba EN EL SERVIDOR aunque la app ya lo valide: la validación de
 * cliente es una cortesía para el usuario, nunca un control de seguridad. Un
 * `curl` se la salta entera.
 *
 * La lista es corta a propósito. Bloquear demasiado obliga a un niño de 10 años
 * a inventar un PIN que no recordará, y un PIN olvidado acaba escrito en la
 * tapa del estuche — que es mucho peor que "1357".
 */
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111, 999999

  const ascending = "0123456789012345";
  const descending = "9876543210987654";
  if (ascending.includes(pin) || descending.includes(pin)) return true; // 1234, 4321

  const blocked = new Set(["1010", "2020", "1212", "2121", "6969", "112233", "123123"]);
  return blocked.has(pin);
}

/** PIN aleatorio con `crypto.getRandomValues`: `Math.random()` no es criptográfico. */
function randomPin(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let pin = "";
  for (const b of bytes) pin += String(b % 10);
  // Un PIN generado que salga débil se descarta y se vuelve a tirar: el profesor
  // no debería tener que mirar si al alumno le tocó "0000".
  return isWeakPin(pin) ? randomPin(length) : pin;
}

async function hashPin(pin: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return await argon2id({ password: pin, salt, ...ARGON, outputType: "encoded" });
}

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

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const passwordSecret = Deno.env.get("CET_STUDENT_PASSWORD_SECRET")!;

  if (!passwordSecret) {
    console.error("student-pin: falta CET_STUDENT_PASSWORD_SECRET");
    return json({ error: "server_error" }, 500);
  }

  /* --- Identidad del llamante, desde el JWT y NUNCA desde el cuerpo -------- */
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData } = await asCaller.auth.getUser();
  const callerId = userData.user?.id;
  if (!callerId) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: caller } = await admin
    .from("profiles")
    .select("id, role, school_id, status")
    .eq("id", callerId)
    .maybeSingle();

  if (!caller || caller.status !== "active") return json({ error: "unauthorized" }, 401);

  let input: z.infer<typeof body>;
  try {
    input = body.parse(await req.json());
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  /* ======================================================================== */
  /* change — el alumno cambia su propio PIN                                  */
  /* ======================================================================== */
  if (input.op === "change") {
    if (caller.role !== "student") return json({ error: "forbidden" }, 403);

    const { data: student } = await admin
      .from("students")
      .select("profile_id, school_id, pin_hash, stage")
      .eq("profile_id", callerId)
      .maybeSingle();

    if (!student) return json({ error: "forbidden" }, 403);

    const ok = await argon2Verify({ password: input.currentPin, hash: student.pin_hash }).catch(
      () => false,
    );
    // Sin lockout aquí a propósito: el atacante ya tiene una sesión válida de
    // este alumno, así que adivinar su PIN actual no le da nada nuevo. Meter
    // lockout permitiría a un compañero con la tableta prestada dejar al dueño
    // bloqueado fuera de su cuenta.
    if (!ok) return json({ error: "bad_current_pin" }, 400);

    const required = await requiredPinLength(admin, student.school_id, student.stage);
    if (input.newPin.length !== required) {
      return json({ error: "wrong_length", expected: required }, 400);
    }
    if (isWeakPin(input.newPin)) return json({ error: "weak_pin" }, 400);
    if (input.newPin === input.currentPin) return json({ error: "same_pin" }, 400);

    const { error } = await admin
      .from("students")
      .update({
        pin_hash: await hashPin(input.newPin),
        pin_must_change: false,
        pin_updated_at: new Date().toISOString(),
        failed_pin_attempts: 0,
        locked_until: null,
      })
      .eq("profile_id", callerId);

    if (error) {
      console.error("student-pin change:", error);
      return json({ error: "server_error" }, 500);
    }

    await admin.from("learning_events").insert({
      school_id: student.school_id,
      student_id: callerId,
      session_id: crypto.randomUUID(),
      seq: 0,
      event_type: "pin_changed",
      payload: { by: "student" },
    });

    return json({ ok: true }, 200);
  }

  /* ======================================================================== */
  /* reset y provision — solo el school_admin de SU colegio                   */
  /* ======================================================================== */
  const isAdmin = caller.role === "school_admin" || caller.role === "superadmin";
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const { data: student } = await admin
    .from("students")
    .select("profile_id, school_id, student_code, stage")
    .eq("profile_id", input.studentProfileId)
    .maybeSingle();

  // 404 y no 403: confirmar que el alumno existe pero es de otro colegio ya es
  // filtrar información entre tenants.
  if (!student) return json({ error: "not_found" }, 404);
  if (caller.role !== "superadmin" && student.school_id !== caller.school_id) {
    return json({ error: "not_found" }, 404);
  }

  const { data: school } = await admin
    .from("schools")
    .select("id, slug")
    .eq("id", student.school_id)
    .maybeSingle();

  if (!school) return json({ error: "server_error" }, 500);

  const length = await requiredPinLength(admin, student.school_id, student.stage);
  const pin = randomPin(length);
  const pinHash = await hashPin(pin);

  if (input.op === "provision") {
    // NO se crea la cuenta: ya existe. `profiles.id` referencia `auth.users(id)`
    // y `students.profile_id` referencia `profiles(id)`, así que todo alumno con
    // ficha tiene forzosamente su fila en auth.users. Aprovisionar es FIJARLE la
    // identidad sintética, no darla de alta.
    //
    // (Descartada la vía de `createUser` + `listUsers()` para localizar la
    //  cuenta si ya existía: `listUsers()` pagina de 50 en 50, así que en un
    //  colegio de 400 alumnos habría fallado en silencio a partir del 51.)
    const email = `s.${student.student_code}@${school.slug}.students.cet.invalid`;
    const password = await hmacBase64(passwordSecret, student.profile_id);

    const { error: updateError } = await admin.auth.admin.updateUserById(student.profile_id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { cet_student_code: student.student_code },
    });

    if (updateError) {
      console.error("student-pin provision:", updateError);
      return json({ error: "server_error" }, 500);
    }
  }

  const { error } = await admin
    .from("students")
    .update({
      pin_hash: pinHash,
      pin_must_change: true, // AD-4: el alumno lo cambia en su primer acceso
      pin_updated_at: new Date().toISOString(),
      failed_pin_attempts: 0,
      locked_until: null,
    })
    .eq("profile_id", student.profile_id);

  if (error) {
    console.error("student-pin reset:", error);
    return json({ error: "server_error" }, 500);
  }

  // Queda en el audit_log: regenerar el PIN de un menor es una acción de staff
  // sobre datos de alumno y tiene que dejar rastro (MASTER_PLAN §9).
  await admin.rpc("audit_student_pin_reset", {
    p_student_id: student.profile_id,
    p_actor_id: callerId,
    p_school_id: student.school_id,
    p_op: input.op,
  });

  // El PIN se devuelve UNA vez. A partir de aquí solo existe su hash.
  return json({ ok: true, pin, mustChange: true }, 200);
});

/* -------------------------------------------------------------------------- */

/** Longitud de PIN según la etapa: AD-4, configurable por colegio. */
async function requiredPinLength(
  admin: SupabaseClient,
  schoolId: string,
  stage: string,
): Promise<number> {
  const { data } = await admin
    .from("schools")
    .select("pin_length_primary, pin_length_secondary")
    .eq("id", schoolId)
    .maybeSingle();

  if (!data) return stage === "secondary" ? 6 : 4;
  return stage === "secondary" ? data.pin_length_secondary : data.pin_length_primary;
}
