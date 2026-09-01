/**
 * auth-pin — login de alumno por colegio + código + PIN (AD-3, AD-4)
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ESQUELETO. Ver modules/auth/CLAUDE.md para el contrato completo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * ─────────────────────────────────────────────────────────────────────────────
 *   colegio + código de alumno + PIN   (la puerta del colegio)
 *   deviceToken + PIN                  (la puerta del dispositivo)
 *        -> valida entrada (Zod)
 *        -> RESUELVE UN ALUMNO, que es lo único distinto entre las dos puertas
 *        -> rate limit por código Y por IP
 *        -> comprueba lockout
 *        -> verifica Argon2id
 *        -> canjea por una sesión REAL de Supabase
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS DOS PUERTAS, Y LO QUE NO CAMBIA ENTRE ELLAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La cookie de dispositivo NO ABRE NINGUNA SESIÓN por sí sola. Lo único que
 * compra es saltarse los pasos «colegio» y «código» del formulario: la sesión
 * sigue naciendo de un Argon2id verificado, y `auth.uid()` sigue siendo el único
 * eje de la RLS. La alternativa —mantener la sesión viva para siempre y poner el
 * PIN como pantalla de bloqueo— convierte el PIN en decoración, porque quien
 * coja la tablet entra navegando directamente a `/learn`.
 *
 * Cada puerta resuelve UN `profile_id` de alumno y ahí se acaba la diferencia:
 *   - El lockout y el rate limit se cuentan POR ALUMNO, nunca por puerta. Si se
 *     contaran por puerta, alternarlas daría intentos infinitos contra el mismo
 *     PIN, que es exactamente lo que el lockout existe para impedir.
 *   - Un `deviceToken` desconocido o revocado verifica IGUALMENTE contra el hash
 *     señuelo y sale por `respond()`. Si «dispositivo desconocido» respondiera
 *     en 5 ms y «PIN incorrecto» en 90, se enumerarían tokens con un cronómetro.
 *   - Dispositivo revocado, alumno inexistente y colegio suspendido devuelven
 *     todos el MISMO cuerpo: `genericFailure()`.
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
import { argon2Verify } from "https://esm.sh/hash-wasm@4.11.0";

// Las piezas puras —los dos esquemas de la frontera, el hash del token, el
// correo sintético— viven en `_shared/puertas.ts`, que importa zod y nada más.
// Es el único código de esta función que una prueba unitaria puede importar:
// ver la cabecera de `supabase/functions/vitest.config.mjs`.
import {
  claveDeIntento,
  emailSinteticoDeAlumno,
  entradaDeAuthPin,
  esPuertaDeDispositivo,
  sha256hex,
  type EntradaDeAuthPin,
} from "../_shared/puertas.ts";

// El rastro de accesos (`accesos_de_alumno`) tiene su propio módulo puro por el
// mismo motivo: qué IP es mandable como `inet`, qué cabeceras de geo se leen y
// cómo se degrada un user-agent son decisiones que conviene poder probar sin red.
import {
  contextoDeAcceso,
  parametrosDeAcceso,
  type TipoDeAcceso,
} from "../_shared/accesos.ts";

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
 * Zod en la frontera, sin excepción (MASTER_PLAN §3). `entradaDeAuthPin` es la
 * unión de las dos puertas y vive en `_shared/puertas.ts` para poder probarse
 * sin red. El PIN se acota a 4–8 dígitos y el `deviceToken` a 43 caracteres de
 * base64url ANTES de tocar la base de datos: sin ese límite, una entrada de
 * 10 MB llegaría hasta el verificador de Argon2id y sería una denegación de
 * servicio gratuita (cada verificación reserva 19 MiB de memoria).
 */
type LoginInput = EntradaDeAuthPin;

/** Motivos de fallo. Se registran en telemetría; NUNCA se devuelven al cliente. */
type FailureReason =
  | "bad_pin"
  | "locked"
  | "unknown_code"
  | "unknown_device"
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

/**
 * `ip_hash = sha256(ip + salt)` (DATA_MODEL §6). El salt vive en el entorno y no
 * en la base de datos: el espacio IPv4 tiene 2^32 direcciones, así que un hash
 * sin salt secreto se revierte con una tabla precalculada en minutos.
 */
