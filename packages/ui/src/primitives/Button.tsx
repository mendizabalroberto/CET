"use client";

/**
 * @cet/ui — Button.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  // blanco sobre navy = 11.53:1
  primary:
    "bg-[var(--cet-primary)] text-[var(--cet-on-primary)] hover:bg-[var(--cet-primary-hover)] border border-transparent",
  // ink sobre surface = 16.49:1; borde fuerte para cumplir el 3:1 de controles
  secondary:
    "bg-[var(--cet-surface)] text-[var(--cet-ink)] border border-[var(--cet-border-strong)] hover:bg-[var(--cet-surface-2)]",
  ghost:
    "bg-transparent text-[var(--cet-ink)] border border-transparent hover:bg-[var(--cet-surface-3)]",
  // #3a2a00 sobre amber = 6.83:1. NO se usa texto blanco sobre ambar: 1.9:1.
  accent:
    "bg-[var(--cet-amber)] text-[var(--cet-on-amber)] border border-transparent hover:brightness-95",
  // --cet-on-danger sobre --cet-danger: 5.44:1 en claro, 7.98:1 en oscuro.
  // NO se usa `dark:` aqui: esa variante solo cubre [data-theme="dark"], y el
  // usuario que tiene el SISTEMA en oscuro sin haber elegido nada se quedaba con
  // texto blanco sobre #ff8a80 (2.28:1). El token lo resuelve en los dos casos.
  danger:
    "bg-[var(--cet-danger)] text-[var(--cet-on-danger)] border border-transparent hover:brightness-95",
};

const SIZES: Readonly<Record<ButtonSize, string>> = {
  // Ningun tamano baja de 44px de alto: objetivo tactil minimo de WCAG 2.5.5.
  sm: "min-h-touch px-4 text-body-sm",
  md: "min-h-touch px-5 text-body",
  lg: "min-h-touch-comfy px-7 text-body-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "primary" */
  readonly variant?: ButtonVariant | undefined;
  /** @default "md" */
  readonly size?: ButtonSize | undefined;
  /** Ocupa todo el ancho disponible. Util en movil. */
  readonly fullWidth?: boolean | undefined;
  /**
   * Muestra el boton como ocupado y lo deshabilita.
   * Usa `aria-busy`, no un texto: el texto lo pone quien llama, en su idioma.
   */
  readonly loading?: boolean | undefined;
  /** Renderiza el hijo en lugar de un `<button>` (para envolver un `<a>`). */
  readonly asChild?: boolean | undefined;
}

/**
 * Boton del design system.
 *
 * Decisiones:
 *  - `type="button"` por defecto. El default de HTML es `submit`, y un boton de
 *    "Ver pista" que envia el formulario del examen es un bug que solo aparece
 *    en produccion.
 *  - `loading` deshabilita pero mantiene el nodo enfocable via `aria-disabled`
 *    solo cuando hay `asChild`; en el caso normal usa `disabled` real.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    asChild = false,
    className,
    disabled,
    type,
    children,
    ...rest
  },
  ref,
): ReactNode {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : (disabled ?? loading)}
      aria-busy={loading || undefined}
      aria-disabled={asChild && (disabled ?? loading) ? true : undefined}
      data-loading={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-semibold",
        "transition-colors duration-fast ease-cet motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
});
