"use client";

/**
 * @cet/ui — QuestionCard.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, type ReactNode } from "react";
import type { I18nText, RenderedBody } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { useLocale } from "../lib/i18n.js";
import { SafeSvg } from "../lib/safe-html.js";
import { UI_STRINGS } from "../lib/strings.js";
import { MathStem } from "../learning/MathStem.js";
import { Badge } from "../primitives/Badge.js";
import { resolveI18n } from "@cet/shared";

export interface QuestionCardProps {
  /** Lo que el alumno ve, literal. Se persiste en `attempt_items.rendered_body`. */
  readonly body: RenderedBody;
  /** Posicion en el examen, base 1. */
  readonly ordinal: number;
  readonly total: number;
  /** Puntos que vale. Se muestra solo si viene. */
  readonly maxPoints?: number | undefined;
  /** Controles de respuesta: `ChoiceList`, `NumericInput`, etc. */
  readonly children: ReactNode;
  /** Feedback bajo la respuesta. En examen va vacio hasta la revision. */
  readonly feedback?: ReactNode | undefined;
  /** Marca la pregunta como marcada para revisar. */
  readonly flagged?: boolean | undefined;
  readonly onToggleFlag?: (() => void) | undefined;
  readonly flagLabel?: I18nText | undefined;
  /** `exam` es sobrio; `practice` admite feedback inmediato. @default "exam" */
  readonly mode?: "exam" | "practice" | undefined;
  readonly className?: string | undefined;
}

/**
 * Contenedor de una pregunta. El `.exq` / `.qbox` de los trainers Y6A.
 *
 * Estructura de accesibilidad:
 *  - la tarjeta es un `<article>` con `aria-labelledby` al encabezado
 *    "Pregunta 3 de 12", asi el lector anuncia donde esta el alumno al entrar;
 *  - el enunciado tiene id propio, para que los controles de respuesta se
 *    referencien con `aria-labelledby` y no se lea dos veces;
 *  - si hay figura, `figureAlt` es OBLIGATORIO. Si falta, la figura se marca
 *    `aria-hidden` en vez de anunciarse como "imagen": una etiqueta vacia es
 *    peor que ninguna.
 */
export function QuestionCard({
  body,
  ordinal,
  total,
  maxPoints,
  children,
  feedback,
  flagged = false,
  onToggleFlag,
  flagLabel,
  mode = "exam",
  className,
}: QuestionCardProps): ReactNode {
  const t = useI18n();
  const locale = useLocale();
  const id = useId();
  const headingId = `${id}-heading`;
  const stemId = `${id}-stem`;

  const figureAlt = body.figureAlt ? resolveI18n(body.figureAlt, locale) : "";

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] p-5 shadow-card",
        flagged && "border-[var(--cet-hint-accent)] border-2",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[12px] font-bold uppercase tracking-wide text-[var(--cet-ink-muted)]">
          {t(UI_STRINGS.question)} {ordinal} {t(UI_STRINGS.questionOf)} {total}
        </h2>
        <div className="flex items-center gap-2">
          {maxPoints === undefined ? null : (
            <Badge tone="neutral">
              {maxPoints} {t(UI_STRINGS.points)}
            </Badge>
          )}
          {onToggleFlag ? (
            <button
              type="button"
              onClick={onToggleFlag}
              aria-pressed={flagged}
              className={cn(
                "flex min-h-touch items-center gap-1.5 rounded-sm px-3 text-body-sm font-semibold",
                "border border-[var(--cet-border-strong)] text-[var(--cet-ink)]",
                "hover:bg-[var(--cet-surface-2)]",
                flagged && "border-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] text-[var(--cet-hint-text)]",
              )}
            >
              {t(flagLabel, flagged ? UI_STRINGS.unflag : UI_STRINGS.flagForReview)}
            </button>
          ) : null}
        </div>
      </header>

      <MathStem
        id={stemId}
        html={body.stem}
        size={mode === "practice" ? "large" : "normal"}
        className="mb-4"
      />

      {body.figureSvg ? (
        <SafeSvg
          svg={body.figureSvg}
          // Sin `figureAlt` la figura pasa a decorativa: se oculta al lector en
          // lugar de anunciarse como una imagen sin nombre. Que falte el alt es
          // un defecto del contenido y se corrige en el panel de autoria, donde
          // `media_assets.alt_text` ya es NOT NULL.
          {...(figureAlt === "" ? { decorative: true } : { label: figureAlt })}
          className="mb-4 rounded-md border border-[var(--cet-line)] p-3 text-center [&_svg]:h-auto [&_svg]:max-w-full"
        />
      ) : null}

      {/* `role="group"` no es decorativo: los `aria-*` sobre un div sin rol se
          ignoran, y este envoltorio existe justamente para atar los controles
          de respuesta al enunciado. */}
      <div role="group" aria-labelledby={stemId}>
        {children}
      </div>

      {feedback ? <div className="mt-4">{feedback}</div> : null}
    </article>
  );
}
