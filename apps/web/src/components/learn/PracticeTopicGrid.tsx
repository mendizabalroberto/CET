/**
 * La parrilla de grupos de práctica, con su progreso persistente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Está extraída de `/practice/page.tsx` para que se pueda RENDERIZAR SIN SESIÓN.
 * La página necesita `requireStudent()` y una consulta con RLS; este componente
 * solo necesita datos, así que la ruta de vista previa de desarrollo
 * (`/dev/practice-preview`) pinta exactamente el mismo marcado que ve el alumno
 * en producción, y no una maqueta parecida. Una captura de una maqueta no prueba
 * nada: es justo la clase de evidencia falsa que este proyecto persigue.
 *
 * No lleva "use client": son enlaces y SVG, cero interacción.
 */
import Link from "next/link";
import type { Locale } from "@cet/shared";
import { EffortMeter, MasteryLadder } from "@cet/ui";

import { learnI18n, type LearnDictionary } from "./dictionary";
import { MIXED_TOPIC_ID, type PracticeTopic } from "./practice-topics";
import {
  answeredCountText,
  nextStepI18n,
  nextStepTargets,
  nextStepText,
} from "./practice-progress-text";
import type { TopicProgress } from "./practice-progress";

export interface PracticeTopicGridProps {
  readonly topics: readonly PracticeTopic[];
  readonly dictionary: LearnDictionary;
  readonly locale: Locale;
  /**
   * Progreso por `engineKey`. **`null` significa "no lo sabemos"** —la consulta
   * falló—, y entonces no se pinta ni un indicador: una consulta caída no es un
   * cero. Un mapa vacío sí es un dato: significa "no ha practicado nada".
   */
  readonly progress: ReadonlyMap<string, TopicProgress> | null;
}

export function PracticeTopicGrid({
  topics,
  dictionary,
  locale,
  progress,
}: PracticeTopicGridProps) {
  const t = dictionary.practice;

  return (
    <nav aria-label={t.topicLegend}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {t.progressLegend}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {topics.map((topic) => {
          // `mix` no es un grupo: es un sorteo entre los demás, y sus respuestas
          // se acreditan al grupo real. Ver `practice-progress.ts`.
          const own = topic.id === MIXED_TOPIC_ID ? undefined : progress?.get(topic.id);
          return (
            <li key={topic.id}>
              <Link
                href={`/practice/${encodeURIComponent(topic.id)}`}
                className="flex min-h-11 flex-col justify-center gap-1 rounded-2xl border-2 border-line bg-card px-4 py-3 text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{t.topics[topic.slug]}</span>
                  {own ? (
                    <MasteryLadder
                      level={own.level}
                      groupLabel={learnI18n((d) => d.practice.topics[topic.slug])}
                      size="sm"
                      showLabel
                    />
                  ) : null}
                </span>

                <span className="text-sm text-muted">{t.topicHints[topic.slug]}</span>

                {/* La cifra de la que sale todo lo demás. Sin ella el nivel es
                    un oráculo; con ella el alumno puede comprobarlo. */}
                {own ? (
                  <span className="text-xs text-muted">
                    {answeredCountText(own.totalAnswered, dictionary)}
                  </span>
                ) : progress !== null && topic.id !== MIXED_TOPIC_ID ? (
                  <span className="text-xs text-muted">{t.notPractisedYet}</span>
                ) : null}

                {/* Con objetivo pendiente, el medidor. Ya dominado, la frase
                    sola: `EffortMeter` no pinta cero circulos (cero no es
                    ausencia), y dejar la tarjeta muda haria que el unico grupo
                    que el alumno ha terminado fuese el que menos le dice. */}
                {own === undefined ? null : nextStepTargets(own.nextStep) > 0 ? (
                  <EffortMeter
                    targets={nextStepTargets(own.nextStep)}
                    message={nextStepI18n(own.nextStep)}
                    className="mt-0.5"
                  />
                ) : (
                  <span className="mt-0.5 text-sm font-semibold text-ink">
                    {nextStepText(own.nextStep, dictionary, locale)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
