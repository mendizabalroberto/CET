"use server";

/**
 * Las seis acciones de la cadena de invitacion.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * FORMA DE TODA ACCION DE ESTE FICHERO
 * ===========================================================================
 *   1. Comprobar el rol EN EL SERVIDOR, ANTES de escalar a `service_role`. Que
 *      la UI ocultara el boton no cuenta: una Server Action es un endpoint HTTP
 *      y se puede invocar con `fetch`. Las dos excepciones —`altaDeTutor` y
 *      `canjearEnlace`— no tienen sesion que comprobar por definicion, y en su
 *      lugar exigen un token de 256 bits que solo llego por el buzon o por el
 *      enlace: ese token ES la credencial.
 *   2. Validar la entrada con Zod. El `FormData` viene del cliente.
 *   3. Comprobar la pertenencia con una consulta explicita. RLS ya lo hace;
 *      esto es la segunda capa, y es la unica que queda en pie cuando la accion
 *      escribe con `service_role`.
 *   4. Ejecutar, con `rollback()` si un paso posterior puede fallar dejando una
 *      cuenta huerfana. Es el patron de `createStudent` (staff/actions.ts:389):
 *      un `auth.users` sin ficha es invisible desde el panel y perfectamente
 *      utilizable.
 *   5. Auditar.
 *
 * ===========================================================================
 * EL TOKEN NO SE REGISTRA. NUNCA.
 * ===========================================================================
 * Ni la URL que lo contiene. En este fichero no hay un solo `console.*` que
 * reciba un token, una URL de enlace o un PIN, y los errores se registran por
 * su `message` y su `code`, jamas por el cuerpo de la peticion. Un token en un
 * log es una credencial en un log, y una de ellas es la de un menor.
 *
 * Las URLs viajan UNA sola vez, en `values.url` del estado que se devuelve, con
 * el mismo tratamiento que ya recibe el PIN de un solo uso de `resetStudentPin`
 * (modules/admin §4).
 * ===========================================================================
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { enlaceDeVinculacion, telegramDisponible } from "@/lib/telegram/bot";
import { fetchConPlazo, PLAZO_AUTENTICAR_MS } from "@/lib/net/plazo";
import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import {
  cabecerasDeContexto,
  contextoDeAcceso,
  registrarAcceso,
} from "@/lib/seguridad/accesos";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { escribirCookieDispositivo, familiaDeAgente } from "./dispositivo";
import {
  altaDeTutorSchema,
  canjeDeEnlaceSchema,
  crearHijoSchema,
  etapaDeCurso,
  invitarTutorSchema,
  olvidarDispositivoSchema,
} from "./schemas";
import { generarToken, hashToken } from "./tokens";

/* ========================================================================== */
/* Resultado uniforme                                                         */
/* ========================================================================== */

/**
 * Las acciones devuelven CLAVES de diccionario, no frases. Una Server Action no
 * puede saber el idioma del usuario sin volver a resolverlo, y devolver texto
 * ya traducido desde el servidor es como se cuelan cadenas fijas en un producto
 * bilingue (AD-7).
 */
export interface TutorState {
  readonly ok: boolean;
  readonly errorKey?: string;
  readonly successKey?: string;
  /**
   * Valores para interpolar en la cadena del diccionario.
   *
   * `values.url` es el enlace recien creado, y viaja AQUI y en ninguna otra
   * parte: no se persiste en claro, no se registra y no se vuelve a devolver.
   * Quien lo pierda genera otro.
   */
  readonly values?: Record<string, string | number>;
}

function fail(errorKey: string, values?: Record<string, string | number>): TutorState {
  return values === undefined ? { ok: false, errorKey } : { ok: false, errorKey, values };
}

function done(successKey: string, values?: Record<string, string | number>): TutorState {
  return values === undefined ? { ok: true, successKey } : { ok: true, successKey, values };
}

/** Siete dias. Un enlace que no caduca es una credencial permanente. */
const VIDA_ENLACE_MS = 7 * 24 * 60 * 60 * 1000;

function dentroDeSieteDias(): string {
  return new Date(Date.now() + VIDA_ENLACE_MS).toISOString();
}

type Fila = Record<string, unknown>;

function columnaTexto(fila: Fila | null, columna: string): string | null {
  const v = fila?.[columna];
  return typeof v === "string" ? v : null;
}

/* ========================================================================== */
/* Origen publico                                                             */
/* ========================================================================== */

/**
 * El origen con el que se compone la URL del enlace.
 *
 * Sale de las cabeceras de la peticion en curso y no de una constante, porque
 * la misma aplicacion se sirve en `localhost`, en un dominio de vista previa de
 * Vercel y en produccion, y un enlace con el origen equivocado es un enlace que
 * no abre. `NEXT_PUBLIC_SITE_URL` es la reserva para cuando no hay cabecera.
 */
