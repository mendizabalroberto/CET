/**
 * @cet/ui — Badge.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Todos los tonos usan la variante LEGIBLE del color, no la decorativa:
 * `--cet-teal` sobre blanco da 3.44:1 y no vale para texto.
 */
const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: "bg-[var(--cet-surface-3)] text-[var(--cet-ink)] border-[var(--cet-line)]",
  info: "bg-[var(--cet-rule-bg)] text-[var(--cet-teal-text)] border-[var(--cet-teal-text)]",
  success: "bg-[var(--cet-ok-bg)] text-[var(--cet-ok-text)] border-[var(--cet-ok-accent)]",
  warning: "bg-[var(--cet-hint-bg)] text-[var(--cet-hint-text)] border-[var(--cet-hint-accent)]",
  danger: "bg-[var(--cet-no-bg)] text-[var(--cet-no-text)] border-[var(--cet-no-accent)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** @default "neutral" */
  readonly tone?: BadgeTone | undefined;
}

/**
 * Etiqueta corta de estado. El `.badge` de los trainers Y6A.
 *
 * Nunca es el unico portador de informacion: el color va siempre acompanado del
 * texto, porque el color solo no cumple WCAG 1.4.1.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", className, children, ...rest },
  ref,
): ReactNode {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-body-sm font-semibold",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
});