async function hashIp(req: Request, salt: string): Promise<string | null> {
  // `x-cet-ip` PRIMERO, y no es un detalle de esta tabla nueva: es el arreglo
  // de `IP_RATE_LIMIT`. Nadie llega aquí desde un navegador —`signInStudent` y
  // `canjearEnlace` llaman de servidor a servidor desde Vercel—, así que
  // `x-forwarded-for` traía SIEMPRE la IP de salida de Vercel. Todos los
  // alumnos de la plataforma compartían por tanto un único `ip_hash`, y el
  // contador de treinta fallos que se lee «por IP» se comportaba «por
  // plataforma»: treinta PIN fallidos entre todos los niños en quince minutos
  // —un aula un lunes— y dejaba de entrar todo el mundo.
  //
  // La capa web manda la IP real percent-codificada, por lo mismo que la geo:
  // un byte fuera de ASCII hace que `fetch` rechace la petición entera.
  const declarada = req.headers.get("x-cet-ip");
  let ip = declarada === null || declarada.trim() === ""
    ? null
    : (() => {
      try {
        return decodeURIComponent(declarada).trim();
      } catch {
        return declarada.trim();
      }
    })();

  // Sin la web por delante —una llamada directa a la función— el
  // `x-forwarded-for` sí es el del llamante y sigue valiendo.
  ip ??= req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  if (!ip) return null;
  return await sha256hex(`${ip}${salt}`);
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
/* Filas                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Los mismos campos para las dos puertas. Se listan una sola vez a proposito: si
 * una puerta leyera menos campos que la otra, el camino comun dejaria de serlo.
 */
const CAMPOS_DE_ALUMNO =
  "profile_id, school_id, student_code, pin_hash, failed_pin_attempts, locked_until, pin_must_change, stage";

type StudentRow = {
  profile_id: string;
  /** Nulo para el hijo de un tutor: nace sin colegio. */
  school_id: string | null;
  student_code: string;
  pin_hash: string;
  failed_pin_attempts: number;
  locked_until: string | null;
  pin_must_change: boolean;
  stage: string;
};

type SchoolRow = { id: string; slug: string; status: string };

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

  // Todo el contexto de la petición, calculado UNA vez y compartido por la
  // salida buena y la mala: si el login fallido registrara menos que el
  // correcto, el archivo serviría justo para lo contrario de para lo que se creó.
  const contexto = contextoDeAcceso(req.headers, ipHash);

  /**
   * Deja constancia del acceso, y NUNCA tumba el login.
   *
   * Misma regla que `auditar()` en `apps/web/.../actions.ts`: no lanza, grita en
   * `console.error` con prefijo greppable y sigue. Un rastro perdido es un
   * incidente de cumplimiento; un niño que no puede entrar es un producto roto.
   *
   * SOBRE EL TIEMPO DE RESPUESTA, que aquí es una propiedad de seguridad y no un
   * detalle de rendimiento: esta llamada solo ocurre cuando HAY alumno resuelto,
   * porque `accesos_de_alumno.student_id` es NOT NULL y un código inexistente no
   * tiene a quién colgarse. Es decir, el camino «el alumno existe» hace un viaje
   * a PostgREST que el camino «no existe» no hace, y esa diferencia es
   * exactamente la que `genericFailure()` existe para no filtrar.
   *
   * Se acepta porque la defensa contra ese oráculo NO es que las dos ramas hagan
   * el mismo trabajo —ya no lo hacen: el `insert` en `learning_events` tiene esta
   * misma asimetría desde el primer día—, sino el suelo fijo de MIN_RESPONSE_MS,
   * que está puesto por encima del coste de un Argon2id (~90 ms) precisamente
   * para absorber toda variación de abajo. Un viaje a PostgREST desde la misma
   * región cabe de sobra en ese margen. Lo que sí sería un error es sacar el
   * registro FUERA de `respond()` (un `waitUntil`, un `void` sin `await`): el
   * suelo dejaría de cubrirlo y la diferencia se volvería medible. Por eso se
   * espera aquí dentro, antes de devolver.
   */
  const registrarAcceso = async (
    tipo: TipoDeAcceso,
    studentId: string,
    device: string | null,
  ): Promise<void> => {
    try {
      const { error } = await admin.rpc(
        // Envoltorio en `public` y no `app.registrar_acceso`: PostgREST no expone
        // el esquema `app`, y no debe hacerlo (§6 del diseño; el mismo fallo de
        // 0023, 0063 y 0077).
        "registrar_acceso",
        parametrosDeAcceso(contexto, { studentId, deviceId: device, tipo }),
      );
      if (error) {
        console.error("[cet] auth-pin registrar_acceso", tipo, error.code, error.message);
      }
    } catch (causa) {
      // Red caída, timeout, respuesta ilegible: el login sigue igual.
      console.error("[cet] auth-pin registrar_acceso inalcanzable", tipo, String(causa));
    }
  };

  /* --- 1. Validación de entrada ------------------------------------------- */
  let input: LoginInput;
  try {
    input = entradaDeAuthPin.parse(await req.json());
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

  /* --- 3. Resolver UN alumno, que es lo unico distinto entre las puertas --- */
  // A partir del final de este bloque el codigo es identico para las dos: mismo
  // lockout, mismo Argon2id, mismo canje por sesion. Ninguna de las tres
  // defensas se duplica, y por tanto ninguna puede divergir con el tiempo.

  /** El colegio del alumno. NULO para el hijo de un tutor, que nace sin colegio. */
  let school: SchoolRow | null = null;
  /** La fila de `students`. Nula solo si se sale antes por fallo generico. */
  let student: StudentRow | null = null;
  /** El dispositivo por el que se entro, para sellarle `last_seen_at` al salir bien. */
  let deviceId: string | null = null;

  if (esPuertaDeDispositivo(input)) {
    /* --- 3a. La puerta del dispositivo ------------------------------------ */
    // La base solo guarda el SHA-256 del secreto: el token en claro vive en la
    // cookie `HttpOnly` y en ningun otro sitio. Perder la cookie es perder el
    // atajo, nunca la cuenta.
    const { data: device } = await admin
      .from("student_devices")
      .select("id, student_id")
      .eq("device_hash", await sha256hex(input.deviceToken))
      .is("revoked_at", null)
      .maybeSingle();

    if (!device) {
      // Desconocido o revocado: se gasta la MISMA CPU y el MISMO reloj que un
      // login real, y se devuelve el MISMO cuerpo. Sin esto se enumeran tokens
      // con un cronometro, que es el ataque que esta cabecera ya documenta para
      // los codigos de alumno.
      await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
      return await respond(genericFailure());
    }

    deviceId = device.id as string;

    const { data: fila } = await admin
      .from("students")
      .select(CAMPOS_DE_ALUMNO)
      .eq("profile_id", device.student_id)
      .maybeSingle();

    if (!fila) {
      // Dispositivo huerfano: la fila de `students` ya no esta. Mismo camino de
      // coste y mismo cuerpo.
      await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
      return await respond(genericFailure());
    }

    student = fila as StudentRow;

    if (student.school_id) {
      const { data: colegio } = await admin
        .from("schools")
        .select("id, slug, status")
        .eq("id", student.school_id)
        .maybeSingle();

      if (!colegio || colegio.status !== "active") {
        await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
        return await respond(genericFailure());
      }
      school = colegio as SchoolRow;
    }
    // Sin colegio no hay nada que comprobar: el hijo de un tutor no pertenece a
    // ningun tenant y no puede quedarse fuera porque un colegio se suspenda.
  } else {
    /* --- 3b. La puerta del colegio, intacta ------------------------------- */
    const { data: colegio } = await admin
      .from("schools")
      .select("id, slug, status")
      .eq("id", input.schoolId)
      .maybeSingle();

    // Colegio inexistente o suspendido: se sigue el MISMO camino de coste que un
    // login normal (verificación señuelo incluida) para no filtrar por tiempo qué
    // colegios existen.
    if (!colegio || colegio.status !== "active") {
      await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
      return await respond(genericFailure());
    }
    school = colegio as SchoolRow;

    const { data: fila } = await admin
      .from("students")
      .select(CAMPOS_DE_ALUMNO)
      .eq("school_id", school.id)
      .eq("student_code", input.studentCode)
      .maybeSingle();

    student = (fila as StudentRow | null) ?? null;
  }

  /* --- 4. Rate limit por ALUMNO, nunca por puerta -------------------------- */
  // `claveDeIntento` es la que decide sobre que se cuenta, y sale de la fila de
  // `students`: la puerta por la que se llamo NO entra en la clave. Alternar
  // puertas no reinicia esta cuenta ni la esquiva, porque las dos leen y
  // escriben exactamente las mismas filas de `auth_attempts`.
  //
  // Consulta directa a la tabla y no `rpc("recent_failed_attempts")`: los
  // helpers viven en el esquema `app`, que NO está expuesto por PostgREST (y no
  // debe estarlo). `service_role` sí puede consultar la tabla directamente, y el
  // índice `auth_attempts_lookup_idx` convierte esto en un lookup.
  const clave = claveDeIntento(input, student);

  if (clave) {
    const desde = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
    const consulta = admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("student_code", clave.studentCode)
      .eq("success", false)
      .gte("created_at", desde);

    // `is` y no `eq` para el colegio nulo: en Postgres `school_id = NULL` no es
    // falso, es NULL, asi que la cuenta saldria SIEMPRE cero — sin dar un solo
    // error — y el hijo de un tutor no tendria ventana por codigo.
    const { count: codeFailures } =
      clave.schoolId === null
        ? await consulta.is("school_id", null)
        : await consulta.eq("school_id", clave.schoolId);

    if ((codeFailures ?? 0) >= LOCKOUT_THRESHOLD * 2) {
      await recordAttempt(admin, clave.schoolId, clave.studentCode, false, ipHash);
      // Rechazado por rate limit sigue siendo un intento de entrar contra ESTE
      // alumno, y es de los que más importa ver en el panel del tutor: son los
      // que vienen en ráfaga. `device_id` va nulo aquí a propósito — la fila que
      // se registra es el intento, no una visita del aparato (§5).
      if (student) await registrarAcceso("login_fallido", student.profile_id, null);
      return await respond(genericFailure());
    }
  }

  /* --- 5. El PIN ----------------------------------------------------------- */
  let reason: FailureReason | null = null;

  if (!student) {
    // Código inexistente: se gasta la MISMA CPU que en un login real.
    await argon2Verify({ password: input.pin, hash: DECOY_HASH }).catch(() => false);
    reason = "unknown_code";
  } else if (student.locked_until && new Date(student.locked_until) > new Date()) {
    // Cuenta bloqueada: TAMBIÉN se verifica el PIN, aunque el resultado se
    // descarte. Sin esto, "bloqueado" respondería más rápido que "PIN erróneo" y
    // el atacante sabría que ese código existe y que le va quedando poco.
    //
    // El bloqueo lo lleva la fila de `students`, indexada por `profile_id`: la
    // puerta por la que se entro no aparece en esa cuenta.
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

    // `auth_attempts.school_id` es nullable desde 0067: el intento contra el hijo
    // de un tutor se registra igual, con `school_id` nulo. Sin eso habia un
    // ciego — la cuenta seguia protegida, pero nadie podia VER el ataque.
    if (clave) {
      await recordAttempt(admin, clave.schoolId, clave.studentCode, false, ipHash);
    }

    // Telemetría: SOLO si el alumno existe. Un `login_failed` de un código
    // inexistente no tiene student_id al que colgarse (learning_events.student_id
    // es NOT NULL), y ese caso ya queda registrado en auth_attempts, que es la
    // tabla diseñada precisamente para códigos que no existen.
    if (student) {
      await admin.from("learning_events").insert({
        school_id: student.school_id,
        student_id: student.profile_id,
        session_id: crypto.randomUUID(),
        seq: 0,
        event_type: "login_failed",
        payload: { reason },
      });

      // Y el rastro forense, con la misma condición y por la misma razón: sin
      // alumno resuelto no hay `student_id` que registrar (la columna es NOT
      // NULL y apunta a `profiles`). Un código inexistente ya queda en
      // `auth_attempts`, que es la tabla hecha para códigos que no existen.
      await registrarAcceso("login_fallido", student.profile_id, null);
    }

    return await respond(genericFailure());
  }

  /* --- 7. Éxito: sesión real ---------------------------------------------- */
  const alumno = student!;
  const email = emailSinteticoDeAlumno(alumno.student_code, school?.slug ?? null);
  const password = await hmacBase64(passwordSecret, alumno.profile_id);

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
    .eq("profile_id", alumno.profile_id);

  // El dispositivo sella su `last_seen_at`: es lo que el tutor ve en la ficha de
  // su hijo para decidir cual olvidar. Solo se toca cuando la entrada fue BUENA;
  // un intento fallido no es una visita.
  if (deviceId) {
    await admin
      .from("student_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", deviceId);
  }

  if (clave) {
    await recordAttempt(admin, clave.schoolId, clave.studentCode, true, ipHash);
  }

  await admin.from("learning_events").insert({
    school_id: alumno.school_id,
    student_id: alumno.profile_id,
    session_id: crypto.randomUUID(),
    seq: 0,
    event_type: "login_success",
    payload: { stage: alumno.stage, puerta: deviceId ? "dispositivo" : "colegio" },
  });

  // El acceso bueno sí lleva `device_id` cuando se entró por la puerta del
  // dispositivo: es lo que permite a la regla `dispositivo_nuevo` disparar y al
  // tutor decidir qué aparato olvidar.
  await registrarAcceso("login_ok", alumno.profile_id, deviceId);

  return await respond(
    new Response(
      JSON.stringify({
        session: session.session,
        // El cliente debe redirigir al cambio de PIN si es el primer acceso (AD-4).
        pinMustChange: alumno.pin_must_change,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
});

/* -------------------------------------------------------------------------- */

/**
 * Registra el intento en `auth_attempts`. Se llama SIEMPRE que hay una clave de
 * intento, con éxito o sin él, y con `school_id` nulo si el alumno no está
 * matriculado: la tabla existe para detectar patrones, y un patrón con la mitad
 * de los datos no se detecta.
 */
async function recordAttempt(
  admin: ReturnType<typeof createClient>,
  /** Nulo cuando el alumno no esta matriculado en ningun colegio (0067). */
  schoolId: string | null,
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
