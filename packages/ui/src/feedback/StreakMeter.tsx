"use client";

/**
 * @cet/ui — StreakMeter.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface StreakMeterProps {
  /** Aciertos seguidos ahora mismo. */
  readonly current: number;
  /** Mejor racha de la sesion. */
  readonly best?: number | undefined;
  /** Objetivo de la racha (los trainers Y6A usan 5 seguidas). @default 5 */
  readonly target?: number | undefined;
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * Racha de aciertos en practica.
 *
 * Diseno deliberadamente contenido: puntos que se llenan hasta el objetivo, sin
 * confeti ni animacion de celebracion. El bucle rapido de practica engancha por
 * el feedback inmediato, no por los efectos; y una animacion grande cada acierto
 * es exactamente lo que `prefers-reduced-motion` existe para evitar.
 *
 * La racha se rompe sin drama: los puntos se vacian, sin color de error. Se
 * anuncia el numero, no un juicio.
 */
export function StreakMeter({
  current,
  best,
  target = 5,
  label,
  className,
}: StreakMeterProps): ReactNode {
  const t = useI18n();
  const safeTarget = Math.max(1, target);
  const filled = Math.min(current, safeTarget);

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--cet-ink-muted)]">
        {t(label, UI_STRINGS.streak)}
      </span>

      <span
        role="meter"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={safeTarget}
        aria-valuetext={`${current}`}
        aria-label={t(label, UI_STRINGS.streak)}
        className="flex items-center gap-1"
      >
        {Array.from({ length: safeTarget }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "h-2.5 w-2.5 rounded-pill border",
              i < filled
                ? "border-[var(--cet-amber-text)] bg-[var(--cet-amber)]"
                : "border-[var(--cet-border-strong)] bg-transparent",
              "transition-colors duration-fast ease-cet motion-reduce:transition-none",
            )}
          />
        ))}
      </span>

      <span className="text-body-sm font-bold tabular-nums text-[var(--cet-ink)]">{current}</span>

      {best === undefined ? null : (
        <span className="text-body-sm text-[var(--cet-ink-muted)]">
          {t(UI_STRINGS.bestStreak)}: <span className="tabular-nums">{best}</span>
        </span>
      )}
    </div>
  );
}
