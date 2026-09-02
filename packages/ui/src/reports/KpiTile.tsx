"use client";

/**
 * @cet/ui — KpiTile: una cifra grande de cabecera, con su variación y su
 * sparkline opcional.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ AÑADE SOBRE `StatTile`
 * ===========================================================================
 * `StatTile` (en `data/`) es la baldosa de siempre: valor y etiqueta, sin
 * comparación. Esta es la baldosa de la FILA PRINCIPAL del panel del tutor:
 * la misma cifra, pero con la variación contra el periodo anterior pintada
 * debajo con color semántico, y —solo en la de tiempo— cuatro barras con la
 * tendencia de las últimas semanas. No sustituye a `StatTile`: las cifras
 * secundarias del informe la siguen usando.
 *
 * ===========================================================================
 * LA VARIACIÓN LLEGA YA REDACTADA (AD-7)
 * ===========================================================================
 * `trend.text` es la frase visible ENTERA, flecha incluida («▲ +42 min»,
 * «▼ −12 %», «= igual»): este paquete no sabe redactar un signo ni una
 * unidad en el idioma del tutor. Lo único que decide aquí es el COLOR, y lo
 * decide `trend.direction`, no el texto — así un color no depende de que la
 * cadena empiece por el carácter esperado. `srText` es la frase larga para
 * quien no puede ver el color («42 minutos más que la semana anterior»),
 * porque el color solo (WCAG 1.4.1) no puede ser el único canal.
 *
 * ===========================================================================
 * EL SPARKLINE ES UNA TENDENCIA, NO UNA MEDICIÓN DE UN DÍA
 * ===========================================================================
 * Cuatro barras, una por semana, de más antigua a más reciente. La semana con
 * más minutos lleva un acento de otro tono (`--cet-teal-text`) Y un trazo
 * alrededor — dos canales, no solo el tono — para que siga distinguiéndose en
 * escala de grises. Las demás van en `--cet-primary` a media opacidad.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";
import { RADIO_DE_DATO, useAnchoDeGrafico } from "./chart-chrome.js";

/** Sentido de la variación contra el periodo anterior. Decide el color, no el texto. */
export type TendenciaKpi = "mejora" | "empeora" | "igual";

export interface KpiTrend {
  readonly direction: TendenciaKpi;
  /** El texto visible completo, con flecha y cifra, ya redactado («▲ +42 min»). */
  readonly text: string;
  /** La frase accesible completa, en los dos idiomas. */
  readonly srText: I18nText;
}

export interface KpiSparkline {
  /** Un valor por semana (minutos), de la más antigua a la más reciente. */
  readonly weeks: readonly number[];
  /** Nombre accesible del sparkline, ya redactado por la aplicación. */
  readonly summary: I18nText;
}

export interface KpiTileProps {
  readonly value: string;
  readonly label: I18nText;
  readonly valueText?: string | undefined;
  readonly trend?: KpiTrend | undefined;
  readonly sparkline?: KpiSparkline | undefined;
  readonly className?: string | undefined;
}

/** El color de la variación. Nunca es el único canal: el texto ya dice la cifra. */
const TINTA_DE_TENDENCIA: Readonly<Record<TendenciaKpi, string>> = {
  mejora: "text-[var(--cet-teal-text)]",
  empeora: "text-[var(--cet-danger)]",
  igual: "text-[var(--cet-ink-muted)]",
};

const ALTO_SPARKLINE = 28;
const HOLGURA = 2;
const MIN_VISIBLE = 2;

function Sparkline({ sparkline }: { readonly sparkline: KpiSparkline }): ReactNode {
  const t = useI18n();
  const [ref, ancho] = useAnchoDeGrafico();
  const id = useId();
  const semanas = sparkline.weeks;
  if (semanas.length === 0) return null;

  const maximo = Math.max(...semanas, 1);
  const util = Math.max(1, ancho - 2 * HOLGURA);
  const carril = util / semanas.length;
  const grueso = Math.max(3, Math.min(RADIO_DE_DATO * 3, carril * 0.55));
  const indiceMaximo = semanas.reduce(
    (mejor, v, i) => (v > (semanas[mejor] ?? -1) ? i : mejor),
    0,
  );

  return (
    <div ref={ref} className="mt-1 w-full">
      <svg
        width={ancho}
        height={ALTO_SPARKLINE}
        viewBox={`0 0 ${ancho} ${ALTO_SPARKLINE}`}
        role="img"
        aria-labelledby={`${id}-title`}
        className="block"
      >
        <title id={`${id}-title`}>{t(sparkline.summary)}</title>
        {semanas.map((minutos, index) => {
          const esMaximo = index === indiceMaximo && minutos > 0;
          const alto = Math.max(
            MIN_VISIBLE,
            Math.round((minutos / maximo) * (ALTO_SPARKLINE - HOLGURA)),
          );
          const x = HOLGURA + carril * index + (carril - grueso) / 2;
          const y = ALTO_SPARKLINE - alto;
          return (
            <rect
              key={index}
              data-cet-semana={esMaximo ? "maxima" : "normal"}
              x={x}
              y={y}
              width={grueso}
              height={alto}
              rx={Math.min(RADIO_DE_DATO, grueso / 2)}
              fill={esMaximo ? "var(--cet-teal-text)" : "var(--cet-primary)"}
              opacity={esMaximo ? 1 : 0.45}
              stroke={esMaximo ? "var(--cet-teal-text)" : "none"}
              strokeWidth={esMaximo ? 1.5 : 0}
            />
          );
        })}
      </svg>
    </div>
  );
}

/**
 * La baldosa de KPI principal: cifra grande, etiqueta, variación y —opcional—
 * la tendencia semanal. Se pinta como lista de descripción, igual que
 * `StatTile`, para que la relación entre etiqueta y valor exista en el árbol
 * de accesibilidad y no solo por proximidad visual.
 */
export function KpiTile({
  value,
  label,
  valueText,
  trend,
  sparkline,
  className,
}: KpiTileProps): ReactNode {
  const t = useI18n();
  return (
    <dl
      data-cet-kpi="principal"
      className={cn(
        "m-0 flex h-full min-w-0 flex-col rounded-xl border border-[var(--cet-line)]",
        "bg-[var(--cet-surface)] px-4 py-3",
        className,
      )}
    >
      <dt className="order-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--cet-ink-muted)]">
        {t(label)}
      </dt>
      <dd className="order-1 m-0 whitespace-nowrap text-[24px] font-bold leading-tight text-[var(--cet-navy)]">
        <span aria-hidden={valueText ? "true" : undefined}>{value}</span>
        {valueText ? <VisuallyHidden>{valueText}</VisuallyHidden> : null}
      </dd>
      {trend ? (
        <dd className="order-3 m-0 mt-1 flex items-center gap-1 text-body-sm font-semibold">
          <span aria-hidden="true" className={TINTA_DE_TENDENCIA[trend.direction]}>
            {trend.text}
          </span>
          <VisuallyHidden>{t(trend.srText)}</VisuallyHidden>
        </dd>
      ) : null}
      {sparkline ? (
        <dd className="order-4 m-0">
          <Sparkline sparkline={sparkline} />
        </dd>
      ) : null}
    </dl>
  );
}
