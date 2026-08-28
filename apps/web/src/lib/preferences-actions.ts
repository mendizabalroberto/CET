/**
 * Server Actions de preferencias.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cambiar de tema o de idioma no necesita NI UNA LÍNEA de JavaScript en el
 * cliente: son formularios que envían una Server Action, la acción escribe la
 * preferencia y la página se vuelve a renderizar en el servidor. Coste en el
 * bundle: cero. Y funciona con JavaScript desactivado, cosa que en un aula con
 * dispositivos viejos no es una hipótesis remota.
 *
 * ===========================================================================
 * POR QUÉ EL IDIOMA ESCRIBE EN DOS SITIOS Y EL TEMA EN UNO
 * ===========================================================================
 * El selector de idioma no hacía nada para un usuario con sesión, y el botón
 * funcionaba: el formulario enviaba, la acción escribía la cookie, y el lector
 * la ignoraba. `resolveLocale()` (lib/i18n/server.ts) resuelve en este orden:
 *
 *     1. profiles.locale del usuario autenticado   <- gana y RETORNA
 *     2. cookie cet_locale
 *     3. Accept-Language
 *     4. DEFAULT_LOCALE
 *
 * Quien tiene sesión tiene SIEMPRE `profiles.locale` (`not null default 'en'`,
 * 0003_tenancy.sql), así que el paso 1 cortaba antes de mirar la cookie. La
 * escritura y la lectura vivían en sitios distintos.
 *
 * La corrección no es bajar `profiles.locale` en la precedencia —es la elección
 * guardada del usuario y debe sobrevivir al cambio de dispositivo— sino que la
 * acción escriba TAMBIÉN ahí. La cookie se conserva porque es la única memoria
 * que tiene un visitante sin cuenta, y porque sigue valiendo tras cerrar sesión.
 *
 * El TEMA no tiene este fallo, y no por suerte: no existe ninguna columna
 * `theme` en `supabase/migrations/`. `getTheme()` lee la cookie `cet_theme` y
 * nada más, que es exactamente el único sitio donde `setThemePreference`
 * escribe. Un sitio, un lector. El invariante de
 * `preferencia-se-lee-donde-se-escribe.test.ts` lo comprueba cada vez, para que
 * el día que alguien añada `profiles.theme` el desajuste salga en rojo.
 */
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getSessionProfile } from "@/lib/auth/session";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { isTheme, PREFERENCE_COOKIE_OPTIONS, THEME_COOKIE } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

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

  await persistLocaleOnProfile(value);

  revalidatePath("/", "layout");
}

/**
 * Guarda el idioma en `profiles.locale`, que es lo que `resolveLocale()` mira
 * primero. Sin sesión no hay fila que escribir y la cookie basta.
 *
 * LA SESIÓN SE LEE AQUÍ, NO SE RECIBE.
 * La alternativa era que `LocaleSwitcher` metiera el id del perfil en un
 * `<input type="hidden">`. Eso convierte la identidad del usuario en un campo
 * de formulario, es decir, en dato que controla el cliente: bastaría con
 * cambiarlo para intentar escribir en la fila de otro. La RLS lo pararía
 * (`profiles_update_own` exige `id = auth.uid()`), pero pedirle a la base que
 * desmienta algo que el servidor ya sabe es poner la autorización en la capa
 * equivocada, y deja al selector cargando con una responsabilidad que no es
 * suya. El coste —una consulta de sesión— se paga solo al pulsar el selector,
 * nunca en un render.
 *
 * Sobre la RLS: `profiles_update_own` permite el UPDATE de la propia fila, y el
 * trigger `app.profiles_guard_escalation` (0022_fix_inert_guards.sql) solo
 * levanta la mano ante `role`, `school_id`, `status` e `id`. `locale` no está en
 * esa lista, y la constraint `profiles_locale_supported` acepta 'es' y 'en',
 * que es justo lo que `isLocale` ya ha dejado pasar.
 */
async function persistLocaleOnProfile(locale: Locale): Promise<void> {
  const profile = await getSessionProfile();
  if (profile === null) return;
  if (profile.locale === locale) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ locale }).eq("id", profile.id);

  // Tragarse este error reproduciría letra por letra el fallo que este fichero
  // arregla: el usuario pulsa, la página se repinta igual que estaba, y nadie
  // se entera de nada. R4 — silencioso es peor que ruidoso.
  if (error) {
    throw new Error(`No se pudo guardar el idioma en profiles.locale: ${error.message}`);
  }
}