async function origenPublico(): Promise<string> {
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  if (host !== null && host.trim() !== "") {
    const proto = cabeceras.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/* ========================================================================== */
/* Auditoria                                                                  */
/* ========================================================================== */

/**
 * Escribe en `audit_log` con la SESION de quien actua, nunca con el cliente de
 * servicio: `app.audit()` deriva el actor de `auth.uid()`, y un registro en el
 * que el actor es NULL no prueba nada.
 *
 * Prueba primero el envoltorio de `public` (0023, el unico esquema que este
 * PostgREST expone) y cae a `app.audit` si aquel no esta. Misma escalera que
 * `components/staff/audit-rpc.ts`, replicada aqui y no importada porque aquel
 * modulo vive bajo `components/` y esta capa no debe depender de la de UI.
 *
 * NO LANZA. Una accion que ya se ejecuto no se reporta como fallida porque el
 * log fallara; pero se grita en `console.error` con un prefijo greppable,
 * porque una auditoria perdida es un incidente de cumplimiento (R4).
 *
 * EL VOCABULARIO ES POR ROL, y lo fija `0068_auditoria_de_la_cadena.sql`.
 * `public.audit_staff_action` no es solo un validador: es la puerta, y
 * distingue quien llama de que puede decir. El tutor solo puede escribir sus
 * tres actos sobre un menor; el alumno, solo el canje de su enlace. Pedir aqui
 * una accion fuera del vocabulario del rol devuelve `invalid_parameter_value`,
 * y eso es un fallo de programacion nuestro, no un caso a manejar.
 *
 * El intento contra el esquema `app` que hay debajo NO es una reserva util
 * —PostgREST no expone ese esquema, y no debe— pero se conserva porque cuesta
 * un viaje solo cuando la primera llamada ya ha fallado, y en ese momento lo
 * que importa es no perder el registro si algun dia se expone.
 */
async function auditar(
  supabase: SupabaseClient,
  action: string,
  entityType: string,
  entityId: string | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  const args = {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_before: null,
    p_after: after,
  };

  const viaPublic = await supabase.rpc("audit_staff_action", args);
  if (viaPublic.error === null) return;

  const viaApp = await supabase.schema("app").rpc("audit", args);
  if (viaApp.error === null) return;

  console.error(
    `[cet] AUDITORIA FALLIDA action=${action} entity=${entityType} id=${entityId ?? "null"} code=${viaPublic.error.code ?? "sin-codigo"}`,
    viaPublic.error.message,
  );
}

/* ========================================================================== */
/* 1 · invitarTutor — solo superadmin                                         */
/* ========================================================================== */

export async function invitarTutor(_prev: TutorState, fd: FormData): Promise<TutorState> {
  // EL ROL PRIMERO, y `not-found` y no 403: un 403 le confirmaria a quien
  // sondea que esta accion existe.
  const viewer = await requireRole(["superadmin"], { onDeny: "not-found" });

  const parsed = invitarTutorSchema.safeParse({ email: fd.get("email") });
  if (!parsed.success) return fail("emailFormat");

  // ESCALADA DE PRIVILEGIO, documentada: `guardian_invites` no tiene ni una
  // sola politica RLS (0065), a proposito. Nadie la lee ni la escribe con una
  // sesion; el fallo seguro es que no se lea.
  const admin = createAdminClient(
    "Invitar a un tutor: guardian_invites no tiene politica RLS para nadie, por diseño",
  );

  const token = generarToken();
  const { error } = await admin.from("guardian_invites").insert({
    token_hash: hashToken(token),
    email: parsed.data.email,
    expires_at: dentroDeSieteDias(),
    created_by: viewer.id,
  });

  if (error !== null) {
    // Se registra el codigo y el mensaje. NUNCA el token ni la URL.
    console.error("[cet] invitarTutor guardian_invites.insert", error.code, error.message);
    return fail("unexpected");
  }

  // Emitir una invitacion es CREAR UNA CREDENCIAL para un adulto que todavia
  // no existe en el sistema. Si no consta quien la emitio y cuando, no hay
  // forma de responder «quien dejo entrar a esta persona».
  // Con la sesion del superadmin y NO con `admin`: el envoltorio deriva el
  // actor de la sesion, y con `service_role` no hay `auth.uid()` que derivar —
  // el registro saldria sin actor, que es media auditoria.
  await auditar(await createClient(), "tutor.invitado", "guardian_invites", null, {
    email: parsed.data.email,
  });

  const origen = await origenPublico();
  revalidatePath("/admin");

  // La URL viaja aqui y SOLO aqui. No se persiste en claro ni se registra.
  return done("invitacionCreada", {
    email: parsed.data.email,
    url: `${origen}/register?t=${token}`,
  });
}

/* ========================================================================== */
/* 2 · altaDeTutor — el correo no se elige                                    */
/* ========================================================================== */

export async function altaDeTutor(_prev: TutorState, fd: FormData): Promise<TutorState> {
  const parsed = altaDeTutorSchema.safeParse({
    token: fd.get("token"),
    fullName: fd.get("fullName"),
    password: fd.get("password"),
  });
  // Un formulario invalido con un token invalido devuelve lo mismo que un token
  // que no existe: no hay forma de usar esta accion como oraculo de tokens.
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path[0];
    if (campo === "fullName") return fail("nameRequired");
    if (campo === "password") return fail("passwordTooShort");
    return fail("enlaceNoValido");
  }

  const cabeceras = await headers();
  const limitado = rateLimit(`alta-tutor:${clientKeyFromHeaders(cabeceras)}`, 10, 60_000);
  if (!limitado.allowed) return fail("rate_limited");

  const admin = createAdminClient(
    "Alta de tutor por invitacion: crear auth.users y leer guardian_invites, que no tiene RLS para nadie",
  );

  const { data: invitacionRaw, error: invitacionError } = await admin
    .from("guardian_invites")
    .select("id, email")
    .eq("token_hash", hashToken(parsed.data.token))
    .is("revoked_at", null)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (invitacionError !== null) {
    console.error("[cet] altaDeTutor guardian_invites.select", invitacionError.code);
    return fail("unexpected");
  }

  const invitacion = invitacionRaw as Fila | null;
  const invitacionId = columnaTexto(invitacion, "id");
  // EL CORREO SALE DE LA INVITACION, jamas del formulario. Si viniera del
  // formulario, un enlace reenviado por error le fabricaria una cuenta a quien
  // lo reenvio, y el enlace dejaria de probar nada sobre quien lo abre.
  const email = columnaTexto(invitacion, "email");
  // Caducado, ya usado e inexistente devuelven LO MISMO.
  if (invitacionId === null || email === null) return fail("enlaceNoValido");

  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    // El enlace se entrego POR ESE BUZON: abrirlo ya demuestra que lo controla,
    // asi que un segundo correo de verificacion no probaria nada nuevo.
    email_confirm: true,
  });

  const nuevoId = creado?.user?.id;
  if (createError !== null || nuevoId === undefined) {
    console.error("[cet] altaDeTutor auth.createUser", createError?.message);
    return fail("unexpected");
  }

  const rollback = async (): Promise<void> => {
    // Igual que `createStudent`: borrar el `auth.users` arrastra `profiles` en
    // cascada. Sin esto quedaria una cuenta sin perfil, invisible desde el
    // panel y perfectamente utilizable para iniciar sesion.
    await admin.auth.admin.deleteUser(nuevoId);
  };

  const { error: profileError } = await admin.from("profiles").insert({
    id: nuevoId,
    // Un tutor no pertenece a ningun colegio: `profiles_alcance_por_rol` (0066)
    // lo exige, y es lo que permite que sus hijos practiquen en casa.
    school_id: null,
    role: "guardian",
    full_name: parsed.data.fullName,
    email,
    locale: "es",
    status: "active",
  });

  if (profileError !== null) {
    console.error("[cet] altaDeTutor profiles.insert", profileError.code, profileError.message);
    await rollback();
    return fail("unexpected");
  }

  // El enlace se marca consumido DESPUES de que exista el perfil: si se marcara
  // antes y el perfil fallara, el tutor se quedaria sin cuenta y sin enlace.
  const { error: usoError } = await admin
    .from("guardian_invites")
    .update({ used_at: new Date().toISOString(), used_by: nuevoId })
    .eq("id", invitacionId)
    .is("used_at", null);

  if (usoError !== null) {
    console.error("[cet] altaDeTutor guardian_invites.update", usoError.code);
    await rollback();
    return fail("unexpected");
  }

  // Se le abre la sesion con la contrasena que acaba de elegir. Pedirsela otra
  // vez dos segundos despues no aporta ninguna seguridad y si una via de
  // abandono en el unico punto del recorrido donde ya no hay vuelta atras.
  const supabase = await createClient();
  const { error: sesionError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (sesionError !== null) {
    // La cuenta EXISTE: no se hace rollback. Se le dice que entre.
    console.error("[cet] altaDeTutor signIn", sesionError.message);
    return done("altaCompletadaEntraTu", { email });
  }

  /*
   * A SU PORTADA, y no a un mensaje de exito.
   *
   * `redirect()` lanza una excepcion de control de flujo, asi que va FUERA de
   * todo `try` y en la ultima linea. Sin el, el tutor se queda mirando el
   * formulario que acaba de enviar: tiene sesion abierta y ninguna pista de
   * que la tiene. La rama de mas arriba —la que no consiguio abrir sesion— si
   * devuelve estado, porque ahi hay algo que decirle.
   */
  redirect(ROUTES.tutorHome);
}

