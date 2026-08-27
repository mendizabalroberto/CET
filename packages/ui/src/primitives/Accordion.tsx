"use client";

/**
 * @cet/ui — Accordion.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixAccordion from "@radix-ui/react-accordion";
import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

export interface AccordionItem {
  readonly value: string;
  readonly title: I18nText;
  readonly content: ReactNode;
  /** Numero del tema, como el `.n` de los trainers Y6A. */
  readonly index?: number | undefined;
  readonly disabled?: boolean | undefined;
}

export interface AccordionProps {
  readonly items: readonly AccordionItem[];
  /** `single` cierra el resto al abrir uno. @default "multiple" */
  readonly mode?: "single" | "multiple" | undefined;
  readonly defaultOpen?: readonly string[] | undefined;
  /** Nivel del encabezado que envuelve el disparador. @default 3 */
  readonly headingLevel?: 2 | 3 | 4 | undefined;
  readonly className?: string | undefined;
}

/**
 * Acordeon de temas de leccion. Portado de `.topic` de los trainers Y6A.
 *
 * Detalle de accesibilidad que la version HTML no tenia: cada disparador va
 * dentro de un encabezado del nivel correcto, para que el indice de encabezados
 * del lector de pantalla siga siendo navegable. Un `<button>` suelto rompe ese
 * indice y obliga a recorrer la pagina entera.
 *
 * La animacion de apertura usa la altura calculada por Radix y se anula bajo
 * `prefers-reduced-motion`.
 */
export function Accordion({
  items,
  mode = "multiple",
  defaultOpen = [],
  headingLevel = 3,
  className,
}: AccordionProps): ReactNode {
  const t = useI18n();
  const Heading = `h${headingLevel}` as const;

  const common = {
    className: cn("flex flex-col gap-2.5", className),
    children: items.map((item) => (
      <RadixAccordion.Item
        key={item.value}
        value={item.value}
        disabled={item.disabled ?? false}
        className="overflow-hidden rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)]"
      >
        <Heading className="m-0">
          <RadixAccordion.Trigger
            className={cn(
              "group flex w-full min-h-touch-comfy items-center justify-between gap-2.5 px-4 py-3.5 text-start",
              "text-[16px] font-bold text-[var(--cet-navy)]",
              "hover:bg-[var(--cet-surface-2)]",
              "transition-colors duration-fast ease-cet motion-reduce:transition-none",
            )}
          >
            <span className="flex items-center gap-2.5">
              {item.index === undefined ? null : (
                <span
                  aria-hidden="true"
                  className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-sm bg-[var(--cet-primary)] text-[13px] font-bold text-[var(--cet-on-primary)]"
                >
                  {item.index}
                </span>
              )}
              {t(item.title)}
            </span>
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
              className={cn(
                "h-3 w-3 flex-none text-[var(--cet-ink-muted)]",
                "transition-transform duration-base ease-cet motion-reduce:transition-none",
                "group-data-[state=open]:rotate-180",
              )}
            >
              <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </RadixAccordion.Trigger>
        </Heading>
        <RadixAccordion.Content className="border-t border-[var(--cet-line)] px-4 pb-4 pt-2">
          {item.content}
        </RadixAccordion.Content>
      </RadixAccordion.Item>
    )),
  };

  const firstOpen = defaultOpen[0];
  return mode === "single" ? (
    <RadixAccordion.Root
      type="single"
      collapsible
      {...(firstOpen === undefined ? {} : { defaultValue: firstOpen })}
      {...common}
    />
  ) : (
    <RadixAccordion.Root type="multiple" defaultValue={[...defaultOpen]} {...common} />
  );
}
