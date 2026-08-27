"use server";

/**
 * Server Actions del área de personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * FORMA DE TODA ACCIÓN DE ESTE FICHERO
 * ===========================================================================
 *   1. Comprobar el rol EN EL SERVIDOR. Que la UI ocultara el botón no cuenta:
 *      una Server Action es un endpoint HTTP y se puede invocar con `fetch`.
 *   2. Validar la entrada con Zod. El `FormData` viene del cliente.
 *   3. Comprobar que la entidad pertenece al colegio del actor, con una
 *      consulta explícita. RLS ya lo hace; esto es la segunda capa.
 *   4. Ejecutar.
 *   5. Auditar con `app.audit(...)`, que pone el actor desde la sesión.
 *
 * El punto 5 no es opcional para NADA que toque datos de alumno, incluida la
 * simple lectura de una clave de respuesta (MASTER_PLAN §9).
 * ===========================================================================
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRole, type SessionProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { ANSWER_KEY_RPC, appRpc, auditStaffAction, type AuditAction } from "./audit-rpc";
import { effectiveGrading, type GradingRow } from "./grading-chain";
import { isUuid } from "./queries";

/* ========================================================================== */
/* Resultado uniforme                                                         */
/* ========================================================================== */

/**
 * Las acciones devuelven CLAVES de diccionario, no frases. Una Server Action
 * no puede saber el idioma del usuario sin volver a resolverlo, y devolver
 * texto ya traducido desde el servidor es cómo se cuelan strings hardcodeados
 * en un producto bilingüe (AD-7).
 */
export interface StaffActionState {
  readonly ok: boolean;
  readonly errorKey?: string;
  readonly successKey?: string;
  /** Valores para interpolar en la cadena del diccionario. */
  readonly values?: Record<string, string | number>;
  /** El PIN generado. Viaja UNA vez y no se persiste en claro en ningún sitio. */
  readonly oneTimePin?: string;
}

const IDLE: StaffActionState = { ok: false };

function fail(errorKey: string, values?: Record<string, string | number>): StaffActionState {
  return values === undefined ? { ok: false, errorKey } : { ok: false, errorKey, values };
}

function done(successKey: string, values?: Record<string, string | number>): StaffActionState {
  return values === undefined ? { ok: true, successKey } : { ok: true, successKey, values };
}

/* ========================================================================== */
/* Auditoría                                                                  */
/* ========================================================================== */

/**
 * Atajo local sobre `auditStaffAction`. El helper vive en `./audit-rpc` y no
 * aquí porque este fichero lleva `"use server"`: todo lo que exporta es un
 * endpoint HTTP, y una función que escribe en el registro forense no debe
 * serlo.
 *
 * Devuelve si el registro se escribió. Antes se tragaba el error en un
 * `console.error` y quien llamaba no tenía forma de enterarse — que es
 * exactamente por lo que un 406 de PostgREST estuvo perdiendo TODA la auditoría
 * del personal sin que nadie lo notara (R4: silencioso es peor que ruidoso).
 */
async function audit(
  supabase: SupabaseClient,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): Promise<boolean> {
  const { ok } = await auditStaffAction(supabase, action, entityType, entityId, before, after);
  return ok;
}

/* ========================================================================== */
/* 1. Clave de respuesta — bajo demanda y auditada                            */
/* ========================================================================== */

export interface AnswerKeyResult {
  readonly ok: boolean;
  readonly errorKey?: string;
  /** Serializada a JSON legible. Nunca se pinta como HTML. */
  readonly json?: string;
}

/**
 * Revela `attempt_items.answer_key` de UN item.
 *
 * `authenticated` no tiene el `GRANT` de esa columna (0013), así que ni
 * siquiera un `select` malintencionado desde esta app la sacaría: el único
 * camino es `app.attempt_item_answer_key(uuid)`, que es `security definer` y
 * comprueba rol y tenant fila a fila.
 *
 * Es una Server Action y no parte de la carga de la página A PROPÓSITO: si
 * viajara con el HTML, estaría en el DOM de cualquier profesor que abriera la
 * reconstrucción por curiosidad, y el registro de auditoría diría que todos la
 * han visto siempre — o sea, no diría nada.
 */