/* ========================================================================== */
/* 3 · crearHijo                                                              */
/* ========================================================================== */

/**
 * Hash de marcador de posicion para `students.pin_hash`, calcado de
 * `createStudent`: la columna es NOT NULL con `check (pin_hash ~ '^\$argon2id\$')`
 * y esta aplicacion no calcula Argon2id —el unico sitio que lo hace es la Edge
 * Function `student-pin`, y tener dos es como divergen los parametros de coste.
 *
 * Son bytes aleatorios con la FORMA correcta. Nadie conoce su preimagen, ni
 * siquiera este codigo, asi que no verifica contra ningun PIN y el hijo no
 * puede entrar hasta canjear su enlace. Ese es el fallo seguro.
 */
function hashDePinInservible(): string {
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const digest = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return `$argon2id$v=19$m=19456,t=2,p=1$${salt}$${digest}`;
}

/** `FAM-` y seis digitos. Corto para que quepa en una pantalla y no lo teclea nadie. */
function codigoDeFamilia(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return `FAM-${String(n % 1_000_000).padStart(6, "0")}`;
}

export async function crearHijo(_prev: TutorState, fd: FormData): Promise<TutorState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const parsed = crearHijoSchema.safeParse({
    fullName: fd.get("fullName"),
    fechaNacimiento: fd.get("fechaNacimiento"),
    yearLevel: fd.get("yearLevel"),
  });
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path[0];
    if (campo === "fullName") return fail("nameRequired");
    if (campo === "fechaNacimiento") return fail("fechaInvalida");
    return fail("cursoInvalido");
  }

  // La etapa se DERIVA del curso y no se le pregunta al tutor: un padre no
  // tiene por que saber que significa "stage", y con la etapa viene cuantas
  // casillas de PIN vera su hijo (AD-4).
  const etapa = etapaDeCurso(parsed.data.yearLevel);

  const admin = createAdminClient(
    "Alta de hijo por su tutor: crear auth.users, que ninguna politica RLS permite a un tutor",
  );

  let studentId: string | null = null;
  let codigo = "";

  // Tres intentos. Quien garantiza la unicidad es el indice parcial de 0066
  // (`students_code_sin_colegio_uniq`), no este bucle: el bucle solo evita
  // molestar al tutor con un error cuando el azar repite seis digitos.
  for (let intento = 0; intento < 3 && studentId === null; intento += 1) {
    codigo = codigoDeFamilia();

    // Dominio `.invalid` (RFC 2606): no resuelve en DNS, asi que esta direccion
    // sintetica no puede recibir correo. Sin colegio no hay sufijo de colegio.
    const email = `s.${codigo.toLowerCase()}@familia.cet.invalid`;
    const { data: creado, error: createError } = await admin.auth.admin.createUser({
      email,
      password: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
      email_confirm: true,
    });

    const nuevoId = creado?.user?.id;
    if (createError !== null || nuevoId === undefined) {
      console.error("[cet] crearHijo auth.createUser", createError?.message);
      continue;
    }

    const rollback = async (): Promise<void> => {
      await admin.auth.admin.deleteUser(nuevoId);
    };

    const { error: profileError } = await admin.from("profiles").insert({
      id: nuevoId,
      school_id: null,
      role: "student",
      full_name: parsed.data.fullName,
      // Un alumno no tiene correo: `profiles_staff_needs_email` solo lo exige
      // al personal, y el dato de contacto de un menor es el de su tutor.
      email: null,
      locale: tutor.locale === "en" ? "en" : "es",
      status: "active",
    });

    if (profileError !== null) {
      console.error("[cet] crearHijo profiles.insert", profileError.code, profileError.message);
      await rollback();
      return fail("unexpected");
    }

    const { error: studentError } = await admin.from("students").insert({
      profile_id: nuevoId,
      // El hijo de un tutor NACE SIN COLEGIO. `fechaNacimiento` se ha validado
      // y NO se guarda: no hay columna para ella y la fecha de nacimiento de un
      // menor es justo el dato que no se recoge "por si acaso".
      school_id: null,
      student_code: codigo,
      year_level: parsed.data.yearLevel,
      stage: etapa,
      pin_hash: hashDePinInservible(),
      pin_must_change: true,
    });

    if (studentError !== null) {
      await rollback();
      // 23505: el codigo ya existia. Se vuelve a tirar el dado.
      if (studentError.code === "23505") continue;
      console.error("[cet] crearHijo students.insert", studentError.code, studentError.message);
      return fail("unexpected");
    }

    const { error: vinculoError } = await admin.from("guardian_students").insert({
      guardian_id: tutor.id,
      student_id: nuevoId,
      parentesco: "tutor",
      es_principal: true,
    });

    if (vinculoError !== null) {
      console.error("[cet] crearHijo guardian_students.insert", vinculoError.code);
      // Sin el vinculo, el hijo existe y su propio tutor NO puede verlo: una
      // ficha de menor huerfana y sin dueno. Se deshace entera.
      await rollback();
      return fail("unexpected");
    }

    studentId = nuevoId;
  }

  if (studentId === null) return fail("unexpected");

  const supabase = await createClient();
  await auditar(supabase, "tutor.hijo_creado", "profiles", studentId, {
    student_code: codigo,
    year_level: parsed.data.yearLevel,
    stage: etapa,
  });

  revalidatePath("/tutor");
  return done("hijoCreado", { name: parsed.data.fullName });
}

