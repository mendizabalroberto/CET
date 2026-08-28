"use client";

/**
 * @cet/ui — HintPanel.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { Button } from "../primitives/Button.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface HintPanelProps {
  /** Texto de la pista, ya resuelto a HTML. Se sanea. */
  readonly html: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
  readonly part?: "all" | "trigger" | "panel" | undefined;
  readonly id?: string | undefined;
}

type Partido = { readonly part: "trigger" | "panel"; readonly id: string };
type Entero = { readonly part?: "all" | undefined; readonly id?: string | undefined };

/**
 * Pista bajo demanda. El `.fb.hint` de los trainers Y6A.
 *
 * Es un desplegable explicito, no algo que aparezca solo: pedir la pista es un
 * evento de aprendizaje (`hint_requested` en `learning_events`) y tiene que
 * partir del alumno. El boton y el panel estan cableados con `aria-expanded` y
 * `aria-controls`, asi que un lector de pantalla sabe que hay contenido
 * asociado antes de abrirlo.
 */
export function HintPanel({ html, open, onOpenChange, label, className, part = "all", id }: HintPanelProps): ReactNode {
  const t = useI18n();
  const generatedId = useId();
  const panelId = `${id ?? generatedId}-hint`;

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
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--cet-hint-vivid)]" />
        {t(label, open ? UI_STRINGS.hint : UI_STRINGS.showHint)}
      </Button>
    );
  }

  if (part === "panel") {
    return (
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "rounded-r-sm border-l-4 border-l-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-4 py-3",
          "text-body text-[var(--cet-hint-text)]",
        )}
      >
        <div className="cet-prose">{parseSafeHtml(html)}</div>
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
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--cet-hint-vivid)]" />
        {t(label, open ? UI_STRINGS.hint : UI_STRINGS.showHint)}
      </Button>

      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "rounded-r-sm border-l-4 border-l-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-4 py-3",
          "text-body text-[var(--cet-hint-text)]",
        )}
      >
        <div className="cet-prose">{parseSafeHtml(html)}</div>
      </div>
    </div>
  );
}
