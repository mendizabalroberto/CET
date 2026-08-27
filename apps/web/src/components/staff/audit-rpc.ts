/**
 * Llamadas RPC del área de personal, y la escritura en `audit_log`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTO NO VIVE EN `actions.ts`
 * ===========================================================================
 * `actions.ts` lleva `"use server"`: TODO lo que exporta es un endpoint HTTP
 * invocable desde el navegador. Estos dos helpers no deben serlo —uno escribe
 * en el registro forense— y además no se pueden probar por unidad sin
 * convertirlos en endpoints. Viven aquí, en un módulo normal.
 *
 * ===========================================================================
 * EL FALLO QUE ORIGINA ESTE MÓDULO (27/08/2026)
 * ===========================================================================
 * `app.audit()` se llamaba con `.schema("app").rpc(...)`. PostgREST de este
 * proyecto expone ÚNICAMENTE `public` y `graphql_public`, así que devolvía:
 *
 *   HTTP 406 {"code":"PGRST106","message":"Invalid schema: app",
 *             "hint":"Only the following schemas are exposed: public, graphql_public"}
 *
 * El fallback solo se disparaba con `PGRST202`/`42883` ("la función no existe"),
 * nunca con `PGRST106`, y el error acababa en un `console.error`. Resultado:
 * ninguna acción de staff hecha desde la web llegaba a `audit_log`, incluida la
 * revelación de una clave de respuesta que M12 exige registrar.
 *
 * Dos cambios, y el orden importa:
 *
 *   1. Se llama PRIMERO al envoltorio de `public` (migración 0023), que es el
 *      único esquema que PostgREST expone de verdad. El camino por `app` queda
 *      como reserva para un despliegue que sí lo exponga, no como camino
 *      principal. Antes era al revés y el caso normal costaba dos round-trips
 *      de los cuales el primero SIEMPRE fallaba.
 *   2. `PGRST106` cuenta como "aquí no está" y dispara la reserva. Cualquier
 *      otro error —permisos, excepción de la propia función— es REAL y se
 *      propaga tal cual: reintentar un `insufficient_privilege` lo convertiría
 *      en un "no existe", que es un mensaje distinto y engañoso.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RpcError {
  readonly message: string;
  readonly code?: string;
}

export interface RpcOutcome {
  readonly data: unknown;
  readonly error: RpcError | null;
}

/**
 * Los dos nombres de la misma operación: el envoltorio público y la función de
 * `app` que envuelve. Se declaran juntos porque son un par —si alguien renombra
 * uno, el otro está aquí al lado— y porque las dos aceptan LOS MISMOS nombres
 * de parámetro, que es lo que permite pasar un solo objeto de argumentos.
 */
export interface RpcTarget {
  readonly publicFn: string;
  readonly appFn: string;
}

export const AUDIT_RPC: RpcTarget = { publicFn: "audit_staff_action", appFn: "audit" };
export const ANSWER_KEY_RPC: RpcTarget = {
  publicFn: "attempt_item_answer_key",
  appFn: "attempt_item_answer_key",
};

/**
 * El vocabulario del `audit_log` que esta aplicación sabe escribir.
 *
 * ESTA LISTA ES UN CONTRATO CON LA MIGRACIÓN 0023, que valida `p_action` contra
 * la misma lista blanca en la base de datos. Una acción que esté aquí y no allí
 * se rechaza con `22023` en tiempo de ejecución; una que esté allí y no aquí es
 * código muerto. `audit-rpc.parity.test.ts` compara las dos declaraciones: es
 * exactamente el tipo de frontera donde este proyecto ya se ha roto seis veces
 * (VERIFICATION_PLAN R3).
 */
export const AUDIT_ACTIONS = [
  "attempt.answer_key_viewed",
  "attempt.answer_key_denied",
  "attempt.graded_manually",
  "attempt.regraded",
  "student.created",
  "student.unlocked",
  "registration.approved",
  "registration.rejected",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** "La función no está en este esquema", en sus tres formas conocidas. */
const NOT_HERE = new Set([
  "PGRST202", // PostgREST: no está en la caché de esquema (404)
  "42883",    // Postgres: undefined_function
  "PGRST106", // PostgREST: el esquema pedido no está expuesto (406) ← el fallo
]);

function isNotHere(error: RpcError | null): boolean {
  return error !== null && error.code !== undefined && NOT_HERE.has(error.code);
}

/**
 * Ejecuta una RPC probando primero `public` y, si allí no está, `app`.
 *
 * Devuelve SIEMPRE el error del primer camino cuando el segundo tampoco
 * encuentra la función: si el `app` responde `PGRST106` («esquema no
 * expuesto»), ese mensaje no le dice nada a quien lee el log — lo que hay que
 * arreglar es que falta el envoltorio público, y eso es lo que dice `PGRST202`.
 */
export async function appRpc(
  supabase: SupabaseClient,
  target: RpcTarget,
  args: Record<string, unknown>,
): Promise<RpcOutcome> {
  const viaPublic = await supabase.rpc(target.publicFn, args);
  if (viaPublic.error === null) return { data: viaPublic.data, error: null };
  if (!isNotHere(viaPublic.error)) return { data: null, error: viaPublic.error };

  const viaSchema = await supabase.schema("app").rpc(target.appFn, args);
  if (viaSchema.error === null) return { data: viaSchema.data, error: null };
  if (isNotHere(viaSchema.error)) return { data: null, error: viaPublic.error };
  return { data: null, error: viaSchema.error };
}

export interface AuditOutcome {
  readonly ok: boolean;
  readonly error: RpcError | null;
}

/**
 * Escribe en `audit_log` a través de `public.audit_staff_action` (0023).
 *
 * NO recibe ni envía actor, rol ni colegio: los tres los deriva la base de
 * datos de la sesión (`auth.uid()`, `app.current_role()`,
 * `app.current_school_id()`). Un audit_log en el que el cliente dice quién ha
 * sido no prueba nada.
 *
 * No lanza —una acción que YA se ejecutó no debe reportarse como fallida porque
 * el log fallara— pero **devuelve el resultado**, que es el cambio importante:
 * antes se tragaba el error en un `console.error` y quien llamaba no tenía
 * forma de enterarse. Para la revelación de una clave de respuesta, donde el
 * registro es el requisito (M12), quien llama SÍ debe mirar esto y denegar.
 */
export async function auditStaffAction(
  supabase: SupabaseClient,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): Promise<AuditOutcome> {
  const { error } = await appRpc(supabase, AUDIT_RPC, {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_before: before ?? null,
    p_after: after ?? null,
  });

  if (error !== null) {
    // Ruidoso a propósito (R4). El prefijo es literal y greppable en los logs
    // de Vercel: una auditoría que falla es un incidente de cumplimiento, no
    // una advertencia de depuración.
    console.error(
      `[cet] AUDITORIA FALLIDA action=${action} entity=${entityType} id=${entityId ?? "null"} code=${error.code ?? "sin-codigo"}`,
      error.message,
    );
    return { ok: false, error };
  }

  return { ok: true, error: null };
}
