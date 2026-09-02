"use client";

/**
 * @cet/ui — StudyScorecard: el informe de esfuerzo de un alumno, montado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE ES Y QUE NO ES
 * ===========================================================================
 * Es el ORDEN de lectura del scorecard, no un componente con logica: recibe
 * cinco grupos de datos ya calculados y monta un panel por grupo. Presentacional
 * puro; no sabe de rutas, ni de consultas, ni de fechas. Existe para que las dos
 * pantallas que lo monten —la del profesor y cualquier vista previa— no vuelvan
 * a decidir cada una su orden, que es como /learn y /practice divergieron.
 *
 * El orden va de lo que se contesta de un vistazo a lo que hay que leer:
 *
 *   1. Las cifras (minutos, sesiones, lecciones, acierto, racha). Son `StatTile`
 *      —texto— y NO llevan dibujo. Un medidor al lado de «74 % de acierto»
 *      diria en barritas lo que la cifra ya dice en numeros, y eso es decoracion
 *      (la misma razon por la que los circulos del `EffortMeter` salieron de
 *      `TopicCard` el 28 de agosto).
 *   2. La constancia: la unica pregunta que las cifras no pueden responder.
 *   3. El reloj del dia: a que hora estudia. Va pegado a la constancia porque
 *      las dos hablan del tiempo, y esta contesta el «¿cuando?» que aquella
 *      deja abierto — leerlas seguidas es leer una sola idea.
 *   4. Esfuerzo contra resultado: «¿le cunde?», que solo tiene sentido despues
 *      de haber visto cuanto tiempo echa. Antes de las destrezas porque sigue
 *      hablando de tiempo; las destrezas cambian de tema.
 *   5. Las destrezas: donde va fuerte y donde flojo.
 *   6. La clase: solo si la cohorte da (ver `scorecard-data.ts`).
 *   7. El reparto del tiempo por leccion: el detalle, al final.
 *
 * ===========================================================================
 * UN PANEL SIN CONTENIDO NO SE MONTA
 * ===========================================================================
 * Cada hijo devuelve `null` cuando sus datos no dan para pintar («todos los dias
 * sin registro», «ninguna destreza medida»). Si el panel se montara igual,
 * quedaria un medallon con un titulo y un hueco debajo: exactamente el «hueco
 * vacio» que la casa considera peor que la ausencia. Por eso las mismas
 * funciones que usan los hijos para callarse —`haySerieDeEsfuerzo`,
 * `hayDestrezasMedidas`, `hayTiempoPorLeccion`— se consultan aqui antes de
 * montar. No son dos criterios que hay que mantener en paralelo: es uno.
 *
 * ===========================================================================
 * EL NOMBRE DEL ALUMNO VA SOLO EN SU FILA
 * ===========================================================================
 * La cabecera es el `h2` con el nombre y nada mas. Ni la racha, ni un semaforo,
 * ni «va bien»: obs003 documenta lo que pasa cuando un nombre comparte fila con
 * un indicador, y los nombres de alumno con dos apellidos son largos.
 *
 * ===========================================================================
 * LAS PROPS SE PASAN UNA A UNA, Y ESO TIENE UN FILO
 * ===========================================================================
 * Cada grupo llega como `ConTitulo<XProps>` —las props del dibujo MAS el titulo
 * de su panel—, asi que no se puede hacer `<EffortTrend {...effort} />`: el
 * `title` es del panel, no del dibujo, y colarselo seria pasarle una prop que no
 * conoce. Por eso van enumeradas.
 *
 * EL FILO: una prop nueva en un dibujo compila y no llega. El tipo la admite
 * —viaja en `effort`— y el JSX de aqui simplemente no la reenvia, asi que no
 * falla nada: la aplicacion la pasa, el compilador calla y la pantalla sale sin
 * eje. Paso exactamente eso con `yTicks` y `peakText` el dia que se anadieron.
 * Al tocar las props de cualquier dibujo de esta carpeta, este fichero es la
 * segunda parada obligatoria.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni un literal de cara al usuario. Los titulos de seccion entran como
 * `I18nText`; los que la aplicacion no pase dejan su panel sin cabecera en vez
 * de escribir un rotulo inventado en un idioma.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { StatTile } from "../data/StatTile.js";

import { ScorecardPanel } from "./ScorecardPanel.js";
import { EffortTrend, type EffortTrendProps } from "./EffortTrend.js";
import { DailyRhythm, type DailyRhythmProps } from "./DailyRhythm.js";
import {
  EffortOutcomeScatter,
  type EffortOutcomeScatterProps,
} from "./EffortOutcomeScatter.js";
import { SkillList, type SkillListProps } from "./SkillList.js";
import { CohortComparison, type CohortComparisonProps } from "./CohortComparison.js";
import { LessonTimeBreakdown, type LessonTimeBreakdownProps } from "./LessonTimeBreakdown.js";
import {
  hayCohorteSuficiente,
  hayDestrezasMedidas,
  hayDispersionSuficiente,
  hayRitmoDiario,
  haySerieDeEsfuerzo,
  hayTiempoPorLeccion,
} from "./scorecard-data.js";

/** Una cifra del encabezado. El formato del numero lo decide quien llama. */
export interface ScorecardStat {
  /** El valor ya formateado con su locale («128», «74 %», «1 h 05 min»). */
  readonly value: string;
  readonly label: I18nText;
  /** Lectura larga para el lector cuando el valor es un simbolo o abreviatura. */
  readonly valueText?: string | undefined;
}

