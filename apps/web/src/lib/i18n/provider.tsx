/**
 * LocaleProvider — contexto de idioma para las islas cliente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los Server Components leen el diccionario directamente con
 * `getServerDictionary()`. Este provider existe SOLO para los componentes
 * interactivos (formulario de login, input de PIN, cola de telemetría), que no
 * pueden llamar a `cookies()` ni a `headers()`.
 *
 * El diccionario completo se serializa una vez en el árbol de React. Son unos
 * pocos KB de texto que de todos modos viajarían dentro del HTML renderizado.
 */
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_LOCALE, getDictionary, interpolate, type Dictionary, type Locale } from ".";

interface LocaleContextValue {
  readonly locale: Locale;
  readonly t: Dictionary;
  /** Interpola `{marcadores}` en una cadena ya seleccionada del diccionario. */
  readonly fmt: (template: string, values: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: dictionary, fmt: interpolate }),
    [locale, dictionary],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallar ruidosamente: un componente sin provider mostraría `undefined` en
    // pantalla, que es peor que un error en desarrollo.
    throw new Error("useI18n() se ha usado fuera de <LocaleProvider>.");
  }
  return ctx;
}

/**
 * Igual que `useI18n()`, pero NO lanza si falta el provider: cae al diccionario
 * por defecto.
 *
 * Existe por un caso concreto: `app/error.tsx` es la frontera de error de TODA
 * la aplicación, incluidas las páginas públicas, que a propósito no montan
 * `<LocaleProvider>` para no arrastrar JavaScript. Si el boundary usara
 * `useI18n()`, un error en la landing haría que el propio boundary lanzara —
 * y el usuario acabaría en la pantalla en blanco de `global-error`. Una
 * pantalla de error que se rompe al renderizarse es la peor clase de bug.
 *
 * El precio es que ese mensaje sale en inglés en las páginas públicas. Es un
 * precio aceptable para una pantalla que solo se ve cuando ya ha fallado algo.
 */
export function useOptionalI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    t: getDictionary(DEFAULT_LOCALE),
    fmt: interpolate,
  };
}
