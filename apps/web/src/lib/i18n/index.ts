/**
 * Núcleo de i18n. Sin dependencias de servidor ni de cliente: se puede importar
 * desde cualquier sitio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * AD-7: cero strings hardcodeados. Un componente que escriba texto literal es un
 * bug, no una simplificación.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@cet/shared";

import { en, type Dictionary } from "./dictionaries/en";
import { es } from "./dictionaries/es";

export type { Dictionary };
export type { Locale };
export { DEFAULT_LOCALE, LOCALES };

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Nombre de la cookie donde se recuerda el idioma elegido explícitamente. */
export const LOCALE_COOKIE = "cet_locale";

/**
 * Sustituye `{marcadores}` por valores. Deliberadamente simple: no hay
 * pluralización porque hoy no hay ninguna cadena que la necesite. Si mañana la
 * hay, se añade aquí y no a base de concatenar en los componentes.
 *
 * Los valores se insertan como texto plano en React, así que no hay riesgo de
 * inyección: React escapa todo lo que no sea `dangerouslySetInnerHTML`.
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Negocia el idioma a partir de la cabecera `Accept-Language`.
 * Se ignora el peso `q`: con solo dos idiomas, el primero que case es el bueno.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
