/**
 * Traducción ExamError -> HTTP. Es la única frontera donde el módulo habla JSON.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * QUÉ SALE Y QUÉ NO
 * ---------------------------------------------------------------------------
 * Sale: `{ error: <código estable>, ...detalles públicos }`.
 * No sale: el `message` del error. Esos mensajes citan tablas, constraints e
 * ids internos — son para el log del servidor, no para el navegador de un
 * alumno que está probando qué responde la API.
 *
 * El código es un identificador, no una frase: la UI lo traduce con
 * `dictionaries/exam-api.{en,es}.ts` para poder decírselo a un niño de 11 años
 * en su idioma.
 */
import { NextResponse } from "next/server";

import { ExamError, isExamError } from "./errors";

/** Cuerpo máximo aceptado. Ningún cuerpo legítimo de este módulo se acerca. */
export const MAX_BODY_BYTES = 64 * 1024;

export function jsonOk<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload as Record<string, unknown>, {
    status,
    // Un examen jamás se cachea: ni en el navegador, ni en el CDN, ni en un
    // proxy del colegio. Una respuesta cacheada es el examen del compañero.
    headers: { "cache-control": "no-store, private" },
  });
}

export function jsonError(error: ExamError): NextResponse {
  if (error.httpStatus >= 500) {
    console.error(`[exam] ${error.code}: ${error.message}`);
  }
  return NextResponse.json(
    { error: error.code, ...error.publicDetails },
    { status: error.httpStatus, headers: { "cache-control": "no-store, private" } },
  );
}

/**
 * Convierte CUALQUIER excepción en una respuesta.
 *
 * Lo que no sea `ExamError` es un fallo no previsto: se registra entero en el
 * servidor y al cliente le llega un 500 pelado. Dejar escapar el mensaje de un
 * error desconocido es como se filtran las cadenas de conexión.
 */
export function toResponse(cause: unknown): NextResponse {
  if (isExamError(cause)) return jsonError(cause);
  console.error("[exam] excepción no controlada", cause);
  return jsonError(new ExamError("internal", String(cause)));
}

/** Lee y acota el cuerpo. Devuelve el JSON crudo, sin validar el esquema. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    throw new ExamError("invalid_request", "Cuerpo demasiado grande (content-length)");
  }
  const raw = await request.text();
  // `content-length` es una declaración del cliente; con `transfer-encoding:
  // chunked` ni siquiera existe. La longitud real en BYTES es la que manda —
  // en bytes y no en `String.length`, que cuenta unidades UTF-16 y se queda
  // corta justo con el contenido en español.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new ExamError("invalid_request", "Cuerpo demasiado grande");
  }
  if (raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ExamError("invalid_request", "El cuerpo no es JSON válido");
  }
}

export function methodNotAllowed(allow: string): NextResponse {
  return new NextResponse(null, { status: 405, headers: { allow } });
}
