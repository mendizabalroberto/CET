/**
 * Cliente HTTP del motor de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Traduce la respuesta del servidor a `ApiErrorKind`, que es lo único que la UI
 * mira. La UI nunca ve un código HTTP ni un mensaje del servidor: un niño de
 * once años no debe leer "Internal Server Error", y el `message` del motor cita
 * tablas y constraints — por eso el servidor tampoco lo manda.
 *
 * POR QUÉ EL CÓDIGO Y NO EL ESTADO HTTP
 * `src/lib/exam/errors.ts` mapea NUEVE situaciones distintas a 409: ventana sin
 * abrir, ventana cerrada, intentos agotados, deadline vencido, intento ya
 * entregado, resultado aún no disponible, banco insuficiente, blueprint
 * inválido y materialización en curso. Adivinar cuál es a partir del número
 * daría el mensaje equivocado la mitad de las veces — y "ya has entregado"
 * cuando en realidad es "no hay preguntas suficientes" manda al alumno a una
 * pantalla de resultado que no existe. Así que se lee el campo `error` del
 * cuerpo, que es un identificador estable por contrato.
 *
 * `fetch` que lanza es siempre `offline`: en ese caso el servidor no ha visto
 * la petición, así que reintentarla es seguro.
 *
 * TODA PETICIÓN LLEVA PLAZO
 * Antes no lo llevaba, y con la red del colegio *colgada* —conexión aceptada,
 * respuesta que no llega nunca— el `fetch` esperaba indefinidamente: la cola de
 * autoguardado se bloqueaba entera y la entrega dejaba al alumno con los tres
 * botones muertos y el cronómetro corriendo. Los plazos y su porqué viven en
 * `@/lib/net/plazo`, que es el único módulo que llama a `fetch`.
 *
 * `timeout` es un `kind` propio y NO un `offline`: cuando vence el plazo la
 * petición pudo llegar al servidor. Decirle al alumno «no llegamos a internet»
 * sería inventarse un diagnóstico que no tenemos.
 */
import type { StudentResponse } from "@cet/shared";

import {
  fetchConPlazo,
  PlazoAgotadoError,
  type RespuestaConPlazo,
  PLAZO_ARRANCAR_MS,
  PLAZO_ENTREGAR_MS,
  PLAZO_GUARDAR_MS,
  PLAZO_RESULTADO_MS,
} from "@/lib/net/plazo";

import { normalizeResult, normalizeStartResponse } from "./normalize";
import {
  ApiError,
  ERROR_CODE_TO_KIND,
  type AnswerAccepted,
  type AttemptResult,
  type StartAttemptResponse,
  type SubmitReason,
} from "./types";

const JSON_HEADERS = { "content-type": "application/json" } as const;

/** Clock que el servidor adjunta a `/start` y a `/answer`. Resincroniza el reloj. */
export interface ServerClock {
  readonly serverNow: string;
  readonly serverDeadlineAt: string;
}

async function request(
  url: string,
  body: unknown,
  method: "GET" | "POST",
  plazoMs: number,
  signal?: AbortSignal | undefined,
): Promise<unknown> {
  // `exactOptionalPropertyTypes` está activo: `body: undefined` NO es lo mismo
  // que no pasar `body`. Se compone el init por partes.
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    cache: "no-store",
    // `keepalive` es lo que hace que un autoguardado disparado al ocultarse la
    // pestaña llegue igualmente al servidor: un `fetch` normal se cancela con la
    // pestaña, y se perderían justo las respuestas del final del examen. El
    // límite de 64 KB de keepalive sobra para un cuerpo de este módulo.
    ...(method === "POST"
      ? { headers: JSON_HEADERS, body: JSON.stringify(body), keepalive: true }
      : {}),
    ...(signal ? { signal } : {}),
  };

  let respuesta: RespuestaConPlazo;
  try {
    respuesta = await fetchConPlazo(url, init, plazoMs);
  } catch (cause) {
    // Se agotó NUESTRO plazo. No es lo mismo que «sin red»: la petición pudo
    // salir y estar procesándose. La cola lo reintenta igual —el servidor es
    // idempotente— pero la pantalla no dirá que no hay internet.
    if (cause instanceof PlazoAgotadoError) {
      throw new ApiError("timeout", 0, cause.message);
    }
    throw new ApiError("offline", 0, cause instanceof Error ? cause.message : "network");
  }

  // El cuerpo ya viene leído bajo el mismo plazo que las cabeceras: aquí no
  // queda ninguna espera sin acotar.
  if (respuesta.ok) return respuesta.cuerpo;

  const payload = respuesta.cuerpo;
  const code = readErrorCode(payload);
  const kind =
    code !== null
      ? (ERROR_CODE_TO_KIND[code] ?? "server")
      : respuesta.status === 401 || respuesta.status === 403
        ? "unauthorized"
        : respuesta.status === 404
          ? "not_found"
          : respuesta.status === 429
            ? "rate_limited"
            : "server";

  throw new ApiError(kind, respuesta.status, code ?? `HTTP ${respuesta.status}`, code, payload);
}