/* ========================================================================== */
/* 4 · crearEnlaceDeAcceso                                                    */
/* ========================================================================== */

const hijoSchema = z.object({ studentId: z.string().uuid() });

/**
 * Segunda capa sobre la RLS: que ese alumno sea hijo de QUIEN LLAMA.
 *
 * Se consulta `guardian_students` con la sesion del tutor —no con el cliente de
 * servicio— para que la politica siga siendo la que decide. Es el equivalente
 * en la aplicacion de `app.puede_ver_alumno`, que gobierna la RLS pero vive en
 * el esquema `app`, que este PostgREST no expone.
 */
async function esHijoSuyo(
  supabase: SupabaseClient,
  guardianId: string,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", guardianId)
    .eq("student_id", studentId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error !== null) {
    console.error("[cet] esHijoSuyo", error.code, error.message);
    return false;
  }
  return data !== null;
}

export async function crearEnlaceDeAcceso(
  _prev: TutorState,
  fd: FormData,
): Promise<TutorState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const parsed = hijoSchema.safeParse({ studentId: fd.get("studentId") });
  if (!parsed.success) return fail("notFound");

  const supabase = await createClient();
  if (!(await esHijoSuyo(supabase, tutor.id, parsed.data.studentId))) return fail("notFound");

  const admin = createAdminClient(
    "Enlace de acceso de un hijo: student_access_links solo se escribe con service_role",
  );

  const ahora = new Date().toISOString();

  // UN SOLO ENLACE VIVO POR ALUMNO. Dos enlaces vivos a la vez son dos
  // credenciales vivas a la vez, y la que el tutor cree que ha sustituido sigue
  // abriendo la cuenta de su hijo.
  const { error: revocarError } = await admin
    .from("student_access_links")
    .update({ revoked_at: ahora })
    .eq("student_id", parsed.data.studentId)
    .is("revoked_at", null);

  if (revocarError !== null) {
    console.error("[cet] crearEnlaceDeAcceso revocar", revocarError.code);
    return fail("unexpected");
  }

  /*
   * DESDE DONDE LO CREO EL TUTOR.
   *
   * No es telemetria: es el unico termino de comparacion que tiene la regla
   * `canje_fuera_de_red`. El enlace es un bearer que el tutor manda por
   * WhatsApp, asi que la pregunta que de verdad importa —«¿lo ha canjeado
   * alguien que no estaba en casa?»— solo se puede responder si consta desde
   * que red se emitio. Sin estas dos columnas, la senal mas valiosa de toda la
   * tabla de accesos no tiene con que contrastar y nunca dispara.
   *
   * Se guardan las DOS: la `inet` porque «¿misma /24?» es un operador nativo de
   * Postgres y reimplementarlo sobre `text` sale mal, y el hash porque es lo
   * unico que sobrevive si algun dia se purga la columna en claro.
   */
  const contexto = contextoDeAcceso(await headers());

  const token = generarToken();
  const { error } = await admin.from("student_access_links").insert({
    token_hash: hashToken(token),
    student_id: parsed.data.studentId,
    created_by: tutor.id,
    expires_at: dentroDeSieteDias(),
    creado_desde_ip: contexto.ip,
    creado_desde_ip_hash: contexto.ipHash,
  });

  if (error !== null) {
    console.error("[cet] crearEnlaceDeAcceso insert", error.code, error.message);
    return fail("unexpected");
  }

  // Mismo motivo que en `invitarTutor`, y aqui pesa mas: la credencial es la de
  // un menor. El canje ya se auditaba; emitirlo, no — y quedaba un hueco en el
  // que aparecia un enlace usado sin constar que alguien lo hubiera creado.
  await auditar(supabase, "tutor.enlace_generado", "student_access_links", parsed.data.studentId, {
    caduca_en_dias: 7,
  });

  const origen = await origenPublico();
  revalidatePath("/tutor");

  // Una sola vez. No se registra en ningun log.
  return done("enlaceCreado", { url: `${origen}/e/${token}` });
}

