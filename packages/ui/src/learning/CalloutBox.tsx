"use client";

/**
 * @cet/ui — base comun de los recuadros de leccion.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `.rule`, `.eg`, `.tip` y `.warn` de los trainers Y6A comparten estructura:
 * barra de color a la izquierda, fondo tenue, contenido HTML. Aqui vive esa
 * estructura una sola vez; los cuatro componentes publicos solo eligen el tono.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";

export type CalloutTone = "rule" | "example" | "tip" | "warning";

const TONE_STYLES: Readonly<Record<CalloutTone, string>> = {
  rule: "bg-[var(--cet-rule-bg)] border-l-4 border-l-[var(--cet-rule-accent)] rounded-r-sm",
  example:
    "bg-[var(--cet-example-bg)] border border-dashed border-[var(--cet-example-border)] rounded-sm",
  tip: "bg-[var(--cet-tip-bg)] border-l-4 border-l-[var(--cet-tip-accent)] rounded-r-sm",
  warning: "bg-[var(--cet-warning-bg)] border-l-4 border-l-[var(--cet-warning-accent)] rounded-r-sm",
};

export interface CalloutBoxProps {
  readonly tone: CalloutTone;
  /**
   * Nombre del tipo de bloque ("Regla", "Truco", "Cuidado con esto").
   * Se pinta como titulo y da al lector de pantalla el contexto que en la
   * version HTML original solo aportaba el color de la barra.
   */
  readonly label: I18nText;
  /** Contenido HTML de la base de datos. Se sanea siempre. */
  readonly html?: string | undefined;
  /** Alternativa a `html` cuando el contenido ya son nodos de React. */
  readonly children?: ReactNode | undefined;
  /** Oculta el titulo visualmente, dejandolo para el lector de pantalla. */
  readonly hideLabel?: boolean | undefined;
  readonly className?: string | undefined;
}

/** Recuadro de leccion. No se exporta al exterior del paquete: usa RuleBox y compania. */
export function CalloutBox({
  tone,
  label,
  html,
  children,
  hideLabel = false,
  className,
}: CalloutBoxProps): ReactNode {
  const t = useI18n();
  const labelText = t(label);

  return (
    <section
      aria-label={labelText}
      className={cn("my-3 px-4 py-3 text-body text-[var(--cet-ink)]", TONE_STYLES[tone], className)}
    >
      <p
        className={cn(
          "mb-1 text-[12px] font-bold uppercase tracking-wide text-[var(--cet-ink-muted)]",
          hideLabel && "absolute h-px w-px overflow-hidden [clip-path:inset(50%)]",
        )}
      >
        {labelText}
      </p>
      {html === undefined ? children : <div className="cet-prose">{parseSafeHtml(html)}</div>}
    </section>
  );
}
