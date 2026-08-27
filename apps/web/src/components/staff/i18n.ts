/**
 * Acceso al diccionario del personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Vive aquí y no en `lib/i18n/index.ts` porque ese fichero es el núcleo
 * compartido de la aplicación y lo mantiene otra vía. El diccionario del
 * personal es un añadido de esta área y no debe obligar a tocar el núcleo.
 *
 * Sin dependencias de servidor: lo importan tanto los Server Components como
 * las islas cliente.
 */
import type { I18nText, Locale } from "@cet/shared";
import { DEFAULT_LOCALE, resolveI18n } from "@cet/shared";

import { staffEn, type StaffDictionary } from "@/lib/i18n/dictionaries/staff.en";
import { staffEs } from "@/lib/i18n/dictionaries/staff.es";

export type { StaffDictionary };

const STAFF_DICTIONARIES: Record<Locale, StaffDictionary> = { en: staffEn, es: staffEs };

export function getStaffDictionary(locale: Locale): StaffDictionary {
  return STAFF_DICTIONARIES[locale];
}

/** Sustituye `{marcadores}`. React escapa el resultado, así que no hay inyección. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Resuelve un `I18nText` que viene de la BASE DE DATOS (título de examen,
 * nombre de destreza…). Devuelve `fallback` si el texto es nulo o está vacío:
 * una celda vacía es mejor que la palabra "undefined" en una tabla que un
 * profesor va a leer.
 */
export function fromDb(
  text: Record<string, string> | null | undefined,
  locale: Locale,
  fallback = "",
): string {
  if (text === null || text === undefined) return fallback;
  const resolved = resolveI18n(text as I18nText, locale, DEFAULT_LOCALE);
  return resolved === "" ? fallback : resolved;
}

/** Envuelve una cadena ya resuelta en la forma `I18nText` que exige `@cet/ui`. */
export function ui(text: string): I18nText {
  return { es: text, en: text };
}
