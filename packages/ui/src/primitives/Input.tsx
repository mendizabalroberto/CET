"use client";

/**
 * @cet/ui — Input.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Etiqueta visible. Obligatoria: un placeholder no es una etiqueta. */
  readonly label: I18nText;
  /** Texto de ayuda bajo el campo. */
  readonly help?: I18nText | undefined;
  /**
   * Mensaje de error. Su presencia marca el campo como invalido.
   * Redactalo describiendo que hacer, no que se hizo mal.
   */
  readonly error?: I18nText | undefined;
  /** Oculta la etiqueta visualmente, manteniendola para el lector de pantalla. */
  readonly hideLabel?: boolean | undefined;
  /** Sufijo visual: la unidad esperada ("cm", "kg"). */
  readonly suffix?: string | undefined;
  readonly className?: string | undefined;
  readonly containerClassName?: string | undefined;
}

/**
 * Campo de texto con etiqueta, ayuda y error cableados por id.
 *
 * El error se asocia con `aria-describedby` y `aria-invalid`, no solo con
 * color: alguien con daltonismo (uno de cada doce ninos varones) no ve un borde
 * rojo. Ademas el mensaje va en un `role="alert"` para que se anuncie.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, help, error, hideLabel = false, suffix, className, containerClassName, id, ...rest },
  ref,
): ReactNode {
  const t = useI18n();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label
        htmlFor={inputId}
        className={cn(
          "text-body-sm font-semibold text-[var(--cet-ink)]",
          hideLabel && "absolute h-px w-px overflow-hidden [clip-path:inset(50%)]",
        )}
      >
        {t(label)}
      </label>

      <div className="relative flex items-center">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          className={cn(
            "min-h-touch w-full rounded-sm bg-[var(--cet-surface)] px-3.5 py-2 text-body-lg",
            "text-[var(--cet-ink)] placeholder:text-[var(--cet-ink-muted)]",
            "border-2 border-[var(--cet-border-strong)]",
            "transition-colors duration-fast ease-cet motion-reduce:transition-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error && "border-[var(--cet-danger)]",
            suffix && "pr-12",
            className,
          )}
          {...rest}
        />
        {suffix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 text-body-sm font-semibold text-[var(--cet-ink-muted)]"
          >
            {suffix}
          </span>
        ) : null}
      </div>

      {help ? (
        <p id={helpId} className="text-body-sm text-[var(--cet-ink-muted)]">
          {t(help)}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-body-sm font-medium text-[var(--cet-danger)]">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
});
