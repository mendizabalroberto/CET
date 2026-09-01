/**
 * La cookie que casa un dispositivo con un alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `HttpOnly` no es un detalle: sin el, cualquier script de la pagina lee el
 * secreto y el "dispositivo recordado" pasa a ser un token robable desde la
 * consola del navegador.
 *
 * Y lo que esta cookie compra es SOLO saltarse los pasos "colegio" y "codigo"
 * del formulario. No abre sesion. La sesion sigue naciendo de un Argon2id
 * verificado dentro de `auth-pin`.
 */
import { cookies } from "next/headers";

export const COOKIE_DISPOSITIVO = "cet_device";
export const VIDA_COOKIE_SEGUNDOS = 60 * 60 * 24 * 365;

export async function leerCookieDispositivo(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_DISPOSITIVO)?.value ?? null;
}

export async function escribirCookieDispositivo(secreto: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_DISPOSITIVO, secreto, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: VIDA_COOKIE_SEGUNDOS,
  });
}

export async function borrarCookieDispositivo(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_DISPOSITIVO);
}

/**
 * MINIMIZACION DE DATOS, no pereza.
 *
 * El tutor necesita reconocer que tablet esta revocando; para eso basta
 * "Chrome en Android". El user-agent completo de un menor es una huella
 * digital, y guardarlo seria recoger un dato que no necesitamos para nada.
 * Lo desconocido se degrada a "Navegador", nunca a la cadena original.
 *
 * DONDE SI SE GUARDA EL USER-AGENT ENTERO, Y POR QUE ESO NO CONTRADICE LO DE
 * ARRIBA
 * ---------------------------------------------------------------------------
 * Desde el registro de accesos de alumno (2026-09-01), la cadena completa SI se
 * escribe, pero en `accesos_de_alumno.user_agent` y no aqui. No es la misma
 * decision tomada dos veces al reves: son dos columnas con dos publicos.
 *
 *   - Lo que devuelve esta funcion lo LEE EL TUTOR en su panel, con una sesion
 *     de navegador. Para reconocer que tablet esta revocando le basta y le
 *     sobra "Chrome en Android", asi que guardar mas seria recoger de mas.
 *   - `accesos_de_alumno.user_agent` queda FUERA del GRANT por columna de
 *     `authenticated` (junto con `ip` e `ip_hash`): solo `service_role` lo
 *     alcanza. Ninguna respuesta HTTP hacia un navegador puede contenerlo —ni
 *     con un XSS en el panel del tutor—, y se lee unicamente en una
 *     investigacion hecha por una persona, con constancia.
 *
 * O sea: lo que cambia no es cuanto se recoge por comodidad, sino que existe un
 * sitio donde el dato completo tiene un motivo forense declarado y un control
 * de acceso que lo sostiene. Esta columna no es ese sitio, y por eso esta
 * funcion sigue degradando lo desconocido a "Navegador".
 */
export function familiaDeAgente(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === "") return "Navegador";

  const navegador =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;

  const sistema =
    /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent) ? "iPad o iPhone"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "Mac"
    : /Linux/.test(userAgent) ? "Linux"
    : null;

  if (navegador === null || sistema === null) return "Navegador";
  return `${navegador} en ${sistema}`;
}