export async function revealAnswerKey(
  attemptId: string,
  attemptItemId: string,
): Promise<AnswerKeyResult> {
  const viewer = await requireRole(["superadmin", "school_admin", "teacher"], {
    onDeny: "not-found",
  });

  if (!isUuid(attemptId) || !isUuid(attemptItemId)) return { ok: false, errorKey: "failed" };

  const supabase = await createClient();

  // El item tiene que pertenecer a ESTE intento y a ESTE colegio. La función
  // de Postgres ya comprueba el tenant, pero no que el item sea del intento de
  // la URL: sin esto, un profesor podría revelar la clave de cualquier item de
  // su colegio pasando su id, y el registro de auditoría apuntaría al intento
  // equivocado.
  const owns = await itemBelongsToAttempt(supabase, viewer, attemptId, attemptItemId);
  if (!owns) {
    // Hallazgo P2-1: la versión anterior devolvía aquí SIN auditar. Un intento
    // de leer la clave de un item de otro colegio —o de un item que no es de
    // este intento— es exactamente el evento que un log forense existe para
    // recoger, y era justo el único camino que no dejaba rastro.
    await audit(supabase, "attempt.answer_key_denied", "attempt_items", attemptItemId, null, {
      attempt_id: attemptId,
      reason: "out_of_scope",
    });
    return { ok: false, errorKey: "denied" };
  }

  const { data, error } = await appRpc(supabase, ANSWER_KEY_RPC, {
    p_item_id: attemptItemId,
  });

  // Se audita ANTES de devolver, y también cuando la función deniega: un
  // intento de ver una clave ajena es justo lo que un log forense debe recoger.
  const registrada = await audit(
    supabase,
    "attempt.answer_key_viewed",
    "attempt_items",
    attemptItemId,
    null,
    { attempt_id: attemptId, granted: error === null },
  );

  // Si no se pudo registrar, NO se revela. M12 no pide "revelar y además
  // registrar": pide que revelar la clave de respuesta quede registrado, y una
  // revelación sin rastro no cumple eso — es justo el estado en el que este
  // panel llevaba meses. Ante la duda, se deniega: el profesor puede reintentar.
  if (!registrada) {
    return { ok: false, errorKey: "failed" };
  }

  if (error !== null) {
    return { ok: false, errorKey: error.code === "42501" ? "denied" : "failed" };
  }
  if (data === null || data === undefined) return { ok: false, errorKey: "failed" };

  return { ok: true, json: JSON.stringify(data, null, 2) };
}

async function itemBelongsToAttempt(
  supabase: SupabaseClient,
  viewer: SessionProfile,
  attemptId: string,
  attemptItemId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("attempt_items")
    .select("id, attempt_id")
    .eq("id", attemptItemId)
    .eq("attempt_id", attemptId)
    .maybeSingle();

  if (data === null) return false;
  return attemptInScope(supabase, viewer, attemptId);
}

async function attemptInScope(
  supabase: SupabaseClient,
  viewer: SessionProfile,
  attemptId: string,
): Promise<boolean> {
  let query = supabase.from("exam_attempts").select("id, school_id, status").eq("id", attemptId);
  if (viewer.role !== "superadmin" && viewer.schoolId !== null) {
    query = query.eq("school_id", viewer.schoolId);
  }
  const { data } = await query.maybeSingle();
  return data !== null;
}

/* ========================================================================== */
/* 2. Corrección manual                                                       */
/* ========================================================================== */

const MAX_RATIONALE = 2000;

const gradeSchema = z.object({
  attemptId: z.string().uuid(),
  attemptItemId: z.string().uuid(),
  points: z.coerce.number().finite().min(0),
  rationale: z.string().trim().min(1).max(MAX_RATIONALE),
});

/**
 * Inserta una fila NUEVA en `attempt_gradings`. Nunca un UPDATE.
 *
 * Si ya había nota, la nueva lleva `supersedes_id` apuntando a la HOJA de la
 * cadena — no a la raíz. Ver el razonamiento completo en `grading-chain.ts`:
 * la fila con `supersedes_id is null` es la MÁS ANTIGUA, y encadenar contra
 * ella crearía dos ramas en vez de una historia.
 */
