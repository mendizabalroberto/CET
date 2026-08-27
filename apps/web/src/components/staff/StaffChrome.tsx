"use client";

/**
 * Frontera de cliente del área de personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTE COMPONENTE EXISTE
 * ===========================================================================
 * Los componentes de datos de `@cet/ui` (`Table`, `StatTile`, `EmptyState`,
 * `MathStem`…) resuelven sus textos con `useI18n()`, que es un hook de React y
 * por tanto necesita un contexto de cliente. El `LocaleProvider` de
 * `@/lib/i18n/provider` que ya monta el layout es OTRO contexto distinto: el
 * del diccionario de la aplicación. Los dos hacen falta.
 *
 * Este componente aporta el de `@cet/ui`, y por ser "use client" sirve además
 * de frontera: todo lo que se pinte dentro y use esos primitivos se hidrata,
 * mientras que el resto del árbol del layout sigue siendo de servidor.
 * ===========================================================================
 */
import type { Locale } from "@cet/shared";
import { LocaleProvider as UiLocaleProvider } from "@cet/ui";
import type { ReactNode } from "react";

export function StaffChrome({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}): ReactNode {
  return <UiLocaleProvider locale={locale}>{children}</UiLocaleProvider>;
}
