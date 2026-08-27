/**
 * @cet/ui — enlace para saltar al contenido.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

export interface SkipLinkProps {
  /** Id del contenedor principal, sin `#`. @default "main" */
  readonly targetId?: string | undefined;
  /** Texto del enlace. Obligatorio: el paquete no inventa textos de navegacion. */
  readonly label: I18nText;
  readonly className?: string | undefined;
}

/**
 * Primer elemento enfocable de la pagina. Invisible hasta recibir foco.
 *
 * Sin esto, alguien que navega con teclado tiene que tabular por toda la
 * cabecera y el menu en CADA pregunta del examen.
 */
export function SkipLink({ targetId = "main", label, className }: SkipLinkProps): ReactNode {
  const t = useI18n();
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "absolute left-2 top-2 z-50 -translate-y-[200%] rounded-sm bg-[var(--cet-primary)]",
        "px-4 py-3 text-[var(--cet-on-primary)] font-semibold",
        "focus-visible:translate-y-0",
        "transition-transform duration-fast ease-cet motion-reduce:transition-none",
        className,
      )}
    >
      {t(label)}
    </a>
  );
}
