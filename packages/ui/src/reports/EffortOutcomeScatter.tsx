"use client";

/**
 * @cet/ui — EffortOutcomeScatter: ¿le cunde el tiempo que echa?
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ES OTRA PREGUNTA, NO OTRA VISTA DE LA MISMA
 * ===========================================================================
 * `EffortTrend` responde «¿cuanto tiempo echa?» y `DailyRhythm` «¿a que hora?».
 * Ninguna de las dos responde la que de verdad preocupa a un padre a la tercera
 * semana: «lleva una hora ahi sentado, ¿le esta sirviendo de algo?». Para eso
 * hacen falta las dos magnitudes CRUZADAS —el tiempo de un dia contra lo que
 * salio de ese dia—, y ese cruce no se ve en ninguna serie por separado: un
 * alumno que sube minutos y baja resultados dibuja dos lineas que suben y bajan
 * cada una a su aire, y hay que superponerlas mentalmente para ver el problema.
 *
 * Por eso es una nube y no dos series: cada dia es UN punto, y la relacion —o la
 * ausencia de relacion, que tambien es una respuesta— es la forma de la nube.
 *
 * ===========================================================================
 * NO SE PINTA NINGUNA RECTA DE TENDENCIA
 * ===========================================================================
 * Y es la decision mas importante de este fichero. Una recta ajustada sobre
 * cuatro o siete puntos tiene el aspecto de una conclusion —limpia, con
 * pendiente, dibujada con la misma tinta que los datos— y no lo es: con esos
 * tamanos la pendiente la decide practicamente cualquier dia suelto. El tutor no
 * tiene forma de saber que esa raya vale menos que los puntos que la rodean, asi
 * que leeria «esta demostrado que cuanto mas estudia, mas cunde». Los puntos se
 * dejan solos y quien saca la conclusion es quien mira.
 *
 * ===========================================================================
 * POR DEBAJO DE UN MINIMO DE DIAS NO SE PINTA NADA
 * ===========================================================================
 * El umbral y su porque viven en `scorecard-data.ts` (`MIN_DIAS_DISPERSION`).
 * En resumen: por dos puntos pasa exactamente una recta, asi que con dos dias la
 * nube dibuja SIEMPRE una tendencia perfecta que no existe. Es la misma regla
 * que la de `MIN_COHORTE` en `CohortComparison` y se resuelve igual: la nube se
 * retira ENTERA, y en su lugar va la frase que explica por que no esta —si la
 * aplicacion la pasa—. Sin frase, un bloque que aparece y desaparece sin decir
 * nada se reporta como fallo y se «arregla» bajando el umbral.
 *
 * ===========================================================================
 * DOS EJES INDEPENDIENTES, CADA UNO CON SU ESCALA Y SU TOPE ESCRITO
 * ===========================================================================
 * Al reves que en `CohortComparison`, aqui las dos magnitudes llegan en bruto:
 * son cosas distintas —minutos y lecciones— y no hay ninguna comparacion entre
 * ellas que una escala comun pudiera falsear. Cada eje se normaliza contra su
 * propio maximo, que sale de los propios datos.
 *
 * Y como no hay rejilla numerada, el TOPE DE CADA EJE va escrito («60 min»,
 * «3 lecciones»): sin el, la nube dice la forma pero no la magnitud, y dos
 * semanas distintas se pintarian identicas. El origen es cero en los dos ejes
 * siempre; empezar un eje por encima de cero exagera las diferencias, que es el
 * engano de grafica mas repetido que hay.
 *
 * ===========================================================================
 * SIN COLOR NO SE PIERDE NADA
 * ===========================================================================
 * Una sola serie, un solo tono heredado (`currentColor`), todos los puntos
 * identicos. No hay ningun estado codificado en el color porque no hay estados:
 * lo que distingue a un punto de otro es su POSICION, que se ve igual en escala
 * de grises. Los ejes van al mismo tono muy atenuado: son rejilla, no dato.
 *
 * ===========================================================================
 * LO QUE OYE QUIEN NO VE LA NUBE
 * ===========================================================================
 * El resumen —nombre accesible del grupo y ademas escrito— y la lista de los
 * dias con su par de cifras, oculta a la vista y ya redactada por la aplicacion.
 * Una nube de puntos es de lo menos accesible que existe: sin la lista, quien
 * usa lector de pantalla se queda con la frase y nada mas, y la frase es un
 * resumen, no los datos.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni un literal aqui dentro. Los rotulos de los ejes, sus topes, la frase de
 * cada dia y el resumen llegan redactados y formateados por la aplicacion.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";
import {
  hayDispersionSuficiente,
  puntosDeDispersion,
  type EffortOutcomePoint,
} from "./scorecard-data.js";

/** Lienzo. Cabe entero en un movil de 360 sin escalar. */
const ANCHO = 216;
const ALTO = 132;
/** Margen izquierdo: el sitio del eje vertical. */
const IZQUIERDA = 8;
/** Margen inferior: el sitio del eje horizontal. */
const ABAJO = 8;
/** Aire arriba y a la derecha para que un punto en el maximo no salga cortado. */
const AIRE = 8;
/** Radio del punto. Dos dias con los mismos minutos se solapan y se ve que son dos. */
const RADIO = 4;

