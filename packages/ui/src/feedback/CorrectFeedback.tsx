"use client";

/**
 * @cet/ui — CorrectFeedback.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";
import { LiveRegion } from "../a11y/LiveRegion.js";

export interface CorrectFeedbackProps {
  /** Titulo. Por defecto "Correcto". */
  readonly title?: I18nText | undefined;
  /** Comentario adicional en HTML de la base de datos. Se sanea. */
  readonly html?: string | undefined;
  /** Racha actual, si la hay. Se muestra como refuerzo, no como presion. */
  readonly streak?: number | undefined;
  /** Anuncia el resultado al lector de pantalla. @default true */
  readonly announce?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Respuesta correcta. El `.fb.ok` de los trainers Y6A.
 *
 * Texto sobre `--cet-ok-text` (#0d5c42) sobre `--cet-ok-bg` (#e7f6ee): 7.16:1.
 * El icono de check es decorativo (`aria-hidden`): quien no ve la pantalla ya
 * recibe la palabra "Correcto" por la region viva.
 */
export function CorrectFeedback({
  title,
  html,
  streak,
  announce = true,
  className,
}: CorrectFeedbackProps): ReactNode {
  const t = useI18n();
  const heading = t(title, UI_STRINGS.correct);

  return (
    <div
      className={cn(
        "rounded-r-sm border-l-4 border-l-[var(--cet-ok-accent)] bg-[var(--cet-ok-bg)] px-4 py-3",
        "text-body text-[var(--cet-ok-text)]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
          className="mt-0.5 h-5 w-5 flex-none"
        >
          <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5.5 10.5 8.5 13.5 14.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{heading}</p>
          {html ? <div className="cet-prose mt-1">{parseSafeHtml(html)}</div> : null}
          {streak !== undefined && streak > 1 ? (
            <p className="mt-1 text-body-sm font-semibold">
              {t(UI_STRINGS.streak)}: {streak}
            </p>
          ) : null}
        </div>
      </div>
      {announce ? <LiveRegion message={heading} politeness="polite" /> : null}
    </div>
  );
}