/* ========================================================================== */
/* 5 · canjearEnlace — la pieza central                                       */
/* ========================================================================== */

interface RespuestaAuthPin {
  session?: { access_token?: string; refresh_token?: string };
  pinMustChange?: boolean;
  error?: string;
}

function claveDeServicio(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Es un secreto de servidor: configuralo en el entorno, jamas en el repositorio.",
    );
  }
  return key;
}

/**
 * El canje. Sin sesion previa: el enlace ES la credencial.
 *
 * TODO FALLO DE ENLACE DEVUELVE `enlaceNoValido`, sin distinguir caducado de ya
 * usado de inexistente. Distinguirlos convertiria esta pantalla en un oraculo
 * sobre que tokens existieron alguna vez, que es exactamente el mismo motivo
 * por el que `signInStudent` colapsa "codigo inexistente" y "PIN incorrecto".
 */
export async function canjearEnlace(_prev: TutorState, fd: FormData): Promise<TutorState> {
  const parsed = canjeDeEnlaceSchema.safeParse({
    token: fd.get("token"),
    pin: fd.get("pin"),
    pinRepetido: fd.get("pinRepetido"),
  });
  if (!parsed.success) {
    // El unico error de formulario que se distingue es el de los dos PIN, que
    // no dice nada sobre el token. Todo lo demas se colapsa.
    const campo = parsed.error.issues[0]?.path[0];
    if (campo === "pinRepetido") return fail("pinNoCoincide");
    if (campo === "pin") return fail("pinFormato");
    return fail("enlaceNoValido");
  }

  const cabeceras = await headers();
  const limitado = rateLimit(`canje:${clientKeyFromHeaders(cabeceras)}`, 10, 60_000);
  if (!limitado.allowed) return fail("rate_limited");

  // Se resuelve UNA vez, arriba, y se usa tanto para el registro de acceso como
  // para las cabeceras que bajan hasta `auth-pin`. Si cada uso releyera las
  // cabeceras por su cuenta, dos filas del mismo canje podrian acabar diciendo
  // cosas distintas sobre el mismo momento.
  const contexto = contextoDeAcceso(cabeceras);

  const admin = createAdminClient(
    "Canje de enlace de acceso: quien lo presenta aún no tiene sesión, y ninguna politica cubre a anon",
  );

  const { data: enlaceRaw, error: enlaceError } = await admin
    .from("student_access_links")
    .select("id, student_id")
    .eq("token_hash", hashToken(parsed.data.token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (enlaceError !== null) {
    console.error("[cet] canjearEnlace select", enlaceError.code);
    return fail("unexpected");
  }

  const enlace = enlaceRaw as Fila | null;
  const enlaceId = columnaTexto(enlace, "id");
  const studentId = columnaTexto(enlace, "student_id");
  if (enlaceId === null || studentId === null) return fail("enlaceNoValido");

  // 1 · El PIN lo escribe `student-pin`, el UNICO sitio del sistema que calcula
  //     Argon2id. `set-from-link` no exige el PIN anterior porque no lo hay: el
  //     enlace de un solo uso ya probo la identidad. Va con la clave de
  //     servicio porque esa operacion rechaza cualquier JWT de usuario.
  try {
    const respuesta = await fetchConPlazo(
      `${getSupabaseUrl()}/functions/v1/student-pin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${claveDeServicio()}`,
          apikey: claveDeServicio(),
        },
        body: JSON.stringify({
          op: "set-from-link",
          studentProfileId: studentId,
          newPin: parsed.data.pin,
        }),
        cache: "no-store",
      },
      PLAZO_AUTENTICAR_MS,
    );

    if (!respuesta.ok) {
      // Un PIN debil lo rechaza la Edge Function con la misma lista que `change`.
      const motivo = (respuesta.cuerpo as Fila | null)?.["error"];
      console.error("[cet] canjearEnlace student-pin", respuesta.status, String(motivo ?? "-"));
      return respuesta.status === 400 ? fail("pinDemasiadoFacil") : fail("unexpected");
    }
  } catch (causa) {
    console.error("[cet] canjearEnlace student-pin inalcanzable", causa);
    return fail("unexpected");
  }

  /*
   * 2 · EL DISPOSITIVO, Y VA ANTES DE CONSUMIR EL ENLACE.
   *
   * Aqui habia un fallo, y el comentario que lo justificaba era falso. Decia
   * que si este INSERT fallaba no pasaba nada porque «el nino PUEDE entrar por
   * la puerta del colegio». Un hijo de tutor NO TIENE COLEGIO: nace con
   * `school_id = null` (ver `crearHijo`), y esa puerta pide colegio y filtra por
   * el. Asi que el resultado real de tragarse el error era un nino con el enlace
   * consumido, un PIN recien fijado y ningun dispositivo: sin puerta por la que
   * entrar y sin credencial que reutilizar. Fuera, y sin manera de volver salvo
   * pedirle a su tutor otro enlace.
   *
   * El arreglo no es «abortar», que dejaria el mismo destrozo un paso antes: es
   * INVERTIR EL ORDEN. Se crea primero el dispositivo, que es la puerta de
   * manana, y solo cuando existe se quema el enlace, que es la credencial de
   * hoy. Si el INSERT falla, se aborta con el enlace INTACTO: el nino vuelve a
   * abrirlo y reintenta. Lo unico que se repite es fijar el PIN, que es
   * idempotente por definicion —`set-from-link` no exige el anterior—.
   *
   * En la base solo vive el SHA-256 del secreto y una familia de agente; el
   * secreto vive unicamente en la cookie.
   */
  const secreto = generarToken();
  const agenteFamilia = familiaDeAgente(cabeceras.get("user-agent"));
  const { data: dispositivoRaw, error: dispositivoError } = await admin
    .from("student_devices")
    .insert({
      student_id: studentId,
      device_hash: hashToken(secreto),
      agente_familia: agenteFamilia,
      created_from_link: enlaceId,
    })
    // El id hace falta para el registro de acceso: una fila `enlace_canjeado`
    // sin `device_id` no permite reconstruir despues que aparato se llevo esa
    // cuenta, que es la mitad de para lo que existe la tabla.
    .select("id")
    .single();

  if (dispositivoError !== null) {
    console.error("[cet] canjearEnlace student_devices.insert", dispositivoError.code);
    return fail("unexpected");
  }

  const deviceId = columnaTexto(dispositivoRaw, "id");
  if (deviceId === null) {
    console.error("[cet] canjearEnlace student_devices.insert sin id");
    return fail("unexpected");
  }

  // 3 · El enlace queda consumido. `revoked_at` ya significa "no vale" (0057),
  //     asi que el uso unico no necesitaba columna nueva.
  const ahora = new Date().toISOString();
  const { error: consumoError } = await admin
    .from("student_access_links")
    .update({ revoked_at: ahora, last_used_at: ahora })
    .eq("id", enlaceId)
    .is("revoked_at", null);

  if (consumoError !== null) {
    console.error("[cet] canjearEnlace consumo", consumoError.code);
    // El dispositivo de arriba queda huerfano. Es inerte —su secreto solo
    // existe en esta variable y la cookie no llego a escribirse, asi que nadie
    // puede presentarlo jamas—, pero SI aparece en la lista de aparatos del
    // panel del tutor, y un aparato fantasma que no se puede reconocer es ruido
    // en la unica pantalla que existe para reconocerlos. Se revoca al vuelo, y
    // el fallo de esa revocacion no cambia lo que se le devuelve al nino.
    const { error: revocaError } = await admin
      .from("student_devices")
      .update({ revoked_at: ahora })
      .eq("id", deviceId);
    if (revocaError !== null) {
      console.error("[cet] canjearEnlace dispositivo huerfano sin revocar", revocaError.code);
    }
    return fail("unexpected");
  }

  // 4 · La cookie. `HttpOnly`: sin eso, el "dispositivo recordado" seria un
  //     token robable desde la consola del navegador.
  await escribirCookieDispositivo(secreto);

  /*
   * 4 bis · EL RASTRO. Aqui, y no al final: es el punto en el que el canje ya
   * es irreversible —enlace quemado, PIN nuevo, dispositivo creado— y por tanto
   * el punto en el que hay algo que registrar aunque la sesion no llegue a
   * abrirse despues. Un canje que se corta al pedir la sesion sigue siendo un
   * canje consumado, y si solo se registrara tras el `setSession` seria
   * justamente el caso raro —el interesante— el que no dejaria huella.
   *
   * NO LANZA y no se envuelve en `try`: ese contrato lo garantiza
   * `registrarAcceso`. Si algun dia dejara de cumplirlo, el canje entero se
   * caeria aqui, con el enlace ya quemado.
   */
  await registrarAcceso(admin, {
    studentId,
    deviceId,
    tipo: "enlace_canjeado",
    contexto,
    agenteFamilia,
  });

  // 5 · La sesion se abre POR LA MISMA PUERTA que usara manana, la del
  //     dispositivo. Es lo que hace que el canje de hoy pruebe el camino de
  //     manana en vez de un atajo que solo existe hoy.
  let payload: RespuestaAuthPin;
  try {
    const respuesta = await fetchConPlazo(
      `${getSupabaseUrl()}/functions/v1/auth-pin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${getSupabaseAnonKey()}`,
          apikey: getSupabaseAnonKey(),
          // La geo baja POR CABECERA. `entradaDeAuthPin` es una union de dos
          // esquemas `.strict()`, y ese `.strict()` es lo que impide presentar
          // las dos puertas a la vez: meterla en el cuerpo obligaria a aflojarlo
          // en las dos ramas, o sea a debilitar un invariante de seguridad para
          // transportar un dato de contexto. La Edge Function la ignora si no
          // sabe que hacer con ella; el cuerpo no la perdonaria.
          ...cabecerasDeContexto(contexto),
        },
        body: JSON.stringify({ deviceToken: secreto, pin: parsed.data.pin }),
        cache: "no-store",
      },
      PLAZO_AUTENTICAR_MS,
    );

    if (!respuesta.ok || respuesta.cuerpo === null) {
      console.error("[cet] canjearEnlace auth-pin", respuesta.status);
      return fail("unexpected");
    }
    payload = respuesta.cuerpo as RespuestaAuthPin;
  } catch (causa) {
    console.error("[cet] canjearEnlace auth-pin inalcanzable", causa);
    return fail("unexpected");
  }

  const access = payload.session?.access_token;
  const refresh = payload.session?.refresh_token;
  if (!access || !refresh) {
    console.error("[cet] canjearEnlace auth-pin sin sesion", payload.error ?? "desconocido");
    return fail("unexpected");
  }

  const supabase = await createClient();
  const { error: sesionError } = await supabase.auth.setSession({
    access_token: access,
    refresh_token: refresh,
  });

  if (sesionError !== null) {
    console.error("[cet] canjearEnlace setSession", sesionError.message);
    return fail("unexpected");
  }

  // 6 · Auditado ya con la sesion del alumno: `app.audit()` deriva el actor de
  //     `auth.uid()`, y con el cliente de servicio no habria actor.
  //     El `entity_id` es EL ALUMNO y no el enlace: el guard de `app.audit`
  //     (0067) solo deja al alumno auditar sobre si mismo, y ademas un id de
  //     `entity` que apunta a la credencial es peor pista forense que uno que
  //     apunta a la persona. El enlace viaja en el payload.
  await auditar(supabase, "alumno.enlace_canjeado", "student_access_links", studentId, {
    enlace_id: enlaceId,
    // La familia de agente, no el user-agent. Nunca el token ni el secreto.
    // (El user-agent entero si queda, pero en `accesos_de_alumno`, que tiene un
    // GRANT por columna que ninguna sesion de navegador alcanza. `audit_log` no
    // lo tiene: aqui seguiria valiendo la minimizacion.)
    agente_familia: agenteFamilia,
  });

  /*
   * Y ADENTRO. Esta linea no es cosmetica: sin ella el nino que acaba de elegir
   * su PIN se queda en `/e/[token]`, la accion refresca el arbol de servidor,
   * `alumnoDelEnlace()` ya no encuentra el enlace —lo acabamos de consumir en
   * el paso 2— y la pagina le contesta «este enlace ya no vale». El peor final
   * posible para el unico paso que si le salio bien.
   *
   * A `/learn` y no a `/account/pin`: `set-from-link` deja `pin_must_change` en
   * falso porque el PIN lo acaba de elegir el. Pedirle que lo cambie otra vez
   * seria pedirselo dos veces seguidas.
   */
  redirect(ROUTES.studentHome);
}

