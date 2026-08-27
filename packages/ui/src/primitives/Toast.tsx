"use client";

/**
 * @cet/ui — Toast.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixToast from "@radix-ui/react-toast";
import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export type ToastTone = "neutral" | "success" | "danger";

const TONES: Readonly<Record<ToastTone, string>> = {
  neutral: "border-l-[var(--cet-primary)]",
  success: "border-l-[var(--cet-ok-accent)]",
  danger: "border-l-[var(--cet-no-accent)]",
};

export interface ToastProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: I18nText;
  readonly description?: I18nText | undefined;
  /** @default "neutral" */
  readonly tone?: ToastTone | undefined;
  /** Milisegundos en pantalla. 0 = no se cierra solo. @default 6000 */
  readonly duration?: number | undefined;
  readonly closeLabel?: I18nText | undefined;
  /** Accion opcional (reintentar, deshacer). */
  readonly action?: { readonly label: I18nText; readonly onAction: () => void };
  readonly className?: string | undefined;
}

/**
 * Aviso efimero.
 *
 * 6 s por defecto, no 3: WCAG 2.2.1 exige que el contenido temporizado se pueda
 * leer, y un nino de 10 anos leyendo en su segundo idioma necesita mas tiempo
 * del que asume el default de la mayoria de librerias. Un toast con `action`
 * deberia pasarse a `duration={0}`, porque una accion que se evapora no es una
 * accion.
 *
 * Nunca se usa para informacion critica del examen (tiempo agotado, fallo de
 * entrega): eso va en superficie persistente.
 */
export function Toast({
  open,
  onOpenChange,
  title,
  description,
  tone = "neutral",
  duration = 6000,
  closeLabel,
  action,
  className,
}: ToastProps): ReactNode {
  const t = useI18n();

  return (
    <RadixToast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration === 0 ? Number.MAX_SAFE_INTEGER : duration}
      className={cn(
        "flex items-start gap-3 rounded-md border border-[var(--cet-line)] border-l-4",
        "bg-[var(--cet-surface)] px-4 py-3 shadow-pop",
        TONES[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <RadixToast.Title className="text-body font-bold text-[var(--cet-ink)]">
          {t(title)}
        </RadixToast.Title>
        {description ? (
          <RadixToast.Description className="mt-0.5 text-body-sm text-[var(--cet-ink-muted)]">
            {t(description)}
          </RadixToast.Description>
        ) : null}
      </div>

      {action ? (
        <RadixToast.Action
          altText={t(action.label)}
          onClick={action.onAction}
          className="min-h-touch rounded-sm px-3 text-body-sm font-bold text-[var(--cet-teal-text)] hover:underline"
        >
          {t(action.label)}
        </RadixToast.Action>
      ) : null}

      <RadixToast.Close
        aria-label={t(closeLabel, UI_STRINGS.close)}
        className="flex h-touch w-touch flex-none items-center justify-center rounded-sm text-[var(--cet-ink-muted)] hover:bg-[var(--cet-surface-3)]"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true" focusable="false">
          <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </RadixToast.Close>
    </RadixToast.Root>
  );
}

export interface ToastViewportProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Envolver la app una vez, en la raiz del arbol cliente. */
export function ToastProvider({ children, className }: ToastViewportProps): ReactNode {
  return (
    <RadixToast.Provider swipeDirection="right">
      {children}
      <RadixToast.Viewport
        className={cn(
          "fixed bottom-0 right-0 z-50 flex w-[min(94vw,400px)] flex-col gap-2 p-4",
          className,
        )}
      />
    </RadixToast.Provider>
  );
}