export async function gradeItemManually(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const viewer = await requireRole(["superadmin", "school_admin", "teacher"], {
    onDeny: "not-found",
  });

  const parsed = gradeSchema.safeParse({
    attemptId: formData.get("attemptId"),
    attemptItemId: formData.get("attemptItemId"),
    points: formData.get("points"),
    rationale: formData.get("rationale") ?? "",
  });

  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    if (path === "rationale") {
      const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
      return tooLong
        ? fail("rationaleTooLong", { max: MAX_RATIONALE })
        : fail("rationaleRequired");
    }
    return fail("invalidPoints");
  }

  const { attemptId, attemptItemId, points, rationale } = parsed.data;
  const supabase = await createClient();

  /* --- El intento: existe, es de mi colegio, y está entregado -------------- */
  let attemptQuery = supabase
    .from("exam_attempts")
    .select("id, school_id, status")
    .eq("id", attemptId);
  if (viewer.role !== "superadmin" && viewer.schoolId !== null) {
    attemptQuery = attemptQuery.eq("school_id", viewer.schoolId);
  }
  const { data: attempt } = await attemptQuery.maybeSingle();
  if (attempt === null) return fail("forbidden");

  const status = String((attempt as Record<string, unknown>)["status"] ?? "");
  if (status === "voided") return fail("forbidden");
  // Poner nota a un intento abierto es puntuar una respuesta que el alumno
  // todavía puede cambiar. El estado correcto de la nota sería inmediatamente
  // falso y quedaría registrado como si fuera una decisión del profesor.
  if (status === "in_progress") return fail("attemptNotSubmitted");

  /* --- El item: es de este intento y se corrige a mano --------------------- */
  const { data: item } = await supabase
    .from("attempt_items")
    .select("id, attempt_id, max_points, question_version_id, ord")
    .eq("id", attemptItemId)
    .eq("attempt_id", attemptId)
    .maybeSingle();

  if (item === null) return fail("notFound");
  const itemRow = item as Record<string, unknown>;

  const { data: version } = await supabase
    .from("question_versions")
    .select("id, grading_mode")
    .eq("id", String(itemRow["question_version_id"] ?? ""))
    .maybeSingle();

  if (version === null || (version as Record<string, unknown>)["grading_mode"] !== "manual") {
    return fail("notManual");
  }

  const maxPoints = Number(itemRow["max_points"] ?? 0);
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) return fail("unexpected");
  // La constraint `attempt_gradings_points_range` lo rechazaría igualmente; se
  // comprueba aquí para poder decir POR QUÉ en vez de devolver "unexpected".
  if (points > maxPoints) return fail("invalidPoints");

  /* --- La cadena existente ------------------------------------------------- */
  const { data: existing } = await supabase
    .from("attempt_gradings")
    .select(
      "id, points_awarded, max_points, is_correct, partial_ratio, graded_by, grader_id, rationale, graded_at, supersedes_id",
    )
    .eq("attempt_item_id", attemptItemId);

  const chain = (existing ?? []) as GradingRow[];
  const leaf = effectiveGrading(chain);

  const ratio = maxPoints === 0 ? 0 : points / maxPoints;

  const { error: insertError } = await supabase.from("attempt_gradings").insert({
    attempt_id: attemptId,
    attempt_item_id: attemptItemId,
    points_awarded: points,
    max_points: maxPoints,
    is_correct: points >= maxPoints,
    partial_ratio: Number(ratio.toFixed(3)),
    graded_by: "manual",
    // La política `attempt_gradings_insert_staff` exige que sea `auth.uid()`.
    // Se envía igualmente: si un día se relajara la política, esta línea sigue
    // impidiendo firmar una nota con el nombre de otro.
    grader_id: viewer.id,
    rationale,
    supersedes_id: leaf === null ? null : leaf.id,
  });

  if (insertError !== null) {
    console.error("[cet] gradeItemManually insert", insertError.message);
    return fail("unexpected");
  }

  await audit(
    supabase,
    leaf === null ? "attempt.graded_manually" : "attempt.regraded",
    "attempt_gradings",
    attemptItemId,
    leaf === null
      ? null
      : { points_awarded: leaf.points_awarded, graded_by: leaf.graded_by, id: leaf.id },
    { points_awarded: points, max_points: maxPoints, ord: itemRow["ord"] ?? null, rationale },
  );

  revalidatePath(`/teach/attempts/${attemptId}`);
  revalidatePath(`/teach/attempts/${attemptId}/grade`);
  return done("success");
}