export interface EffortOutcomeScatterProps {
  /** Un punto por dia. Los dias sin esfuerzo no entran: ver `scorecard-data`. */
  readonly points: readonly EffortOutcomePoint[];
  /** La nube contada en una frase, ya redactada. Nombre accesible del grupo. */
  readonly summary: I18nText;
  /** Que mide el eje horizontal («Minutos estudiados»). */
  readonly xAxisLabel: I18nText;
  /** Que mide el eje vertical («Lecciones terminadas»). */
  readonly yAxisLabel: I18nText;
  /** El tope del eje horizontal, con sus unidades y ya formateado («60 min»). */
  readonly xMaxText: string;
  /** El tope del eje vertical, con sus unidades y ya formateado («3 lecciones»). */
  readonly yMaxText: string;
  /**
   * La frase que explica que no hay nube porque hay pocos dias. Sin ella, con
   * pocos dias no se pinta nada en absoluto.
   */
  readonly tooFewText?: I18nText | undefined;
  readonly className?: string | undefined;
}

export function EffortOutcomeScatter({
  points,
  summary,
  xAxisLabel,
  yAxisLabel,
  xMaxText,
  yMaxText,
  tooFewText,
  className,
}: EffortOutcomeScatterProps): ReactNode {
  const t = useI18n();
  const id = useId();

  /* La puerta. Ver la cabecera y `scorecard-data.ts`. */
  if (!hayDispersionSuficiente(points)) {
    const aviso = t(tooFewText);
    if (aviso.length === 0) return null;
    return (
      <p data-cet-dispersion="oculta" className={cn("m-0 text-body-sm font-semibold", className)}>
        {aviso}
      </p>
    );
  }

  const utiles = puntosDeDispersion(points);
  const maxX = Math.max(...utiles.map((p) => p.x), 1);
  const maxY = Math.max(...utiles.map((p) => p.y), 1);

  const x0 = IZQUIERDA + RADIO;
  const x1 = ANCHO - AIRE;
  const y0 = AIRE;
  const y1 = ALTO - ABAJO - RADIO;

  /* El origen es cero en los dos ejes, siempre. Ver la cabecera. */
  const px = (v: number): number => x0 + (v / maxX) * (x1 - x0);
  const py = (v: number): number => y1 - (v / maxY) * (y1 - y0);

  const texto = t(summary);

  return (
    <div
      data-cet-dispersion="visible"
      className={cn("flex flex-col gap-2", className)}
      role="group"
      aria-labelledby={`${id}-resumen`}
    >
      {/* El resumen nombra al grupo entero y ademas se lee. */}
      <p id={`${id}-resumen`} className="m-0 text-body-sm font-semibold">
        {texto}
      </p>

      {/* El eje vertical se rotula ARRIBA y en horizontal, no girado noventa
          grados al costado. Un texto vertical no se lee de un vistazo, y ademas
          «Lecciones terminadas» giradas obligarian a reservar ancho que en un
          movil de 360 no sobra. El tope va al lado, que es su magnitud. */}
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body-sm">
        <span className="font-semibold">{t(yAxisLabel)}</span>
        <span className="tabular-nums opacity-80">{yMaxText}</span>
      </p>

      <svg
        width={ANCHO}
        height={ALTO}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        // El dibujo NO es el nombre accesible: el grupo entero ya se llama con el
        // resumen, y la lista de abajo trae los datos. Anunciarlo otra vez seria
        // decir la misma frase tres veces seguidas.
        aria-hidden="true"
        className="block max-w-full overflow-visible"
        preserveAspectRatio="xMinYMin meet"
      >
        {/* Los dos ejes. Rejilla: mismo tono, muy atenuados, un pixel. */}
        <line
          x1={IZQUIERDA}
          y1={y0 - AIRE / 2}
          x2={IZQUIERDA}
          y2={ALTO - ABAJO}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.35}
        />
        <line
          x1={IZQUIERDA}
          y1={ALTO - ABAJO}
          x2={ANCHO}
          y2={ALTO - ABAJO}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.35}
        />

        {utiles.map((punto, index) => (
          <circle
            key={`${index}-${punto.x}-${punto.y}`}
            data-cet-punto="dia"
            cx={px(punto.x)}
            cy={py(punto.y)}
            r={RADIO}
            fill="currentColor"
            // Dos dias parecidos se solapan; con algo de transparencia el
            // solape se ve mas oscuro y deja de leerse como un solo dia.
            opacity={0.8}
          />
        ))}
      </svg>

      {/* El rotulo del eje horizontal, debajo del eje que describe. */}
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body-sm">
        <span className="font-semibold">{t(xAxisLabel)}</span>
        <span className="tabular-nums opacity-80">{xMaxText}</span>
      </p>

      {/* La alternativa a la nube: los dias, uno a uno. Ver la cabecera. */}
      <VisuallyHidden as="div">
        <ul data-cet-lista="dias-de-dispersion">
          {utiles.map((punto, index) => (
            <li key={`${index}-${punto.x}-${punto.y}`}>{t(punto.label)}</li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  );
}
