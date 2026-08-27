/**
 * @cet/ui — Skeleton.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { HTMLAttributes, ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Numero de lineas del bloque. @default 1 */
  readonly lines?: number | undefined;
  /**
   * Texto anunciado mientras se carga. Cae al "Cargando" del diccionario del
   * paquete si no se pasa.
   */
  readonly label?: I18nText | undefined;
}

/**
 * Marcador de carga.
 *
 * El pulso se apaga bajo `prefers-reduced-motion` (`motion-reduce:animate-none`):
 * un rectangulo latiendo a pantalla completa provoca malestar real a quien tiene
 * sensibilidad vestibular, y aqui no aporta informacion.
 */
export function Skeleton({ lines = 1, label, className, ...rest }: SkeletonProps): ReactNode {
  const t = useI18n();
  return (
    // `className` va al CONTENEDOR, no a cada linea: pasarlo a las lineas hacia
    // imposible ajustar el hueco que ocupa el bloque desde fuera.
    <div role="status" aria-live="polite" aria-busy="true" className={cn(className)} {...rest}>
      <VisuallyHidden>{t(label, UI_STRINGS.loading)}</VisuallyHidden>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: Math.max(1, lines) }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 rounded-sm bg-[var(--cet-surface-3)]",
              "animate-pulse motion-reduce:animate-none",
              i === lines - 1 && lines > 1 && "w-2/3",
            )}
          />
        ))}
      </div>
    </div>
  );
}