/* ========================================================================== */
/* 3. Administración de alumnos                                               */
/* ========================================================================== */

const STUDENT_CODE_RE = /^[A-Za-z0-9._-]{2,32}$/;

const createStudentSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  studentCode: z.string().trim().regex(STUDENT_CODE_RE),
  yearLevel: z.coerce.number().int().min(1).max(13),
  stage: z.enum(["primary", "secondary"]),
  section: z.string().trim().max(40).optional(),
  guardianEmail: z.string().trim().email().optional().or(z.literal("")),
});

/**
 * Hash de marcador de posición para `students.pin_hash`.
 *
 * `pin_hash` es NOT NULL con `check (pin_hash ~ '^\$argon2id\$')`, y Argon2id
 * NO se puede calcular ni en Postgres (pgcrypto no lo trae) ni aquí (la app web
 * no tiene ni debe tener la dependencia de hashing: quien la tiene es la Edge
 * Function `student-pin`, y tener DOS sitios que calculan credenciales es cómo
 * divergen los parámetros de coste).
 *
 * Así que la ficha nace con un hash con la FORMA correcta y bytes aleatorios de
 * `crypto.getRandomValues`. No es el hash de ningún PIN: nadie conoce su
 * preimagen, ni siquiera este código, así que no verifica contra nada y el
 * alumno no puede entrar todavía. Acto seguido se invoca `student-pin`
 * (op `provision`), que le fija de verdad la identidad sintética y su PIN
 * inicial. Si esa llamada fallara, la ficha queda creada y sin acceso, que es
 * el fallo seguro: el botón "Regenerar PIN" la recupera.
 */
function unusablePinHash(): string {
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const digest = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return `$argon2id$v=19$m=19456,t=2,p=1$${salt}$${digest}`;
}

