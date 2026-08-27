"use client";

/**
 * @cet/ui — AutosaveIndicator.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { LiveRegion } from "../a11y/LiveRegion.js";

export type AutosaveState = "idle" | "saving" | "saved" | "offline" | "retrying";

export interface AutosaveIndicatorProps {
  readonly state: AutosaveState;
  /** Hora del ultimo guardado confirmado por el SERVIDOR. */
  readonly lastSavedAt?: Date | undefined;
  readonly className?: string | undefined;
}

const STATE_STYLES: Readonly<Record<AutosaveState, string>> = {
  idle: "text-[var(--cet-ink-muted)]",
  saving: "text-[var(--cet-ink-muted)]",
  saved: "text-[var(--cet-ok-text)]",
  // `offline` y `retrying` NO son rojo: no ha pasado nada malo todavia y el
  // trabajo del alumno sigue a salvo. Rojo aqui provoca abandono.
  offline: "text-[var(--cet-hint-text)]",
  retrying: "text-[var(--cet-hint-text)]",
};

const STATE_TEXT: Readonly<Record<AutosaveState, I18nText>> = {
  idle: UI_STRINGS.autosaveNever,
  saving: UI_STRINGS.autosaveSaving,
  saved: UI_STRINGS.autosaveSaved,
  offline: UI_STRINGS.autosaveOffline,
  retrying: UI_STRINGS.autosaveRetrying,
};

/**
 * Estado del autoguardado del intento.
 *
 * Dos reglas de tono, y las dos importan mas que el diseno:
 *
 *  1. Sin conexion NO es un error. El mensaje dice que se sigue guardando en el
 *     dispositivo, en ambar, sin icono de alarma. Un nino que lee "Error al
 *     guardar" en mitad de un examen deja de hacer el examen.
 *  2. "Guardado" solo se muestra cuando lo ha confirmado el SERVIDOR. Decirlo
 *     antes es mentir sobre lo unico que el alumno necesita creer.
 *
 * Los cambios se anuncian en `polite`: nunca interrumpen la lectura de una
 * pregunta.
 */
export function AutosaveIndicator({
  state,
  lastSavedAt,
  className,
}: AutosaveIndicatorProps): ReactNode {
  const t = useI18n();
  const text = t(STATE_TEXT[state]);

  const time =
    state === "saved" && lastSavedAt
      ? lastSavedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <div className={cn("inline-flex items-center gap-2 text-body-sm", STATE_STYLES[state], className)}>
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 flex-none rounded-pill",
          state === "saved" && "bg-[var(--cet-ok-accent)]",
          state === "saving" && "bg-[var(--cet-ink-muted)] animate-pulse motion-reduce:animate-none",
          (state === "offline" || state === "retrying") && "bg-[var(--cet-hint-accent)]",
          state === "idle" && "bg-[var(--cet-line)]",
        )}
      />
      <span>
        {text}
        {time ? ` ${time}` : ""}
      </span>
      <LiveRegion message={text} politeness="polite" />
    </div>
  );
}
