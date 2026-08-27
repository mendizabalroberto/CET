"use client";

/**
 * @cet/ui — MatchingGrid.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { htmlToPlainText } from "../lib/sanitize.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface MatchingSide {
  readonly id: string;
  readonly html: string;
}

export interface MatchingGridProps {
  /** Columna izquierda: los elementos a emparejar. */
  readonly left: readonly MatchingSide[];
  /** Columna derecha: las parejas posibles. */
  readonly right: readonly MatchingSide[];
  /** Parejas actuales `[leftId, rightId]`. Controlado. */
  readonly value: ReadonlyArray<readonly [string, string]>;
  readonly onChange: (pairs: ReadonlyArray<readonly [string, string]>) => void;
  readonly label: I18nText;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Emparejar dos columnas.
 *
 * Igual que en `OrderingList`, nada de lineas arrastrables: cada fila de la
 * izquierda lleva un `<select>` nativo con las opciones de la derecha. Es
 * accesible de serie, funciona con teclado, con lector de pantalla y con el dedo,
 * y en movil el selector nativo del sistema es mas usable que cualquier cosa que
 * dibujemos nosotros.
 *
 * Las opciones del selector usan el TEXTO PLANO del HTML de la derecha
 * (`htmlToPlainText`): un `<option>` no puede contener marcado, y meter HTML ahi
 * seria a la vez inutil y peligroso.
 */
export function MatchingGrid({
  left,
  right,
  value,
  onChange,
  label,
  disabled = false,
  className,
}: MatchingGridProps): ReactNode {
  const t = useI18n();
  const gridId = useId();

  const pairFor = (leftId: string): string =>
    value.find(([l]) => l === leftId)?.[1] ?? "";

  const setPair = (leftId: string, rightId: string): void => {
    if (disabled) return;
    const rest = value.filter(([l]) => l !== leftId);
    onChange(rightId === "" ? rest : [...rest, [leftId, rightId] as const]);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} role="group" aria-label={t(label)}>
      <p id={`${gridId}-help`} className="text-body-sm text-[var(--cet-ink-muted)]">
        {t(UI_STRINGS.matchingHelp)}
      </p>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {left.map((item) => {
          const selectId = `${gridId}-${item.id}`;
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] px-3 py-2"
            >
              <label htmlFor={selectId} className="cet-prose min-w-0 flex-1 text-body text-[var(--cet-ink)]">
                {parseSafeHtml(item.html)}
              </label>
              <select
                id={selectId}
                disabled={disabled}
                value={pairFor(item.id)}
                aria-describedby={`${gridId}-help`}
                onChange={(event) => setPair(item.id, event.target.value)}
                className={cn(
                  "min-h-touch min-w-[180px] rounded-sm border-2 border-[var(--cet-border-strong)]",
                  "bg-[var(--cet-surface)] px-3 py-2 text-body text-[var(--cet-ink)]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <option value="">{t(UI_STRINGS.noMatch)}</option>
                {right.map((option) => (
                  <option key={option.id} value={option.id}>
                    {htmlToPlainText(option.html)}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
