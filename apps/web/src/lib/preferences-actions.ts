/**
 * Server Actions de preferencias.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cambiar de tema o de idioma no necesita NI UNA LÍNEA de JavaScript en el
 * cliente: son formularios que envían una Server Action, la acción escribe la
 * cookie y la página se vuelve a renderizar en el servidor. Coste en el bundle:
 * cero. Y funciona con JavaScript desactivado, cosa que en un aula con
 * dispositivos viejos no es una hipótesis remota.
 */
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { isTheme, PREFERENCE_COOKIE_OPTIONS, THEME_COOKIE } from "@/lib/preferences";

export async function setThemePreference(formData: FormData): Promise<void> {
  const value = formData.get("theme");
  // Se valida contra la lista cerrada: el valor acaba en un atributo del <html>
  // y un valor arbitrario del formulario no debe llegar nunca ahí.
  if (!isTheme(value)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, value, PREFERENCE_COOKIE_OPTIONS);

  // El layout raíz depende de esta cookie, así que hay que invalidar el layout
  // entero y no solo la página.
  revalidatePath("/", "layout");
}

export async function setLocalePreference(formData: FormData): Promise<void> {
  const value = formData.get("locale");
  if (!isLocale(value)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, value, PREFERENCE_COOKIE_OPTIONS);

  revalidatePath("/", "layout");
}
