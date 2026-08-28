/**
 * Preferencias de presentación: tema e idioma.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Ambas viven en cookies legibles por el servidor. Consecuencia deliberada: el
 * HTML sale del servidor ya con el tema y el idioma correctos, sin un script en
 * línea que "arregle" el tema tras la primera pintura. Ese script es el patrón
 * habitual y es justo lo que obliga a meter `unsafe-inline` en la CSP.
 */
import "server-only";

import { cookies } from "next/headers";

export const THEME_COOKIE = "cet_theme";

export type Theme = "light" | "dark" | "system";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Tema efectivo.
 *
 * SIN COOKIE, EL TEMA ES CLARO — no `system`, y es deliberado.
 *
 * Quien decide aquí no es el dueño del dispositivo: es un niño que abre la app
 * en el móvil que le han dejado, con los ajustes que trajera. `system` hacía
 * que el modo oscuro del teléfono de su padre decidiera con qué contraste
 * estudia. La lección se diseñó, se midió y se mira sobre fondo claro, así que
 * ése es el suelo; el oscuro es una elección, no una herencia.
 *
 * `system` sigue existiendo y el selector lo ofrece: quien lo elige, lo elige.
 * Sólo deja de ser lo que pasa cuando nadie ha elegido nada.
 */
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "light";
}

/** Cookies de preferencia: 1 año, sin datos personales, no httpOnly (el toggle no las necesita, pero tampoco daña). */
export const PREFERENCE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  // No son secretas — pero sí deben viajar solo por HTTPS en producción.
  secure: process.env.NODE_ENV === "production",
} as const;
