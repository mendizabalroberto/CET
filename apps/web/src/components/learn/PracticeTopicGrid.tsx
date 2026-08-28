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
 * QUÉ HABÍA AQUÍ, Y POR QUÉ YA NO
 * ===========================================================================
 * El marcado de la tarjeta, escrito a mano en la aplicación: primero píldoras,
 * después una caja parecida a la de `/learn`. Las dos veces era la APP quien
 * decidía cómo se ve una tarjeta, mientras la de materias la decidía el design
 * system. Así es como dos pantallas hermanas del mismo alumno se separan sin
 * que ningún test lo vea.
 *
 * Ahora este fichero no dibuja: TRADUCE. Coge lo que la aplicación sabe —los
 * temas del registro de generadores, el diccionario del alumno y su progreso— y
 * lo convierte en las props que `TopicGrid` espera. El dibujo entero vive en
 * `@cet/ui`, junto al de `/learn` y compartiendo con él la misma caja
 * (`card-chrome.ts`).
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
 * LA SILUETA DICE EL TEMA; EL COLOR, LA MATERIA
 * ===========================================================================
 * `topic` es la clave del dibujo (`simplify`, `compare`, ...) y `subjectCode`
 * la materia de la que sale el color. Son dos cosas distintas a propósito: las
 * diez tarjetas comparten tono porque son todas de Matemáticas, y lo único que
 * distingue un tema de otro sin leer es el medallón. `mix` no pertenece a
 * ninguna materia —es un cruce— y por eso se queda con la identidad neutra.
 *
 * `trackedValue` viaja aparte de `topic` y NO se deriva de él: la analítica
 * lleva guardando la clave del generador (`math.compare`) desde el primer día,
 * y fundirla con la clave de la silueta rompería la serie histórica el día que
 * dejen de coincidir.
 */
import { MasteryOverview, TopicGrid, type TopicCardProps } from "@cet/ui";

import { learnI18n, type LearnDictionary } from "./dictionary";
import { MIXED_TOPIC_ID, topicSubjectCode, type PracticeTopic } from "./practice-topics";
import {
  answeredCountI18n,
  nextStepI18n,
  nextStepTargets,
  overviewSummaryI18n,
} from "./practice-progress-text";
import { overviewLevels, type TopicProgress } from "./practice-progress";

export interface PracticeTopicGridProps {
  readonly topics: readonly PracticeTopic[];
  readonly dictionary: LearnDictionary;
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

  const cards: readonly TopicCardProps[] = topics.map((topic) => {
    // `mix` no es un grupo: es un sorteo entre los demás, y sus respuestas se
    // acreditan al grupo real. Ver `practice-progress.ts`.
    const own = topic.id === MIXED_TOPIC_ID ? undefined : progress?.get(topic.id);

    // "Sin practicar todavía" es un DATO —el alumno no ha respondido nada—, así
    // que solo se escribe cuando la consulta ha respondido. Con `progress` a
    // `null` la tarjeta se queda sin ninguna fila de progreso, que es lo
    // honesto: no lo sabemos.
    const evidenceText =
      own !== undefined
        ? answeredCountI18n(own.totalAnswered)
        : progress !== null && topic.id !== MIXED_TOPIC_ID
          ? learnI18n((d) => d.practice.notPractisedYet)
          : undefined;

    return {
      topic: topic.slug,
      subjectCode: topicSubjectCode(topic),
      name: t.topics[topic.slug],
      hint: t.topicHints[topic.slug],
      href: `/practice/${encodeURIComponent(topic.id)}`,
      trackedValue: topic.id,
      level: own?.level ?? null,
      groupLabel: learnI18n((d) => d.practice.topics[topic.slug]),
      evidenceText,
      // El objetivo y la frase salen del MISMO `nextStep`: si el texto promete
      // tres aciertos y el dibujo enseña cinco círculos, el dibujo es decoración
      // y el alumno aprende a no mirarlo.
      targets: own === undefined ? undefined : nextStepTargets(own.nextStep),
      nextStepText: own === undefined ? undefined : nextStepI18n(own.nextStep),
    };
  });

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

      <TopicGrid topics={cards} className="mt-4" />
    </nav>
  );
}
