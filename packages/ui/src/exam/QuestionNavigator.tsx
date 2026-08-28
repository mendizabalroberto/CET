"use client";

/**
 * @cet/ui — QuestionNavigator.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";

export type QuestionState = "answered" | "unanswered" | "flagged";

export interface NavigatorEntry {
  /** Posicion base 1. */
  readonly ordinal: number;
  readonly state: QuestionState;
}

export interface QuestionNavigatorProps {
  readonly entries: readonly NavigatorEntry[];
  /** Pregunta activa (base 1). */
  readonly current: number;
  readonly onNavigate: (ordinal: number) => void;
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
}

const STATE_STYLES: Readonly<Record<QuestionState, string>> = {
  answered: "bg-[var(--cet-ok-bg)] border-[var(--cet-ok-accent)] text-[var(--cet-ok-text)]",
  unanswered: "bg-[var(--cet-surface)] border-[var(--cet-border-strong)] text-[var(--cet-ink)]",
  flagged: "bg-[var(--cet-hint-bg)] border-[var(--cet-hint-accent)] text-[var(--cet-hint-text)]",
};

/**
 * Rejilla de acceso directo a cada pregunta del examen.
 *
 * El color NO es el unico canal: cada boton lleva su estado escrito en el
 * nombre accesible ("Pregunta 4, sin responder") y las marcadas anaden un punto
 * visible ademas del color de fondo. Un alumno con daltonismo tiene que poder
 * distinguir "respondida" de "sin responder" de un vistazo, y en un examen
 * cronometrado eso no es un detalle.
 *
 * Los botones son elementos normales: Tab los recorre y Enter o Espacio navegan.
 */
export function QuestionNavigator({
  entries,
  current,
  onNavigate,
  label,
  className,
}: QuestionNavigatorProps): ReactNode {
  const t = useI18n();

  const stateLabel = (state: QuestionState): string =>
    t(
      state === "answered"
        ? UI_STRINGS.answered
        : state === "flagged"
          ? UI_STRINGS.flagged
          : UI_STRINGS.unanswered,
    );

  return (
    <nav aria-label={t(label, UI_STRINGS.questionNavigator)} className={className}>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {entries.map((entry) => {
          const isCurrent = entry.ordinal === current;
          return (
            <li key={entry.ordinal}>
              <button
                type="button"
                onClick={() => onNavigate(entry.ordinal)}
                // UN control con el numero de pregunta como VALOR, y no treinta
                // controles distintos. Con `examen.navegador.p7` como id, cada
                // examen inventaria identificadores nuevos y la pregunta «cuanto
                // salta el alumno por el navegador» habria que responderla
                // sumando a mano una lista que cambia con cada examen.
                data-cet-id="examen.navegador"
                data-cet-value={String(entry.ordinal)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`${t(UI_STRINGS.question)} ${entry.ordinal}, ${stateLabel(entry.state)}`}
                className={cn(
                  "relative flex h-touch w-touch items-center justify-center rounded-sm border-2",
                  "text-body font-bold",
                  "transition-colors duration-fast ease-cet motion-reduce:transition-none",
                  STATE_STYLES[entry.state],
                  // La pregunta actual se marca con un anillo grueso, no con un
                  // color mas: hay que distinguirla del estado de respuesta.
                  isCurrent && "ring-4 ring-[var(--cet-focus)] ring-offset-1",
                )}
              >
                <span aria-hidden="true">{entry.ordinal}</span>
                {entry.state === "flagged" ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-pill bg-[var(--cet-hint-accent)]"
                  />
                ) : null}
                {/* Marca de "respondida" dibujada, no escrita: un literal como
                    "OK" seria texto de cara al usuario dentro del componente y
                    AD-7 no lo admite. Ademas anade una segunda senal al color. */}
                {entry.state === "answered" ? (
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                    className="absolute bottom-0.5 right-0.5 h-3 w-3"
                  >
                    <path
                      d="M2.5 8.5 6 12l7.5-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
