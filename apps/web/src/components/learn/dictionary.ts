/**
 * Resolución del diccionario de learn/practice.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Vive aquí y no en `lib/i18n/index.ts` porque ese fichero es compartido por las
 * cuatro vías que trabajan en `apps/web` a la vez. Al integrar, cablearlo allí
 * es mover estas veinte líneas; mientras tanto, nadie pisa a nadie.
 */
import type { I18nText, Locale } from "@cet/shared";

import { learnEn, type LearnDictionary } from "@/lib/i18n/dictionaries/learn.en";
import { learnEs } from "@/lib/i18n/dictionaries/learn.es";

export type { LearnDictionary };

const LEARN_DICTIONARIES: Record<Locale, LearnDictionary> = { en: learnEn, es: learnEs };

export function getLearnDictionary(locale: Locale): LearnDictionary {
  return LEARN_DICTIONARIES[locale];
}

/**
 * Construye un `I18nText` a partir del diccionario.
 *
 * Los componentes de `@cet/ui` reciben los textos como `{ es, en }` y los
 * resuelven ellos mismos con su propio `LocaleProvider`. Pasarles una cadena ya
 * resuelta obligaría a duplicar la lógica de idioma en cada llamada; pasarles el
 * par completo mantiene una sola fuente.
 */
export function learnI18n(select: (d: LearnDictionary) => string): I18nText {
  return { en: select(learnEn), es: select(learnEs) };
}

/** `{marcadores}` sustituidos en las dos lenguas a la vez. */
export function learnI18nWith(
  select: (d: LearnDictionary) => string,
  values: Record<string, string | number>,
): I18nText {
  const fill = (template: string): string =>
    template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = values[key];
      return value === undefined ? match : String(value);
    });
  return { en: fill(select(learnEn)), es: fill(select(learnEs)) };
}
