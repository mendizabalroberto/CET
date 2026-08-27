/**
 * @cet/ui — el UNICO punto del paquete que usa `dangerouslySetInnerHTML`.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Si buscas `dangerouslySetInnerHTML` en el repositorio, solo debe aparecer en
 * este fichero. Cualquier otra aparicion es un bug de seguridad, no un estilo
 * distinto de hacer las cosas.
 */

import type { ElementType, ReactNode } from "react";
import { sanitizeHtml, sanitizeSvg } from "./sanitize.js";
import { cn } from "./cn.js";

export interface SafeHtmlProps {
  /** HTML no confiable, tal cual sale de la base de datos. */
  readonly html: string;
  /** Etiqueta contenedora. `span` cuando el HTML es en linea. */
  readonly as?: ElementType | undefined;
  readonly className?: string | undefined;
}

/**
 * Renderiza HTML de la base de datos despues de pasarlo por `sanitizeHtml`.
 * No acepta HTML ya saneado por fuera: sanea siempre. Sanear dos veces es
 * idempotente y barato; confiar en que alguien saneo antes, no.
 */
export function SafeHtml({ html, as: Tag = "div", className }: SafeHtmlProps): ReactNode {
  const clean = sanitizeHtml(html);
  return (
    <Tag
      className={cn("cet-prose", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export interface SafeSvgProps {
  /** SVG no confiable (`RenderedBody.figureSvg`). */
  readonly svg: string;
  /**
   * Texto alternativo de la figura. Obligatorio: una figura sin alternativa
   * textual deja fuera del examen a quien usa lector de pantalla.
   */
  readonly label?: string | undefined;
  /**
   * Marca la figura como puramente decorativa. Entonces NO se emite `role="img"`
   * y `label` se ignora: un `role="img"` con nombre vacio es peor que no tener
   * rol, porque el lector lo anuncia como una imagen anonima.
   *
   * Solo debe usarse cuando la figura no aporta informacion. Si el enunciado
   * depende de ella y falta el `alt`, el contenido esta mal y hay que
   * arreglarlo en el panel de autoria, no aqui.
   */
  readonly decorative?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Renderiza un SVG inline de la base de datos despues de `sanitizeSvg`.
 * El contenedor lleva `role="img"` y el `aria-label`; el SVG en si queda oculto
 * al arbol de accesibilidad para que no se lea el texto suelto de las cotas
 * fuera de contexto.
 */
export function SafeSvg({ svg, label, decorative = false, className }: SafeSvgProps): ReactNode {
  const clean = sanitizeSvg(svg);
  const named = !decorative && typeof label === "string" && label.trim() !== "";
  return (
    <div
      role={named ? "img" : undefined}
      aria-label={named ? label : undefined}
      aria-hidden={named ? undefined : true}
      className={cn("cet-figure", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
