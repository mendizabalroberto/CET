"use client";

/**
 * @cet/ui — ProgressBar.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { Progress } from "../primitives/Progress.js";

export interface ProgressBarProps {
  readonly value: number;
  readonly max?: number | undefined;
  readonly label?: I18nText | undefined;
  /** Texto de valor para el lector ("3 de 12 lecciones"). */
  readonly valueText?: string | undefined;
  /** Muestra el porcentaje al lado de la etiqueta. @default true */
  readonly showValue?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Barra de progreso con etiqueta visible.
 *
 * Envuelve la primitiva `Progress` anadiendo la fila de etiqueta y valor, que es
 * como se usa en el 95 % de los sitios. La cifra se muestra ademas de la barra:
 * una barra sin numero obliga a estimar longitudes, que es justo lo que peor se
 * le da a alguien con baja vision.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  showValue = true,
  className,
}: ProgressBarProps): ReactNode {
  const t = useI18n();
  const safeMax = max > 0 ? max : 100;
  const pct = Math.round((Math.min(Math.max(value, 0), safeMax) / safeMax) * 100);
  const labelText = t(label, UI_STRINGS.progress);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm font-semibold text-[var(--cet-ink)]">{labelText}</span>
        {showValue ? (
          <span aria-hidden="true" className="text-body-sm tabular-nums text-[var(--cet-ink-muted)]">
            {valueText ?? `${pct}%`}
          </span>
        ) : null}
      </div>
      <Progress value={value} max={safeMax} label={label ?? UI_STRINGS.progress} valueText={valueText} />
    </div>
  );
}