function readErrorCode(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const code = (payload as { error?: unknown }).error;
  return typeof code === "string" && code.length > 0 ? code : null;
}

/**
 * Arranca (o RECUPERA) el intento. Esta llamada es lo que pone en marcha el
 * cronómetro del servidor: no se hace al cargar la antesala, solo cuando el
 * alumno pulsa el botón.
 *
 * Es idempotente por contrato: si ya hay un intento `in_progress`, el servidor
 * devuelve ESE (`resumed: true`, HTTP 200 en vez de 201). Por eso la misma
 * función sirve para empezar y para recuperar tras una recarga, y por eso dos
 * pestañas no producen dos exámenes.
 *
 * `attempt_starting` (otra petición está materializando el mismo intento) se
 * reintenta sola una vez: es una carrera de milisegundos entre dos recargas
 * rápidas, y hacer que el alumno pulse otra vez por eso sería absurdo.
 */
export async function startAttempt(
  assignmentId: string,
  options: { signal?: AbortSignal | undefined; retryOnStarting?: boolean | undefined } = {},
): Promise<StartAttemptResponse> {
  try {
    const raw = await request(
      "/api/attempts/start",
      { assignmentId },
      "POST",
      PLAZO_ARRANCAR_MS,
      options.signal,
    );
    const parsed = normalizeStartResponse(raw);
    if (!parsed) throw new ApiError("server", 200, "respuesta de /start ilegible");
    return parsed;
  } catch (error) {
    const retryable =
      error instanceof ApiError && error.code === "attempt_starting" && options.retryOnStarting !== false;
    if (!retryable) throw error;
    await delay(700);
    return startAttempt(assignmentId, { ...options, retryOnStarting: false });
  }
}

export async function saveAnswer(
  attemptId: string,
  input: {
    readonly attemptItemId: string;
    readonly response: StudentResponse;
    readonly clientTs: string;
    readonly timeOnItemMs: number;
  },
  options: { signal?: AbortSignal | undefined } = {},
): Promise<AnswerAccepted & { readonly clock: ServerClock | null }> {
  const raw = await request(
    `/api/attempts/${encodeURIComponent(attemptId)}/answer`,
    input,
    "POST",
    PLAZO_GUARDAR_MS,
    options.signal,
  );

  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const revision = typeof record["revision"] === "number" ? record["revision"] : 0;

  // Cada autoguardado trae el reloj del servidor. Es el "heartbeat" del que
  // habla el contrato del módulo: resincronizar aquí es gratis y corrige
  // cualquier deriva del temporizador a lo largo de 25 minutos.
  const serverNow = record["serverNow"];
  const serverDeadlineAt = record["serverDeadlineAt"];
  const clock =
    typeof serverNow === "string" && typeof serverDeadlineAt === "string"
      ? { serverNow, serverDeadlineAt }
      : null;

  return { ok: true, revision, clock };
}

/**
 * Entrega.
 *
 * `reason` viaja como cortesía informativa y NADA MÁS: el servidor lo descarta
 * y decide él mismo `submitted_by` comparando el deadline contra su propio
 * reloj. Es lo correcto — si lo eligiera el cliente, cualquiera podría marcar
 * su entrega en blanco como "me pilló el tiempo".
 *
 * Idempotente: una segunda entrega devuelve `attempt_not_in_progress`, que aquí
 * se traduce a `already_submitted` y NO es un error que enseñar.
 */
export async function submitAttempt(
  attemptId: string,
  reason: SubmitReason,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<AttemptResult> {
  const raw = await request(
    `/api/attempts/${encodeURIComponent(attemptId)}/submit`,
    { reason },
    "POST",
    PLAZO_ENTREGAR_MS,
    options.signal,
  );
  const parsed = normalizeResult(raw);
  if (!parsed) throw new ApiError("server", 200, "respuesta de /submit ilegible");
  return parsed;
}

export async function fetchResult(
  attemptId: string,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<AttemptResult> {
  const raw = await request(
    `/api/attempts/${encodeURIComponent(attemptId)}/result`,
    undefined,
    "GET",
    PLAZO_RESULTADO_MS,
    options.signal,
  );
  const parsed = normalizeResult(raw);
  if (!parsed) throw new ApiError("server", 200, "respuesta de /result ilegible");
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