/** Un grupo con su titulo de seccion. */
type ConTitulo<T> = T & { readonly title?: I18nText | undefined };

export interface StudyScorecardProps {
  /** `subjects.code`: da rail, medallon y lavado a todos los paneles. */
  readonly subjectCode: string;
  /** Nombre del alumno, ya resuelto por la aplicacion. Encabeza el informe. */
  readonly studentName: string;
  /** Titulo del panel de cifras. */
  readonly statsTitle?: I18nText | undefined;
  /** Minutos, sesiones, lecciones abiertas y terminadas, acierto, racha maxima. */
  readonly stats?: readonly ScorecardStat[] | undefined;
  /** La constancia diaria. */
  readonly effort?: ConTitulo<EffortTrendProps> | undefined;
  /** A que hora del dia estudia. Se oculta solo si no hay ni un minuto medido. */
  readonly rhythm?: ConTitulo<DailyRhythmProps> | undefined;
  /** Esfuerzo contra resultado. Se oculta solo si hay pocos dias. */
  readonly outcome?: ConTitulo<EffortOutcomeScatterProps> | undefined;
  /** Areas fortalecidas y flojas. */
  readonly skills?: ConTitulo<SkillListProps> | undefined;
  /** La comparacion con la clase. Se oculta sola si la cohorte no da. */
  readonly cohort?: ConTitulo<CohortComparisonProps> | undefined;
  /** El reparto del tiempo por leccion. */
  readonly lessons?: ConTitulo<LessonTimeBreakdownProps> | undefined;
  readonly className?: string | undefined;
}

