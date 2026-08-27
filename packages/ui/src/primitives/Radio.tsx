"use client";

/**
 * @cet/ui — RadioGroup.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixRadio from "@radix-ui/react-radio-group";
import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { definedProps } from "../lib/defined-props.js";

export interface RadioOption {
  readonly value: string;
  readonly label: I18nText;
  readonly description?: I18nText | undefined;
  readonly disabled?: boolean | undefined;
}

export interface RadioGroupProps {
  /** Nombre del grupo, leido antes de las opciones. */
  readonly legend: I18nText;
  readonly options: readonly RadioOption[];
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  readonly name?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly required?: boolean | undefined;
  /** @default "vertical" */
  readonly orientation?: "vertical" | "horizontal" | undefined;
  readonly hideLegend?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Grupo de opciones excluyentes.
 *
 * Teclado (nativo de Radix): las flechas mueven la seleccion dentro del grupo y
 * Tab salta al siguiente control. Ese es el patron correcto para un radiogroup;
 * hacer que Tab recorra opcion por opcion obligaria a un alumno a pulsar Tab
 * cuarenta veces para llegar al boton de entregar.
 */
export function RadioGroup({
  legend,
  options,
  hideLegend = false,
  orientation = "vertical",
  className,
  ...rest
}: RadioGroupProps): ReactNode {
  const t = useI18n();
  const groupId = useId();

  return (
    <fieldset className={cn("m-0 border-0 p-0", className)}>
      <legend
        className={cn(
          "mb-2 text-body font-semibold text-[var(--cet-ink)]",
          hideLegend && "absolute h-px w-px overflow-hidden [clip-path:inset(50%)]",
        )}
      >
        {t(legend)}
      </legend>
      <RadixRadio.Root
        orientation={orientation}
        className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-wrap")}
        {...definedProps(rest)}
      >
        {options.map((option) => {
          const itemId = `${groupId}-${option.value}`;
          const descId = `${itemId}-desc`;
          const labelId = `${itemId}-label`;
          return (
            <div key={option.value} className="flex min-h-touch items-start gap-3 py-1">
              <RadixRadio.Item
                id={itemId}
                value={option.value}
                disabled={option.disabled ?? false}
                /**
                 * `aria-labelledby`, no `<label htmlFor>`: Radix renderiza un
                 * `<button role="radio">` y un `label for` no da nombre accesible
                 * a un elemento con rol ARIA. Ver el mismo comentario en Checkbox.
                 */
                aria-labelledby={labelId}
                aria-describedby={option.description ? descId : undefined}
                className={cn(
                  "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-pill",
                  "border-2 border-[var(--cet-border-strong)] bg-[var(--cet-surface)]",
                  "data-[state=checked]:border-[var(--cet-primary)]",
                  "transition-colors duration-fast ease-cet motion-reduce:transition-none",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <RadixRadio.Indicator className="block h-3 w-3 rounded-pill bg-[var(--cet-primary)]" />
              </RadixRadio.Item>
              <label
                htmlFor={itemId}
                id={labelId}
                className="flex-1 cursor-pointer text-body text-[var(--cet-ink)]"
              >
                {t(option.label)}
                {option.description ? (
                  <span id={descId} className="mt-0.5 block text-body-sm text-[var(--cet-ink-muted)]">
                    {t(option.description)}
                  </span>
                ) : null}
              </label>
            </div>
          );
        })}
      </RadixRadio.Root>
    </fieldset>
  );
}
