"use client";

/**
 * @cet/ui — Tabs.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { definedProps } from "../lib/defined-props.js";

export interface TabItem {
  readonly value: string;
  readonly label: I18nText;
  readonly content: ReactNode;
  readonly disabled?: boolean | undefined;
}

export interface TabsProps {
  /** Nombre del conjunto de pestanas, para el lector de pantalla. */
  readonly label: I18nText;
  readonly items: readonly TabItem[];
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  readonly className?: string | undefined;
}

/**
 * Pestanas. Portado de la navegacion Learn / Practice / Lab / Mock de Y6A.
 *
 * Teclado (nativo de Radix): flechas para moverse entre pestanas, Home y End
 * para ir a la primera y la ultima, Tab para entrar en el panel.
 *
 * La pestana activa NO se distingue solo por color: lleva ademas un subrayado
 * de 3px y `aria-selected`.
 */
export function Tabs({ label, items, className, ...rest }: TabsProps): ReactNode {
  const t = useI18n();
  return (
    <RadixTabs.Root className={cn("w-full", className)} {...definedProps(rest)}>
      <RadixTabs.List
        aria-label={t(label)}
        className="flex flex-wrap gap-1 border-b border-[var(--cet-line)]"
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled ?? false}
            className={cn(
              "min-h-touch rounded-t-sm border-b-[3px] border-transparent px-4 py-2.5",
              "text-body font-semibold text-[var(--cet-ink-muted)]",
              "hover:bg-[var(--cet-surface-3)] hover:text-[var(--cet-ink)]",
              "data-[state=active]:border-b-[var(--cet-amber)] data-[state=active]:text-[var(--cet-navy)]",
              "data-[state=active]:bg-[var(--cet-surface)]",
              "transition-colors duration-fast ease-cet motion-reduce:transition-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {t(item.label)}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} className="pt-4">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