export function StudyScorecard({
  subjectCode,
  studentName,
  statsTitle,
  stats,
  effort,
  rhythm,
  outcome,
  skills,
  cohort,
  lessons,
  className,
}: StudyScorecardProps): ReactNode {
  /* Las mismas condiciones que usan los hijos para callarse. Ver la cabecera. */
  const hayCifras = stats !== undefined && stats.length > 0;
  const hayEsfuerzo = effort !== undefined && haySerieDeEsfuerzo(effort.series);
  const hayHoras = rhythm !== undefined && hayRitmoDiario(rhythm.hours);
  /* La dispersion tiene DOS motivos para aparecer, igual que la comparacion con
     la clase: o hay dias suficientes y se pinta, o no los hay y hay que explicar
     por que no esta. Sin la frase que lo explica, el panel no se monta. */
  const hayNube =
    outcome !== undefined &&
    (hayDispersionSuficiente(outcome.points) || outcome.tooFewText !== undefined);
  const hayDestrezas = skills !== undefined && hayDestrezasMedidas(skills.items);
  const hayLecciones = lessons !== undefined && hayTiempoPorLeccion(lessons.items);
  /* La comparacion tiene DOS motivos para aparecer: o hay cohorte suficiente y
     se pinta, o no la hay y hay que explicar por que no esta. Sin la frase que
     lo explica, el panel no se monta: ver `CohortComparison`. */
  const hayCohorte =
    cohort !== undefined &&
    (hayCohorteSuficiente(cohort.cohortSize) || cohort.tooSmallText !== undefined);

  return (
    <div data-cet-informe="scorecard" className={cn("flex flex-col gap-4", className)}>
      {/* La cabecera: el nombre, y nada mas en su fila. Ver la cabecera del
          fichero. Va fuera de los paneles porque encabeza a todos. */}
      <h2 className="m-0 text-body-lg font-bold leading-tight">{studentName}</h2>

      {hayCifras ? (
        <ScorecardPanel subjectCode={subjectCode} title={statsTitle}>
          {/* Fila de baldosas. Cada `StatTile` trae su propio fondo
              `--cet-surface`, que es donde la tinta atenuada de su etiqueta esta
              medida; sobre el lavado del panel no lo estaria. */}
          <div className="flex flex-wrap gap-2">
            {stats.map((cifra, index) => (
              <StatTile
                key={`${index}-${cifra.value}`}
                value={cifra.value}
                label={cifra.label}
                valueText={cifra.valueText}
              />
            ))}
          </div>
        </ScorecardPanel>
      ) : null}

      {hayEsfuerzo ? (
        <ScorecardPanel subjectCode={subjectCode} title={effort.title}>
          <EffortTrend
            series={effort.series}
            summary={effort.summary}
            yTicks={effort.yTicks}
            peakText={effort.peakText}
          />
        </ScorecardPanel>
      ) : null}

      {hayHoras ? (
        <ScorecardPanel subjectCode={subjectCode} title={rhythm.title}>
          <DailyRhythm
            hours={rhythm.hours}
            summary={rhythm.summary}
            yTicks={rhythm.yTicks}
            peakText={rhythm.peakText}
          />
        </ScorecardPanel>
      ) : null}

      {hayNube ? (
        <ScorecardPanel subjectCode={subjectCode} title={outcome.title}>
          <EffortOutcomeScatter
            points={outcome.points}
            summary={outcome.summary}
            xAxisLabel={outcome.xAxisLabel}
            yAxisLabel={outcome.yAxisLabel}
            xMaxText={outcome.xMaxText}
            yMaxText={outcome.yMaxText}
            xTicks={outcome.xTicks}
            yTicks={outcome.yTicks}
            tooFewText={outcome.tooFewText}
          />
        </ScorecardPanel>
      ) : null}

      {hayDestrezas ? (
        <ScorecardPanel subjectCode={subjectCode} title={skills.title}>
          <SkillList items={skills.items} />
        </ScorecardPanel>
      ) : null}

      {hayCohorte ? (
        <ScorecardPanel subjectCode={subjectCode} title={cohort.title}>
          <CohortComparison
            cohortSize={cohort.cohortSize}
            studentLabel={cohort.studentLabel}
            studentValueText={cohort.studentValueText}
            studentRatio={cohort.studentRatio}
            classLabel={cohort.classLabel}
            classValueText={cohort.classValueText}
            classRatio={cohort.classRatio}
            tooSmallText={cohort.tooSmallText}
            summary={cohort.summary}
          />
        </ScorecardPanel>
      ) : null}

      {hayLecciones ? (
        <ScorecardPanel subjectCode={subjectCode} title={lessons.title}>
          <LessonTimeBreakdown items={lessons.items} />
        </ScorecardPanel>
      ) : null}
    </div>
  );
}
