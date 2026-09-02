/**
 * Acceso a datos del área de personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * REGLAS QUE NO SE NEGOCIAN EN ESTE FICHERO
 * ===========================================================================
 * 1. Se usa SIEMPRE el cliente de sesión (`@/lib/supabase/server`), nunca
 *    `createAdminClient`. RLS es la última palabra (modules/admin §6.1). La
 *    regla sigue siendo absoluta, y el lint la vigila: este fichero no está en
 *    la lista de excepciones tasadas de `apps/web/eslint.config.mjs`.
 *
 *    `loadFamiliesData()` necesita una tabla que NINGUNA sesión alcanza
 *    —`guardian_invites` no tiene ni una política RLS, por diseño de 0065— y no
 *    la lee aquí: la pide a `invitacionesPendientes()`, que vive en
 *    `@/lib/tutor/queries`, que ya es una de esas excepciones tasadas y es
 *    además el módulo que escribe esa misma tabla. La alternativa era ampliar
 *    la lista del lint, y la cabecera de ese fichero dice por qué eso sería un
 *    fallo de arquitectura y no una necesidad.
 * 2. Aun así, TODA consulta filtra por `school_id` a mano. RLS y el `where`
 *    son dos sistemas independientes: si una política se relaja mañana en una
 *    migración, el filtro explícito sigue en pie. Y a la inversa.
 * 3. `answer_key` NO se selecciona jamás aquí. Ni siquiera está en la lista de
 *    columnas: el `GRANT` de 0013 ya la excluye, pero un `select *` acabaría
 *    fallando en runtime en vez de fallar en la revisión de código. La clave
 *    sale por RPC, bajo demanda, desde `actions.ts`.
 * 4. Nada de `Date.now()` para decidir permisos ni ventanas: el reloj que vale
 *    es el del servidor de base de datos.
 * ===========================================================================
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { invitacionesPendientes, type InvitacionPendiente } from "@/lib/tutor/queries";
import type { SessionProfile } from "@/lib/auth/session";

import { effectiveGrading, type GradingRow } from "./grading-chain";
import type { RenderedOption } from "./option-order";

/* ========================================================================== */
/* Tipos de fila                                                              */
/* ========================================================================== */

export interface SchoolInfo {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly default_locale: string;
}

export interface AttemptRow {
  readonly id: string;
  readonly assignment_id: string;
  readonly student_id: string;
  readonly school_id: string;
  readonly attempt_number: number;
  /**
   * Solo el TÍTULO del snapshot, proyectado en SQL (`blueprint_snapshot->title`).
   * Traer el snapshot entero serializaría al navegador la selección de items y
   * los pesos del examen en cada carga de esta pantalla, para pintar un titular.
   */
  readonly exam_title: unknown;
  readonly status: string;
  readonly started_at: string;
  readonly server_deadline_at: string;
  readonly submitted_at: string | null;
  readonly graded_at: string | null;
  readonly submitted_by: string | null;
  readonly score_raw: number | null;
  readonly score_max: number | null;
  readonly score_pct: number | null;
  readonly passed: boolean | null;
}

export interface AttemptItemRow {
  readonly id: string;
  readonly attempt_id: string;
  readonly ord: number;
  readonly section_ord: number | null;
  readonly question_id: string;
  readonly question_version_id: string;
  readonly rendered_body: Record<string, unknown>;
  readonly option_order: number[] | null;
  readonly skill_id: string | null;
  readonly difficulty: number | null;
  readonly max_points: number;
}

export interface QuestionVersionRow {
  readonly id: string;
  readonly question_id: string;
  readonly version: number;
  readonly format: string;
  readonly grading_mode: "auto" | "partial" | "manual";
  readonly max_points: number;
}

export interface ResponseRow {
  readonly id: string;
  readonly attempt_item_id: string;
  readonly revision: number;
  readonly response: unknown;
  readonly is_final: boolean;
  readonly client_ts: string | null;
  readonly server_ts: string;
  readonly time_on_item_ms: number | null;
  readonly source: "typed" | "selected" | "autosave" | "restored";
}

export interface LearningEventRow {
  readonly event_type: string;
  readonly attempt_item_id: string | null;
  readonly payload: Record<string, unknown>;
  readonly server_ts: string;
  readonly seq: number;
}

export interface SkillRow {
  readonly id: string;
  readonly code: string;
  readonly name: Record<string, string>;
}

/* ========================================================================== */
/* Vista compuesta de la reconstrucción                                       */
/* ========================================================================== */

/** Telemetría derivada de `learning_events`, por item. */
export interface ItemTelemetry {
  readonly timeOnItemMs: number | null;
  readonly hintsRequested: number;
  readonly idleMs: number;
  readonly focusLosses: number;
  readonly revisits: number;
  readonly shownAt: string | null;
}

export interface AttemptTelemetry extends ItemTelemetry {
  readonly eventCount: number;
}

export interface ReconstructedItem {
  readonly item: AttemptItemRow;
  readonly version: QuestionVersionRow | null;
  readonly skill: SkillRow | null;
  readonly stem: string;
  readonly figureSvg: string | null;
  /** `rendered_body.figureAlt`: obligatorio cuando hay figura (engine-contract). */
  readonly figureAlt: Record<string, string> | null;
  readonly options: readonly RenderedOption[] | null;
  readonly responses: readonly ResponseRow[];
  readonly gradings: readonly GradingRow[];
  readonly telemetry: ItemTelemetry;
}

export interface AttemptReconstruction {
  readonly attempt: AttemptRow;
  readonly school: SchoolInfo;
  readonly studentName: string;
  readonly studentCode: string | null;
  readonly sectionName: string | null;
  readonly examTitle: Record<string, string> | null;
  readonly items: readonly ReconstructedItem[];
  readonly telemetry: AttemptTelemetry;
  /** true si no llegó ni un evento: hay que decirlo, no fingir ceros. */
  readonly telemetryMissing: boolean;
}

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/**
 * Alcance de tenant del observador.
 *
 * El superadmin no pertenece a colegio (`profiles.school_id is null`, y la
 * constraint de DATA_MODEL §1 lo hace obligatorio), así que para él el filtro
 * por `school_id` no existe — lo cubre `*_select_superadmin` en RLS. Para todos
 * los demás el filtro es obligatorio y se aplica ADEMÁS de la política.
 */