/* ========================================================================== */
/* 6 · olvidarDispositivo                                                     */
/* ========================================================================== */

export async function olvidarDispositivo(
  _prev: TutorState,
  fd: FormData,
): Promise<TutorState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const parsed = olvidarDispositivoSchema.safeParse({ deviceId: fd.get("deviceId") });
  if (!parsed.success) return fail("notFound");

  const supabase = await createClient();

  // Se lee con la SESION: `dispositivos_select_tutor` (0065) solo devuelve los
  // dispositivos de sus hijos, asi que un id ajeno ya no llega hasta aqui. La
  // comprobacion explicita de abajo es la segunda capa.
  const { data: filaRaw, error: lecturaError } = await supabase
    .from("student_devices")
    .select("id, student_id")
    .eq("id", parsed.data.deviceId)
    .is("revoked_at", null)
    .maybeSingle();

  if (lecturaError !== null) {
    console.error("[cet] olvidarDispositivo select", lecturaError.code);
    return fail("unexpected");
  }

  const studentId = columnaTexto(filaRaw as Fila | null, "student_id");
  if (studentId === null) return fail("notFound");
  if (!(await esHijoSuyo(supabase, tutor.id, studentId))) return fail("notFound");

  // `student_devices` no concede UPDATE a nadie con sesion (0065): solo
  // `service_role` escribe en ella.
  const admin = createAdminClient(
    "Olvidar un dispositivo: student_devices solo admite escritura de service_role",
  );

  const { error } = await admin
    .from("student_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.deviceId)
    .is("revoked_at", null);

  if (error !== null) {
    console.error("[cet] olvidarDispositivo update", error.code, error.message);
    return fail("unexpected");
  }

  // El `entity_id` es EL ALUMNO y no el dispositivo: el guard de `app.audit`
  // (0074) solo deja al tutor auditar sobre una PERSONA que pueda ver, y
  // ademas un id que apunta a la persona es mejor pista forense que uno que
  // apunta al aparato. El dispositivo viaja en el payload.
  await auditar(supabase, "tutor.dispositivo_olvidado", "student_devices", studentId, {
    dispositivo_id: parsed.data.deviceId,
    student_id: studentId,
  });

  /*
   * Y ADEMAS EN EL HISTORIAL DE ACCESOS, que no es una copia de la auditoria.
   * `audit_log` responde «quien hizo que»; esta tabla responde «desde donde se
   * toco esta cuenta», y una revocacion es justo el acto que uno quiere ver en
   * la misma linea de tiempo que los accesos que la provocaron: el tutor revoca
   * PORQUE vio algo raro, y sin esta fila su reaccion no aparece al lado de
   * aquello a lo que reaccionaba.
   *
   * `agenteFamilia` va a nulo a proposito: el user-agent de esta peticion es el
   * del TUTOR desde su panel, y ponerlo en la fila de un aparato del alumno
   * seria describir el aparato equivocado. El de verdad ya esta en la fila de
   * `student_devices` que se acaba de revocar.
   *
   * Con `admin`, no con `supabase`: la RPC solo tiene EXECUTE para
   * `service_role`, nunca para `authenticated` — que es lo que impide que nadie
   * se fabrique su propio rastro.
   */
  await registrarAcceso(admin, {
    studentId,
    deviceId: parsed.data.deviceId,
    tipo: "dispositivo_olvidado",
    contexto: contextoDeAcceso(await headers()),
    agenteFamilia: null,
  });

  revalidatePath("/tutor");
  return done("dispositivoOlvidado");
}

