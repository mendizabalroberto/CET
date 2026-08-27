/**
 * Traducción de códigos de error de autenticación a texto para el usuario.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El servidor devuelve CÓDIGOS; el idioma se resuelve aquí (AD-7). Varios
 * códigos comparten mensaje a propósito — ver la cabecera de `lib/auth/actions.ts`.
 */
import type { AuthErrorCode } from "@/lib/auth/state";
import type { Dictionary } from "@/lib/i18n";

export function authErrorMessage(
  code: AuthErrorCode | undefined,
  t: Dictionary,
  fmt: (template: string, values: Record<string, string | number>) => string,
  pinLength?: number,
): string | null {
  if (!code) return null;
  const e = t.auth.errors;

  switch (code) {
    case "bad_credentials":
      return e.badCredentials;
    case "staff_bad_credentials":
      return e.staffBadCredentials;
    case "rate_limited":
      return e.rateLimited;
    case "pin_mismatch":
      return e.pinMismatch;
    case "pin_too_weak":
      return e.pinTooWeak;
    case "pin_wrong_length":
      return fmt(e.pinWrongLength, { length: pinLength ?? 4 });
    case "school_unavailable":
      return e.schoolUnavailable;
    case "required":
      return e.required;
    case "consent_required":
      return t.register.errors.consentRequired;
    case "invalid_email":
      return t.register.errors.invalidEmail;
    case "unexpected":
      return e.unexpected;
    default:
      // `default` inalcanzable con la unión actual, pero si mañana se añade un
      // código y se olvida aquí, el usuario ve un mensaje genérico en vez de
      // una pantalla vacía.
      return e.unexpected;
  }
}
