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
import { EffortMeter, MasteryLadder, MasteryOverview } from "@cet/ui";

import { learnI18n, type LearnDictionary } from "./dictionary";
import { MIXED_TOPIC_ID, type PracticeTopic } from "./practice-topics";
import {
  answeredCountText,
  nextStepI18n,
  nextStepTargets,
  nextStepText,
  overviewSummaryI18n,
} from "./practice-progress-text";
import { overviewLevels, type TopicProgress } from "./practice-progress";

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

  // La vista de conjunto sale de los MISMOS `TopicProgress` que las tarjetas: es
  // una proyección, no un segundo cálculo. Un resumen con su propia fuente se
  // desincroniza del detalle el primer día. Ver `overviewLevels`.
  //
  // `mix` queda fuera: no es un tema, es un sorteo entre los demás, y contarlo
  // inflaría el denominador con algo que nunca se puede medir.
  const overview = overviewLevels(
    topics.filter((topic) => topic.id !== MIXED_TOPIC_ID).map((topic) => topic.id),
    progress ?? null,
  );

  return (
    <nav aria-label={t.topicLegend}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {t.progressLegend}
      </h2>

      {/* Lo único de esta pantalla que responde «cómo voy en general». Va
          arriba y solo: es lo que el alumno lee de un vistazo, y las diez
          tarjetas de abajo son el detalle para quien quiera bajar. Sin ningún
          tema medido no se pinta —`MasteryOverview` devuelve `null`—, que es lo
          correcto el primer día: entonces las tarjetas ya dicen «Sin practicar
          todavía» diez veces y un resumen a cero sería una medida inventada. */}
      <MasteryOverview levels={overview} summary={overviewSummaryI18n(overview)} className="mt-3" />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {topics.map((topic) => {
          // `mix` no es un grupo: es un sorteo entre los demás, y sus respuestas
          // se acreditan al grupo real. Ver `practice-progress.ts`.
          const own = topic.id === MIXED_TOPIC_ID ? undefined : progress?.get(topic.id);
          return (
            <li key={topic.id}>
              <Link
                href={`/practice/${encodeURIComponent(topic.id)}`}
                data-cet-id="practica.elegir-tema"
                data-cet-value={topic.id}
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
