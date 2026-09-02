import "server-only";

/**
 * La frontera con Telegram.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EL VINCULO VA AL REVES DE LO QUE PARECE
 * ===========================================================================
 * La forma obvia —«pon aquí tu @usuario de Telegram»— NO FUNCIONA, y conviene
 * que quede escrito para que nadie la vuelva a intentar: un bot de Telegram no
 * puede iniciar una conversación. Solo puede responder a quien le haya escrito
 * antes. Guardar `@fulanita` no sirve de nada porque no hay forma de mandarle
 * un mensaje, y además pedirle su usuario a un padre es pedirle un dato
 * personal a cambio de nada.
 *
 * Lo único que funciona es al revés: el tutor pulsa `https://t.me/<bot>?start=
 * <token>`, Telegram abre el chat, él pulsa «Empezar», y el bot recibe
 * `/start <token>` JUNTO CON su `chat_id`. Ese identificador es lo único que
 * hay que guardar y lo único con lo que se le puede escribir después. El tutor
 * no teclea nada.
 *
 * ===========================================================================
 * LOS DOS SECRETOS, Y QUE PROTEGE CADA UNO
 * ===========================================================================
 * `TELEGRAM_TOKEN` es la contraseña del bot: quien lo tenga lee todo lo que el
 * bot recibe y escribe en su nombre. Solo se usa aquí, en el servidor.
 *
 * `TELEGRAM_WEBHOOK_SECRET` viaja de vuelta en cada actualización, en la
 * cabecera `X-Telegram-Bot-Api-Secret-Token`. Sin comprobarla, cualquiera que
 * descubra la URL del webhook puede enviar una actualización falsa con el token
 * de vinculación de un padre y su propio `chat_id`, y quedarse recibiendo las
 * notificaciones sobre un menor ajeno. No es una comprobación de higiene: es la
 * única que hay en esa puerta.
 *
 * ===========================================================================
 * ESTE MODULO NO LANZA
 * ===========================================================================
 * Mismo contrato que `auditar()` y que el registro de accesos: una notificación
 * que no sale no puede tumbar la pantalla desde la que se pidió. Devuelve
 * `false` y grita en `console.error` con un prefijo greppable.
 */

import { fetchConPlazo, PLAZO_TELEGRAM_MS } from "@/lib/net/plazo";

const API = "https://api.telegram.org";

/**
 * El usuario del bot, que va en el enlace y NO es un secreto: aparece en la URL
 * que el tutor pulsa. Se deja aquí y no en el entorno porque cambiarlo obliga a
 * cambiar el bot entero, y entonces habría que revisar este fichero de todos
 * modos.
 */
export const USUARIO_DEL_BOT = "CambridgeExamTrainerbot";

function token(): string | null {
  const t = process.env["TELEGRAM_TOKEN"];
  return t !== undefined && t.trim() !== "" ? t.trim() : null;
}

/**
 * El secreto de la cabecera. Se compara SIEMPRE, y su ausencia se trata como
 * fallo y no como «no hace falta comprobar»: una variable que se olvida de
 * configurar no puede convertir la puerta en abierta.
 */
export function secretoDelWebhook(): string | null {
  const s = process.env["TELEGRAM_WEBHOOK_SECRET"];
  return s !== undefined && s.trim() !== "" ? s.trim() : null;
}

/** ¿Está el bot configurado? Si no, la interfaz no ofrece la opción. */
export function telegramDisponible(): boolean {
  return token() !== null && secretoDelWebhook() !== null;
}

/** El enlace que abre el chat con el token de vinculación dentro. */
export function enlaceDeVinculacion(tokenDeVinculo: string): string {
  return `https://t.me/${USUARIO_DEL_BOT}?start=${encodeURIComponent(tokenDeVinculo)}`;
}

/**
 * Compara dos cadenas en tiempo independiente de dónde difieren.
 *
 * `a === b` sale en el primer byte distinto, y con eso se adivina un secreto
 * byte a byte midiendo el tiempo de respuesta. Es el mismo criterio que ya
 * aplica `supabase/functions/_shared/puertas.ts` a la identidad del canje.
 */
export function igualEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i += 1) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * Manda un mensaje. `false` si no salió, y nunca lanza.
 *
 * `parse_mode` se deja SIN poner a propósito. Con `Markdown` o `HTML`, un
 * nombre de niño con un guion bajo o un `<` rompería el mensaje entero o, peor,
 * cambiaría su formato de forma inesperada. El texto plano no tiene sintaxis
 * que escapar, y aquí no hace falta ninguna.
 */
export async function enviarMensaje(chatId: number, texto: string): Promise<boolean> {
  const t = token();
  if (t === null) {
    console.error("[telegram] enviarMensaje sin TELEGRAM_TOKEN configurado");
    return false;
  }

  try {
    /*
     * `fetchConPlazo` y no `fetch`, y no es estilo: un `fetch` pelado PUEDE
     * ESPERAR PARA SIEMPRE. Aquí eso no cuelga a un niño en un examen —cuelga
     * al webhook, al que Telegram le exige un 2xx y al que reintenta durante
     * horas si no lo recibe—, con lo que un Telegram lento se convertiría en
     * una tormenta de reintentos. `peticion-sin-plazo.test.ts` vigila la regla.
     */
    const r = await fetchConPlazo(
      `${API}/bot${t}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
        cache: "no-store",
      },
      PLAZO_TELEGRAM_MS,
    );

    if (!r.ok) {
      // El cuerpo trae `description`, que es lo que distingue «el padre bloqueó
      // al bot» de «el token es inválido». Sin él, los dos son un 400 mudo.
      const descripcion = (r.cuerpo as { description?: string } | null)?.description ?? "";
      console.error(`[telegram] sendMessage ${r.status}`, descripcion.slice(0, 200));
      return false;
    }
    return true;
  } catch (causa) {
    console.error("[telegram] sendMessage inalcanzable", causa);
    return false;
  }
}

/**
 * Deja registrado en Telegram a dónde mandar las actualizaciones.
 *
 * Se llama a mano desde `scripts/`, no en cada arranque: `setWebhook` es una
 * operación de despliegue, y ejecutarla en cada petición sería pedirle a
 * Telegram que reconfigure el bot decenas de veces por minuto.
 */
export async function registrarWebhook(url: string): Promise<{ ok: boolean; detalle: string }> {
  const t = token();
  const s = secretoDelWebhook();
  if (t === null || s === null) return { ok: false, detalle: "faltan TELEGRAM_TOKEN o TELEGRAM_WEBHOOK_SECRET" };

  const r = await fetchConPlazo(
    `${API}/bot${t}/setWebhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: s,
        // Solo mensajes: no interesan ediciones, reacciones ni pulsaciones de
        // botones. Cuanto menos llegue, menos superficie tiene esa puerta.
        allowed_updates: ["message"],
        // Una actualización pendiente de una configuración anterior podría traer
        // un token de vinculación viejo. Se descartan.
        drop_pending_updates: true,
      }),
    },
    PLAZO_TELEGRAM_MS,
  );

  const cuerpo = (r.cuerpo ?? {}) as { ok?: boolean; description?: string };
  return { ok: cuerpo.ok === true, detalle: cuerpo.description ?? `HTTP ${r.status}` };
}
