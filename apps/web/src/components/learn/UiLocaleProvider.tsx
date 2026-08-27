"use client";

/**
 * Puente de idioma hacia `@cet/ui`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `@cet/ui` tiene su propio `LocaleProvider`: sus componentes reciben los textos
 * como `I18nText` (`{ es, en }`) y los resuelven con `resolveI18n`. Sin este
 * proveedor todo el design system cae a `DEFAULT_LOCALE` ("en") y un alumno con
 * el perfil en español vería "Check", "Streak" y "Not quite" en medio de una
 * pantalla en español.
 *
 * Se monta en el subárbol de learn/practice y no en el layout de alumno porque
 * el layout es territorio compartido: cuando se integren las cuatro vías, subirlo
 * es mover una línea.
 */
import { LocaleProvider as UiLocale } from "@cet/ui";
import type { Locale } from "@cet/shared";
import type { ReactNode } from "react";

export function UiLocaleProvider({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  return <UiLocale locale={locale}>{children}</UiLocale>;
}
