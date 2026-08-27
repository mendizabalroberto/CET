"use client";

/**
 * @cet/ui — Tooltip.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

export interface TooltipProps {
  /** Texto del tooltip. Solo texto: nunca HTML de la base de datos. */
  readonly content: I18nText;
  /** Disparador. Debe ser un elemento enfocable. */
  readonly children: ReactNode;
  /** @default "top" */
  readonly side?: "top" | "right" | "bottom" | "left" | undefined;
  readonly className?: string | undefined;
}

/**
 * Tooltip.
 *
 * Advertencia de uso: un tooltip NO puede llevar informacion necesaria para
 * responder una pregunta. No existe al tacto y desaparece al mover el dedo.
 * Para un enunciado, una pista o una unidad, usa texto visible.
 *
 * Se muestra tanto al pasar el raton como al recibir foco (WCAG 1.4.13) y se
 * cierra con Escape, ambas cosas por cuenta de Radix.
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps): ReactNode {
  const t = useI18n();
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-w-[280px] rounded-sm px-3 py-2 text-body-sm",
            // ink-inverse sobre ink: 16.49:1 en claro, 14.25:1 en oscuro
            "bg-[var(--cet-ink)] text-[var(--cet-ink-inverse)] shadow-pop",
            className,
          )}
        >
          {t(content)}
          <RadixTooltip.Arrow className="fill-[var(--cet-ink)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export interface TooltipProviderProps {
  readonly children: ReactNode;
  /** @default 300 */
  readonly delayDuration?: number | undefined;
}

/** Envolver la app una vez. Radix lo exige para coordinar los retardos. */
export function TooltipProvider({ children, delayDuration = 300 }: TooltipProviderProps): ReactNode {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}
