/**
 * @cet/ui — Card.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

/**
 * `Omit<..., "title">`: el atributo nativo `title` de HTML es un `string` (el
 * tooltip del navegador). Aqui `title` es un `I18nText` que se pinta como
 * encabezado, asi que hay que retirar el nativo antes de redeclararlo — si no,
 * TypeScript lo marca como extension incompatible (TS2430).
 */
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Titulo de la tarjeta. Se pinta como `h2` salvo que se cambie `headingAs`. */
  readonly title?: I18nText | undefined;
  /** Frase de entrada bajo el titulo (el `.lead` de los trainers Y6A). */
  readonly lead?: I18nText | undefined;
  /** @default "h2" */
  readonly headingAs?: "h2" | "h3" | "h4" | undefined;
  readonly padding?: "none" | "sm" | "md" | undefined;
}

/** Superficie base del producto: el `.card` de los trainers Y6A. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { title, lead, headingAs: Heading = "h2", padding = "md", className, children, ...rest },
  ref,
): ReactNode {
  const t = useI18n();
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] shadow-card",
        padding === "md" && "px-5 py-4",
        padding === "sm" && "px-4 py-3",
        className,
      )}
      {...rest}
    >
      {title ? (
        <Heading className="mb-1 text-[21px] font-bold text-[var(--cet-ink)]">{t(title)}</Heading>
      ) : null}
      {lead ? <p className="mb-3 text-body-sm text-[var(--cet-ink-muted)]">{t(lead)}</p> : null}
      {children}
    </div>
  );
});
