"use client";

/**
 * @cet/ui — StatTile.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";

export interface StatTileProps {
  /** Valor ya formateado. El formato de numero lo decide quien llama, con su locale. */
  readonly value: string;
  readonly label: I18nText;
  /**
   * Texto largo para el lector de pantalla cuando `value` es un simbolo o una
   * abreviatura ("—" para "sin datos todavia").
   */
  readonly valueText?: string | undefined;
  /** Nota bajo el valor (variacion, contexto). */
  readonly hint?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * Baldosa de estadistica. El `.stat` de los trainers Y6A.
 *
 * Se pinta como una lista de descripcion (`dl`/`dt`/`dd`) en vez de dos divs:
 * asi la relacion entre la etiqueta y el valor existe de verdad en el arbol de
 * accesibilidad y no solo visualmente por proximidad.
 */
export function StatTile({ value, label, valueText, hint, className }: StatTileProps): ReactNode {
  const t = useI18n();
  return (
    <dl
      className={cn(
        // `dt` va antes que `dd` en el DOM porque el modelo de contenido de
        // <dl> lo exige (y axe lo comprueba con la regla `definition-list`).
        // El orden VISUAL (valor grande arriba, etiqueta debajo) se consigue
        // con la propiedad `order`, no reordenando el marcado.
        "m-0 flex min-w-[110px] flex-col rounded-md border border-[var(--cet-line)]",
        "bg-[var(--cet-surface)] px-4 py-2.5 text-center",
        className,
      )}
    >
      <dt className="order-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--cet-ink-muted)]">
        {t(label)}
      </dt>
      <dd className="order-1 m-0 text-[22px] font-bold leading-tight text-[var(--cet-navy)]">
        <span aria-hidden={valueText ? "true" : undefined}>{value}</span>
        {valueText ? <VisuallyHidden>{valueText}</VisuallyHidden> : null}
      </dd>
      {hint ? <dd className="order-3 m-0 mt-1 text-body-sm text-[var(--cet-ink-muted)]">{t(hint)}</dd> : null}
    </dl>
  );
}
