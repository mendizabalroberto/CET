"use client";

/**
 * @cet/ui — trampa de foco.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "summary",
].join(",");

export interface FocusTrapProps {
  readonly children: ReactNode;
  /** @default true */
  readonly active?: boolean | undefined;
  /** Se invoca al pulsar Escape. */
  readonly onEscape?: (() => void) | undefined;
  /** Devuelve el foco al elemento que lo tenia al montar. @default true */
  readonly restoreFocus?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Encierra el foco dentro de sus hijos mientras `active`.
 *
 * `Dialog` y `SubmitDialog` lo obtienen ya de Radix; esto existe para las
 * superficies modales propias (el panel de solucion a pantalla completa, el
 * navegador de preguntas en movil) que no usan Radix.
 */
export function FocusTrap({
  children,
  active = true,
  onEscape,
  restoreFocus = true,
  className,
}: FocusTrapProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    previouslyFocused.current = document.activeElement;
    const container = containerRef.current;
    if (container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus();
    }
    return () => {
      if (restoreFocus && previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [active, restoreFocus]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!active) return;
      if (event.key === "Escape") {
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [active, onEscape],
  );

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={handleKeyDown} className={className}>
      {children}
    </div>
  );
}
