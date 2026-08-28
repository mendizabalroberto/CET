"use client";

/**
 * @cet/ui — HintPanel.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { Button } from "../primitives/Button.js";
import { Icono } from "../icons/Icono.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface HintPanelBaseProps {
  /** Texto de la pista, ya resuelto a HTML. Se sanea. */
  readonly html: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * Partido en dos: el disparador va en la zona de acciones y el cuerpo debajo.
 * `id` deja de ser opcional, y no es capricho de tipos: cada mitad es un montaje
 * distinto, con su propio `useId`, asi que el `aria-controls` del disparador
 * apuntaria a un identificador que el cuerpo nunca genera. Un lector de pantalla
 * anunciaria contenido asociado y no habria ninguno.
 */
type Partido = { readonly part: "trigger" | "panel"; readonly id: string };
/** Entero, como siempre: disparador y cuerpo juntos, y el `id` se genera solo. */
type Entero = { readonly part?: "all" | undefined; readonly id?: string | undefined };

export type HintPanelProps = HintPanelBaseProps & (Partido | Entero);

/**
 * Pista bajo demanda. El `.fb.hint` de los trainers Y6A.
 *
 * Es un desplegable explicito, no algo que aparezca solo: pedir la pista es un
 * evento de aprendizaje (`hint_requested` en `learning_events`) y tiene que
 * partir del alumno. El boton y el panel estan cableados con `aria-expanded` y
 * `aria-controls`, asi que un lector de pantalla sabe que hay contenido
 * asociado antes de abrirlo.
 */
export function HintPanel({ html, open, onOpenChange, label, className, part = "all", id }: HintPanelProps): ReactNode {
  const t = useI18n();
  const generatedId = useId();
  const panelId = `${id ?? generatedId}-hint`;

  if (part === "trigger") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        /* `w-fit` es el ancho por defecto —el disparador entero no debe
           estirarse cuando va suelto—, pero lo decide quien llama: dentro de la
           rejilla de acciones tiene que ocupar su celda, o queda un boton
           estrecho al lado de dos anchos y vuelve a no cuadrar. `cn` es
           tailwind-merge: un `w-full` de fuera gana. */
        className={cn("w-fit", className)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        {/* La bombilla sustituye al punto ambar de obs001: la misma senal,
            ahora con FORMA ademas de color, que es lo que pedia la regla de
            «ninguna senal viaja sola». Va aqui y no por la prop `icon` del
            boton porque lleva tinta propia: es el unico icono de la aplicacion
            que no hereda el color del texto. */}
        <Icono nombre="pista" className="text-[var(--cet-hint-vivid-text)]" />
        {t(label, open ? UI_STRINGS.hint : UI_STRINGS.showHint)}
      </Button>
    );
  }

  if (part === "panel") {
    return (
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "rounded-r-sm border-l-4 border-l-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-4 py-3",
          "text-body text-[var(--cet-hint-text)]",
        )}
      >
        <div className="cet-prose">{parseSafeHtml(html)}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="w-fit"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        {/* La bombilla sustituye al punto ambar de obs001: la misma senal,
            ahora con FORMA ademas de color, que es lo que pedia la regla de
            «ninguna senal viaja sola». Va aqui y no por la prop `icon` del
            boton porque lleva tinta propia: es el unico icono de la aplicacion
            que no hereda el color del texto. */}
        <Icono nombre="pista" className="text-[var(--cet-hint-vivid-text)]" />
        {t(label, open ? UI_STRINGS.hint : UI_STRINGS.showHint)}
      </Button>

      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "rounded-r-sm border-l-4 border-l-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-4 py-3",
          "text-body text-[var(--cet-hint-text)]",
        )}
      >
        <div className="cet-prose">{parseSafeHtml(html)}</div>
      </div>
    </div>
  );
}
