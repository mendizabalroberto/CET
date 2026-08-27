/**
 * @cet/ui — Alert.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Readonly<Record<AlertTone, string>> = {
  info: "bg-[var(--cet-rule-bg)] border-l-[var(--cet-rule-accent)] text-[var(--cet-ink)]",
  success: "bg-[var(--cet-ok-bg)] border-l-[var(--cet-ok-accent)] text-[var(--cet-ink)]",
  warning: "bg-[var(--cet-hint-bg)] border-l-[var(--cet-hint-accent)] text-[var(--cet-ink)]",
  danger: "bg-[var(--cet-no-bg)] border-l-[var(--cet-no-accent)] text-[var(--cet-ink)]",
};

/**
 * Marca de forma del tono. Existe porque el color no puede ser el unico canal:
 * quien no distingue rojo de verde necesita otra senal.
 *
 * Se dibuja como trazo SVG y no como texto ("i", "OK", "!") a proposito: un
 * literal aqui seria un texto de cara al usuario escrito en el componente, y
 * AD-7 no admite eso. Una forma no tiene idioma.
 */
const TONE_PATH: Readonly<Record<AlertTone, string>> = {
  info: "M8 6.6v4.6M8 4.4v.9",
  success: "M4.4 8.2 6.9 10.7 11.8 5.3",
  warning: "M8 4.4v4.6M8 11.2v.9",
  danger: "M8 4.4v4.6M8 11.2v.9",
};

/**
 * `Omit<..., "title">`: el atributo nativo `title` de HTML es un `string` (el
 * tooltip del navegador). Aqui `title` es un `I18nText` que se pinta como
 * encabezado, asi que hay que retirar el nativo antes de redeclararlo — si no,
 * TypeScript lo marca como extension incompatible (TS2430).
 */
export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** @default "info" */
  readonly tone?: AlertTone | undefined;
  /** Titulo corto. */
  readonly title?: I18nText | undefined;
  /**
   * Nombre accesible del tono ("Aviso", "Error"). Se lee antes del contenido.
   * Obligatorio para `warning` y `danger`.
   */
  readonly toneLabel?: I18nText | undefined;
  /**
   * `true` para que el lector lo anuncie al aparecer.
   * @default false para `info`/`success`, `true` para `warning`/`danger`
   */
  readonly live?: boolean | undefined;
}

/**
 * Aviso en linea. Portado de `.rule` / `.tip` / `.warn` de los trainers Y6A.
 *
 * El texto va siempre sobre `--cet-ink` (>=14:1 sobre todos los fondos de tono,
 * en claro y en oscuro), nunca sobre el color del tono, que en varios casos no
 * llega a 4.5:1.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = "info", title, toneLabel, live, className, children, ...rest },
  ref,
): ReactNode {
  const t = useI18n();
  const isUrgent = tone === "danger" || tone === "warning";
  const announce = live ?? isUrgent;

  return (
    <div
      ref={ref}
      role={announce ? "alert" : undefined}
      className={cn(
        "my-2.5 rounded-r-sm border-l-4 px-4 py-3 text-body",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      <div className="flex gap-2.5">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
          className="mt-0.5 h-5 w-5 flex-none"
        >
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d={TONE_PATH[tone]}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="min-w-0 flex-1">
          {toneLabel ? <VisuallyHidden>{t(toneLabel)}: </VisuallyHidden> : null}
          {title ? <p className="mb-0.5 font-bold">{t(title)}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
});
