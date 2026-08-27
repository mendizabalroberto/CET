"use client";

/**
 * @cet/ui — NumericInput.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface NumericInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Etiqueta accesible. Por defecto "Tu respuesta". */
  readonly label?: I18nText | undefined;
  /** Unidad esperada (`RenderedBody.unit`): se muestra al lado, no se escribe. */
  readonly unit?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Se invoca al pulsar Enter: en practica, comprobar la respuesta. */
  readonly onSubmit?: (() => void) | undefined;
  readonly className?: string | undefined;
}

/**
 * Campo de respuesta numerica. El `input.ans` de los trainers Y6A.
 *
 * Decisiones:
 *  - `type="text"` con `inputMode="decimal"`, no `type="number"`. `type="number"`
 *    permite que la rueda del raton cambie el valor sin querer, oculta lo que el
 *    alumno escribio si no es un numero valido y en varios navegadores no deja
 *    escribir "1 3/4". En un examen eso son puntos perdidos por culpa del
 *    widget. `inputMode` levanta el teclado numerico en tablet, que es lo que de
 *    verdad queriamos.
 *  - No se normaliza ni se corrige lo que escribe el alumno mientras escribe.
 *    Interpretar la respuesta es trabajo de @cet/engine, no de la caja de texto.
 *  - `autoComplete="off"` y `spellCheck={false}`: el autocompletado del navegador
 *    sugiriendo respuestas anteriores en un examen es un problema de integridad.
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  { value, onChange, label, unit, placeholder, disabled = false, onSubmit, className },
  ref,
): ReactNode {
  const t = useI18n();
  const labelText = t(label, UI_STRINGS.yourAnswer);

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={labelText}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={cn(
          "min-h-touch-comfy w-[200px] rounded-sm border-2 border-[var(--cet-border-strong)]",
          "bg-[var(--cet-surface)] px-3.5 py-2 text-center text-[20px] text-[var(--cet-ink)]",
          "placeholder:text-[var(--cet-ink-muted)]",
          "transition-colors duration-fast ease-cet motion-reduce:transition-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      />
      {unit ? (
        <span className="text-body-lg font-semibold text-[var(--cet-ink-muted)]">{unit}</span>
      ) : null}
    </div>
  );
});
