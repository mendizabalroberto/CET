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
 *
 * ===========================================================================
 * QUÉ PROGRESO SE PINTA Y CUÁNDO NO SE PINTA NADA
 * ===========================================================================
 * Tres estados, y los tres se ven distintos a propósito:
 *   - la consulta falla  -> un aviso en la página, y CERO indicadores aquí;
 *   - el grupo no tiene evidencia -> "Sin practicar todavía";
 *   - hay evidencia -> escalera + palabra del nivel + siguiente paso.
 *
 * El chip `mix` nunca lleva escalera: no es un grupo, es un sorteo entre los
 * demás. Sus respuestas se acreditan al grupo real. Ver `practice-progress.ts`.
 *
 * ===========================================================================
 * LA MISMA LIBRERÍA VISUAL QUE /learn (2026-08-28)
 * ===========================================================================
 * Hasta hoy esta parrilla tenía su propio aspecto —píldoras de esquina muy
 * redonda, borde doble gris, dos columnas fijas, cuerpo a 12 px— mientras
 * `/learn` estrenaba las tarjetas del design system. Dos pantallas hermanas del
 * mismo alumno con dos lenguajes visuales distintos, y la de práctica con el
 * texto más pequeño de todo el producto. Ahora las dos hablan el mismo:
 *
 *   - **El rail de color** (`border-s-4` con `--cet-materia-*`) y el resto de la
 *     caja —`rounded-md`, `shadow-card`, elevación al pasar por encima— salen de
 *     `SubjectCard`. Es la misma decisión de dibujo, no una copia parecida: los
 *     colores llegan por `subjectIdentity()`, que es la única fuente de la
 *     paleta de materias, y aquí no se escribe ni un hexadecimal.
 *   - **El cuerpo se queda en `bg-card`**, y esto es deliberado: `SubjectCard`
 *     usa el lavado `--cet-materia-*-suave` porque encima solo lleva
 *     `--cet-ink`. Aquí encima va además texto atenuado —la pista, el recuento y
 *     la palabra del nivel que escribe `MasteryLadder`— y `--cet-ink-muted`
 *     sobre ese lavado mide de 4.45:1 a 4.51:1: por debajo del 4.5 que pide WCAG
 *     1.4.3 en tres de los siete tonos. El lavado se gana un cuerpo de texto
 *     entero o no se usa; sobre `--cet-surface` esos pares ya están medidos.
 *   - **La escala tipográfica del preset**: `text-body-lg` para el nombre y
 *     `text-body-sm` para lo demás. El `text-xs` que había son 12 px, y la
 *     escala de esta casa no baja de 14.5 px porque el lector tiene once años.
 *   - **La rejilla**: una columna, dos desde `sm` y tres desde `lg`, igual que
 *     `SubjectGrid`. Con diez temas, dos columnas fijas dejaban media pantalla
 *     vacía en el portátil del colegio.
 *
 * Lo que NO se copia de `SubjectCard` es el medallón. El icono de materia es el
 * canal que IDENTIFICA la materia, y aquí las diez tarjetas son de la misma:
 * diez cruces azules idénticas no distinguirían nada, se comerían el ancho que
 * en un móvil de 360 px necesita el nombre del tema, y le enseñarían al alumno
 * que ese dibujo no significa nada. Lo que distingue un tema de otro es su
 * nombre y su pista, y los dos van escritos.
 */
import Link from "next/link";
import type { Locale } from "@cet/shared";
import { EffortMeter, MasteryLadder, MasteryOverview, subjectIdentity } from "@cet/ui";

import { learnI18n, type LearnDictionary } from "./dictionary";
import { MIXED_TOPIC_ID, topicSubjectCode, type PracticeTopic } from "./practice-topics";
import {
  answeredCountText,
  nextStepI18n,
  nextStepTargets,
  nextStepText,
  overviewSummaryI18n,
} from "./practice-progress-text";
import { overviewLevels, type TopicProgress } from "./practice-progress";

/**
 * La caja de la tarjeta, en una constante y no repartida por el JSX: es UNA
 * decisión de diseño —la de `SubjectCard`— y quien la cambie tiene que verla
 * entera. El único color que no está aquí es el del rail, que depende de la
 * materia y viaja por `style`.
 */
const CARD_CLASS = [
  "flex h-full min-h-touch w-full flex-col gap-2",
  "rounded-md border border-line border-s-4 bg-card px-4 py-4",
  "text-ink no-underline shadow-card hover:shadow-pop",
  "transition-shadow duration-slow ease-cet motion-reduce:transition-none",
  "focus-visible:outline-2 focus-visible:outline-offset-2",
].join(" ");

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

      {/* Lista y no divs en rejilla, por lo mismo que `SubjectGrid`: el lector
          anuncia «lista de 10 elementos» antes de entrar. El aspecto de rejilla
          lo pone CSS, que no toca el árbol de accesibilidad. */}
      <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => {
          // `mix` no es un grupo: es un sorteo entre los demás, y sus respuestas
          // se acreditan al grupo real. Ver `practice-progress.ts`.
          const own = topic.id === MIXED_TOPIC_ID ? undefined : progress?.get(topic.id);
          const identity = subjectIdentity(topicSubjectCode(topic));
          return (
            <li key={topic.id} className="m-0 flex">
              <Link
                href={`/practice/${encodeURIComponent(topic.id)}`}
                data-cet-id="practica.elegir-tema"
                data-cet-value={topic.id}
                data-subject={identity.code}
                className={CARD_CLASS}
                style={{ borderInlineStartColor: identity.fill }}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-body-lg font-bold leading-tight">
                    {t.topics[topic.slug]}
                  </span>
                  {own ? (
                    <MasteryLadder
                      level={own.level}
                      groupLabel={learnI18n((d) => d.practice.topics[topic.slug])}
                      size="sm"
                      showLabel
                    />
                  ) : null}
                </span>

                <span className="text-body-sm text-muted">{t.topicHints[topic.slug]}</span>

                {/* La cifra de la que sale todo lo demás. Sin ella el nivel es
                    un oráculo; con ella el alumno puede comprobarlo. */}
                {own ? (
                  <span className="text-body-sm text-muted">
                    {answeredCountText(own.totalAnswered, dictionary)}
                  </span>
                ) : progress !== null && topic.id !== MIXED_TOPIC_ID ? (
                  <span className="text-body-sm text-muted">{t.notPractisedYet}</span>
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
                  <span className="mt-0.5 text-body-sm font-semibold text-ink">
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
