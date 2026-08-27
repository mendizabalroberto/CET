"use client";

/**
 * @cet/ui — Checkbox.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { forwardRef, useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { definedProps } from "../lib/defined-props.js";

export interface CheckboxProps {
  readonly label: I18nText;
  readonly checked?: boolean | undefined;
  readonly defaultChecked?: boolean | undefined;
  readonly onCheckedChange?: ((checked: boolean) => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly name?: string | undefined;
  readonly value?: string | undefined;
  readonly id?: string | undefined;
  readonly description?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * Casilla de verificacion.
 *
 * La caja mide 24px pero el area clicable es toda la fila con `min-h-touch`:
 * un nino de 10 anos en una tablet no acierta un objetivo de 24px de forma
 * fiable, y fallar el clic en una pregunta de opcion multiple cuesta puntos.
 *
 * Teclado: Espacio marca y desmarca (comportamiento nativo de Radix).
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...rest },
  ref,
): ReactNode {
  const t = useI18n();
  const generatedId = useId();
  const boxId = id ?? generatedId;
  const descId = `${boxId}-desc`;
  const labelId = `${boxId}-label`;

  return (
    <div className={cn("flex min-h-touch items-start gap-3 py-1", className)}>
      <RadixCheckbox.Root
        ref={ref}
        id={boxId}
        /**
         * `aria-labelledby`, no `<label htmlFor>`.
         *
         * Radix renderiza un `<button role="checkbox">`. Un `<label for>` NO da
         * nombre accesible a un elemento que lleva rol ARIA: el lector de pantalla
         * anuncia "casilla, no marcada" sin decir de que. En un examen eso deja al
         * alumno sin saber que esta marcando. axe lo detecta como `button-name`.
         */
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-sm",
          "border-2 border-[var(--cet-border-strong)] bg-[var(--cet-surface)]",
          "data-[state=checked]:border-[var(--cet-primary)] data-[state=checked]:bg-[var(--cet-primary)]",
          "data-[state=indeterminate]:border-[var(--cet-primary)] data-[state=indeterminate]:bg-[var(--cet-primary)]",
          "transition-colors duration-fast ease-cet motion-reduce:transition-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
        {...definedProps(rest)}
      >
        <RadixCheckbox.Indicator className="text-[var(--cet-on-primary)]">
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" focusable="false">
            <path
              d="M2.5 8.5 6 12l7.5-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>

      <label
        htmlFor={boxId}
        id={labelId}
        className="flex-1 cursor-pointer text-body text-[var(--cet-ink)]"
      >
        {t(label)}
        {description ? (
          <span id={descId} className="mt-0.5 block text-body-sm text-[var(--cet-ink-muted)]">
            {t(description)}
          </span>
        ) : null}
      </label>
    </div>
  );
});
