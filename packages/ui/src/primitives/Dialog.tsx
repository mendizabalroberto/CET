"use client";

/**
 * @cet/ui — Dialog.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Titulo. Obligatorio: es el nombre accesible del dialogo. */
  readonly title: I18nText;
  /** Descripcion corta bajo el titulo. */
  readonly description?: I18nText | undefined;
  /** Etiqueta del boton de cerrar (nombre accesible). */
  readonly closeLabel?: I18nText | undefined;
  /** Oculta la X de cerrar: para dialogos que exigen una decision explicita. */
  readonly hideCloseButton?: boolean | undefined;
  /** Pie con los botones de accion. */
  readonly footer?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/**
 * Dialogo modal sobre Radix: foco atrapado, Escape cierra, `aria-modal`,
 * scroll del fondo bloqueado y foco devuelto al disparador al cerrar.
 *
 * La entrada se anima con opacidad y una traslacion de 4px, y ambas se anulan
 * bajo `prefers-reduced-motion`.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  hideCloseButton = false,
  footer,
  children,
  className,
}: DialogProps): ReactNode {
  const t = useI18n();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            // Sin clases de animacion: "animate-in" y "fade-in" vienen del
            // plugin tailwindcss-animate, que este paquete no declara como
            // dependencia. Estaban puestas y no existian: codigo muerto que
            // aparentaba respetar una preferencia de movimiento.
            "fixed inset-0 z-40 bg-[var(--cet-overlay)]",
          )}
        />
        <RadixDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2",
            "max-h-[88vh] overflow-y-auto rounded-lg border border-[var(--cet-line)]",
            "bg-[var(--cet-surface)] p-6 shadow-pop",
            className,
          )}
        >
          <RadixDialog.Title className="text-[21px] font-bold text-[var(--cet-ink)]">
            {t(title)}
          </RadixDialog.Title>

          {description ? (
            <RadixDialog.Description className="mt-1.5 text-body text-[var(--cet-ink-muted)]">
              {t(description)}
            </RadixDialog.Description>
          ) : null}

          <div className="mt-4">{children}</div>

          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2.5">{footer}</div> : null}

          {hideCloseButton ? null : (
            <RadixDialog.Close
              aria-label={t(closeLabel, UI_STRINGS.close)}
              className={cn(
                "absolute right-3 top-3 flex h-touch w-touch items-center justify-center rounded-sm",
                "text-[var(--cet-ink-muted)] hover:bg-[var(--cet-surface-3)] hover:text-[var(--cet-ink)]",
                "transition-colors duration-fast ease-cet motion-reduce:transition-none",
              )}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" focusable="false">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </RadixDialog.Close>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
