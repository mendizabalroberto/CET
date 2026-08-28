"use client";

/**
 * @cet/ui — SolutionPanel.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { Button } from "../primitives/Button.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";
import { StepList } from "../learning/StepList.js";

export interface SolutionPanelBaseProps {
  /** Explicacion completa en HTML (el `sol:` de los trainers Y6A). Se sanea. */
  readonly html?: string | undefined;
  /** Alternativa estructurada: pasos numerados. */
  readonly steps?: readonly string[] | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
}

/** Ver la nota de `HintPanel`: partido, el `id` lo tiene que dar el llamante. */
type Partido = { readonly part: "trigger" | "panel"; readonly id: string };
type Entero = { readonly part?: "all" | undefined; readonly id?: string | undefined };

export type SolutionPanelProps = SolutionPanelBaseProps & (Partido | Entero);

/**
 * Explicacion paso a paso de la respuesta.
 *
 * Separado de `HintPanel` a proposito: ver la solucion es un evento distinto
 * (`solution_viewed`) y pedagogicamente significa algo distinto que pedir una
 * pista. Mezclarlos falsea la analitica de dificultad.
 *
 * Nunca se abre solo. En un examen con `feedback_mode = 'never'` la aplicacion
 * simplemente no monta este componente: la clave no debe llegar al cliente.
 */
export function SolutionPanel({
  html,
  steps,
  open,
  onOpenChange,
  label,
  className,
  part = "all",
  id,
}: SolutionPanelProps): ReactNode {
  const t = useI18n();
  const generatedId = useId();
  const panelId = `${id ?? generatedId}-solution`;

  if (part === "trigger") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="w-fit"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        {t(label, open ? UI_STRINGS.hideSolution : UI_STRINGS.showSolution)}
      </Button>
    );
  }

  if (part === "panel") {
    return (
      <div id={panelId} hidden={!open}>
        {steps && steps.length > 0 ? (
          <StepList steps={steps.map((stepHtml) => ({ html: stepHtml }))} label={UI_STRINGS.solution} />
        ) : null}
        {html ? (
          <div
            className={cn(
              "cet-prose rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface-2)] px-4 py-3",
              "text-body text-[var(--cet-ink)]",
            )}
          >
            {parseSafeHtml(html)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="w-fit"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        {t(label, open ? UI_STRINGS.hideSolution : UI_STRINGS.showSolution)}
      </Button>

      <div id={panelId} hidden={!open}>
        {steps && steps.length > 0 ? (
          <StepList steps={steps.map((stepHtml) => ({ html: stepHtml }))} label={UI_STRINGS.solution} />
        ) : null}
        {html ? (
          <div
            className={cn(
              "cet-prose rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface-2)] px-4 py-3",
              "text-body text-[var(--cet-ink)]",
            )}
          >
            {parseSafeHtml(html)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
