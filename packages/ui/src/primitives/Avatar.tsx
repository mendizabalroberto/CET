"use client";

/**
 * @cet/ui — Avatar.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import * as RadixAvatar from "@radix-ui/react-avatar";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type AvatarSize = "sm" | "md" | "lg";

const SIZES: Readonly<Record<AvatarSize, string>> = {
  sm: "h-8 w-8 text-[13px]",
  md: "h-11 w-11 text-body-sm",
  lg: "h-14 w-14 text-body-lg",
};

export interface AvatarProps {
  /**
   * Nombre de la persona. Se usa como `alt` de la imagen y como fuente de las
   * iniciales. No es opcional: un avatar sin nombre es ruido para el lector.
   */
  readonly name: string;
  /** URL de la foto. Si falla o no existe, se muestran las iniciales. */
  readonly src?: string | undefined;
  /** @default "md" */
  readonly size?: AvatarSize | undefined;
  readonly className?: string | undefined;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * Avatar con degradacion a iniciales.
 *
 * Nota de privacidad: en listados de alumnos el avatar NO debe llevar la foto
 * salvo que el colegio lo haya autorizado. Este componente no decide eso; solo
 * pinta lo que se le pasa.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size = "md", className },
  ref,
): ReactNode {
  return (
    <RadixAvatar.Root
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center overflow-hidden rounded-pill align-middle",
        "border border-[var(--cet-line)] bg-[var(--cet-surface-3)]",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <RadixAvatar.Image src={src} alt={name} className="h-full w-full object-cover" />
      ) : null}
      <RadixAvatar.Fallback
        delayMs={src ? 400 : 0}
        className="flex h-full w-full items-center justify-center font-bold text-[var(--cet-ink)]"
      >
        <span aria-hidden="true">{initials(name)}</span>
        <span className="absolute h-px w-px overflow-hidden [clip-path:inset(50%)]">{name}</span>
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
});
