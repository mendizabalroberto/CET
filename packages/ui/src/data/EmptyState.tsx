"use client";

/**
 * @cet/ui — EmptyState.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface EmptyStateProps {
  readonly title?: I18nText | undefined;
  readonly body?: I18nText | undefined;
  /** Accion para salir del vacio (crear, invitar, empezar). */
  readonly action?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/**
 * Pantalla sin datos.
 *
 * No usa el lenguaje de un error: no ha fallado nada, simplemente todavia no hay
 * contenido. La diferencia entre "Aqui todavia no hay nada" y "No se han podido
 * cargar los datos" es la diferencia entre un alumno que espera y uno que cree
 * que ha roto algo.
 */
export function EmptyState({ title, body, action, className }: EmptyStateProps): ReactNode {
  const t = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--cet-line)]",
        "bg-[var(--cet-surface-2)] px-6 py-10 text-center",
        className,
      )}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="h-12 w-12 text-[var(--cet-ink-muted)]">
        <rect
          x="8"
          y="12"
          width="32"
          height="26"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M14 21h20M14 27h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="text-body-lg font-bold text-[var(--cet-ink)]">{t(title, UI_STRINGS.emptyTitle)}</p>
      <p className="max-w-[42ch] text-body text-[var(--cet-ink-muted)]">{t(body, UI_STRINGS.emptyBody)}</p>
      {action}
    </div>
  );
}
