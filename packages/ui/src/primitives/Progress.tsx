"use client";

/**
 * @cet/ui — Progress.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixProgress from "@radix-ui/react-progress";
import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

export interface ProgressProps {
  /** Valor actual, 0..max. */
  readonly value: number;
  /** @default 100 */
  readonly max?: number | undefined;
  /** Nombre accesible de la barra. Obligatorio. */
  readonly label: I18nText;
  /**
   * Texto que sustituye al porcentaje para el lector de pantalla
   * ("3 de 12 preguntas"). Sin esto se anuncia un porcentaje seco.
   */
  readonly valueText?: string | undefined;
  /** @default "md" */
  readonly size?: "sm" | "md" | undefined;
  readonly className?: string | undefined;
}

/**
 * Barra de progreso primitiva. El `.bar` de los trainers Y6A.
 *
 * El relleno usa el degradado teal -> ambar del original. Ambos son colores
 * decorativos: la informacion la lleva `aria-valuenow` y `valueText`, nunca el
 * color.
 */
export function Progress({
  value,
  max = 100,
  label,
  valueText,
  size = "md",
  className,
}: ProgressProps): ReactNode {
  const t = useI18n();
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = (clamped / safeMax) * 100;

  return (
    <RadixProgress.Root
      value={clamped}
      max={safeMax}
      aria-label={t(label)}
      aria-valuetext={valueText}
      className={cn(
        "relative w-full overflow-hidden rounded-pill bg-[var(--cet-surface-3)]",
        size === "sm" ? "h-1.5" : "h-2.5",
        className,
      )}
    >
      <RadixProgress.Indicator
        className={cn(
          "h-full rounded-pill",
          // Degradado teal -> ambar como en Y6A, pero con las variantes
          // legibles: la decorativa daba 1.81:1 contra la pista y 1.4.11 exige
          // 3:1 a un indicador grafico. Con estas: 5.37 y 4.93.
          "bg-[linear-gradient(90deg,var(--cet-teal-text),var(--cet-amber-text))]",
          "transition-[width] duration-slow ease-cet motion-reduce:transition-none",
        )}
        style={{ width: `${pct}%` }}
      />
    </RadixProgress.Root>
  );
}
