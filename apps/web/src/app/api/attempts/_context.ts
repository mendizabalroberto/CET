/**
 * Contexto común de las cuatro rutas del motor de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este fichero NO es una ruta: en el App Router solo `route.ts` define un
 * endpoint. Vive aquí, y no en `src/lib/exam/`, por una razón concreta: es el
 * único sitio del módulo que importa `createAdminClient`, y la regla de ESLint
 * del repositorio restringe esa importación a `src/app/api/**`. Mantener la
 * escalada de privilegios en la capa de entrada —y no enterrada en la lógica—
 * es exactamente lo que pide `admin.ts`.
 *
 * ===========================================================================
 * LA REGLA
 * ===========================================================================
 * `studentId` y `schoolId` salen de `getSessionState()`, que lee `profiles` con
 * RLS ACTIVA. No de un claim del JWT (que puede ir un ciclo de refresco por
 * detrás: un alumno suspendido hace un minuto seguiría teniendo su rol en el
 * token) y desde luego no del cuerpo de la petición.
 */
import "server-only";

import { createHash } from "node:crypto";

import { getSessionState } from "@/lib/auth/session";
import {
  createSupabaseEventEmitter,
  createSupabaseExamRepository,
  ExamError,
  type ExamEventEmitter,
  type ExamRepository,
} from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface ExamContext {
  readonly studentId: string;
  readonly schoolId: string;
  readonly locale: "es" | "en";
  readonly repo: ExamRepository;
  readonly events: ExamEventEmitter;
}

/**
 * Motivo de la escalada, exigido por `createAdminClient`.
 *
 * Por qué RLS no basta, en una frase: `0012_rls_policies.sql` NO concede INSERT
 * sobre `exam_attempts`, `attempt_items` ni `attempt_responses` a nadie
 * (AD-5, "los intentos nacen y mueren en el servidor"), y la corrección tiene
 * que leer `attempt_items.answer_key`, cuyo GRANT está retirado a
 * `authenticated` por columna en `0013_grants.sql`.
 */
const ADMIN_REASON =
  "Motor de examen autoritativo (M09): el alumno no tiene INSERT en las tablas de intento y la corrección necesita answer_key, revocada por columna a authenticated.";

export async function requireStudentContext(): Promise<ExamContext> {
  const state = await getSessionState();

  if (state.kind === "anonymous") {
    throw new ExamError("unauthenticated", "No hay sesión válida");
  }
  if (state.kind === "stale") {
    // Cookie viva, perfil `pending`/`suspended`/inexistente. En una API se
    // responde 401 y no se redirige: el cliente del examen espera JSON, y una
    // redirección a `/logout` le llegaría como HTML.
    throw new ExamError("unauthenticated", "La sesión ya no es utilizable");
  }

  const profile = state.profile;
  if (profile.role !== "student" || !profile.schoolId) {
    // Un profesor no "hace" un examen. 403 y no 404: la ruta no es un secreto,
    // simplemente no es para él.
    throw new ExamError("forbidden", "Solo un alumno puede operar sobre un intento");
  }

  const admin = createAdminClient(ADMIN_REASON);
  const session = await createClient();

  return {
    studentId: profile.id,
    schoolId: profile.schoolId,
    locale: profile.locale === "es" ? "es" : "en",
    repo: createSupabaseExamRepository(admin, session),
    events: createSupabaseEventEmitter(admin),
  };
}

/**
 * `sha256(ip + sal)` — DATA_MODEL §6. Nunca la IP en claro: son datos de
 * menores y el CHECK `exam_attempts_ip_hash_sha256` exige 64 hex.
 *
 * Sin sal configurada devuelve `null` y NO guarda nada. Un sha256 de una IPv4
 * sin sal se revierte con una tabla de 4.000 millones de entradas, que hoy se
 * calcula en minutos: sería guardar la IP con un disfraz.
 */
export function hashIp(headers: Headers): string | null {
  const salt = process.env.CET_IP_HASH_SALT;
  if (!salt || salt.length < 16) return null;

  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip");
  if (!ip) return null;

  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

/** `user_agent` acotado: la columna es `text`, pero no hace falta guardar 8 KB. */
export function readUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  return ua ? ua.slice(0, 512) : null;
}

/** El `attemptId` de la URL tiene que ser un uuid antes de tocar la base de datos. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string): string {
  if (!UUID_RE.test(value)) {
    // 404 y no 400: un id con forma rara y un id que no existe son, para quien
    // pregunta desde fuera, la misma cosa.
    throw new ExamError("not_found", "Identificador de intento inválido");
  }
  return value;
}
