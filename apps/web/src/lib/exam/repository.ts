/**
 * La frontera con Postgres. Todo lo demás de `src/lib/exam/**` es puro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ UN REPOSITORIO Y NO EL CLIENTE DE SUPABASE DIRECTAMENTE
 * ---------------------------------------------------------------------------
 * Porque así la lógica del examen —que es donde viven la reanudación, el
 * deadline y la idempotencia— se prueba con un doble en memoria, sin base de
 * datos y sin HTTP. Un test que necesita levantar Postgres para comprobar que
 * un doble submit no califica dos veces es un test que no se ejecuta.
 *
 * DOS CLIENTES, DOS PAPELES
 * ---------------------------------------------------------------------------
 *  · `session`  — cliente del alumno, RLS ACTIVA. Se usa para UNA cosa: decidir
 *    si el alumno puede ver la asignación. Que lo decida la política y no un
 *    `where` escrito a mano significa que la regla vive en un solo sitio (y
 *    está cubierta por pgTAP).
 *  · `admin`    — service_role, RLS SALTADA. Es la única forma de ESCRIBIR en
 *    las tablas de intento: `0012_rls_policies.sql` no concede INSERT sobre
 *    `exam_attempts`, `attempt_items` ni `attempt_responses` a nadie
 *    (AD-5: "los intentos nacen y mueren en el servidor").
 *    Regla 3 de `admin.ts`: cada consulta filtra por `school_id`/`student_id` a
 *    mano, porque RLS ya no cubre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { dbFailure, ExamError } from "./errors";
import type {
  AssignmentRow,
  AttemptRow,
  BlueprintRow,
  BlueprintSectionRow,
  GradingItemRow,
  GradingRow,
  PoolRow,
  ResponseRow,
  StudentItemRow,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Contrato                                                                   */
/* -------------------------------------------------------------------------- */

export interface NewAttempt {
  readonly assignmentId: string;
  readonly studentId: string;
  readonly schoolId: string;
  readonly attemptNumber: number;
  readonly blueprintSnapshot: unknown;
  readonly seed: number;
  readonly startedAt: string;
  readonly serverDeadlineAt: string;
  readonly userAgent: string | null;
  readonly ipHash: string | null;
}

export interface NewAttemptItem {
  readonly attemptId: string;
  readonly ord: number;
  readonly sectionOrd: number;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly itemSeed: number;
  readonly renderedBody: unknown;
  readonly optionOrder: readonly number[] | null;
  readonly answerKey: unknown;
  readonly skillId: string;
  readonly difficulty: number;
  readonly maxPoints: number;
}

export interface NewResponse {
  readonly attemptId: string;
  readonly attemptItemId: string;
  readonly revision: number;
  readonly response: unknown;
  readonly clientTs: string | null;
  readonly timeOnItemMs: number | null;
  readonly source: "typed" | "selected" | "autosave" | "restored";
}

export interface NewGrading {
  readonly attemptId: string;
  readonly attemptItemId: string;
  readonly pointsAwarded: number;
  readonly maxPoints: number;
  readonly isCorrect: boolean | null;
  readonly partialRatio: number | null;
  readonly rationale: string | null;
  readonly rubricSnapshot: unknown;
}

export interface FinishGradingInput {
  readonly status: "grading" | "graded";
  readonly scoreRaw: number;
  readonly scoreMax: number;
  readonly scorePct: number;
  readonly passed: boolean;
  readonly gradedAt: string | null;
}

/**
 * Se lanza cuando un INSERT choca con una constraint UNIQUE. La lógica de
 * arriba la usa para distinguir "esto es una carrera entre dos pestañas, hay
 * que releer" de "esto es un error de verdad".
 */
export class UniqueViolation extends Error {
  constructor(public readonly constraintHint: string) {
    super(`Violación de unicidad: ${constraintHint}`);
    this.name = "UniqueViolation";
  }
}

export interface ExamRepository {
  /* --- Lectura con RLS (cliente de sesión) -------------------------------- */
  /** `null` si no existe O si el alumno no puede verla. Los dos casos son 404. */
  findAssignmentVisibleToStudent(assignmentId: string): Promise<AssignmentRow | null>;

