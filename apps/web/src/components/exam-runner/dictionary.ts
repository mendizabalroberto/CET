/**
 * Selector del diccionario del examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Vive aquí y no en `src/lib/i18n/index.ts` a propósito: ese fichero es
 * compartido por toda la app y lo tocan otras vías en paralelo. El motor de
 * examen resuelve su propio diccionario sin pedirle permiso a nadie.
 */
import type { Locale } from "@cet/shared";

import { examEn, type ExamDictionary } from "@/lib/i18n/dictionaries/exam.en";
import { examEs } from "@/lib/i18n/dictionaries/exam.es";

const DICTIONARIES: Record<Locale, ExamDictionary> = { en: examEn, es: examEs };

export function getExamDictionary(locale: Locale): ExamDictionary {
  return DICTIONARIES[locale];
}

export type { ExamDictionary };

/** `interpolate` de `@/lib/i18n`, replicado para no acoplar el runner a ese módulo. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
