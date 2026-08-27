"use client";

/**
 * @cet/ui — MasteryMeter.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
// Los umbrales viven en un modulo SIN "use client": los llama tambien codigo de
// servidor, y exportarlos desde aqui los convertiria en una referencia de
// cliente que revienta al invocarla. Ver la cabecera de `mastery-level.ts`.
import { masteryLevel, type MasteryLevel } from "./mastery-level.js";

export type { MasteryLevel };

export interface MasteryMeterProps {
  /** `skill_mastery.mastery`, de 0 a 1. */
  readonly mastery: number;
  /** Nombre de la destreza. */
  readonly skillLabel: I18nText;
  /**
   * `skill_mastery.confidence`, de 0 a 1. Por debajo de 0.4 se avisa de que hay
   * pocos datos: presentar un dominio del 90 % calculado con dos preguntas es
   * mentirle al alumno y al profesor.
   */
  readonly confidence?: number | undefined;
  readonly lowConfidenceLabel?: I18nText | undefined;
  readonly className?: string | undefined;
}

const LEVEL_STRINGS: Readonly<Record<MasteryLevel, I18nText>> = {
  starting: UI_STRINGS.masteryStarting,
  learning: UI_STRINGS.masteryLearning,
  solid: UI_STRINGS.masterySolid,
  mastered: UI_STRINGS.masteryMastered,
};

/**
 * Rellenos en la variante LEGIBLE de cada color. Medido contra la pista
 * (`--cet-surface-3`), porque 1.4.11 exige 3:1 a un indicador grafico:
 *   ink-muted 4.53 · amber-text 4.93 · teal-text 5.37 · ok-accent 4.38 (claro)
 * La variante decorativa daba 1.81:1 con el ambar, que es un suspenso claro.
 */
const LEVEL_FILL: Readonly<Record<MasteryLevel, string>> = {
  starting: "bg-[var(--cet-ink-muted)]",
  learning: "bg-[var(--cet-amber-text)]",
  solid: "bg-[var(--cet-teal-text)]",
  mastered: "bg-[var(--cet-ok-accent)]",
};

/**
 * Nivel de dominio de una destreza.
 *
 * El estado se dice CON PALABRAS ("Lo llevas bien"), no solo con el color y la
 * longitud de la barra: el color solo incumple WCAG 1.4.1, y una etiqueta como
 * "Aprendiendo" es ademas mas util para un nino que un 47 %.
 */
export function MasteryMeter({
  mastery,
  skillLabel,
  confidence,
  lowConfidenceLabel,
  className,
}: MasteryMeterProps): ReactNode {
  const t = useI18n();
  const clamped = Math.min(Math.max(mastery, 0), 1);
  const level = masteryLevel(clamped);
  const levelText = t(LEVEL_STRINGS[level]);
  const skillText = t(skillLabel);
  const lowConfidence = confidence !== undefined && confidence < 0.4;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body font-semibold text-[var(--cet-ink)]">{skillText}</span>
        <span className="text-body-sm font-semibold text-[var(--cet-ink-muted)]">{levelText}</span>
      </div>

      <div
        role="meter"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${levelText}${lowConfidence ? `. ${t(lowConfidenceLabel)}` : ""}`}
        aria-label={`${t(UI_STRINGS.mastery)}: ${skillText}`}
        className="h-2.5 w-full overflow-hidden rounded-pill bg-[var(--cet-surface-3)]"
      >
        <div
          className={cn(
            "h-full rounded-pill",
            LEVEL_FILL[level],
            "transition-[width] duration-slow ease-cet motion-reduce:transition-none",
          )}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>

      {lowConfidence && lowConfidenceLabel ? (
        <p className="text-body-sm text-[var(--cet-ink-muted)]">{t(lowConfidenceLabel)}</p>
      ) : null}
    </div>
  );
}
