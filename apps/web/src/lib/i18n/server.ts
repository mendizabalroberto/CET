/**
 * Resolución del idioma en el servidor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ORDEN DE PRECEDENCIA (de más a menos específico):
 *   1. `profiles.locale` del usuario autenticado — es su elección guardada.
 *   2. Cookie `cet_locale` — elección explícita de un visitante sin cuenta.
 *   3. Cabecera `Accept-Language` del navegador.
 *   4. `DEFAULT_LOCALE` ("en").
 *
 * El idioma por defecto del colegio (`schools.default_locale`) se aplica al
 * crear el perfil, en la vía A, no aquí: cuando el alumno ya tiene sesión, su
 * `profiles.locale` ya lo refleja y respetar su elección posterior es correcto.
 */
import "server-only";

import { cookies, headers } from "next/headers";

import {
  DEFAULT_LOCALE,
  getDictionary,
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  type Dictionary,
  type Locale,
} from ".";

/**
 * @param profileLocale Idioma del perfil autenticado, si lo hay. Se pasa como
 *   argumento en vez de consultarse aquí para no acoplar i18n a la sesión ni
 *   provocar una consulta extra en cada render.
 */
export async function resolveLocale(profileLocale?: string | null): Promise<Locale> {
  if (isLocale(profileLocale)) return profileLocale;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const negotiated = localeFromAcceptLanguage(headerStore.get("accept-language"));
  if (negotiated) return negotiated;

  return DEFAULT_LOCALE;
}

export async function getServerDictionary(
  profileLocale?: string | null,
): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await resolveLocale(profileLocale);
  return { locale, t: getDictionary(locale) };
}
