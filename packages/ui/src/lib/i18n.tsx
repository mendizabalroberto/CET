"use client";

/**
 * @cet/ui — contexto de idioma.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * AD-7: cero strings hardcodeados. Todo texto visible entra como `I18nText`
 * (`{ es, en }`) desde props o desde el diccionario del paquete, y se resuelve
 * con `resolveI18n` de @cet/shared.
 *
 * Los componentes NO llevan textos propios en linea: los pocos textos que el
 * design system necesita para funcionar (etiquetas de cierre de dialogo, texto
 * de estado del autoguardado, etc.) viven en `packages/ui/src/lib/strings.ts`
 * como `I18nText` y son sobreescribibles por prop.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, resolveI18n, type I18nText, type Locale } from "@cet/shared";

interface LocaleContextValue {
  readonly locale: Locale;
  readonly fallback: Locale;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  fallback: DEFAULT_LOCALE,
});

export interface LocaleProviderProps {
  readonly locale: Locale;
  /** Idioma al que caer si el texto no existe en `locale`. */
  readonly fallback?: Locale | undefined;
  readonly children: ReactNode;
}

/** Provee el idioma activo a todo el arbol de @cet/ui. */
export function LocaleProvider({
  locale,
  fallback = DEFAULT_LOCALE,
  children,
}: LocaleProviderProps): ReactNode {
  const value = useMemo<LocaleContextValue>(() => ({ locale, fallback }), [locale, fallback]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Idioma activo. */
export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

/**
 * Resolutor de textos. `t(texto)` devuelve la cadena en el idioma activo.
 * `t(undefined, defecto)` permite que una prop opcional caiga al texto del
 * diccionario del paquete sin que el componente escriba literales.
 */
export function useI18n(): (text: I18nText | undefined, fallbackText?: I18nText) => string {
  const { locale, fallback } = useContext(LocaleContext);
  return useCallback(
    (text: I18nText | undefined, fallbackText?: I18nText): string => {
      const chosen = text ?? fallbackText;
      if (!chosen) return "";
      return resolveI18n(chosen, locale, fallback);
    },
    [locale, fallback],
  );
}

export type { I18nText, Locale };
