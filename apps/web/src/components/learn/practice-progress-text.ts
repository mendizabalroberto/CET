/**
 * El "cuánto esfuerzo más", en palabras.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ NO ES UN PORCENTAJE, Y POR QUÉ TAMPOCO ES UN TOTAL
 * ===========================================================================
 * El encargo era "mostrar visualmente cuánto esfuerzo más". Las dos respuestas
 * fáciles están las dos mal, y por motivos distintos:
 *
 *  - "Te falta el 40 %" no es accionable. Un niño de once años no puede traducir
 *    un porcentaje a algo que hacer esta tarde.
 *  - "Te faltan 200 preguntas" sí es accionable, es honesto... y hace abandonar.
 *    Es el efecto contrario al que se busca.
 *
 * Lo que se enseña aquí es el SIGUIENTE PELDAÑO, nunca la cima: cuántos aciertos
 * faltan para subir un tramo de `masteryLevel()`. Ese número está acotado por
 * `WINDOW` por construcción (ver `nextStepFor`), así que siempre es un objetivo
 * de una sentada. La cima no se esconde —los cuatro peldaños se ven dibujados—
 * pero la CIFRA que se pide es siempre la del paso siguiente.
 *
 * Cuando aún no hay evidencia, el objetivo tampoco es una promesa vacía: es
 * "responde N preguntas y te digo cómo lo llevas", con N <= MIN_EVIDENCE.
 *
 * Ninguna de estas frases se construye si no hay `TopicProgress`, y no hay
 * `TopicProgress` si no hubo eventos. Ver `practice-progress.ts`.
 */
import { resolveI18n, type I18nText, type Locale } from "@cet/shared";
import { UI_STRINGS } from "@cet/ui";

import { getLearnDictionary, type LearnDictionary } from "./dictionary";
import type { NextStep } from "./practice-progress";

/**
 * Las palabras de los cuatro niveles salen de `@cet/ui` y NO del diccionario de
 * la aplicación: `MasteryLadder` y `MasteryMeter` ya las usan, y dos fuentes
 * para el mismo vocabulario divergen el primer día que alguien retoca una.
 */
const LEVEL_TEXT = {
  starting: UI_STRINGS.masteryStarting,
  learning: UI_STRINGS.masteryLearning,
  solid: UI_STRINGS.masterySolid,
  mastered: UI_STRINGS.masteryMastered,
} as const;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/** La frase del siguiente paso, ya interpolada y en el idioma del alumno. */
export function nextStepText(
  step: NextStep,
  dictionary: LearnDictionary,
  locale: Locale,
): string {
  const t = dictionary.practice;
  switch (step.kind) {
    case "need_evidence":
      return step.questions === 1
        ? t.nextStepEvidenceOne
        : fill(t.nextStepEvidence, { count: step.questions });
    case "to_next_level": {
      const level = resolveI18n(LEVEL_TEXT[step.level], locale);
      return step.correct === 1
        ? fill(t.nextStepToLevelOne, { level })
        : fill(t.nextStepToLevel, { count: step.correct, level });
    }
    case "mastered":
      return t.nextStepMastered;
  }
}

/**
 * La misma frase, en los dos idiomas.
 *
 * Los componentes de `@cet/ui` reciben `I18nText` y lo resuelven con su propio
 * `LocaleProvider`; pasarles una cadena ya resuelta duplicaría la lógica de
 * idioma. Es el mismo patrón que `learnI18n()`, que no sirve aquí porque esta
 * frase no es una clave del diccionario sino una interpolación con datos.
 */
export function nextStepI18n(step: NextStep): I18nText {
  return {
    es: nextStepText(step, getLearnDictionary("es"), "es"),
    en: nextStepText(step, getLearnDictionary("en"), "en"),
  };
}

/**
 * Cuántos "objetivos" pinta `EffortMeter` para este paso.
 *
 * Es el mismo número que dice la frase: si el texto promete tres aciertos y el
 * dibujo enseña cinco círculos, el dibujo es decoración y el alumno aprende a no
 * mirarlo. Cero para "dominado", que es lo que hace que `EffortMeter` no pinte
 * nada en vez de inventarse un objetivo.
 */
export function nextStepTargets(step: NextStep): number {
  switch (step.kind) {
    case "need_evidence":
      return step.questions;
    case "to_next_level":
      return step.correct;
    case "mastered":
      return 0;
  }
}

/** "12 preguntas respondidas": la evidencia de la que sale todo lo anterior. */
export function answeredCountText(total: number, dictionary: LearnDictionary): string {
  const t = dictionary.practice;
  return total === 1 ? t.answeredCountOne : fill(t.answeredCount, { count: total });
}