/* ========================================================================== */
/* 7 · vincularTelegram — el enlace que le dice al bot quien es este padre     */
/* ========================================================================== */

/**
 * TREINTA MINUTOS, Y NO SIETE DIAS COMO EL DEL ALUMNO.
 *
 * La vida de un enlace se fija por como se usa, no por costumbre. El del alumno
 * dura una semana porque el tutor se lo MANDA a su hijo por WhatsApp y el nino
 * lo abrira cuando llegue a casa: entre emitirlo y canjearlo hay un viaje.
 *
 * Este no viaja a ninguna parte. El tutor lo genera y lo pulsa el mismo, en la
 * misma pantalla y en el mismo minuto. Todo lo que dure de mas es tiempo en el
 * que una credencial vive sin que nadie la necesite, y quien la robara podria
 * apuntar a SU Telegram los avisos sobre un menor ajeno. Media hora es holgura
 * de sobra para «me han llamado por telefono a mitad», y nada mas.
 */
const VIDA_VINCULO_TELEGRAM_MS = 30 * 60 * 1000;

export async function vincularTelegram(
  _prev: TutorState,
  _fd: FormData,
): Promise<TutorState> {
  // EL ROL PRIMERO, igual que en `crearEnlaceDeAcceso`: que la seccion no se
  // pinte sin bot no impide invocar esta accion con un `fetch`.
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  /*
   * SIN BOT NO SE EMITE NADA.
   *
   * La interfaz ya oculta la seccion cuando falta la configuracion, pero eso es
   * cosmetica. Si aqui no se comprobara, una invocacion directa dejaria en la
   * base un token vivo apuntando a un tutor real que NUNCA se puede canjear
   * -no hay webhook que lo reciba- y que sin embargo sigue siendo una
   * credencial valida el dia que alguien configure el bot.
   */
  if (!telegramDisponible()) return fail("notFound");

  // ESCALADA DE PRIVILEGIO, documentada: `telegram_de_tutor` (0087) no concede
  // INSERT ni UPDATE a `authenticated` para nadie. Si lo hiciera, un tutor
  // podria escribirse el `chat_id` que quisiera y desviar a su Telegram los
  // avisos del hijo de otro.
  const admin = createAdminClient(
    "Vincular Telegram: telegram_de_tutor solo la escribe service_role, por diseño (0087)",
  );

  const token = generarToken();
  const ahora = new Date().toISOString();

  /*
   * UPSERT Y NO INSERT: la clave primaria es `guardian_id`, o sea una fila por
   * tutor. Pedir otro enlace REEMPLAZA el pendiente en vez de acumular una
   * segunda credencial viva —el mismo criterio de «un solo enlace vivo» que
   * `crearEnlaceDeAcceso` consigue revocando antes de insertar—.
   *
   * `chat_id` y `vinculado_at` NO van en el payload a proposito, y eso importa:
   * PostgREST traduce el upsert a `ON CONFLICT DO UPDATE SET <columnas dadas>`,
   * asi que un tutor YA conectado que genere otro enlace no se queda
   * desconectado mientras decide si lo pulsa. Cortar el vinculo es un acto
   * explicito y tiene su propia accion.
   */
  const { error } = await admin.from("telegram_de_tutor").upsert(
    {
      guardian_id: tutor.id,
      token_hash: hashToken(token),
      token_expira_at: new Date(Date.now() + VIDA_VINCULO_TELEGRAM_MS).toISOString(),
      updated_at: ahora,
    },
    { onConflict: "guardian_id" },
  );

  if (error !== null) {
    // Ni el token ni la URL entran aqui. `code` y `message` de Postgres, y nada
    // del cuerpo de la peticion.
    console.error("[cet] vincularTelegram upsert", error.code, error.message);
    return fail("unexpected");
  }

  /*
   * AUDITORIA: `tutor.enlace_generado`, Y NO UNA ACCION NUEVA.
   *
   * El vocabulario del rol `guardian` lo fija `0068_auditoria_de_la_cadena.sql`
   * y tiene exactamente tres verbos: `tutor.hijo_creado`,
   * `tutor.enlace_generado` y `tutor.dispositivo_olvidado`. Pedir cualquier otro
   * -«tutor.telegram_vinculado», por ejemplo- devuelve `invalid_parameter_value`
   * y la auditoria se PIERDE, que es peor que registrarla con el verbo vecino.
   *
   * Y el verbo vecino describe con precision lo que acaba de pasar: se ha
   * emitido un enlace de un solo uso con caducidad. Lo que lo distingue del
   * enlace de un alumno es el `entity_type` —`telegram_de_tutor` frente a
   * `student_access_links`— que es justo para lo que sirve esa columna. Quien
   * lea el log no confunde los dos.
   *
   * `entity_id` es el propio tutor: `app.audit()` (0074) solo deja a un tutor
   * auditar sobre si mismo o sobre un hijo suyo, y aqui el sujeto es el.
   */
  const supabase = await createClient();
  await auditar(supabase, "tutor.enlace_generado", "telegram_de_tutor", tutor.id, {
    canal: "telegram",
    caduca_en_minutos: VIDA_VINCULO_TELEGRAM_MS / 60000,
  });

  revalidatePath("/tutor");

  // UNA SOLA VEZ, y en ningun log. La base guarda el SHA-256 y nada mas: quien
  // cierre esta pantalla sin pulsar el enlace genera otro.
  return done("telegramEnlaceCreado", { url: enlaceDeVinculacion(token) });
}

