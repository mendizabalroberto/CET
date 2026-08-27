"use client";

/**
 * @cet/ui — IncorrectFeedback.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";
import { LiveRegion } from "../a11y/LiveRegion.js";

export interface IncorrectFeedbackProps {
  /** Titulo. Por defecto "Casi" / "Not quite". */
  readonly title?: I18nText | undefined;
  /**
   * Respuesta correcta en HTML (el `canonical` de `AnswerKey`). Se sanea.
   * En modo examen NO se pasa: la clave no sale de la base de datos hasta la
   * revision.
   */
  readonly correctAnswerHtml?: string | undefined;
  /** Explicacion adicional en HTML. Se sanea. */
  readonly html?: string | undefined;
  /** Boton de reintentar, si el modo lo permite. */
  readonly actions?: ReactNode | undefined;
  readonly announce?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Respuesta incorrecta. El `.fb.no` de los trainers Y6A.
 *
 * TONO. El titulo por defecto es "Casi", no "Incorrecto" ni "Mal". El objetivo
 * de la practica es que el alumno siga intentandolo; un veredicto seco a los 11
 * anos cierra la sesion. Se dice lo que era correcto y por que, y se ofrece
 * seguir. Nada de iconos de prohibido ni de aspas rojas grandes.
 *
 * Contraste: #8e2d22 sobre #fdeeec = 7.30:1 en claro; #ffa39b sobre #2b1512 =
 * 9.00:1 en oscuro.
 */
export function IncorrectFeedback({
  title,
  correctAnswerHtml,
  html,
  actions,
  announce = true,
  className,
}: IncorrectFeedbackProps): ReactNode {
  const t = useI18n();
  const heading = t(title, UI_STRINGS.incorrect);

  return (
    <div
      className={cn(
        "rounded-r-sm border-l-4 border-l-[var(--cet-no-accent)] bg-[var(--cet-no-bg)] px-4 py-3",
        "text-body text-[var(--cet-no-text)]",
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
          <path d="M10 5.5v5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="10" cy="14.2" r="1.1" fill="currentColor" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{heading}</p>
          {correctAnswerHtml ? (
            <p className="mt-1">
              {t(UI_STRINGS.correctAnswerIs)}{" "}
              <span className="cet-prose font-bold">{parseSafeHtml(correctAnswerHtml)}</span>
            </p>
          ) : null}
          {html ? <div className="cet-prose mt-1">{parseSafeHtml(html)}</div> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      {announce ? <LiveRegion message={heading} politeness="polite" /> : null}
    </div>
  );
}
