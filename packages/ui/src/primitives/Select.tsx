"use client";

/**
 * @cet/ui — Select.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixSelect from "@radix-ui/react-select";
import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { definedProps } from "../lib/defined-props.js";

export interface SelectOption {
  readonly value: string;
  readonly label: I18nText;
  readonly disabled?: boolean | undefined;
}

export interface SelectProps {
  readonly label: I18nText;
  readonly options: readonly SelectOption[];
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  /** Texto cuando no hay nada elegido. */
  readonly placeholder?: I18nText | undefined;
  readonly disabled?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly name?: string | undefined;
  readonly error?: I18nText | undefined;
  readonly hideLabel?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Desplegable.
 *
 * Se usa para filtros del panel de profesor y admin. Para que un ALUMNO elija
 * una respuesta se usa `ChoiceList`, no esto: un desplegable esconde las
 * opciones y penaliza a quien lee despacio.
 */
export function Select({
  label,
  options,
  placeholder,
  error,
  hideLabel = false,
  className,
  ...rest
}: SelectProps): ReactNode {
  const t = useI18n();
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "text-body-sm font-semibold text-[var(--cet-ink)]",
          hideLabel && "absolute h-px w-px overflow-hidden [clip-path:inset(50%)]",
        )}
      >
        {t(label)}
      </label>

      <RadixSelect.Root {...definedProps(rest)}>
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "inline-flex min-h-touch w-full items-center justify-between gap-2 rounded-sm px-3.5 py-2",
            "border-2 border-[var(--cet-border-strong)] bg-[var(--cet-surface)] text-body text-[var(--cet-ink)]",
            "data-[placeholder]:text-[var(--cet-ink-muted)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error && "border-[var(--cet-danger)]",
          )}
        >
          <RadixSelect.Value placeholder={placeholder ? t(placeholder) : undefined} />
          <RadixSelect.Icon aria-hidden="true">
            <svg viewBox="0 0 12 12" className="h-3 w-3" focusable="false">
              <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className={cn(
              "z-50 overflow-hidden rounded-sm border border-[var(--cet-line)]",
              "bg-[var(--cet-surface)] shadow-pop",
            )}
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled ?? false}
                  className={cn(
                    "flex min-h-touch cursor-pointer select-none items-center rounded-sm px-3 py-2 text-body",
                    "text-[var(--cet-ink)] outline-none",
                    "data-[highlighted]:bg-[var(--cet-surface-3)]",
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                  )}
                >
                  <RadixSelect.ItemText>{t(option.label)}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

      {error ? (
        <p id={errorId} role="alert" className="text-body-sm font-medium text-[var(--cet-danger)]">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
