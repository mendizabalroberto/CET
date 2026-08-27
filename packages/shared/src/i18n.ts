/**
 * Texto internacionalizado. Todo texto visible al usuario que viva en la base de
 * datos usa esta forma (AD-7).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";

export const LOCALES = ["es", "en"] as const;
export const locale = z.enum(LOCALES);
export type Locale = z.infer<typeof locale>;

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Un texto en varios idiomas. Al menos uno debe estar presente y no vacío:
 * un I18nText totalmente vacío es un dato corrupto, no un texto opcional.
 */
export const i18nText = z
  .object({
    es: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  })
  .refine((v) => Boolean(v.es ?? v.en), {
    message: "I18nText requiere al menos un idioma con contenido",
  });

export type I18nText = z.infer<typeof i18nText>;

/**
 * Resuelve un I18nText al idioma pedido, con cadena de fallback explícita.
 * Nunca devuelve undefined: el esquema garantiza que hay al menos un idioma.
 */
export function resolveI18n(
  text: I18nText,
  preferred: Locale,
  fallback: Locale = DEFAULT_LOCALE,
): string {
  const direct = text[preferred];
  if (direct) return direct;

  const fell = text[fallback];
  if (fell) return fell;

  for (const l of LOCALES) {
    const any = text[l];
    if (any) return any;
  }

  // Inalcanzable si el valor pasó por i18nText.parse(), pero no lanzamos en
  // runtime de UI: un texto vacío degrada mejor que una pantalla en blanco.
  return "";
}

/** Construye un I18nText con el mismo texto en todos los idiomas (para seeds). */
export function sameInAll(text: string): I18nText {
  return { es: text, en: text };
}
