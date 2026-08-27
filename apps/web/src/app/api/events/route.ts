/**
 * POST /api/events — ingesta de telemetría de aprendizaje.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA REGLA QUE DEFINE ESTE FICHERO
 * ===========================================================================
 * `school_id` y `student_id` se derivan de la SESIÓN AUTENTICADA y jamás del
 * cuerpo de la petición.
 *
 * Si se confiara en el cuerpo, cualquier alumno con las herramientas de
 * desarrollo abiertas podría escribir eventos en nombre de otro: falsear las
 * horas de práctica de un compañero, contaminar su mastery, o inyectar eventos
 * en otro colegio. El contrato de `@cet/shared/events` lo dice explícitamente y
 * el esquema `clientEvent` ni siquiera ADMITE esos campos — Zod los descarta al
 * parsear, así que enviarlos no tiene efecto alguno.
 *
 * Defensa en profundidad: el insert se hace con el cliente de SESIÓN (RLS
 * activa), no con service role. Aunque este código tuviera un fallo y llegara a
 * componer una fila con el `student_id` de otro, la política
 * `learning_events_insert_own` la rechazaría en la base de datos.
 *
 * OJO CON ESTE COMENTARIO, QUE FUE MENTIRA DURANTE MESES: la política que citaba
 * (`student_writes_own`) no existía, y `authenticated` ni siquiera tenía el
 * GRANT de INSERT. Cada lote respondía 500 con «permission denied for table
 * learning_events» y la cola del navegador reintentaba en bucle. La telemetría
 * de aprendizaje entera —M11, y con ella el informe para los tutores— llevaba
 * meses sin guardar una sola fila. Lo arregla la migración 0024, y lo vigilan
 * `supabase/tests/telemetry_ingest.sql` y `events-route.test.ts`.
 * ===========================================================================
 */
import { NextResponse } from "next/server";
import { eventBatch } from "@cet/shared";

import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** La ingesta necesita cookies de sesión: nunca se puede cachear ni prerenderizar. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 256 KB: 100 eventos con payloads razonables caben de sobra. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Respuesta uniforme y sin detalles. Un cliente de telemetría no necesita saber
 * por qué se rechazó su lote, y los mensajes detallados son un mapa gratis del
 * modelo de datos.
 */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request): Promise<NextResponse> {
  // --- 1. Cuerpo acotado antes de tocar nada ------------------------------
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const raw = await request.text();
  // `content-length` es una declaración del cliente; la longitud real es la que
  // manda. Sin esta segunda comprobación, un cuerpo sin `content-length`
  // (chunked) pasaría sin límite.
  //
  // Se mide en BYTES, no en `raw.length`: `String.length` cuenta unidades UTF-16,
  // así que un payload lleno de acentos o de emoji ocuparía casi el doble de lo
  // que declara y el límite se quedaría corto justo con el contenido en español.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // --- 2. Validación Zod con el contrato compartido ------------------------
  // `eventBatch` acota a MAX_EVENT_BATCH y `clientEvent` DESCARTA cualquier
  // campo no declarado: `schoolId`/`studentId` enviados a mano se evaporan aquí.
  const parsed = eventBatch.safeParse(parsedJson);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  // --- 3. Identidad: solo desde la sesión ----------------------------------
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse(null, { status: 401 });
  }

  // 60 lotes por minuto y usuario: la cola manda uno cada 5 s, así que sobra
  // margen incluso con varias pestañas abiertas, y se corta un bucle atascado.
  const limited = rateLimit(`events:${user.id}`, 60, 60_000);
  if (!limited.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { "retry-after": String(limited.retryAfterSeconds) },
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("school_id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "active" || !profile.school_id) {
    return new NextResponse(null, { status: 403 });
  }

  // `learning_events` es telemetría DE APRENDIZAJE: `student_id` es not null
  // (DATA_MODEL §7). Un profesor navegando no genera estas filas. Se responde
  // 204 en vez de un error: no es un fallo del cliente, simplemente no hay nada
  // que guardar.
  if (profile.role !== "student") {
    return noContent();
  }

  const schoolId = profile.school_id as string;
  const studentId = user.id;

  // --- 4. Insert masivo ----------------------------------------------------
  // Una sola sentencia para todo el lote. Un insert por evento convertiría
  // treinta niños practicando en cientos de round-trips por minuto.
  const rows = parsed.data.events.map((event) => ({
    school_id: schoolId, // de la sesión
    student_id: studentId, // de la sesión
    session_id: event.sessionId,
    seq: event.seq,
    event_type: event.eventType,
    attempt_id: event.attemptId ?? null,
    attempt_item_id: event.attemptItemId ?? null,
    lesson_id: event.lessonId ?? null,
    question_id: event.questionId ?? null,
    skill_id: event.skillId ?? null,
    payload: event.payload,
    client_ts: event.clientTs, // dato, no verdad
    // `server_ts` lo pone el DEFAULT de la tabla. Enviarlo desde aquí sería
    // volver a confiar en un reloj que no es el de la base de datos.
  }));

  // INSERT PLANO. Aquí hubo un `upsert(..., { onConflict: "session_id,seq" })`
  // y costó toda la telemetría del producto.
  //
  // El razonamiento original era correcto: la cola del cliente reintenta ante un
  // 5xx o un corte de red, y sin idempotencia un reintento duplicaría eventos.
  // El contrato de `modules/analytics/CLAUDE.md` declara `(session_id, seq)`
  // único, así que `onConflict` parecía la herramienta exacta.
  //
  // Lo que ese contrato nunca comprobó es que la constraint EXISTIERA. Y no
  // puede existir: `learning_events` está particionada por rango sobre
  // `server_ts`, y en una tabla particionada todo índice único debe incluir la
  // clave de partición. Un único sobre `(server_ts, session_id, seq)` sí es
  // legal, pero no deduplica nada — el mismo evento reinsertado un segundo
  // después trae otro `server_ts` y entra igual. Sería una constraint que
  // aparenta, que es peor que ninguna.
  //
  // Resultado en producción: Postgres devolvía 42P10, PostgREST lo traducía a
  // 400, este handler respondía 500 y la cola reintentaba EN BUCLE. Una sesión
  // entera de lecciones dejó tres filas en la tabla.
  //
  // Así que la unicidad se trata donde de verdad vive: al LEER. `(session_id,
  // seq)` sigue siendo la clave lógica del evento y el `seq` sigue dando el
  // orden dentro de la sesión; quien agregue horas de estudio o mastery debe
  // deduplicar por ese par. Un duplicado ocasional tras un corte de wifi engorda
  // la tabla y no miente en el informe. Cero filas, sí mienten.
  const { error: insertError } = await supabase.from("learning_events").insert(rows);

  if (insertError) {
    // Con el código: `42501` es permiso o RLS y es un fallo de despliegue que
    // hay que arreglar en la base de datos, no un lote malo del cliente.
    console.error(
      `[events] insert falló code=${insertError.code ?? "sin-codigo"}`,
      insertError.message,
    );
    // 500 para que la cola del cliente reintente con backoff.
    return new NextResponse(null, { status: 500 });
  }

  return noContent();
}

/**
 * Cualquier otro método no existe. Devolver 405 con `Allow` es correcto y no
 * filtra nada: que este endpoint acepta POST ya se sabe.
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