  /* --- Lectura privilegiada ---------------------------------------------- */
  findBlueprint(blueprintId: string): Promise<BlueprintRow | null>;
  listBlueprintSections(blueprintId: string): Promise<BlueprintSectionRow[]>;
  /** Banco publicado del curso, visible para ese colegio (AD-2: global OR propio). */
  listPool(courseId: string, schoolId: string): Promise<PoolRow[]>;

  findAttempt(attemptId: string): Promise<AttemptRow | null>;
  findInProgressAttempt(assignmentId: string, studentId: string): Promise<AttemptRow | null>;
  /** Intentos consumidos. Los `voided` NO cuentan: anular es devolver la oportunidad. */
  countAttempts(assignmentId: string, studentId: string): Promise<number>;

  listStudentItems(attemptId: string): Promise<StudentItemRow[]>;
  /**
   * `question_versions.format` por id de versión.
   *
   * `attempt_items` NO guarda el formato (DATA_MODEL §6 no lo contempla) y la
   * vista del alumno tampoco lo tiene, pero el cliente lo necesita para elegir
   * el widget de entrada. Se resuelve con una consulta aparte en vez de con un
   * embed: PostgREST no infiere relaciones desde una VISTA de forma fiable.
   */
  formatsForVersions(versionIds: readonly string[]): Promise<Map<string, string>>;
  listItemsForGrading(attemptId: string): Promise<GradingItemRow[]>;
  findAttemptItem(attemptItemId: string): Promise<{ id: string; attempt_id: string; ord: number } | null>;
  listResponses(attemptId: string): Promise<ResponseRow[]>;
  listGradings(attemptId: string): Promise<GradingRow[]>;

  /* --- Escritura ---------------------------------------------------------- */
  insertAttempt(attempt: NewAttempt): Promise<AttemptRow>;
  insertItems(items: readonly NewAttemptItem[]): Promise<void>;
  /** Limpieza tras un fallo de materialización. Un intento sin items no puede sobrevivir. */
  deleteAttempt(attemptId: string): Promise<void>;
  voidAttempt(attemptId: string): Promise<void>;

  maxRevision(attemptItemId: string): Promise<number | null>;
  clearFinalFlag(attemptItemId: string): Promise<void>;
  insertResponse(response: NewResponse): Promise<ResponseRow>;
  markResponseFinal(responseId: string): Promise<void>;
  touchHeartbeat(attemptId: string, at: string): Promise<void>;

  /**
   * UPDATE CONDICIONAL: pasa a `submitted` SOLO si sigue `in_progress`.
   * Devuelve la fila si este proceso ganó la carrera, `null` si otro ya la
   * había cerrado. Es el equivalente sin transacciones del `SELECT … FOR UPDATE`
   * del contrato del módulo, y es lo que hace idempotente el doble submit.
   */
  claimSubmission(attemptId: string, submittedAt: string, submittedBy: "student" | "timer"): Promise<AttemptRow | null>;
  insertGradings(rows: readonly NewGrading[]): Promise<void>;
  finishGrading(attemptId: string, input: FinishGradingInput): Promise<AttemptRow>;
}

/* -------------------------------------------------------------------------- */
/* Implementación sobre Supabase                                              */
/* -------------------------------------------------------------------------- */

const ATTEMPT_COLUMNS =
  "id, assignment_id, student_id, school_id, attempt_number, blueprint_snapshot, seed, status, " +
  "started_at, server_deadline_at, submitted_at, graded_at, submitted_by, score_raw, score_max, score_pct, passed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `23505` = unique_violation en Postgres. Es la carrera, no un error. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

interface PostgrestErrorLike {
  readonly message: string;
  readonly code?: string;
}

function fail(operation: string, error: PostgrestErrorLike): never {
  throw dbFailure(operation, `${error.code ?? "?"} ${error.message}`);
}

