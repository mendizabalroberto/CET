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
 * Tema efectivo. `system` devuelve `null` a propósito: sin atributo
 * `data-theme`, manda `prefers-color-scheme` desde CSS puro.
 */
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "system";
}

/** Cookies de preferencia: 1 año, sin datos personales, no httpOnly (el toggle no las necesita, pero tampoco daña). */
export const PREFERENCE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  // No son secretas — pero sí deben viajar solo por HTTPS en producción.
  secure: process.env.NODE_ENV === "production",
} as const;