export async function createStudent(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const viewer = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });
  const schoolId = viewer.schoolId;
  if (schoolId === null) return fail("unexpected");

  const parsed = createStudentSchema.safeParse({
    fullName: formData.get("fullName"),
    studentCode: formData.get("studentCode"),
    yearLevel: formData.get("yearLevel"),
    stage: formData.get("stage"),
    section: formData.get("section") ?? undefined,
    guardianEmail: formData.get("guardianEmail") ?? undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "fullName") return fail("nameRequired");
    if (field === "studentCode") return fail("codeFormat");
    if (field === "yearLevel") return fail("yearRange");
    if (field === "guardianEmail") return fail("emailFormat");
    return fail("unexpected");
  }

  const input = parsed.data;
  const supabase = await createClient();

  // Unicidad `(school_id, student_code)`. La constraint la impone igualmente;
  // esto existe para poder dar un mensaje que se entienda.
  const { data: clash } = await supabase
    .from("students")
    .select("profile_id")
    .eq("school_id", schoolId)
    .eq("student_code", input.studentCode)
    .maybeSingle();
  if (clash !== null) return fail("codeTaken");

  // ESCALADA DE PRIVILEGIO, documentada: dar de alta a un alumno crea una fila
  // en `auth.users`, y `auth.users` no es alcanzable con la sesión del
  // administrador por ninguna política. Es uno de los casos legítimos que
  // enumera `lib/supabase/admin.ts`. El rol ya se ha comprobado arriba y el
  // `school_id` se fija desde la SESIÓN, nunca desde el formulario.
  const admin = createAdminClient(
    "Alta de alumno: crear auth.users, que ninguna politica RLS permite al administrador",
  );

  const email = `s.${input.studentCode.toLowerCase()}.${schoolId.slice(0, 8)}@students.cet.invalid`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
    email_confirm: true,
  });

  const newUserId = created?.user?.id;
  if (createError !== null || newUserId === undefined) {
    console.error("[cet] createStudent auth.createUser", createError?.message);
    return fail("unexpected");
  }

  const rollback = async (): Promise<void> => {
    // Borrar el usuario de auth arrastra en cascada `profiles` y `students`
    // (`on delete cascade` en las dos FK). Así no queda una cuenta huérfana sin
    // ficha, que sería invisible desde el panel y perfectamente utilizable.
    await admin.auth.admin.deleteUser(newUserId);
  };

  // Hallazgo P2-6: el perfil nacía con `locale: "en"` fijo. En un colegio con
  // `default_locale = 'es'`, el alumno veía su primera pantalla en inglés hasta
  // que alguien le cambiara el idioma a mano — y esa primera pantalla es
  // precisamente la del cambio de PIN obligatorio (AD-4).
  const { data: schoolRow } = await supabase
    .from("schools")
    .select("id, default_locale")
    .eq("id", schoolId)
    .maybeSingle();
  const schoolLocale = (schoolRow as Record<string, unknown> | null)?.["default_locale"];
  const locale = schoolLocale === "es" || schoolLocale === "en" ? schoolLocale : "en";

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUserId,
    school_id: schoolId,
    role: "student",
    full_name: input.fullName,
    email: null,
    locale,
    status: "active",
  });

  if (profileError !== null) {
    console.error("[cet] createStudent profiles.insert", profileError.message);
    await rollback();
    return fail("unexpected");
  }

  const guardianEmail =
    input.guardianEmail !== undefined && input.guardianEmail !== "" ? input.guardianEmail : null;
  const section = input.section !== undefined && input.section !== "" ? input.section : null;

  const { error: studentError } = await admin.from("students").insert({
    profile_id: newUserId,
    school_id: schoolId,
    student_code: input.studentCode,
    year_level: input.yearLevel,
    stage: input.stage,
    section,
    pin_hash: unusablePinHash(),
    pin_must_change: true,
    guardian_email: guardianEmail,
  });

  if (studentError !== null) {
    console.error("[cet] createStudent students.insert", studentError.message);
    await rollback();
    return studentError.code === "23505" ? fail("codeTaken") : fail("unexpected");
  }

  // El alta queda auditada AUNQUE el PIN falle: la ficha ya existe.
  await audit(supabase, "student.created", "students", newUserId, null, {
    student_code: input.studentCode,
    year_level: input.yearLevel,
    stage: input.stage,
    section,
  });

  const pin = await provisionPin(supabase, newUserId);
  revalidatePath("/admin");

  if (pin === null) {
    // La ficha existe pero sin credencial utilizable. Se dice tal cual en vez
    // de fingir éxito: el administrador tiene que pulsar "Regenerar PIN".
    return fail("unexpected");
  }

  return { ok: true, successKey: "pinOnce", values: { name: input.fullName, pin }, oneTimePin: pin };
}

/**
 * Delega en la Edge Function `student-pin`, que es el ÚNICO sitio del sistema
 * que calcula Argon2id. Se invoca con la sesión del administrador: la función
 * vuelve a comprobar su rol y su colegio contra la base de datos, y audita el
 * reseteo por su cuenta.
 */
async function provisionPin(
  supabase: SupabaseClient,
  studentProfileId: string,
  op: "provision" | "reset" = "provision",
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("student-pin", {
    body: { op, studentProfileId },
  });

  if (error !== null) {
    console.error("[cet] student-pin", error.message);
    return null;
  }

  const pin = (data as Record<string, unknown> | null)?.["pin"];
  return typeof pin === "string" ? pin : null;
}

export async function resetStudentPin(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const viewer = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });

  const studentId = String(formData.get("studentProfileId") ?? "");
  if (!isUuid(studentId)) return fail("notFound");

  const supabase = await createClient();
  const student = await studentInScope(supabase, viewer, studentId);
  if (student === null) return fail("notFound");

  const pin = await provisionPin(supabase, studentId, "reset");
  if (pin === null) return fail("unexpected");

  revalidatePath("/admin");
  // El PIN en claro NO va al audit_log: consta que se reseteó, nunca el valor
  // (modules/admin §4).
  return {
    ok: true,
    successKey: "pinOnce",
    values: { name: student.fullName, pin },
    oneTimePin: pin,
  };
}