export function createSupabaseExamRepository(
  admin: SupabaseClient,
  session: SupabaseClient,
): ExamRepository {
  return {
    async findAssignmentVisibleToStudent(assignmentId) {
      // Cliente de SESIÓN a propósito. `exam_assignments_select_student` exige
      // que el alumno esté en la sección Y que `now() >= opens_at`, evaluado
      // por Postgres. Reimplementar eso aquí sería duplicar una regla de
      // seguridad ya cubierta por pgTAP.
      const { data, error } = await session
        .from("exam_assignments")
        .select(
          "id, blueprint_id, blueprint_version, school_id, section_id, opens_at, closes_at, max_attempts, time_limit_override_seconds",
        )
        .eq("id", assignmentId)
        .maybeSingle();

      if (error) fail("findAssignmentVisibleToStudent", error);
      return (data as AssignmentRow | null) ?? null;
    },

    async findBlueprint(blueprintId) {
      const { data, error } = await admin
        .from("exam_blueprints")
        .select(
          "id, course_id, school_id, title, duration_seconds, shuffle_questions, shuffle_options, allow_back, feedback_mode, pass_threshold, max_attempts, version",
        )
        .eq("id", blueprintId)
        .maybeSingle();

      if (error) fail("findBlueprint", error);
      return (data as BlueprintRow | null) ?? null;
    },

    async listBlueprintSections(blueprintId) {
      const { data, error } = await admin
        .from("exam_blueprint_sections")
        .select("ord, title, item_count, selection, source, points_per_item")
        .eq("blueprint_id", blueprintId)
        .order("ord", { ascending: true });

      if (error) fail("listBlueprintSections", error);
      return (data ?? []) as BlueprintSectionRow[];
    },

    async listPool(courseId, schoolId) {
      // `.or()` compone una CADENA de filtro de PostgREST. Interpolar ahí un
      // valor sin validar es inyección de filtro: una coma o un paréntesis
      // cambiarían la consulta. `schoolId` viene de `profiles.school_id`, que es
      // uuid, así que hoy es seguro — pero la comprobación cuesta cero y el día
      // que alguien llame a esto con otra cosa el fallo será "no se ve" y no
      // "se ve el banco de otro colegio".
      if (!UUID_RE.test(schoolId)) {
        throw new ExamError("internal", "[exam] listPool recibió un school_id que no es uuid");
      }
      // Dos consultas y no un `select` con embed. Entre `questions` y
      // `question_versions` hay DOS claves ajenas (`question_versions.question_id`
      // y `questions.current_version_id`), así que un embed sin pista de
      // constraint es ambiguo y PostgREST lo rechaza. Dos viajes explícitos
      // valen más que una pista frágil al nombre de una constraint.
      const { data: questions, error: qError } = await admin
        .from("questions")
        .select("id, kind, skill_id, current_version_id")
        .eq("course_id", courseId)
        .eq("status", "published")
        .not("current_version_id", "is", null)
        // AD-2: biblioteca global OR contenido propio del colegio.
        .or(`school_id.is.null,school_id.eq.${schoolId}`);

      if (qError) fail("listPool.questions", qError);

      const rows = (questions ?? []) as {
        id: string;
        kind: "static" | "generated";
        skill_id: string;
        current_version_id: string;
      }[];
      if (rows.length === 0) return [];

      const { data: versions, error: vError } = await admin
        .from("question_versions")
        .select("id, format, body, answer_spec, difficulty, max_points, grading_mode, published_at")
        .in(
          "id",
          rows.map((r) => r.current_version_id),
        );

      if (vError) fail("listPool.versions", vError);

      const byId = new Map(
        ((versions ?? []) as {
          id: string;
          format: string;
          body: unknown;
          answer_spec: unknown;
          difficulty: number;
          max_points: number;
          grading_mode: PoolRow["grading_mode"];
          published_at: string | null;
        }[]).map((v) => [v.id, v]),
      );

      const pool: PoolRow[] = [];
      for (const row of rows) {
        const version = byId.get(row.current_version_id);
        // `current_version_id` apuntando a una versión sin publicar es un
        // borrador que se coló: se descarta en vez de meterlo en un examen.
        if (!version || version.published_at === null) continue;
        pool.push({
          question_id: row.id,
          kind: row.kind,
          skill_id: row.skill_id,
          version_id: version.id,
          format: version.format,
          body: version.body,
          answer_spec: version.answer_spec,
          difficulty: version.difficulty,
          max_points: Number(version.max_points),
          grading_mode: version.grading_mode,
        });
      }
      return pool;
    },

    async findAttempt(attemptId) {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_COLUMNS)
        .eq("id", attemptId)
        .maybeSingle();

      if (error) fail("findAttempt", error);
      return (data as AttemptRow | null) ?? null;
    },

    async findInProgressAttempt(assignmentId, studentId) {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_COLUMNS)
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .eq("status", "in_progress")
        // Si por una carrera hubiera dos, gana el más antiguo: es el que ya
        // tiene items materializados y respuestas colgando.
        .order("started_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) fail("findInProgressAttempt", error);
      return (data as AttemptRow | null) ?? null;
    },

    async countAttempts(assignmentId, studentId) {
      const { count, error } = await admin
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .neq("status", "voided");

      if (error) fail("countAttempts", error);
      return count ?? 0;
    },

    async listStudentItems(attemptId) {
      // LA VISTA, no la tabla. `attempt_items_student` no tiene `answer_key` ni
      // `item_seed` — no es que no se pidan, es que no existen ahí. Con
      // service_role la RLS no aplica, así que la vista es la ÚNICA barrera que
      // queda: seleccionar de `attempt_items` "solo las columnas buenas" sería
      // una barrera de una sola línea, y esa línea se edita sin querer.
      const { data, error } = await admin
        .from("attempt_items_student")
        .select(
          "id, attempt_id, ord, section_ord, question_id, question_version_id, rendered_body, option_order, skill_id, difficulty, max_points",
        )
        .eq("attempt_id", attemptId)
        .order("ord", { ascending: true });

      if (error) fail("listStudentItems", error);
      return (data ?? []) as StudentItemRow[];
    },

    async formatsForVersions(versionIds) {
      if (versionIds.length === 0) return new Map();
      const { data, error } = await admin
        .from("question_versions")
        .select("id, format")
        .in("id", [...new Set(versionIds)]);

      if (error) fail("formatsForVersions", error);
      return new Map(
        ((data ?? []) as { id: string; format: string }[]).map((row) => [row.id, row.format]),
      );
    },

    async listItemsForGrading(attemptId) {
      const { data, error } = await admin
        .from("attempt_items")
        .select("id, ord, answer_key, max_points, question_versions(grading_mode)")
        .eq("attempt_id", attemptId)
        .order("ord", { ascending: true });

      if (error) fail("listItemsForGrading", error);

      // Doble aserción vía `unknown`: PostgREST tipa un embed como array aunque
      // la relación sea a-uno, y `select` compuesto con `+` pierde el tipo
      // literal que usa la inferencia de supabase-js. La forma REAL la fija el
      // esquema, no el tipo generado.
      return ((data ?? []) as unknown as {
        id: string;
        ord: number;
        answer_key: unknown;
        max_points: number;
        question_versions: { grading_mode: GradingItemRow["grading_mode"] } | null;
      }[]).map((row) => ({
        id: row.id,
        ord: row.ord,
        answer_key: row.answer_key,
        max_points: Number(row.max_points),
        // Si el embed no viniera, se cae del lado seguro: `auto` corrige, y la
        // clave congelada de tipo `manual` se detecta igualmente en `grade.ts`.
        grading_mode: row.question_versions?.grading_mode ?? "auto",
      }));
    },

    async findAttemptItem(attemptItemId) {
      const { data, error } = await admin
        .from("attempt_items")
        .select("id, attempt_id, ord")
        .eq("id", attemptItemId)
        .maybeSingle();

      if (error) fail("findAttemptItem", error);
      return (data as { id: string; attempt_id: string; ord: number } | null) ?? null;
    },

    async listResponses(attemptId) {
      const { data, error } = await admin
        .from("attempt_responses")
        .select("id, attempt_item_id, revision, response, is_final, server_ts")
        .eq("attempt_id", attemptId)
        .order("revision", { ascending: true });

      if (error) fail("listResponses", error);
      return (data ?? []) as ResponseRow[];
    },

    async listGradings(attemptId) {
      const { data, error } = await admin
        .from("attempt_gradings")
        .select("attempt_item_id, points_awarded, max_points, is_correct, partial_ratio, rationale, graded_by")
        .eq("attempt_id", attemptId)
        // La nota VIGENTE es la que nadie ha sustituido (M10 §3).
        .is("supersedes_id", null);

      if (error) fail("listGradings", error);
      return ((data ?? []) as GradingRow[]).map((row) => ({
        ...row,
        points_awarded: Number(row.points_awarded),
        max_points: Number(row.max_points),
        partial_ratio: row.partial_ratio === null ? null : Number(row.partial_ratio),
      }));
    },

    async insertAttempt(attempt) {
      const { data, error } = await admin
        .from("exam_attempts")
        .insert({
          assignment_id: attempt.assignmentId,
          student_id: attempt.studentId,
          // El trigger `exam_attempts_sync_school` lo IMPONE desde `students`;
          // se envía igualmente para que la fila sea coherente aunque el
          // trigger desapareciera.
          school_id: attempt.schoolId,
          attempt_number: attempt.attemptNumber,
          blueprint_snapshot: attempt.blueprintSnapshot,
          seed: attempt.seed,
          status: "in_progress",
          started_at: attempt.startedAt,
          server_deadline_at: attempt.serverDeadlineAt,
          user_agent: attempt.userAgent,
          ip_hash: attempt.ipHash,
          last_heartbeat_at: attempt.startedAt,
        })
        .select(ATTEMPT_COLUMNS)
        .single();

      if (error) {
        if (isUniqueViolation(error)) throw new UniqueViolation("exam_attempts_uniq");
        fail("insertAttempt", error);
      }
      if (!data) throw dbFailure("insertAttempt", "el insert no devolvió fila");
      return data as unknown as AttemptRow;
    },

    async insertItems(items) {
      if (items.length === 0) {
        throw new ExamError("internal", "[exam] insertItems recibió una lista vacía");
      }
      // UN solo insert para los N items: es lo que hace que "el intento entero
      // se escribe al arrancar" sea una operación y no N oportunidades de
      // quedarse a medias.
      const { error } = await admin.from("attempt_items").insert(
        items.map((item) => ({
          attempt_id: item.attemptId,
          ord: item.ord,
          section_ord: item.sectionOrd,
          question_id: item.questionId,
          question_version_id: item.questionVersionId,
          item_seed: item.itemSeed,
          rendered_body: item.renderedBody,
          option_order: item.optionOrder === null ? null : [...item.optionOrder],
          answer_key: item.answerKey,
          skill_id: item.skillId,
          difficulty: item.difficulty,
          max_points: item.maxPoints,
        })),
      );

      if (error) {
        if (isUniqueViolation(error)) throw new UniqueViolation("attempt_items_ord_uniq");
        fail("insertItems", error);
      }
    },

    async deleteAttempt(attemptId) {
      const { error } = await admin.from("exam_attempts").delete().eq("id", attemptId);
      if (error) fail("deleteAttempt", error);
    },

    async voidAttempt(attemptId) {
      const { error } = await admin
        .from("exam_attempts")
        .update({ status: "voided" })
        .eq("id", attemptId);
      if (error) fail("voidAttempt", error);
    },

    async maxRevision(attemptItemId) {
      const { data, error } = await admin
        .from("attempt_responses")
        .select("revision")
        .eq("attempt_item_id", attemptItemId)
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) fail("maxRevision", error);
      const row = data as { revision: number } | null;
      return row ? row.revision : null;
    },

    async clearFinalFlag(attemptItemId) {
      // El trigger `attempt_responses_guard_update` deja pasar este UPDATE y
      // SOLO este: `is_final` es la única columna que puede cambiar tras el
      // insert. La tabla sigue siendo append-only para todo lo demás.
      const { error } = await admin
        .from("attempt_responses")
        .update({ is_final: false })
        .eq("attempt_item_id", attemptItemId)
        .eq("is_final", true);

      if (error) fail("clearFinalFlag", error);
    },

    async insertResponse(response) {
      const { data, error } = await admin
        .from("attempt_responses")
        .insert({
          attempt_id: response.attemptId,
          attempt_item_id: response.attemptItemId,
          revision: response.revision,
          response: response.response,
          is_final: true,
          client_ts: response.clientTs,
          time_on_item_ms: response.timeOnItemMs,
          source: response.source,
          // `server_ts` lo pone el DEFAULT de la tabla: es la hora de Postgres,
          // que es la única que no depende de quién envíe la petición.
        })
        .select("id, attempt_item_id, revision, response, is_final, server_ts")
        .single();

      if (error) {
        if (isUniqueViolation(error)) throw new UniqueViolation("attempt_responses_revision_uniq");
        fail("insertResponse", error);
      }
      if (!data) throw dbFailure("insertResponse", "el insert no devolvió fila");
      return data as ResponseRow;
    },

    async markResponseFinal(responseId) {
      const { error } = await admin
        .from("attempt_responses")
        .update({ is_final: true })
        .eq("id", responseId);

      if (error) {
        if (isUniqueViolation(error)) throw new UniqueViolation("attempt_responses_final_uniq");
        fail("markResponseFinal", error);
      }
    },

    async touchHeartbeat(attemptId, at) {
      const { error } = await admin
        .from("exam_attempts")
        .update({ last_heartbeat_at: at })
        .eq("id", attemptId);
      if (error) fail("touchHeartbeat", error);
    },

    async claimSubmission(attemptId, submittedAt, submittedBy) {
      const { data, error } = await admin
        .from("exam_attempts")
        .update({ status: "submitted", submitted_at: submittedAt, submitted_by: submittedBy })
        .eq("id", attemptId)
        // ESTA condición es toda la idempotencia. Postgres ejecuta el UPDATE
        // bajo un lock de fila: de dos peticiones simultáneas, la segunda ve la
        // fila ya en `submitted` y no casa. Cero filas devueltas = perdí la
        // carrera = leo el resultado que escribió el otro.
        .eq("status", "in_progress")
        .select(ATTEMPT_COLUMNS)
        .maybeSingle();

      if (error) fail("claimSubmission", error);
      return (data as AttemptRow | null) ?? null;
    },

    async insertGradings(rows) {
      if (rows.length === 0) return;
      const { error } = await admin.from("attempt_gradings").insert(
        rows.map((row) => ({
          attempt_id: row.attemptId,
          attempt_item_id: row.attemptItemId,
          points_awarded: row.pointsAwarded,
          max_points: row.maxPoints,
          is_correct: row.isCorrect,
          partial_ratio: row.partialRatio,
          graded_by: "auto" as const,
          rationale: row.rationale,
          rubric_snapshot: row.rubricSnapshot,
        })),
      );

      if (error) {
        // El índice parcial `attempt_gradings_current_uniq` impide dos notas
        // vigentes para el mismo item. Si salta, es que otro proceso ya
        // corrigió: se relee, no se insiste.
        if (isUniqueViolation(error)) throw new UniqueViolation("attempt_gradings_current_uniq");
        fail("insertGradings", error);
      }
    },

    async finishGrading(attemptId, input) {
      const { data, error } = await admin
        .from("exam_attempts")
        .update({
          status: input.status,
          score_raw: input.scoreRaw,
          score_max: input.scoreMax,
          score_pct: input.scorePct,
          passed: input.passed,
          graded_at: input.gradedAt,
        })
        .eq("id", attemptId)
        .select(ATTEMPT_COLUMNS)
        .single();

      if (error) fail("finishGrading", error);
      if (!data) throw dbFailure("finishGrading", "el update no devolvió fila");
      return data as unknown as AttemptRow;
    },
  };
}
