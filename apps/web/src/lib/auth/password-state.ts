/**
 * Estado del formulario de cambio de contraseña del personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * En su propio fichero porque `password-actions.ts` lleva `"use server"`, y un
 * módulo así solo puede exportar funciones async: todo lo que exporta se
 * convierte en un endpoint invocable desde el cliente, y un objeto no lo es.
 */

export type PasswordErrorCode =
  | "required"
  | "too_short"
  | "mismatch"
  | "bad_current"
  | "weak"
  | "same"
  | "unexpected";

export interface PasswordActionState {
  readonly status: "idle" | "error";
  readonly error?: PasswordErrorCode;
  readonly field?: string;
}

export const IDLE_PASSWORD_STATE: PasswordActionState = { status: "idle" };

/** Mínimo de caracteres para el personal. Debe coincidir con la Edge Function. */
export const MIN_STAFF_PASSWORD_LENGTH = 10;