/* ========================================================================== */
/* 8 · desvincularTelegram — un padre tiene que poder cortarlo                 */
/* ========================================================================== */

/**
 * Corta el vinculo: sin `chat_id` no hay a donde escribirle, y esa ausencia ES
 * la desconexion.
 *
 * SE BORRAN LAS TRES COLUMNAS, no solo el `chat_id`. Dejar vivo un `token_hash`
 * pendiente convertiria «he desconectado» en una promesa a medias: quien
 * tuviera aquel enlace todavia sin pulsar podria reconectar el chat que quisiera
 * despues de que el padre creyera haberlo cortado.
 *
 * NO SE AUDITA, y es deliberado. El vocabulario del rol `guardian` (0068) no
 * tiene ningun verbo que signifique esto, y forzar el que hay -«enlace
 * generado» para describir una revocacion- seria escribir un dato falso en una
 * tabla forense, que es peor que no escribir ninguno. Ampliarlo pide una
 * migracion, y la asimetria se sostiene: lo que crea una credencial queda
 * registrado; retirarla solo reduce lo que el sistema puede hacer.
 */
export async function desvincularTelegram(
  _prev: TutorState,
  _fd: FormData,
): Promise<TutorState> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });

  const admin = createAdminClient(
    "Desvincular Telegram: telegram_de_tutor solo la escribe service_role, por diseño (0087)",
  );

  // El `eq` sobre `guardian_id` es la frontera entera de esta escritura: con
  // `service_role` no hay RLS que la acote, asi que la acota el `where` y sale
  // de la SESION, jamas del formulario.
  const { error } = await admin
    .from("telegram_de_tutor")
    .update({
      chat_id: null,
      token_hash: null,
      token_expira_at: null,
      vinculado_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("guardian_id", tutor.id);

  if (error !== null) {
    console.error("[cet] desvincularTelegram update", error.code, error.message);
    return fail("unexpected");
  }

  revalidatePath("/tutor");
  return done("telegramDesvinculado");
}
