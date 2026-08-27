/**
 * Estado compartido entre las Server Actions de autenticación y los formularios
 * de cliente que las consumen con `useActionState`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ ESTÁ EN SU PROPIO FICHERO
 * Un módulo marcado con `"use server"` solo puede exportar funciones async: todo
 * lo que exporta se convierte en un endpoint invocable desde el cliente, y un
 * objeto no es invocable. Next falla el build con
 * `A "use server" file can only export async functions, found object`.
 *
 * Los tipos se borran al compilar y podrían quedarse en `actions.ts`, pero viven
 * aquí junto a `IDLE_STATE` para que la frontera sea una sola: `actions.ts`
 * exporta acciones, `state.ts` exporta datos y tipos.
 */

/**
 * Códigos de error que cruzan al cliente. Son CÓDIGOS, no mensajes: el texto lo
 * elige el componente según el idioma (AD-7). Enviar el mensaje ya traducido
 * desde el servidor obligaría a resolver el idioma dos veces y abriría la
 * puerta a filtrar detalles internos en el texto.
 */
export type AuthErrorCode =
  | "bad_credentials"
  | "staff_bad_credentials"
  | "rate_limited"
  | "pin_mismatch"
  | "pin_too_weak"
  | "pin_wrong_length"
  | "school_unavailable"
  | "required"
  | "consent_required"
  | "invalid_email"
  | "unexpected";

export interface ActionState {
  readonly status: "idle" | "error" | "success";
  readonly error?: AuthErrorCode;
  /** Campo al que asociar el error, para `aria-describedby`. */
  readonly field?: string;
}

export const IDLE_STATE: ActionState = { status: "idle" };
