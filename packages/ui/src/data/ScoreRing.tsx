"use client";

/**
 * @cet/ui — ScoreRing.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface ScoreRingProps {
  /** Puntos obtenidos. */
  readonly value: number;
  /** Puntos posibles. */
  readonly max: number;
  readonly label?: I18nText | undefined;
  /** Diametro en px. @default 140 */
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Nota final del examen, en anillo. El `.result .score` de los trainers Y6A.
 *
 * Detalles que no son cosmeticos:
 *  - la nota se escribe en el centro con numeros grandes; el anillo es el adorno,
 *    no el dato. Quien no distingue el arco sigue leyendo "18 / 20";
 *  - el SVG lleva `role="img"` y un `aria-label` completo ("Nota: 18 de 20,
 *    90 por ciento"), y los textos internos van `aria-hidden` para no duplicar;
 *  - el color del arco no codifica aprobado o suspenso. Esa decision es del
 *    colegio, no del design system, y pintar de rojo un 49 % delante de un nino
 *    es una eleccion que no nos corresponde tomar por defecto.
 */
export function ScoreRing({ value, max, label, size = 140, className }: ScoreRingProps): ReactNode {
  const t = useI18n();
  const id = useId();
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.min(Math.max(value / safeMax, 0), 1);
  const pct = Math.round(ratio * 100);

  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  const labelText = t(label, UI_STRINGS.score);
  const accessibleText = `${labelText}: ${value} ${t(UI_STRINGS.questionOf)} ${max}, ${pct}%`;

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={accessibleText}
        className="block"
      >
        <title id={`${id}-title`}>{accessibleText}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--cet-surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--cet-teal)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          aria-hidden="true"
          fill="var(--cet-ink)"
          fontSize={size * 0.26}
          fontWeight="800"
        >
          {value}
        </text>
        <text
          x="50%"
          y="68%"
          textAnchor="middle"
          dominantBaseline="middle"
          aria-hidden="true"
          fill="var(--cet-ink-muted)"
          fontSize={size * 0.12}
          fontWeight="600"
        >
          / {max}
        </text>
      </svg>
      <p className="text-body-sm font-semibold uppercase tracking-wide text-[var(--cet-ink-muted)]">
        {labelText}
      </p>
    </div>
  );
}