export async function unlockStudent(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const viewer = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });

  const studentId = String(formData.get("studentProfileId") ?? "");
  if (!isUuid(studentId)) return fail("notFound");

  const supabase = await createClient();
  const student = await studentInScope(supabase, viewer, studentId);
  if (student === null) return fail("notFound");

  const { error } = await supabase
    .from("students")
    .update({ failed_pin_attempts: 0, locked_until: null })
    .eq("profile_id", studentId)
    .eq("school_id", student.schoolId);

  if (error !== null) {
    console.error("[cet] unlockStudent", error.message);
    return fail("unexpected");
  }

  await audit(
    supabase,
    "student.unlocked",
    "students",
    studentId,
    { failed_pin_attempts: student.failedPinAttempts, locked_until: student.lockedUntil },
    { failed_pin_attempts: 0, locked_until: null },
  );

  revalidatePath("/admin");
  return done("unlocked", { name: student.fullName });
}

interface ScopedStudent {
  readonly profileId: string;
  readonly schoolId: string;
  readonly fullName: string;
  readonly failedPinAttempts: number;
  readonly lockedUntil: string | null;
}

async function studentInScope(
  supabase: SupabaseClient,
  viewer: SessionProfile,
  studentId: string,
): Promise<ScopedStudent | null> {
  let query = supabase
    .from("students")
    .select("profile_id, school_id, failed_pin_attempts, locked_until")
    .eq("profile_id", studentId);
  if (viewer.role !== "superadmin" && viewer.schoolId !== null) {
    query = query.eq("school_id", viewer.schoolId);
  }
  const { data } = await query.maybeSingle();
  if (data === null) return null;

  const row = data as Record<string, unknown>;
  const schoolId = String(row["school_id"] ?? "");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", studentId)
    .maybeSingle();

  return {
    profileId: studentId,
    schoolId,
    fullName: String((profile as Record<string, unknown> | null)?.["full_name"] ?? ""),
    failedPinAttempts: Number(row["failed_pin_attempts"] ?? 0),
    lockedUntil: typeof row["locked_until"] === "string" ? row["locked_until"] : null,
  };
}

/* ========================================================================== */
/* 4. Cola de registro                                                        */
/* ========================================================================== */

