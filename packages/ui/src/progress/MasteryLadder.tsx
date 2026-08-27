"use client";

/**
 * @cet/ui — MasteryLadder: el nivel de un grupo de practica, en cuatro peldanos.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE PELDANOS Y NO UN ANILLO NI UN PORCENTAJE
 * ===========================================================================
 * Este indicador va DENTRO de un chip de tema. En `/practice` hay diez chips en
 * una fila que hace wrap, y en un movil de colegio caben dos por linea. Eso
 * descarta las dos formas obvias:
 *
 *  - Un anillo necesita 28-36 px de alto y de ancho. Multiplicado por diez chips
 *    es una fila mas de scroll en movil, y un anillo alrededor de una pildora es
 *    una geometria que no cierra.
 *  - Una barra proporcional dentro del chip NO es comparable entre chips: los
 *    chips miden lo que mide su etiqueta ("Comparar" contra "+ - x / fracciones"),
 *    asi que el mismo 60 % se pinta con dos longitudes distintas y el alumno
 *    compara mal. Es un grafico con el eje cambiando en cada barra.
 *
 * Cuatro peldanos discretos miden SIEMPRE lo mismo (25 px de ancho, 14 de alto,
 * y ni un pixel de alto extra en el chip, que ya es `min-h-11`), son comparables
 * de un vistazo entre chips, y hablan el vocabulario que el resto de la app ya
 * usa: los cuatro tramos de `masteryLevel()`. Un 47 % no le dice nada a un nino
 * de once anos; "te falta un peldano" si.
 *
 * ===========================================================================
 * NO SE DISTINGUE POR COLOR (WCAG 1.4.1)
 * ===========================================================================
 * El nivel NO se codifica con el tono: se codifica con CUANTOS peldanos estan
 * llenos y con su altura creciente. Los llenos van macizos y los vacios en
 * contorno, que es una diferencia de forma, no de color. Por eso este fichero no
 * tiene ningun `Record<Nivel, clase-de-color>`: no hay nada que declarar en
 * `estados-no-solo-color.test.tsx` porque no hay ningun estado que dependa del
 * color. Y ademas del dibujo va siempre la PALABRA del nivel en el nombre
 * accesible.
 *
 * ===========================================================================
 * SIN DATOS NO SE PINTA NADA
 * ===========================================================================
 * `level === null` devuelve `null`. Deliberadamente no existe un "nivel cero"
 * que dibuje cuatro peldanos vacios: un indicador que se pinta igual haya datos
 * o no es exactamente la barra decorativa que este repositorio persigue, y
 * ademas le dice a un alumno que no ha empezado que va mal. Ver
 * `__tests__/progreso-viene-de-datos.test.tsx`.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { masteryLevel, type MasteryLevel } from "../data/mastery-level.js";

/** El orden de los peldanos. Es el mismo de `masteryLevel()`, y por eso vale 1..4. */
export const MASTERY_STEPS: readonly MasteryLevel[] = [
  "starting",
  "learning",
  "solid",
  "mastered",
];

const LEVEL_STRINGS: Readonly<Record<MasteryLevel, I18nText>> = {
  starting: UI_STRINGS.masteryStarting,
  learning: UI_STRINGS.masteryLearning,
  solid: UI_STRINGS.masterySolid,
  mastered: UI_STRINGS.masteryMastered,
};

/** Peldanos ganados, 1..4. */
export function ladderSteps(level: MasteryLevel): number {
  return MASTERY_STEPS.indexOf(level) + 1;
}

