/**
 * POST /api/telegram/webhook — donde Telegram entrega el `/start` del tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA REGLA QUE DEFINE ESTE FICHERO
 * ===========================================================================
 * Esta ruta es PUBLICA: Telegram la llama desde sus servidores y no hay sesión
 * ninguna. Lo único que separa una actualización legítima de una inventada es
 * la cabecera `X-Telegram-Bot-Api-Secret-Token`.
 *
 * Sin comprobarla, cualquiera que descubra la URL puede enviar un cuerpo con el
 * token de vinculación de un padre y SU PROPIO `chat_id`, y quedarse recibiendo
 * las notificaciones sobre el hijo de otro. No es una comprobación de higiene:
 * es la única que hay en esta puerta.
 *
 * Y la ausencia del secreto se trata como FALLO, nunca como «entonces no hace
 * falta comprobar». Una variable de entorno que alguien olvida configurar no
 * puede convertir la puerta en abierta — es exactamente así como se abren.
 *
 * ===========================================================================
 * POR QUE SIEMPRE SE RESPONDE 200
 * ===========================================================================
 * Telegram REINTENTA lo que no recibe un 2xx, y sigue reintentando durante
 * horas. Un 401 a una actualización basura la convertiría en una actualización
 * basura que vuelve cada pocos segundos. Se acusa recibo siempre y se decide
 * dentro qué se hace; lo que no se acepta, simplemente no cambia nada.
 *
 * La excepción es el secreto: ahí sí importa no decir nada útil, así que
 * también devuelve 200 con cuerpo vacío. Quien sondee la URL no distingue
 * «secreto incorrecto» de «token de vinculación inexistente», que es lo que
 * hace inútil sondearla.
 */
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tutor/tokens";
import {
  enviarMensaje,
  igualEnTiempoConstante,
  secretoDelWebhook,
} from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 32 KB: una actualización de Telegram con un mensaje de texto cabe de sobra. */
const MAX_BODY_BYTES = 32 * 1024;

/** Acuse de recibo. Vacío a propósito: no hay nada que contarle a quien llama. */
function ok(): NextResponse {
  return new NextResponse(null, { status: 200 });
}

/** El `/start <token>` y nada más. Cualquier otro texto no vincula nada. */
function tokenDeArranque(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio.startsWith("/start")) return null;
  const resto = limpio.slice("/start".length).trim();
  // El token es lo que genera `generarToken()`: 32 bytes en base64url, o sea 43
  // caracteres exactos del alfabeto url-safe. Acotarlo aquí evita que una
  // cadena larguísima llegue hasta la base como parámetro de una consulta.
  return /^[A-Za-z0-9_-]{43}$/.test(resto) ? resto : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  // --- 1. El secreto, antes que nada -------------------------------------
  const esperado = secretoDelWebhook();
  const presentado = request.headers.get("x-telegram-bot-api-secret-token");

  if (esperado === null) {
    console.error("[telegram] webhook sin TELEGRAM_WEBHOOK_SECRET: se rechaza todo");
    return ok();
  }
  if (presentado === null || !igualEnTiempoConstante(presentado, esperado)) {
    console.error("[telegram] webhook con secreto incorrecto");
    return ok();
  }

  // --- 2. Cuerpo acotado --------------------------------------------------
  const crudo = await request.text();
  if (Buffer.byteLength(crudo, "utf8") > MAX_BODY_BYTES) return ok();

  let actualizacion: unknown;
  try {
    actualizacion = JSON.parse(crudo);
  } catch {
    return ok();
  }

  const mensaje = (actualizacion as { message?: Record<string, unknown> } | null)?.message;
  const chat = mensaje?.["chat"] as { id?: unknown } | undefined;
  const texto = mensaje?.["text"];
  const chatId = typeof chat?.id === "number" ? chat.id : null;

  if (chatId === null || typeof texto !== "string") return ok();

  const token = tokenDeArranque(texto);
  if (token === null) {
    // Un `/start` pelado, o cualquier otra cosa que el tutor escriba. Se le
    // contesta para que no se quede mirando un chat mudo, pero no se vincula
    // nada: sin token no se sabe de quién es este chat.
    await enviarMensaje(
      chatId,
      "Para recibir avisos, entra en tu perfil de Cambridge Exam Trainer y pulsa «Habilitar notificaciones». Ese enlace es el que me dice quién eres.",
    );
    return ok();
  }

  // --- 3. Resolver a quién pertenece el token -----------------------------
  // `service_role`: `telegram_de_tutor` no concede escritura a nadie con
  // sesión, y aquí no hay sesión ninguna que conceder.
  const admin = createAdminClient(
    "Webhook de Telegram: no hay sesión, y telegram_de_tutor solo la escribe service_role",
  );

  const { data: fila, error } = await admin
    .from("telegram_de_tutor")
    .select("guardian_id, token_expira_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) {
    console.error("[telegram] webhook select", error.code, error.message);
    return ok();
  }

  const guardianId = fila?.["guardian_id"] as string | undefined;
  const expira = fila?.["token_expira_at"] as string | null | undefined;

  // Token inexistente o caducado: se responde lo MISMO en los dos casos. Una
  // respuesta distinta convertiría el bot en un oráculo de tokens válidos.
  if (guardianId === undefined || expira == null || new Date(expira) <= new Date()) {
    await enviarMensaje(
      chatId,
      "Ese enlace ya no vale. Genera uno nuevo desde tu perfil y vuelve a pulsarlo.",
    );
    return ok();
  }

  // --- 4. Vincular, y quemar el token -------------------------------------
  // El token se borra en el mismo `update`: es de un solo uso, igual que el
  // enlace de acceso de un alumno. Si se dejara, quien lo hubiera visto podría
  // reapuntar el aviso a otro chat más tarde.
  const { error: errorVinculo } = await admin
    .from("telegram_de_tutor")
    .update({
      chat_id: chatId,
      token_hash: null,
      token_expira_at: null,
      vinculado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("guardian_id", guardianId);

  if (errorVinculo) {
    // 23505 es el único esperable: ese `chat_id` ya está vinculado a OTRO
    // tutor. No se reasigna en silencio — sería mover los avisos del hijo de
    // una familia al Telegram de otra.
    console.error("[telegram] webhook vincular", errorVinculo.code, errorVinculo.message);
    await enviarMensaje(
      chatId,
      errorVinculo.code === "23505"
        ? "Esta cuenta de Telegram ya está conectada a otro perfil. Desconéctala allí primero."
        : "No he podido conectarte. Inténtalo otra vez en unos minutos.",
    );
    return ok();
  }

  await enviarMensaje(
    chatId,
    "Listo. Te avisaré por aquí del progreso de tus hijos. Puedes desconectarme cuando quieras desde tu perfil.",
  );

  return ok();
}

/**
 * Telegram solo hace POST. Un GET aquí es alguien mirando, y lo único que
 * merece es un 405 que no cuenta nada.
 */
export function GET(): NextResponse {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
