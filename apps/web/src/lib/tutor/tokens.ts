/**
 * Tokens de la cadena de invitacion.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Puro a proposito: sin Supabase, sin cookies, sin `next/headers`. Es lo que
 * permite testearlo sin levantar nada, y es la pieza de la que depende que un
 * token no acabe nunca en claro en la base de datos.
 */
import { createHash, randomBytes } from "node:crypto";

/** 32 bytes son 256 bits de entropia; en base64url, exactamente 43 caracteres. */
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Lo UNICO que se guarda. SHA-256 y no Argon2id a proposito: un token de 256
 * bits no se adivina por fuerza bruta, asi que el coste alto de Argon2 no
 * compra nada aqui y si costaria en cada canje. Argon2 es para secretos con
 * poca entropia, como un PIN de cuatro digitos.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
