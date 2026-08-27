"use client";

/**
 * @cet/ui — StepList.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface Step {
  /** HTML del paso, de la base de datos. Se sanea. */
  readonly html: string;
}

export interface StepListProps {
  readonly steps: readonly Step[];
  /** Titulo del bloque. Por defecto "Paso a paso" del diccionario. */
  readonly label?: I18nText | undefined;
  /**
   * Resalta un paso concreto (base 1). Lo usa el visor de soluciones para
   * acompanar al alumno paso a paso.
   */
  readonly highlightStep?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Lista numerada de pasos. Portada de `.steps` de los trainers Y6A.
 *
 * Es un `<ol>` de verdad, no divs con numeros pintados: el lector de pantalla
 * anuncia "lista de 5 elementos, elemento 2", que es exactamente la informacion
 * que un alumno necesita para no perderse a mitad de un procedimiento.
 */
export function StepList({ steps, label, highlightStep, className }: StepListProps): ReactNode {
  const t = useI18n();
  return (
    <section
      aria-label={t(label, UI_STRINGS.blockSteps)}
      className={cn(
        "my-3 rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] p-4",
        className,
      )}
    >
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[var(--cet-ink-muted)]">
        {t(label, UI_STRINGS.blockSteps)}
      </p>
      <ol className="m-0 flex list-decimal flex-col gap-2 pl-6 text-body text-[var(--cet-ink)]">
        {steps.map((step, index) => (
          <li
            key={index}
            aria-current={highlightStep === index + 1 ? "step" : undefined}
            className={cn(
              "cet-prose",
              highlightStep === index + 1 &&
                "rounded-sm bg-[var(--cet-hint-bg)] px-2 py-1 font-semibold",
            )}
          >
            {parseSafeHtml(step.html)}
          </li>
        ))}
      </ol>
    </section>
  );
}
