"use client";

/**
 * @cet/ui — FractionInput.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, useRef, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface FractionValue {
  readonly numerator: string;
  readonly denominator: string;
}

export interface FractionInputProps {
  readonly value: FractionValue;
  readonly onChange: (value: FractionValue) => void;
  /** Nombre del grupo de campos. Por defecto "Tu respuesta". */
  readonly label?: I18nText | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSubmit?: (() => void) | undefined;
  readonly className?: string | undefined;
}

const NUM_CLASS =
  "min-h-touch w-[92px] rounded-sm border-2 border-[var(--cet-border-strong)] bg-[var(--cet-surface)] px-2 py-1.5 text-center text-[20px] text-[var(--cet-ink)] disabled:opacity-60";

/**
 * Respuesta en forma de fraccion: dos campos apilados con una barra entre medias.
 *
 * Por que dos campos y no uno de texto con "3/4": porque asi el alumno no puede
 * equivocarse de formato, y porque el foco entre numerador y denominador es
 * explicito para quien navega con teclado o con lector de pantalla. Cada campo
 * lleva su propia etiqueta ("Numerador", "Denominador"), asi que se anuncian por
 * separado y sin ambiguedad.
 *
 * Atajo: escribir "/" en el numerador salta al denominador, que es lo que un
 * alumno acostumbrado a teclear "3/4" va a hacer por instinto.
 */
export function FractionInput({
  value,
  onChange,
  label,
  disabled = false,
  onSubmit,
  className,
}: FractionInputProps): ReactNode {
  const t = useI18n();
  const groupId = useId();
  const denominatorRef = useRef<HTMLInputElement | null>(null);

  return (
    <fieldset
      className={cn("m-0 inline-flex flex-col items-center border-0 p-0", className)}
      disabled={disabled}
    >
      <legend className="absolute h-px w-px overflow-hidden [clip-path:inset(50%)]">
        {t(label, UI_STRINGS.yourAnswer)}
      </legend>

      <label htmlFor={`${groupId}-num`} className="absolute h-px w-px overflow-hidden [clip-path:inset(50%)]">
        {t(UI_STRINGS.numerator)}
      </label>
      <input
        id={`${groupId}-num`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value.numerator}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.endsWith("/")) {
            onChange({ numerator: raw.slice(0, -1), denominator: value.denominator });
            denominatorRef.current?.focus();
            return;
          }
          onChange({ numerator: raw, denominator: value.denominator });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={NUM_CLASS}
      />

      <span aria-hidden="true" className="my-1 h-0.5 w-[92px] bg-[var(--cet-ink)]" />

      <label htmlFor={`${groupId}-den`} className="absolute h-px w-px overflow-hidden [clip-path:inset(50%)]">
        {t(UI_STRINGS.denominator)}
      </label>
      <input
        id={`${groupId}-den`}
        ref={denominatorRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value.denominator}
        onChange={(event) => onChange({ numerator: value.numerator, denominator: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={NUM_CLASS}
      />
    </fieldset>
  );
}