export async function approveRegistration(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const viewer = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });
  const schoolId = viewer.schoolId;
  if (schoolId === null) return fail("unexpected");

  const requestId = String(formData.get("requestId") ?? "");
  const studentCode = String(formData.get("studentCode") ?? "").trim();
  if (!isUuid(requestId)) return fail("notFound");
  if (!STUDENT_CODE_RE.test(studentCode)) return fail("codeFormat");

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("registration_requests")
    .select("id, school_id, full_name, requested_year_level, guardian_email, status")
    .eq("id", requestId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (request === null) return fail("notFound");
  const row = request as Record<string, unknown>;
  if (row["status"] !== "pending") return fail("alreadyReviewed");

  const yearLevel = Number(row["requested_year_level"] ?? 0);
  const fullName = String(row["full_name"] ?? "");
  const guardianEmail = typeof row["guardian_email"] === "string" ? row["guardian_email"] : "";

  // Se reutiliza `createStudent` entero en vez de duplicar el alta: es donde
  // viven la unicidad del código, el rollback y la escalada documentada.
  const studentForm = new FormData();
  studentForm.set("fullName", fullName);
  studentForm.set("studentCode", studentCode);
  studentForm.set("yearLevel", String(yearLevel));
  // AD-4: la etapa determina la longitud del PIN. Y1–Y6 primaria, Y7+ secundaria.
  studentForm.set("stage", yearLevel <= 6 ? "primary" : "secondary");
  studentForm.set("guardianEmail", guardianEmail);

  const creation = await createStudent(IDLE, studentForm);
  if (!creation.ok) return creation;

  // La solicitud se marca DESPUÉS de que el alumno exista. Al revés, un fallo
  // en el alta dejaría una solicitud "aprobada" sin alumno detrás, y nadie la
  // volvería a mirar porque ya no estaría en la cola.
  // El `.select()` no es decorativo: sin él, PostgREST devuelve 204 y `error`
  // es null tanto si el UPDATE tocó una fila como si no tocó ninguna.
  //
  // Y no tocar ninguna es lo que pasaba de verdad en producción. `0012` da a
  // `registration_requests` una política de UPDATE para el school_admin y —a
  // diferencia de TODAS las demás tablas del fichero— ninguna para el
  // superadmin, cuyo `app.current_school_id()` es NULL. Reproducido el
  // 27/08/2026 contra producción en una transacción revertida:
  //
  //   [SUPERADMIN resolver] filas afectadas = 0, SIN error
  //
  // Efecto: el alumno se creaba, se auditaba "registration.approved", y la
  // solicitud se quedaba `pending` para siempre. Al segundo clic, otro alumno.
  // (La política que falta la añade `0025_registration_superadmin_update.sql`,
  //  pero esta comprobación se queda: es la que hace que el día que una
  //  política vuelva a filtrar la fila se vea en vez de adivinarse.)
  const { data: updated, error } = await supabase
    .from("registration_requests")
    .update({ status: "approved", reviewed_by: viewer.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("school_id", schoolId)
    .eq("status", "pending")
    .select("id");

  if (error !== null) {
    console.error("[cet] approveRegistration update", error.code, error.message);
    return fail("unexpected");
  }

  if ((updated ?? []).length === 0) {
    console.error(
      "[cet] approveRegistration: el UPDATE no tocó ninguna fila.",
      `request=${requestId} actor=${viewer.id} rol=${viewer.role}.`,
      "O la revisó otro administrador entre la lectura y la escritura, o la RLS filtró la fila.",
    );
    // NO se devuelve "unexpected" ("no se ha cambiado nada"): el alumno ya está
    // creado unas líneas más arriba. Ese mensaje invitaría a reintentar y a
    // crear un segundo alumno para la misma solicitud.
    return fail("notMarked");
  }

  await audit(supabase, "registration.approved", "registration_requests", requestId, {
    status: "pending",
  }, { status: "approved", student_code: studentCode });

  revalidatePath("/admin");
  return creation;
}

const rejectSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export async function rejectRegistration(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const viewer = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });
  const schoolId = viewer.schoolId;
  if (schoolId === null) return fail("unexpected");

  const parsed = rejectSchema.safeParse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "reason" ? fail("reasonRequired") : fail("notFound");
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("registration_requests")
    .select("id, school_id, full_name, status")
    .eq("id", parsed.data.requestId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (request === null) return fail("notFound");
  const row = request as Record<string, unknown>;
  if (row["status"] !== "pending") return fail("alreadyReviewed");

  const { data: updated, error } = await supabase
    .from("registration_requests")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      reviewed_by: viewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.requestId)
    .eq("school_id", schoolId)
    // Concurrencia: si otro administrador la revisó entre la lectura y esta
    // escritura, este UPDATE no toca ninguna fila en vez de pisar su decisión.
    .eq("status", "pending")
    // Igual que en `approveRegistration`: sin `.select()` un UPDATE que no toca
    // ninguna fila —porque la RLS la filtró— es indistinguible de uno que sí.
    // Un rechazo que no se guarda y dice que se ha guardado deja la solicitud
    // en la cola y al tutor sin respuesta.
    .select("id");

  if (error !== null) {
    console.error("[cet] rejectRegistration", error.code, error.message);
    return fail("unexpected");
  }

  if ((updated ?? []).length === 0) {
    console.error(
      "[cet] rejectRegistration: el UPDATE no tocó ninguna fila.",
      `request=${parsed.data.requestId} actor=${viewer.id} rol=${viewer.role}.`,
      "O la revisó otro administrador entre la lectura y la escritura, o la RLS filtró la fila.",
    );
    // Aquí "no se ha cambiado nada" sí es verdad: el rechazo no escribe nada más.
    return fail("unexpected");
  }

  await audit(
    supabase,
    "registration.rejected",
    "registration_requests",
    parsed.data.requestId,
    { status: "pending" },
    { status: "rejected", reason: parsed.data.reason },
  );

  revalidatePath("/admin");
  return done("rejected", { name: String(row["full_name"] ?? "") });
}