export interface MasteryLadderProps {
  /**
   * Nivel ya derivado de datos reales. `null` cuando no hay evidencia
   * suficiente: entonces el componente NO pinta nada.
   */
  readonly level: MasteryLevel | null;
  /** Nombre del grupo. Entra en el nombre accesible ("Comparar: Lo llevas bien"). */
  readonly groupLabel: I18nText;
  /** `sm` va dentro de un chip; `md` encabeza la pantalla del tema activo. */
  readonly size?: "sm" | "md" | undefined;
  /**
   * Escribe ADEMAS la palabra del nivel al lado del dibujo.
   *
   * La palabra sale de `UI_STRINGS`, la misma fuente que usa `MasteryMeter`: si
   * la aplicacion la duplicara en su diccionario, el dia que cambie "Lo llevas
   * bien" habria dos vocabularios distintos para el mismo nivel en dos
   * pantallas. Donde cabe (la parrilla de `/practice`) se enciende; dentro de un
   * chip no cabe y el nivel viaja en el nombre accesible.
   */
  readonly showLabel?: boolean | undefined;
  readonly className?: string | undefined;
}

const GEOMETRY = {
  sm: { bar: 4, gap: 3, min: 5, step: 3 },
  md: { bar: 7, gap: 5, min: 9, step: 6 },
} as const;

export function MasteryLadder({
  level,
  groupLabel,
  size = "sm",
  showLabel = false,
  className,
}: MasteryLadderProps): ReactNode {
  const t = useI18n();
  const id = useId();

  // Sin nivel no hay dibujo. Ver la cabecera.
  if (level === null) return null;

  const g = GEOMETRY[size];
  const earned = ladderSteps(level);
  const width = MASTERY_STEPS.length * g.bar + (MASTERY_STEPS.length - 1) * g.gap;
  const height = g.min + (MASTERY_STEPS.length - 1) * g.step;
  const levelText = t(LEVEL_STRINGS[level]);
  const accessibleText = `${t(groupLabel)}: ${levelText} (${earned}/${MASTERY_STEPS.length})`;

  const ladder = (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${id}-title`}
      className={cn("block shrink-0", showLabel ? undefined : className)}
    >
      <title id={`${id}-title`}>{accessibleText}</title>
      {MASTERY_STEPS.map((step, index) => {
        const barHeight = g.min + index * g.step;
        const filled = index < earned;
        return (
          <rect
            key={step}
            x={index * (g.bar + g.gap)}
            y={height - barHeight}
            width={g.bar}
            height={barHeight}
            rx={g.bar / 2}
            // Ganado = macizo con contorno continuo. Pendiente = hueco con
            // contorno DISCONTINUO. Son dos diferencias de forma (relleno y
            // trazo), ninguna de tono: el tono es el mismo en los cuatro, asi
            // que quien no distingue colores sigue contando cuantos hay llenos.
            // El guion no es adorno: es lo que hace que los cuatro niveles se
            // distingan tambien en una impresion en blanco y negro o con el
            // filtro de escala de grises del sistema.
            // `currentColor`, y no un token fijo.
            //
            // Medido: con `--cet-teal-text` fijo, la escalera dentro del chip
            // ACTIVO —que va en inverso, tinta sobre `--cet-ink`— daba 2.9:1.
            // WCAG 1.4.11 pide 3:1 a un indicador grafico, asi que en el unico
            // chip que el alumno esta mirando la escalera era la que peor se
            // veia. Heredando el color del texto, el contraste de la escalera es
            // por construccion el mismo que el del rotulo que tiene al lado, que
            // ya esta validado en los dos fondos. Y no se pierde nada: el nivel
            // no lo codifica el tono, lo codifican el numero de peldanos, su
            // altura y el trazo.
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray={filled ? undefined : "2 2"}
            opacity={filled ? 1 : 0.65}
          />
        );
      })}
    </svg>
  );

  if (!showLabel) return ladder;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {ladder}
      {/* El dibujo ya lleva el nivel en su <title>; escribirlo otra vez para el
          lector lo diria dos veces. Visualmente si tiene que estar: es el canal
          que no depende ni del color ni de contar barritas. */}
      <span aria-hidden="true" className="text-body-sm font-semibold text-[var(--cet-ink-muted)]">
        {levelText}
      </span>
    </span>
  );
}

/**
 * Atajo para quien tiene el `mastery` 0..1 en vez del nivel. Mantiene una sola
 * fuente de umbrales: los de `masteryLevel()`.
 */
export function ladderLevelFor(mastery: number | null): MasteryLevel | null {
  return mastery === null ? null : masteryLevel(mastery);
}
