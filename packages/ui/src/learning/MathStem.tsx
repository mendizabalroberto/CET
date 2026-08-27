"use client";

/**
 * @cet/ui — MathStem.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { parseSafeHtml } from "../lib/html-to-react.js";

export interface MathStemProps {
  /**
   * `RenderedBody.stem`: HTML restringido de la base de datos, con `<b>`, `<i>`,
   * `<sub>`, `<sup>`, `<br>` y fracciones apiladas `<span class="f">`.
   */
  readonly html: string;
  /**
   * `large` para el enunciado corto y centrado de practica (el `.qtext` de Y6A),
   * `normal` para problemas de texto largos.
   * @default "normal"
   */
  readonly size?: "normal" | "large" | undefined;
  /** Etiqueta la region como el enunciado de la pregunta para el lector. */
  readonly id?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Enunciado matematico.
 *
 * Hace dos cosas que `SafeHtml` no hace:
 *
 *  1. Sanea y ademas convierte a arbol de React, sustituyendo cada fraccion
 *     apilada por `<FractionText>`. Sin esto un lector de pantalla lee
 *     "tres cuatro" donde pone tres cuartos, y el alumno responde mal por culpa
 *     de la interfaz.
 *  2. Aplica la tipografia de enunciado de los trainers, que sube a 26px en
 *     modo `large` porque son operaciones cortas que se leen de un vistazo.
 *
 * Para prosa sin matematicas, `SafeHtml` es mas barato.
 */
export function MathStem({ html, size = "normal", id, className }: MathStemProps): ReactNode {
  return (
    <div
      id={id}
      className={cn(
        "cet-prose text-[var(--cet-ink)]",
        size === "large"
          ? "text-stem-lg font-semibold [text-wrap:balance]"
          : "text-stem font-normal",
        className,
      )}
    >
      {parseSafeHtml(html)}
    </div>
  );
}
