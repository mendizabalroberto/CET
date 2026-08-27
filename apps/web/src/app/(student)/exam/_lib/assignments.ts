/**
 * Lectura de las asignaciones de examen del alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ NO HAY UNA API PARA ESTO
 * El contrato del motor de servidor cubre el CICLO DE VIDA del intento
 * (`start`, `answer`, `submit`, `result`), que es donde vive la clave de
 * respuesta y por tanto donde hace falta `service_role`. Listar qué exámenes
 * tiene puestos un alumno no toca ningún secreto: son sus propias asignaciones,
 * y RLS ya las filtra por `school_id` y por sección. Un Server Component con el
 * cliente normal es la herramienta correcta y ahorra un salto de red.
 *
 * REGLA DE FALLO: este módulo NUNCA lanza. Si el esquema todavía no está
 * migrado, si una columna se llama distinto o si Postgres se cae, devuelve
 * `{ kind: "error" }` y la página pinta un mensaje comprensible. Un `throw`
 * aquí acabaría en la pantalla de error genérica de Next, que es exactamente lo
 * que un niño de once años no debe ver.
 */
import "server-only";

import type { FeedbackMode, I18nText, Locale } from "@cet/shared";
import { resolveI18n } from "@cet/shared";

import { createClient } from "@/lib/supabase/server";

export type AssignmentStatus =
  /** Abierta y con intentos disponibles. */
  | "available"
  /** Tiene un intento `in_progress`: puede continuar. */
  | "in_progress"
  /** Ya entregado (y sin intentos restantes, o el último ya usado). */
  | "submitted"
  /** `closes_at` ya pasó. */
  | "closed"
  /** `opens_at` todavía no ha llegado. */
  | "not_open";

export interface AssignmentCard {
  readonly id: string;
  readonly title: string;
  readonly durationSeconds: number;
  readonly questionCount: number;
  readonly allowBack: boolean;
  readonly feedbackMode: FeedbackMode;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly maxAttempts: number;
  readonly attemptsUsed: number;
  readonly status: AssignmentStatus;
  /** Intento en curso o último entregado, para enlazar al resultado. */
  readonly latestAttemptId: string | null;
  readonly latestScoreRaw: number | null;
  readonly latestScoreMax: number | null;
}

export type AssignmentsResult =
  | { readonly kind: "ok"; readonly assignments: readonly AssignmentCard[] }
  | { readonly kind: "error" };

const SELECT = `
  id, opens_at, closes_at, max_attempts, time_limit_override_seconds,
  blueprint:exam_blueprints (
    id, title, duration_seconds, allow_back, feedback_mode, max_attempts,
    sections:exam_blueprint_sections ( item_count )
  ),
  attempts:exam_attempts ( id, status, attempt_number, score_raw, score_max, submitted_at )
`;

export async function listAssignments(locale: Locale): Promise<AssignmentsResult> {
  try {
    const supabase = await createClient();
    // Sin filtro por alumno: RLS ya limita `exam_assignments` a las secciones
    // en las que está matriculado, y `exam_attempts` a los suyos. Filtrar aquí
    // por `student_id` sería duplicar la política en la aplicación, que es la
    // forma habitual de que las dos se desincronicen.
    const { data, error } = await supabase.from("exam_assignments").select(SELECT).order("closes_at");

    if (error || !data) return { kind: "error" };
    return {
      kind: "ok",
      assignments: data
        .map((row) => toCard(row as unknown, locale))
        .filter((card): card is AssignmentCard => card !== null),
    };
  } catch {
    return { kind: "error" };
  }
}

export async function getAssignment(id: string, locale: Locale): Promise<AssignmentCard | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("exam_assignments").select(SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return toCard(data as unknown, locale);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * PostgREST devuelve una relación como objeto o como array de un elemento según
 * cómo infiera la cardinalidad. Se acepta lo que llegue.
 */
function one(value: unknown): Row | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null;
  return isRecord(value) ? value : null;
}

function many(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCard(raw: unknown, locale: Locale): AssignmentCard | null {
  if (!isRecord(raw)) return null;
  const id = str(raw["id"]);
  const blueprint = one(raw["blueprint"]);
  if (!id || !blueprint) return null;

  const title = isRecord(blueprint["title"])
    ? resolveI18n(blueprint["title"] as I18nText, locale)
    : (str(blueprint["title"]) ?? "");

  const questionCount = many(blueprint["sections"]).reduce(
    (sum, section) => sum + num(section["item_count"], 0),
    0,
  );

  const override = raw["time_limit_override_seconds"];
  const durationSeconds =
    override === null || override === undefined
      ? num(blueprint["duration_seconds"], 0)
      : num(override, num(blueprint["duration_seconds"], 0));

  // El máximo de la asignación manda sobre el del blueprint: es la decisión que
  // el profesor tomó para ESTA clase.
  const maxAttempts = num(raw["max_attempts"], num(blueprint["max_attempts"], 1));

  const attempts = many(raw["attempts"]);
  const inProgress = attempts.find((a) => a["status"] === "in_progress");
  const finished = attempts.filter((a) => a["status"] !== "in_progress" && a["status"] !== "voided");
  const latestFinished = [...finished].sort(
    (a, b) => num(b["attempt_number"], 0) - num(a["attempt_number"], 0),
  )[0];

  const opensAt = str(raw["opens_at"]);
  const closesAt = str(raw["closes_at"]);
  const now = Date.now();
  const opened = opensAt === null || Date.parse(opensAt) <= now;
  const closed = closesAt !== null && Date.parse(closesAt) <= now;
  const attemptsUsed = finished.length + (inProgress ? 1 : 0);

  // El orden de esta cadena no es casual. Un intento en curso gana a todo: si el
  // examen se está cerrando mientras el alumno lo hace, la tarjeta tiene que
  // seguir dejándole volver a él, no mandarlo a "cerrado" con el examen abierto.
  const status: AssignmentStatus = inProgress
    ? "in_progress"
    : !opened
      ? "not_open"
      : closed
        ? "closed"
        : attemptsUsed >= maxAttempts
          ? "submitted"
          : "available";

  const latest = inProgress ?? latestFinished;

  return {
    id,
    title,
    durationSeconds,
    questionCount,
    allowBack: blueprint["allow_back"] !== false,
    feedbackMode: normalizeMode(blueprint["feedback_mode"]),
    opensAt,
    closesAt,
    maxAttempts,
    attemptsUsed,
    status,
    latestAttemptId: latest ? str(latest["id"]) : null,
    latestScoreRaw: latestFinished ? nullableNum(latestFinished["score_raw"]) : null,
    latestScoreMax: latestFinished ? nullableNum(latestFinished["score_max"]) : null,
  };
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = num(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Desconocido -> `never`. La misma elección segura que en `normalize.ts`. */
function normalizeMode(value: unknown): FeedbackMode {
  return value === "after_submit" || value === "immediate" ? value : "never";
}
