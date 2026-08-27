"use client";

/**
 * @cet/ui — OrderingList.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";
import { LiveRegion } from "../a11y/LiveRegion.js";

export interface OrderingItem {
  readonly id: string;
  readonly html: string;
}

export interface OrderingListProps {
  readonly items: readonly OrderingItem[];
  /** Orden actual, por id. Controlado. */
  readonly value: readonly string[];
  readonly onChange: (order: readonly string[]) => void;
  readonly label: I18nText;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Ordenar elementos.
 *
 * NO se implementa con arrastrar y soltar como unica via. El drag and drop es
 * inaccesible por teclado, dificil con lector de pantalla y poco fiable con el
 * dedo en una tablet. Aqui la interaccion primaria son DOS BOTONES por fila,
 * "Subir" y "Bajar", que funcionan con raton, dedo y teclado por igual. Una capa
 * de arrastre puede anadirse encima mas adelante, pero nunca sustituyendo a los
 * botones.
 *
 * Cada movimiento se anuncia en una region viva ("Fraccion movida a la posicion
 * 2 de 5"), porque si no quien no ve la pantalla no tiene forma de saber que ha
 * pasado.
 */
export function OrderingList({
  items,
  value,
  onChange,
  label,
  disabled = false,
  className,
}: OrderingListProps): ReactNode {
  const t = useI18n();
  const listId = useId();
  // Estado, no `ref`: mutar un ref no provoca render, asi que el anuncio solo
  // llegaba de rebote si el padre re-renderizaba por su cuenta.
  const [announcement, setAnnouncement] = useState("");
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = value.map((id) => byId.get(id)).filter((item): item is OrderingItem => item !== undefined);

  const move = useCallback(
    (index: number, delta: number, direction: "up" | "down"): void => {
      if (disabled) return;
      const target = index + delta;
      if (target < 0 || target >= ordered.length) return;
      const next = [...value];
      const moved = next[index];
      const displaced = next[target];
      if (moved === undefined || displaced === undefined) return;
      next[index] = displaced;
      next[target] = moved;
      setAnnouncement(`${t(UI_STRINGS.movedToPosition)} ${target + 1} ${t(UI_STRINGS.questionOf)} ${ordered.length}`);
      onChange(next);
      // El foco viaja con el elemento: si se queda en la posicion, la siguiente
      // pulsacion mueve el elemento equivocado.
      // El `?.` NO sobra, aunque el linter lo crea: `lib.dom` declara
      // requestAnimationFrame como siempre presente, pero este componente tambien
      // se renderiza en el servidor, donde no existe. Quitarlo rompe el SSR.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      globalThis.requestAnimationFrame?.(() => {
        buttonRefs.current[`${moved}-${direction}`]?.focus();
      });
    },
    [disabled, onChange, ordered.length, t, value],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p id={`${listId}-help`} className="text-body-sm text-[var(--cet-ink-muted)]">
        {t(UI_STRINGS.orderingHelp)}
      </p>

      <ol aria-label={t(label)} aria-describedby={`${listId}-help`} className="m-0 flex list-none flex-col gap-2 p-0">
        {ordered.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "flex min-h-touch-comfy items-center gap-3 rounded-md border-2 border-[var(--cet-border-strong)]",
              "bg-[var(--cet-surface)] px-3 py-2 text-body text-[var(--cet-ink)]",
            )}
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 flex-none items-center justify-center rounded-sm bg-[var(--cet-surface-3)] text-body-sm font-bold"
            >
              {index + 1}
            </span>
            <span className="cet-prose min-w-0 flex-1">{parseSafeHtml(item.html)}</span>
            <span className="flex flex-none gap-1">
              <button
                type="button"
                ref={(node) => {
                  buttonRefs.current[`${item.id}-up`] = node;
                }}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1, "up")}
                aria-label={`${t(UI_STRINGS.moveUp)}: ${index + 1}`}
                className="flex h-touch w-touch items-center justify-center rounded-sm border border-[var(--cet-border-strong)] text-[var(--cet-ink)] disabled:opacity-40"
              >
                <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden="true" focusable="false">
                  <path d="M2 8 6 4l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                ref={(node) => {
                  buttonRefs.current[`${item.id}-down`] = node;
                }}
                disabled={disabled || index === ordered.length - 1}
                onClick={() => move(index, 1, "down")}
                aria-label={`${t(UI_STRINGS.moveDown)}: ${index + 1}`}
                className="flex h-touch w-touch items-center justify-center rounded-sm border border-[var(--cet-border-strong)] text-[var(--cet-ink)] disabled:opacity-40"
              >
                <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden="true" focusable="false">
                  <path d="M2 4 6 8l4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          </li>
        ))}
      </ol>

      <LiveRegion message={announcement} />
    </div>
  );
}
