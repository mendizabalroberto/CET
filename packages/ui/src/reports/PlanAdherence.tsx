"use client";

/**
 * @cet/ui — PlanAdherence: cuánto de lo planificado se ha hecho, en 7 días.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * SOLO EXISTE CON PLAN ACTIVO
 * ===========================================================================
 * Sin plan no hay objetivo contra el que medir, así que esta baldosa NO se
 * monta — es la aplicación quien decide no pasar las props, no este
 * componente quien se calla solo (al revés que el resto de la carpeta): no
 * hay ningún «cero» que distinguir de una ausencia, es una ausencia de
 * verdad.
 *
 * ===========================================================================
 * LA BARRA SE CAPA EN EL 100 %; LA CIFRA REAL NO SE ESCONDE
 * ===========================================================================
 * `ratio` llega ya normalizado a 0..1 —1 es el objetivo— y una barra que se
 * saliera de su carril al pasarlo dejaría de leerse como progreso. Cuando el
 * niño hace MÁS de lo previsto, la barra se queda llena y `overText` («134 %»)
 * se escribe al lado: pasarse de la meta es una noticia, no un dato que
 * ocultar.
 *
 * La marca del objetivo va SIEMPRE en el borde derecho del carril —el 100 %
 * es el final de la escala por definición— así que no hace falta ninguna
 * coordenada más: basta con dibujar la línea ahí.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";
import { RADIO_DE_DATO, TINTA_DE_REJILLA, useAnchoDeGrafico } from "./chart-chrome.js";

const GRUESO = 14;
const HOLGURA = 1;
const ALTO = GRUESO + 2 * HOLGURA;
const MIN_VISIBLE = 3;

export interface PlanAdherenceProps {
  readonly label: I18nText;
  /** El porcentaje a enseñar como cifra grande, ya CAPADO al 100 % y formateado. */
  readonly percentText: string;
  /** La fracción de la barra, 0..1. Valores por encima de 1 se capan al dibujar. */
  readonly ratio: number;
  /** El porcentaje real sin capar, solo si pasó de 100 % («134 %»). */
  readonly overText?: string | undefined;
  /** «96 min de 120 min», ya redactado y formateado por la aplicación. */
  readonly progressText: string;
  /** Nombre accesible del dibujo entero. */
  readonly summary: I18nText;
  readonly className?: string | undefined;
}

export function PlanAdherence({
  label,
  percentText,
  ratio,
  overText,
  progressText,
  summary,
  className,
}: PlanAdherenceProps): ReactNode {
  const t = useI18n();
  const [ref, ancho] = useAnchoDeGrafico();
  const id = useId();

  const fraccion = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const util = Math.max(1, ancho - 2 * HOLGURA);
  const largo = Math.min(util, Math.max(MIN_VISIBLE, fraccion * util));

  return (
    <div
      data-cet-adherencia="plan"
      // SIN CAJA PROPIA A PROPOSITO. Igual que el resto de dibujos de esta
      // carpeta, el chrome -borde, lavado, medallon, titulo- lo pone
      // ScorecardPanel al montarlo; una caja aqui dentro seria una tarjeta
      // dentro de otra tarjeta. label viaja oculto: la app ya lo usa como
      // titulo del panel, y aqui solo hace falta para quien no vea el color.
      className={cn("flex h-full flex-col gap-2", className)}
      role="group"
      aria-labelledby={`${id}-resumen`}
    >
      <VisuallyHidden>{t(label)}</VisuallyHidden>
      <span className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-tight text-[var(--cet-navy)]">
          {percentText}
        </span>
        {overText !== undefined && overText.length > 0 ? (
          <span className="text-body-sm font-semibold text-[var(--cet-teal-text)]">
            {overText}
          </span>
        ) : null}
      </span>

      <div ref={ref} className="w-full">
        <svg width={ancho} height={ALTO} viewBox={`0 0 ${ancho} ${ALTO}`} aria-hidden="true" className="block">
          {/* El carril: el sitio disponible, un lavado plano y no una rejilla. */}
          <rect x={HOLGURA} y={HOLGURA} width={util} height={GRUESO} rx={RADIO_DE_DATO} fill="currentColor" opacity={0.12} />
          {/* Lo hecho, en el color de marca. */}
          <rect
            data-cet-barra="hecho"
            x={HOLGURA}
            y={HOLGURA}
            width={largo}
            height={GRUESO}
            rx={RADIO_DE_DATO}
            fill="var(--cet-primary)"
          />
          {/* El objetivo: el borde derecho del carril, siempre el 100 %. */}
          <line
            x1={ancho - HOLGURA}
            y1={0}
            x2={ancho - HOLGURA}
            y2={ALTO}
            stroke="currentColor"
            strokeWidth={2}
            opacity={TINTA_DE_REJILLA + 0.3}
          />
        </svg>
      </div>

      <p id={`${id}-resumen`} className="m-0 text-body-sm">
        {t(summary)}
      </p>
      <p aria-hidden="true" className="m-0 text-body-sm text-[var(--cet-ink-muted)]">
        {progressText}
      </p>
    </div>
  );
}