function tenantFilter(viewer: SessionProfile): string | null {
  return viewer.role === "superadmin" ? null : viewer.schoolId;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asI18n(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function optionsFrom(renderedBody: Record<string, unknown>): readonly RenderedOption[] | null {
  const raw = renderedBody["options"];
  if (!Array.isArray(raw)) return null;
  const options: RenderedOption[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = asString(record["id"]);
    const html = record["html"];
    if (id === null || typeof html !== "string") continue;
    options.push({ id, html });
  }
  return options.length === 0 ? null : options;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/* ========================================================================== */
/* La reconstrucción — DATA_MODEL §10                                         */
/* ========================================================================== */

/**
 * La query de DATA_MODEL §10, resuelta en consultas separadas en vez de en un
 * único `join`.
 *
 * Motivo: el `left join attempt_responses` × `left join attempt_gradings` de
 * §10 produce un PRODUCTO CARTESIANO. Un item con 4 revisiones y 3
 * recalificaciones devuelve 12 filas, y sumar puntos sobre eso da una nota
 * inventada. En SQL puro se corrige agregando; aquí, con PostgREST, salen cinco
 * consultas indexadas y el emparejamiento se hace en memoria — que además es lo
 * que permite ordenar la cadena de recalificación correctamente
 * (`grading-chain.ts`), cosa que un `order by` plano no hace.
 *
 * El contenido de la reconstrucción es EXACTAMENTE el de §10: `ord`,
 * `rendered_body`, `option_order`, `qv.version`, cada `response`/`revision`/
 * `server_ts` y cada `points_awarded`/`graded_by`/`graded_at`. Lo único que se
 * deja fuera a propósito es `ai.answer_key`, que aquí no se puede leer y que
 * sale por RPC bajo demanda (DATA_MODEL §9).
 *
 * @returns `null` si el intento no existe o no pertenece al colegio del
 *   observador. Las dos situaciones dan el MISMO resultado a propósito:
 *   distinguirlas confirmaría a un profesor que el intento de otro colegio
 *   existe.
 */
export async function loadAttemptReconstruction(
  attemptId: string,
  viewer: SessionProfile,
): Promise<AttemptReconstruction | null> {
  if (!isUuid(attemptId)) return null;

  const supabase = await createClient();
  const schoolId = tenantFilter(viewer);

  let attemptQuery = supabase
    .from("exam_attempts")
    .select(
      "id, assignment_id, student_id, school_id, attempt_number, exam_title:blueprint_snapshot->title, status, started_at, server_deadline_at, submitted_at, graded_at, submitted_by, score_raw, score_max, score_pct, passed",
    )
    .eq("id", attemptId);

  if (schoolId !== null) attemptQuery = attemptQuery.eq("school_id", schoolId);

  const { data: attemptData, error: attemptError } = await attemptQuery.maybeSingle();
  if (attemptError !== null || attemptData === null) return null;

  const attempt = attemptData as AttemptRow;

  // Defensa en profundidad: si por lo que sea la fila llegara con otro tenant,
  // se descarta aquí. Es redundante con el `.eq()` y con la RLS. Redundante es
  // exactamente lo que se busca en la frontera de un tenant.
  if (schoolId !== null && attempt.school_id !== schoolId) return null;

  const [schoolRes, itemsRes, responsesRes, gradingsRes, eventsRes, studentRes, assignmentRes] =
    await Promise.all([
      supabase
        .from("schools")
        .select("id, name, timezone, default_locale")
        .eq("id", attempt.school_id)
        .maybeSingle(),
      supabase
        .from("attempt_items")
        .select(
          "id, attempt_id, ord, section_ord, question_id, question_version_id, rendered_body, option_order, skill_id, difficulty, max_points",
        )
        .eq("attempt_id", attempt.id)
        .order("ord", { ascending: true }),
      supabase
        .from("attempt_responses")
        .select("id, attempt_item_id, revision, response, is_final, client_ts, server_ts, time_on_item_ms, source")
        .eq("attempt_id", attempt.id)
        .order("revision", { ascending: true }),
      supabase
        .from("attempt_gradings")
        .select(
          "id, attempt_item_id, points_awarded, max_points, is_correct, partial_ratio, graded_by, grader_id, rationale, graded_at, supersedes_id",
        )
        .eq("attempt_id", attempt.id)
        .order("graded_at", { ascending: true }),
      supabase
        .from("learning_events")
        .select("event_type, attempt_item_id, payload, server_ts, seq")
        .eq("attempt_id", attempt.id)
        .eq("school_id", attempt.school_id)
        .order("server_ts", { ascending: true })
        .limit(5000),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", attempt.student_id)
        .maybeSingle(),
      supabase
        .from("exam_assignments")
        .select("id, section_id, blueprint_id")
        .eq("id", attempt.assignment_id)
        .eq("school_id", attempt.school_id)
        .maybeSingle(),
    ]);

  const items = (itemsRes.data ?? []) as AttemptItemRow[];

  const versionIds = [...new Set(items.map((item) => item.question_version_id))];
  const skillIds = [...new Set(items.map((item) => item.skill_id).filter(isNonNullString))];

  const [versionsRes, skillsRes, studentRowRes, sectionRes] = await Promise.all([
    versionIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("question_versions")
          // Hallazgo P2-2: aquí se pedían además `hint` y `solution`. No se
          // pintaban en ningún sitio, pero viajaban al navegador dentro de la
          // carga RSC de este componente. `solution` es el desarrollo completo
          // de la respuesta: el `GRANT` deja al profesor leerlo, así que no es
          // una fuga entre colegios, pero contradice de plano la promesa de
          // esta pantalla —"nada de la respuesta se carga hasta que la pidas"—
          // y ensuciaba el criterio de "revelar la clave es un gesto
          // deliberado". Lo que no se pinta, no se pide.
          .select("id, question_id, version, format, grading_mode, max_points")
          .in("id", versionIds),
    skillIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("skills").select("id, code, name").in("id", skillIds),
    supabase
      .from("students")
      .select("profile_id, student_code, section")
      .eq("profile_id", attempt.student_id)
      .eq("school_id", attempt.school_id)
      .maybeSingle(),
    (() => {
      const sectionId = asString(asRecord(assignmentRes.data)["section_id"]);
      if (sectionId === null) return Promise.resolve({ data: null });
      return supabase
        .from("sections")
        .select("id, name")
        .eq("id", sectionId)
        .eq("school_id", attempt.school_id)
        .maybeSingle();
    })(),
  ]);

  const versionsById = new Map<string, QuestionVersionRow>();
  for (const raw of (versionsRes.data ?? []) as QuestionVersionRow[]) {
    versionsById.set(raw.id, raw);
  }

  const skillsById = new Map<string, SkillRow>();
  for (const raw of (skillsRes.data ?? []) as SkillRow[]) skillsById.set(raw.id, raw);

  const responsesByItem = groupBy((responsesRes.data ?? []) as ResponseRow[], (r) => r.attempt_item_id);
  const gradingsByItem = groupBy(
    (gradingsRes.data ?? []) as (GradingRow & { attempt_item_id: string })[],
    (g) => g.attempt_item_id,
  );

  const events = (eventsRes.data ?? []) as LearningEventRow[];
  const telemetryByItem = telemetryPerItem(events);

  const reconstructed: ReconstructedItem[] = items.map((item) => {
    const rendered = asRecord(item.rendered_body);
    const responses = [...(responsesByItem.get(item.id) ?? [])].sort((a, b) => a.revision - b.revision);
    return {
      item,
      version: versionsById.get(item.question_version_id) ?? null,
      skill: item.skill_id === null ? null : (skillsById.get(item.skill_id) ?? null),
      stem: asString(rendered["stem"]) ?? "",
      figureSvg: asString(rendered["figureSvg"]),
      figureAlt: asI18n(rendered["figureAlt"]),
      options: optionsFrom(rendered),
      responses,
      gradings: gradingsByItem.get(item.id) ?? [],
      telemetry: telemetryByItem.get(item.id) ?? emptyItemTelemetry(),
    };
  });

  const schoolRow = asRecord(schoolRes.data);
  const school: SchoolInfo = {
    id: attempt.school_id,
    name: asString(schoolRow["name"]) ?? "",
    // `schools.timezone` es NOT NULL DEFAULT 'UTC', pero esta pantalla no puede
    // depender de que la fila se haya podido leer.
    timezone: asString(schoolRow["timezone"]) ?? "UTC",
    default_locale: asString(schoolRow["default_locale"]) ?? "en",
  };

  const studentRow = asRecord(studentRowRes.data);

  return {
    attempt,
    school,
    studentName: asString(asRecord(studentRes.data)["full_name"]) ?? "",
    studentCode: asString(studentRow["student_code"]),
    sectionName:
      asString(asRecord(sectionRes.data)["name"]) ?? asString(studentRow["section"]),
    // El título sale del SNAPSHOT del blueprint, no de `exam_blueprints`: si
    // alguien renombra el examen mañana, este intento debe seguir diciendo cómo
    // se llamaba cuando el alumno lo hizo (DATA_MODEL §6).
    examTitle: asI18n(attempt.exam_title),
    items: reconstructed,
    telemetry: aggregateTelemetry(events, telemetryByItem),
    telemetryMissing: events.length === 0,
  };
}

/* ========================================================================== */
/* Telemetría                                                                 */
/* ========================================================================== */

function emptyItemTelemetry(): ItemTelemetry {
  return { timeOnItemMs: null, hintsRequested: 0, idleMs: 0, focusLosses: 0, revisits: 0, shownAt: null };
}

/**
 * Reduce `learning_events` a cifras por pregunta.
 *
 * Se prefiere el `timeOnItemMs` que el cliente reporta en `answer_submitted` /
 * `answer_changed` porque mide tiempo REAL frente a la pregunta, mientras que
 * restar dos `server_ts` mide "tiempo hasta que el lote llegó al servidor" —
 * que con la ingesta en lote de M11 (cada 5 s) es sistemáticamente otra cosa.
 * El valor es del cliente y por tanto no puntúa nada: es información para el
 * profesor, y así se etiqueta.
 */
function telemetryPerItem(events: readonly LearningEventRow[]): Map<string, ItemTelemetry> {
  const acc = new Map<string, {
    timeOnItemMs: number | null;
    hintsRequested: number;
    idleMs: number;
    focusLosses: number;
    revisits: number;
    shownAt: string | null;
  }>();

  const get = (itemId: string) => {
    const existing = acc.get(itemId);
    if (existing !== undefined) return existing;
    const created = { ...emptyItemTelemetry() };
    acc.set(itemId, created);
    return created;
  };

  for (const event of events) {
    const itemId = event.attempt_item_id;
    if (itemId === null) continue;
    const bucket = get(itemId);
    const payload = asRecord(event.payload);

    switch (event.event_type) {
      case "question_shown":
        if (bucket.shownAt === null) bucket.shownAt = event.server_ts;
        break;
      case "question_revisited":
        bucket.revisits += 1;
        break;
      case "hint_requested":
        bucket.hintsRequested += 1;
        break;
      case "idle_end":
        bucket.idleMs += Math.max(0, numberOr(payload["idleMs"], 0));
        break;
      case "focus_lost":
        bucket.focusLosses += 1;
        break;
      case "answer_changed":
      case "answer_submitted":
      case "question_skipped": {
        const reported = numberOr(payload["timeOnItemMs"], -1);
        if (reported >= 0) {
          bucket.timeOnItemMs = Math.max(bucket.timeOnItemMs ?? 0, reported);
        }
        break;
      }
      default:
        break;
    }
  }

  return acc;
}

function aggregateTelemetry(
  events: readonly LearningEventRow[],
  perItem: ReadonlyMap<string, ItemTelemetry>,
): AttemptTelemetry {
  let timeOnItemMs = 0;
  let hasTime = false;
  let hintsRequested = 0;
  let idleMs = 0;
  let focusLosses = 0;
  let revisits = 0;

  for (const item of perItem.values()) {
    if (item.timeOnItemMs !== null) {
      timeOnItemMs += item.timeOnItemMs;
      hasTime = true;
    }
    hintsRequested += item.hintsRequested;
    idleMs += item.idleMs;
    focusLosses += item.focusLosses;
    revisits += item.revisits;
  }

  // Los eventos de foco e inactividad del intento pueden llegar SIN
  // `attempt_item_id` (el alumno se va de la pestaña entre preguntas). Si solo
  // se contaran los que tienen item, se perderían justo los más interesantes.
  for (const event of events) {
    if (event.attempt_item_id !== null) continue;
    if (event.event_type === "focus_lost") focusLosses += 1;
    if (event.event_type === "idle_end") {
      idleMs += Math.max(0, numberOr(asRecord(event.payload)["idleMs"], 0));
    }
    if (event.event_type === "hint_requested") hintsRequested += 1;
  }

  return {
    timeOnItemMs: hasTime ? timeOnItemMs : null,
    hintsRequested,
    idleMs,
    focusLosses,
    revisits,
    shownAt: null,
    eventCount: events.length,
  };
}

/* ========================================================================== */
/* Panel del profesor                                                         */
/* ========================================================================== */

export interface TeachClass {
  readonly id: string;
  readonly name: string;
  readonly yearLevel: number;
  readonly academicYear: string;
  readonly studentCount: number;
  readonly assignmentCount: number;
}

export interface TeachAssignment {
  readonly id: string;
  readonly examTitle: Record<string, string> | null;
  readonly sectionName: string | null;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly submitted: number;
  readonly inProgress: number;
  readonly notStarted: number;
  readonly averagePct: number | null;
}

export interface TeachAttempt {
  readonly id: string;
  readonly studentName: string;
  readonly examTitle: Record<string, string> | null;
  readonly status: string;
  readonly startedAt: string;
  readonly submittedAt: string | null;
  readonly scorePct: number | null;
}

export interface WeakSkill {
  readonly skillId: string;
  readonly code: string;
  readonly name: Record<string, string>;
  readonly averageMastery: number;
  readonly averageConfidence: number;
  readonly studentsTracked: number;
  readonly observations: number;
}

export interface TeachDashboardData {
  readonly school: SchoolInfo;
  readonly totals: {
    readonly submitted: number;
    readonly inProgress: number;
    readonly notStarted: number;
    readonly averagePct: number | null;
  };
  readonly classes: readonly TeachClass[];
  readonly assignments: readonly TeachAssignment[];
  readonly recentAttempts: readonly TeachAttempt[];
  readonly weakSkills: readonly WeakSkill[];
}

// Definido en `./constants` (sin `server-only`) para que los componentes de
// cliente puedan leerlo sin arrastrar esta capa de datos al bundle.
export { MIN_MASTERY_OBSERVATIONS } from "./constants";
import { MIN_MASTERY_OBSERVATIONS } from "./constants";

const RECENT_ATTEMPTS_LIMIT = 25;
const WEAK_SKILLS_LIMIT = 8;

export async function loadTeachDashboard(viewer: SessionProfile): Promise<TeachDashboardData | null> {
  const schoolId = viewer.schoolId;
  // Un superadmin no tiene colegio y este panel es, por definición, el de UN
  // colegio. En vez de enseñarle un agregado sin sentido de todos los colegios,
  // se le manda a /admin.
  if (schoolId === null) return null;

  const supabase = await createClient();

  const [schoolRes, sectionsRes, membershipsRes, assignmentsRes, attemptsRes, masteryRes] =
    await Promise.all([
      supabase
        .from("schools")
        .select("id, name, timezone, default_locale")
        .eq("id", schoolId)
        .maybeSingle(),
      supabase
        .from("sections")
        .select("id, name, year_level, academic_year")
        .eq("school_id", schoolId)
        .order("year_level", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("section_members")
        .select("section_id, profile_id, role_in_section")
        .eq("school_id", schoolId),
      supabase
        .from("exam_assignments")
        .select("id, blueprint_id, section_id, opens_at, closes_at, max_attempts")
        .eq("school_id", schoolId)
        .order("opens_at", { ascending: false })
        .limit(50),
      supabase
        .from("exam_attempts")
        // Hallazgo P2-3: aquí se traía `blueprint_snapshot` ENTERO para 500
        // intentos, y de ese jsonb solo se usa el título. El snapshot lleva las
        // secciones, la selección de items y los pesos: son decenas de KB por
        // fila que cruzaban la red y se serializaban al cliente para pintar una
        // celda de texto. Se proyecta solo la clave que hace falta.
        .select(
          "id, assignment_id, student_id, status, started_at, submitted_at, score_pct, exam_title:blueprint_snapshot->title",
        )
        .eq("school_id", schoolId)
        .order("started_at", { ascending: false })
        .limit(500),
      supabase
        .from("skill_mastery")
        .select("skill_id, student_id, mastery, confidence, attempts_count")
        .eq("school_id", schoolId)
        .limit(5000),
    ]);

  const schoolRow = asRecord(schoolRes.data);
  const school: SchoolInfo = {
    id: schoolId,
    name: asString(schoolRow["name"]) ?? "",
    timezone: asString(schoolRow["timezone"]) ?? "UTC",
    default_locale: asString(schoolRow["default_locale"]) ?? "en",
  };

  const memberships = (membershipsRes.data ?? []) as {
    section_id: string;
    profile_id: string;
    role_in_section: string;
  }[];

  const assignments = (assignmentsRes.data ?? []) as {
    id: string;
    blueprint_id: string;
    section_id: string | null;
    opens_at: string;
    closes_at: string;
  }[];

  const attempts = (attemptsRes.data ?? []) as {
    id: string;
    assignment_id: string;
    student_id: string;
    status: string;
    started_at: string;
    submitted_at: string | null;
    score_pct: number | null;
    exam_title: unknown;
  }[];

  // Un profesor solo debe ver sus clases. Un school_admin las ve todas: es su
  // colegio entero. La RLS permite las dos cosas; el recorte es de producto.
  const mySectionIds = new Set(
    memberships
      .filter((m) => m.profile_id === viewer.id && m.role_in_section !== "student")
      .map((m) => m.section_id),
  );
  const seesEverySection = viewer.role !== "teacher" || mySectionIds.size === 0;

  const studentsBySection = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (m.role_in_section !== "student") continue;
    const set = studentsBySection.get(m.section_id) ?? new Set<string>();
    set.add(m.profile_id);
    studentsBySection.set(m.section_id, set);
  }

  const sectionRows = (sectionsRes.data ?? []) as {
    id: string;
    name: string;
    year_level: number;
    academic_year: string;
  }[];

  const visibleSections = sectionRows.filter((s) => seesEverySection || mySectionIds.has(s.id));
  const visibleSectionIds = new Set(visibleSections.map((s) => s.id));

  const visibleAssignments = assignments.filter(
    (a) => a.section_id === null || visibleSectionIds.has(a.section_id),
  );
  const visibleAssignmentIds = new Set(visibleAssignments.map((a) => a.id));
  const visibleAttempts = attempts.filter((a) => visibleAssignmentIds.has(a.assignment_id));

  const sectionNameById = new Map(sectionRows.map((s) => [s.id, s.name] as const));

  const classes: TeachClass[] = visibleSections.map((section) => ({
    id: section.id,
    name: section.name,
    yearLevel: section.year_level,
    academicYear: section.academic_year,
    studentCount: studentsBySection.get(section.id)?.size ?? 0,
    assignmentCount: visibleAssignments.filter((a) => a.section_id === section.id).length,
  }));

  const attemptsByAssignment = groupBy(visibleAttempts, (a) => a.assignment_id);

  const assignmentViews: TeachAssignment[] = visibleAssignments.map((assignment) => {
    const rows = attemptsByAssignment.get(assignment.id) ?? [];
    const expected =
      assignment.section_id === null
        ? rows.length
        : (studentsBySection.get(assignment.section_id)?.size ?? rows.length);

    const submitted = rows.filter((r) => isSubmittedStatus(r.status)).length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const startedStudents = new Set(rows.filter((r) => r.status !== "voided").map((r) => r.student_id));
    const graded = rows.filter((r) => r.status === "graded" && r.score_pct !== null);

    return {
      id: assignment.id,
      examTitle: asI18n(rows[0]?.exam_title),
      sectionName: assignment.section_id === null ? null : (sectionNameById.get(assignment.section_id) ?? null),
      opensAt: assignment.opens_at,
      closesAt: assignment.closes_at,
      submitted,
      inProgress,
      notStarted: Math.max(0, expected - startedStudents.size),
      averagePct:
        graded.length === 0
          ? null
          : graded.reduce((sum, r) => sum + (r.score_pct ?? 0), 0) / graded.length,
    };
  });

  const gradedOverall = visibleAttempts.filter((a) => a.status === "graded" && a.score_pct !== null);

  const totals = {
    submitted: visibleAttempts.filter((a) => isSubmittedStatus(a.status)).length,
    inProgress: visibleAttempts.filter((a) => a.status === "in_progress").length,
    notStarted: assignmentViews.reduce((sum, a) => sum + a.notStarted, 0),
    averagePct:
      gradedOverall.length === 0
        ? null
        : gradedOverall.reduce((sum, a) => sum + (a.score_pct ?? 0), 0) / gradedOverall.length,
  };

  const studentIds = [...new Set(visibleAttempts.slice(0, RECENT_ATTEMPTS_LIMIT).map((a) => a.student_id))];
  const namesRes =
    studentIds.length === 0
      ? { data: [] }
      : await supabase.from("profiles").select("id, full_name").in("id", studentIds).eq("school_id", schoolId);
  const nameById = new Map(
    ((namesRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name] as const),
  );

  const recentAttempts: TeachAttempt[] = visibleAttempts.slice(0, RECENT_ATTEMPTS_LIMIT).map((a) => ({
    id: a.id,
    studentName: nameById.get(a.student_id) ?? "",
    examTitle: asI18n(a.exam_title),
    status: a.status,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    scorePct: a.score_pct,
  }));

  return {
    school,
    totals,
    classes,
    assignments: assignmentViews,
    recentAttempts,
    weakSkills: await weakestSkills(
      (masteryRes.data ?? []) as MasteryRow[],
      supabase,
      studentsBySection,
      visibleSectionIds,
      seesEverySection,
    ),
  };
}

interface MasteryRow {
  readonly skill_id: string;
  readonly student_id: string;
  readonly mastery: number;
  readonly confidence: number;
  readonly attempts_count: number;
}

/**
 * Agrega `skill_mastery` por destreza dentro del colegio y devuelve las más
 * flojas.
 *
 * Las destrezas con menos de `MIN_MASTERY_OBSERVATIONS` observaciones se
 * descartan: un alumno que ha respondido dos preguntas de una destreza no
 * "domina el 0 %", simplemente no hay dato. Enseñar esa fila arriba del todo
 * haría que el profesor dejara de creerse el panel a la tercera vez.
 */
async function weakestSkills(
  rows: readonly MasteryRow[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentsBySection: ReadonlyMap<string, ReadonlySet<string>>,
  visibleSectionIds: ReadonlySet<string>,
  seesEverySection: boolean,
): Promise<readonly WeakSkill[]> {
  let considered = rows;

  if (!seesEverySection) {
    const mine = new Set<string>();
    for (const [sectionId, students] of studentsBySection) {
      if (!visibleSectionIds.has(sectionId)) continue;
      for (const student of students) mine.add(student);
    }
    considered = rows.filter((row) => mine.has(row.student_id));
  }

  const bySkill = new Map<string, { mastery: number; confidence: number; students: Set<string>; observations: number }>();

  for (const row of considered) {
    const bucket = bySkill.get(row.skill_id) ?? {
      mastery: 0,
      confidence: 0,
      students: new Set<string>(),
      observations: 0,
    };
    bucket.mastery += numberOr(row.mastery, 0);
    bucket.confidence += numberOr(row.confidence, 0);
    bucket.students.add(row.student_id);
    bucket.observations += Math.max(0, numberOr(row.attempts_count, 0));
    bySkill.set(row.skill_id, bucket);
  }

  const ranked = [...bySkill.entries()]
    .filter(([, bucket]) => bucket.observations >= MIN_MASTERY_OBSERVATIONS)
    .map(([skillId, bucket]) => ({
      skillId,
      averageMastery: bucket.mastery / bucket.students.size,
      averageConfidence: bucket.confidence / bucket.students.size,
      studentsTracked: bucket.students.size,
      observations: bucket.observations,
    }))
    .sort((a, b) => a.averageMastery - b.averageMastery)
    .slice(0, WEAK_SKILLS_LIMIT);

  if (ranked.length === 0) return [];

  const { data } = await supabase
    .from("skills")
    .select("id, code, name")
    .in(
      "id",
      ranked.map((r) => r.skillId),
    );

  const skillById = new Map(((data ?? []) as SkillRow[]).map((s) => [s.id, s] as const));

  return ranked.map((entry) => {
    const skill = skillById.get(entry.skillId);
    return {
      skillId: entry.skillId,
      code: skill?.code ?? "",
      name: skill?.name ?? {},
      averageMastery: entry.averageMastery,
      averageConfidence: entry.averageConfidence,
      studentsTracked: entry.studentsTracked,
      observations: entry.observations,
    };
  });
}

/* ========================================================================== */
/* Corrección manual                                                          */
/* ========================================================================== */

export interface ManualGradingItem {
  readonly itemId: string;
  readonly ord: number;
  readonly stem: string;
  readonly maxPoints: number;
  readonly finalResponse: unknown;
  readonly currentGrading: GradingRow | null;
  readonly gradings: readonly GradingRow[];
}

export interface ManualGradingView {
  readonly attempt: AttemptRow;
  readonly school: SchoolInfo;
  readonly studentName: string;
  readonly examTitle: Record<string, string> | null;
  readonly items: readonly ManualGradingItem[];
}

/**
 * Los items del intento cuyo `grading_mode` es `manual`.
 *
 * El modo lo manda `question_versions`, no `attempt_items`: la versión es el
 * snapshot inmutable de la pregunta, y es lo que decidía cómo se corregía
 * cuando el alumno la vio.
 */
export async function loadManualGradingView(
  attemptId: string,
  viewer: SessionProfile,
): Promise<ManualGradingView | null> {
  const reconstruction = await loadAttemptReconstruction(attemptId, viewer);
  if (reconstruction === null) return null;

  const items: ManualGradingItem[] = reconstruction.items
    .filter((entry) => entry.version?.grading_mode === "manual")
    .map((entry) => {
      const finalResponse =
        entry.responses.find((r) => r.is_final)?.response ?? entry.responses.at(-1)?.response ?? null;
      return {
        itemId: entry.item.id,
        ord: entry.item.ord,
        stem: entry.stem,
        maxPoints: entry.item.max_points,
        finalResponse,
        currentGrading: effectiveGrading(entry.gradings),
        gradings: entry.gradings,
      };
    });

  return {
    attempt: reconstruction.attempt,
    school: reconstruction.school,
    studentName: reconstruction.studentName,
    examTitle: reconstruction.examTitle,
    items,
  };
}

/* ========================================================================== */
/* Administración                                                             */
/* ========================================================================== */

export interface AdminStudent {
  readonly profileId: string;
  readonly fullName: string;
  readonly studentCode: string;
  readonly yearLevel: number;
  readonly stage: string;
  readonly section: string | null;
  readonly status: string;
  readonly pinMustChange: boolean;
  readonly failedPinAttempts: number;
  readonly lockedUntil: string | null;
  readonly guardianEmail: string | null;
}

export interface AdminRegistration {
  readonly id: string;
  readonly fullName: string;
  readonly requestedYearLevel: number;
  readonly guardianEmail: string | null;
  readonly note: string | null;
  readonly status: string;
  readonly createdAt: string;
}

export interface AuditEntry {
  readonly id: number;
  readonly createdAt: string;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly before: unknown;
  readonly after: unknown;
}

export interface AdminData {
  readonly school: SchoolInfo;
  readonly students: readonly AdminStudent[];
  readonly registrations: readonly AdminRegistration[];
  readonly audit: readonly AuditEntry[];
  /** Un `teacher` que llegue aquí no ve el log: la RLS solo lo abre al school_admin. */
  readonly auditAvailable: boolean;
}

const AUDIT_PAGE_SIZE = 50;

/**
 * @param schoolId Colegio a cargar, ya resuelto por `resolveAdminSchool()`.
 *   Se pasa explícito y no se deduce de `viewer` porque un superadmin no tiene
 *   colegio propio (`profiles_superadmin_has_no_school`) y elige el suyo por la
 *   URL. La decisión de QUÉ colegio es de quien llama; aquí solo se carga.
 *
 *   Sigue en pie la regla 2 de la cabecera: todas las consultas filtran por
 *   `school_id` a mano, además de lo que haga RLS.
 */
export async function loadAdminData(
  viewer: SessionProfile,
  schoolId: string | null = viewer.schoolId,
): Promise<AdminData | null> {
  if (schoolId === null) return null;

  // Cinturón sobre el tirante de `resolveAdminSchool`: quien no sea superadmin
  // solo carga su propio colegio, venga de donde venga el argumento.
  if (viewer.role !== "superadmin" && schoolId !== viewer.schoolId) return null;

  const supabase = await createClient();

  const [schoolRes, studentsRes, profilesRes, registrationsRes, auditRes] = await Promise.all([
    supabase.from("schools").select("id, name, timezone, default_locale").eq("id", schoolId).maybeSingle(),
    supabase
      .from("students")
      .select(
        "profile_id, student_code, year_level, stage, section, pin_must_change, failed_pin_attempts, locked_until, guardian_email",
      )
      .eq("school_id", schoolId)
      .order("student_code", { ascending: true })
      .limit(500),
    supabase.from("profiles").select("id, full_name, status").eq("school_id", schoolId).limit(1000),
    supabase
      .from("registration_requests")
      .select("id, full_name, requested_year_level, guardian_email, note, status, created_at")
      .eq("school_id", schoolId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("audit_log")
      .select("id, created_at, actor_id, actor_role, action, entity_type, entity_id, before, after")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(AUDIT_PAGE_SIZE),
  ]);

  const schoolRow = asRecord(schoolRes.data);
  const school: SchoolInfo = {
    id: schoolId,
    name: asString(schoolRow["name"]) ?? "",
    timezone: asString(schoolRow["timezone"]) ?? "UTC",
    default_locale: asString(schoolRow["default_locale"]) ?? "en",
  };

  const profiles = (profilesRes.data ?? []) as { id: string; full_name: string; status: string }[];
  const profileById = new Map(profiles.map((p) => [p.id, p] as const));

  const students: AdminStudent[] = ((studentsRes.data ?? []) as Record<string, unknown>[]).map((row) => {
    const profileId = asString(row["profile_id"]) ?? "";
    const profile = profileById.get(profileId);
    return {
      profileId,
      fullName: profile?.full_name ?? "",
      studentCode: asString(row["student_code"]) ?? "",
      yearLevel: numberOr(row["year_level"], 0),
      stage: asString(row["stage"]) ?? "",
      section: asString(row["section"]),
      status: profile?.status ?? "",
      pinMustChange: row["pin_must_change"] === true,
      failedPinAttempts: numberOr(row["failed_pin_attempts"], 0),
      lockedUntil: asString(row["locked_until"]),
      guardianEmail: asString(row["guardian_email"]),
    };
  });

  const registrations: AdminRegistration[] = ((registrationsRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      id: asString(row["id"]) ?? "",
      fullName: asString(row["full_name"]) ?? "",
      requestedYearLevel: numberOr(row["requested_year_level"], 0),
      guardianEmail: asString(row["guardian_email"]),
      note: asString(row["note"]),
      status: asString(row["status"]) ?? "pending",
      createdAt: asString(row["created_at"]) ?? "",
    }),
  );

  const auditRows = (auditRes.data ?? []) as Record<string, unknown>[];
  const audit: AuditEntry[] = auditRows.map((row) => {
    const actorId = asString(row["actor_id"]);
    return {
      id: numberOr(row["id"], 0),
      createdAt: asString(row["created_at"]) ?? "",
      actorId,
      actorName: actorId === null ? null : (profileById.get(actorId)?.full_name ?? null),
      actorRole: asString(row["actor_role"]),
      action: asString(row["action"]) ?? "",
      entityType: asString(row["entity_type"]) ?? "",
      entityId: asString(row["entity_id"]),
      before: row["before"] ?? null,
      after: row["after"] ?? null,
    };
  });

  return {
    school,
    students,
    registrations,
    audit,
    auditAvailable: auditRes.error === null,
  };
}

/* ========================================================================== */
/* Familias — el bloque que no es de ningún colegio                           */
/* ========================================================================== */

/**
 * UN HIJO, VISTO DESDE LA ADMINISTRACIÓN.
 *
 * Lo que NO lleva es tan deliberado como lo que lleva: ni `pin_hash`, ni
 * `token_hash`, ni la IP desde la que se generó ningún enlace, ni el
 * user-agent del aparato. `hayDispositivo` y `hayEnlaceVivo` son booleanos y
 * no listas por el mismo motivo: al superadmin le basta saber SI el niño puede
 * entrar; cuál es el aparato concreto es asunto de su tutor, y para eso ya
 * existe la pantalla del tutor.
 */
export interface FamiliaHijo {
  readonly profileId: string;
  readonly fullName: string;
  readonly studentCode: string;
  readonly yearLevel: number;
  readonly stage: string;
  readonly hayDispositivo: boolean;
  readonly hayEnlaceVivo: boolean;
  /**
   * `max(student_devices.last_seen_at)`, y NO la última fila de
   * `accesos_de_alumno`.
   *
   * Las dos responden a la pregunta —`auth-pin` sella `last_seen_at` en cada
   * entrada válida (functions/auth-pin/index.ts:595)—, pero `accesos_de_alumno`
   * es «la tabla más sensible del sistema» por decisión escrita en 0078: guarda
   * la IP en claro y sin caducidad. Abrirla para pintar una columna de fecha
   * sería pasearse por ese dato sin necesitarlo. Se le pregunta a la tabla
   * barata, que además ya se estaba consultando para saber si hay dispositivo.
   */
  readonly ultimoAccesoAt: string | null;
}

export interface Familia {
  readonly guardianId: string;
  readonly guardianName: string;
  readonly guardianEmail: string | null;
  readonly hijos: readonly FamiliaHijo[];
}

/**
 * Se reexporta para que la pantalla que la pinta importe sus tipos de un solo
 * sitio. La forma la define `@/lib/tutor/queries`, que es donde vive la única
 * lectura posible de `guardian_invites`.
 */
export type { InvitacionPendiente };

export interface FamiliesData {
  readonly familias: readonly Familia[];
  readonly invitaciones: readonly InvitacionPendiente[];
  /**
   * `false` si la cola de invitaciones no se pudo leer (falta la clave de
   * servicio en el entorno, o PostgREST devolvió error). Se distingue de «no
   * hay ninguna» a propósito: una lista vacía por un fallo de consulta se lee
   * en pantalla como «no queda nadie por canjear», que es un mensaje falso.
   */
  readonly invitacionesDisponibles: boolean;
}

const FAMILIAS_LIMITE = 500;

/**
 * Las familias del sistema, para el superadmin.
 *
 * ===========================================================================
 * POR QUÉ ESTA CONSULTA NO PASA POR `school_id`
 * ===========================================================================
 * El resto de este fichero filtra por colegio a mano, además de lo que haga
 * RLS (regla 2 de la cabecera). Aquí no hay nada que filtrar, y no es un
 * descuido: desde `0066` un hijo dado de alta por su tutor NACE con
 * `school_id = null`, y `profiles_alcance_por_rol` obliga a que un `guardian`
 * tampoco tenga colegio. Una familia no pertenece a ningún tenant, así que un
 * `where school_id = …` no la encontraría nunca — que es exactamente el motivo
 * por el que los dos únicos alumnos reales de producción eran invisibles desde
 * `/admin`, se eligiera el colegio que se eligiera.
 *
 * Lo que sustituye al filtro de tenant es el rol: esta función solo devuelve
 * datos al superadmin, y lo comprueba ella misma en vez de fiarse de que la
 * página lo haya hecho antes.
 *
 * ===========================================================================
 * QUÉ SE LEE CON LA SESIÓN Y QUÉ NO
 * ===========================================================================
 * Todo menos la cola de invitaciones. Con la sesión del superadmin llegan
 * `profiles` (0012, `profiles_select_superadmin`), `guardian_students` (0075,
 * `vinculos_select_superadmin`), `students` (0012, `students_select_superadmin`),
 * `student_devices` (0065) y `student_access_links` (0075) — estas dos por el
 * cuarto camino de `app.puede_ver_alumno`. Comprobado contra la base real antes
 * de escribir esto, no supuesto.
 *
 * `guardian_invites` es la única excepción, y está documentada en
 * `invitacionesPendientes()`.
 */
export async function loadFamiliesData(viewer: SessionProfile): Promise<FamiliesData | null> {
  // El rol PRIMERO. Que la página no pinte esta sección para un school_admin no
  // es una garantía: esta función se exporta, y mañana la llama otro sitio.
  if (viewer.role !== "superadmin") return null;

  const supabase = await createClient();

  const { data: tutoresRaw, error: tutoresError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "guardian")
    .order("full_name", { ascending: true })
    .limit(FAMILIAS_LIMITE);

  if (tutoresError !== null) {
    // Ruidoso (R4): devolver la lista vacía en silencio pintaría «todavía no
    // hay familias» encima de un fallo de consulta.
    console.error("[cet] loadFamiliesData profiles", tutoresError.code, tutoresError.message);
    return { familias: [], invitaciones: [], invitacionesDisponibles: false };
  }

  const tutores = (tutoresRaw ?? []) as Record<string, unknown>[];
  const tutorIds = tutores.map((row) => asString(row["id"])).filter(isNonNullString);

  const vinculosRes =
    tutorIds.length === 0
      ? { data: [] as Record<string, unknown>[] }
      : await supabase
          .from("guardian_students")
          .select("guardian_id, student_id")
          .in("guardian_id", tutorIds)
          .is("revoked_at", null);

  const vinculos = (vinculosRes.data ?? []) as Record<string, unknown>[];
  const hijoIds = [
    ...new Set(vinculos.map((row) => asString(row["student_id"])).filter(isNonNullString)),
  ];

  // `expires_at > ahora` se compara contra el reloj de esta aplicación y no
  // contra el de la base. La regla 4 de la cabecera prohíbe eso para DECIDIR
  // PERMISOS; aquí no se decide ninguno, solo se pinta un sí o un no
  // informativo. Un enlace que caduque dentro de un segundo puede salir como
  // vivo, y no rompe nada. Es la misma cuenta que ya hace `listarHijos()`.
  const ahora = new Date().toISOString();

  const [perfilesRes, fichasRes, dispositivosRes, enlacesRes] = await Promise.all(
    hijoIds.length === 0
      ? [
          Promise.resolve({ data: [] }),
          Promise.resolve({ data: [] }),
          Promise.resolve({ data: [] }),
          Promise.resolve({ data: [] }),
        ]
      : [
          supabase.from("profiles").select("id, full_name").in("id", hijoIds),
          supabase
            .from("students")
            .select("profile_id, student_code, year_level, stage")
            .in("profile_id", hijoIds),
          supabase
            .from("student_devices")
            .select("student_id, last_seen_at")
            .in("student_id", hijoIds)
            .is("revoked_at", null),
          supabase
            .from("student_access_links")
            .select("student_id")
            .in("student_id", hijoIds)
            .is("revoked_at", null)
            .gt("expires_at", ahora),
        ],
  );

  const nombrePorId = new Map<string, string>();
  for (const fila of (perfilesRes.data ?? []) as Record<string, unknown>[]) {
    const id = asString(fila["id"]);
    if (id !== null) nombrePorId.set(id, asString(fila["full_name"]) ?? "");
  }

  const fichaPorId = new Map<string, Record<string, unknown>>();
  for (const fila of (fichasRes.data ?? []) as Record<string, unknown>[]) {
    const id = asString(fila["profile_id"]);
    if (id !== null) fichaPorId.set(id, fila);
  }

  const conDispositivo = new Set<string>();
  const ultimoAccesoPorId = new Map<string, string>();
  for (const fila of (dispositivosRes.data ?? []) as Record<string, unknown>[]) {
    const id = asString(fila["student_id"]);
    if (id === null) continue;
    conDispositivo.add(id);
    const visto = asString(fila["last_seen_at"]);
    // El más reciente de todos sus aparatos: un niño con tablet y portátil
    // «accedió por última vez» cuando entró por cualquiera de los dos. Comparar
    // como texto ordena igual que comparar instantes porque PostgREST devuelve
    // siempre `timestamptz` en ISO-8601 y con el mismo desplazamiento.
    if (visto !== null && visto > (ultimoAccesoPorId.get(id) ?? "")) {
      ultimoAccesoPorId.set(id, visto);
    }
  }

  const conEnlaceVivo = new Set(
    ((enlacesRes.data ?? []) as Record<string, unknown>[])
      .map((fila) => asString(fila["student_id"]))
      .filter(isNonNullString),
  );

  const hijosPorTutor = groupBy(
    vinculos
      .map((fila) => ({
        guardianId: asString(fila["guardian_id"]) ?? "",
        studentId: asString(fila["student_id"]) ?? "",
      }))
      .filter((v) => v.guardianId !== "" && v.studentId !== ""),
    (v) => v.guardianId,
  );

  const familias: Familia[] = tutores.map((fila) => {
    const guardianId = asString(fila["id"]) ?? "";
    const hijos: FamiliaHijo[] = (hijosPorTutor.get(guardianId) ?? []).map((vinculo) => {
      const ficha = fichaPorId.get(vinculo.studentId) ?? {};
      return {
        profileId: vinculo.studentId,
        fullName: nombrePorId.get(vinculo.studentId) ?? "",
        studentCode: asString(ficha["student_code"]) ?? "",
        yearLevel: numberOr(ficha["year_level"], 0),
        stage: asString(ficha["stage"]) ?? "",
        hayDispositivo: conDispositivo.has(vinculo.studentId),
        hayEnlaceVivo: conEnlaceVivo.has(vinculo.studentId),
        ultimoAccesoAt: ultimoAccesoPorId.get(vinculo.studentId) ?? null,
      };
    });

    hijos.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return {
      guardianId,
      guardianName: asString(fila["full_name"]) ?? "",
      guardianEmail: asString(fila["email"]),
      hijos,
    };
  });

  const cola = await invitacionesPendientes();

  return {
    familias,
    invitaciones: cola.filas,
    invitacionesDisponibles: cola.disponible,
  };
}

/* ========================================================================== */
/* Utilidades                                                                 */
/* ========================================================================== */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un id que no es un uuid no se manda a PostgREST: devolvería un 400 con el
 * mensaje de error de Postgres, que es información sobre el esquema que un
 * atacante no necesita. Se corta antes.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isNonNullString(value: string | null): value is string {
  return value !== null;
}

function isSubmittedStatus(status: string): boolean {
  return status === "submitted" || status === "grading" || status === "graded";
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket === undefined) map.set(k, [row]);
    else bucket.push(row);
  }
  return map;
}
