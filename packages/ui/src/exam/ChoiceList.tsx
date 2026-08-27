"use client";

/**
 * @cet/ui — ChoiceList.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { UI_STRINGS } from "../lib/strings.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";

export interface Choice {
  /** Id estable de la opcion; es lo que se guarda en `attempt_responses`. */
  readonly id: string;
  /** HTML de la opcion (`RenderedBody.options[].html`). Se sanea. */
  readonly html: string;
}

export interface ChoiceListProps {
  readonly choices: readonly Choice[];
  /** Ids seleccionados. Controlado siempre: el estado vive en el intento. */
  readonly value: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  /** `single` = radio, `multi` = checkbox. @default "single" */
  readonly mode?: "single" | "multi" | undefined;
  /** Enunciado asociado, para `aria-labelledby` del grupo. */
  readonly labelledBy?: string | undefined;
  /** Bloquea la interaccion (examen entregado, revision). */
  readonly disabled?: boolean | undefined;
  /**
   * Marca visual de correccion por opcion, para la revision posterior.
   * En modo examen NUNCA se pasa: la clave no sale de la base de datos.
   */
  readonly review?: Readonly<Record<string, ReviewState>> | undefined;
  readonly className?: string | undefined;
}

type ReviewState = "correct" | "incorrect" | "missed";

const REVIEW_STYLES: Readonly<Record<ReviewState, string>> = {
  correct: "border-[var(--cet-ok-accent)] bg-[var(--cet-ok-bg)]",
  incorrect: "border-[var(--cet-no-accent)] bg-[var(--cet-no-bg)]",
  missed: "border-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)]",
};

/** Tinta del glifo. Es la variante LEGIBLE del tono, no la decorativa. */
const REVIEW_INK: Readonly<Record<ReviewState, string>> = {
  correct: "text-[var(--cet-ok-text)]",
  incorrect: "text-[var(--cet-no-text)]",
  missed: "text-[var(--cet-hint-text)]",
};

/**
 * Segundo canal, el que ve el ojo: una FORMA distinta por estado.
 *
 * Existe porque `REVIEW_STYLES` por si solo incumple WCAG 1.4.1. Bajo
 * deuteranopia `--cet-ok-accent` y `--cet-no-accent` dan 1.10:1 entre si, y los
 * fondos `--cet-ok-bg` / `--cet-no-bg` estan a 1.01:1 hasta para vision normal:
 * las tres filas de una revision eran indistinguibles y el alumno no podia leer
 * su propia correccion.
 *
 * Se dibuja como trazo SVG y no como letra ("OK", "?"): un literal aqui seria
 * texto de cara al usuario escrito en el componente, y AD-7 no lo admite. Una
 * forma no tiene idioma. El texto del estado va aparte, por `UI_STRINGS`.
 *
 * Las formas son las mismas que ya usan `CorrectFeedback` e `IncorrectFeedback`
 * —check, y barra con punto— para que el alumno no aprenda dos vocabularios. El
 * aspa roja no se usa a proposito: la barra con punto se distingue igual de bien
 * bajo cualquier deficiencia de color y no cierra la puerta a seguir intentando.
 */
const REVIEW_GLYPH: Readonly<Record<ReviewState, ReactNode>> = {
  correct: (
    <path
      d="M5.5 10.5 8.5 13.5 14.5 6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  incorrect: (
    <>
      <path d="M10 5.5v5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1.1" fill="currentColor" />
    </>
  ),
  missed: (
    <>
      <path
        d="M7.4 8.1a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.8.7-.8 1.3v.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="14.6" r="1.1" fill="currentColor" />
    </>
  ),
};

/** Tercer canal, el que oye el lector de pantalla. */
const REVIEW_TEXT: Readonly<Record<ReviewState, I18nText>> = {
  correct: UI_STRINGS.reviewCorrect,
  incorrect: UI_STRINGS.reviewIncorrect,
  missed: UI_STRINGS.reviewMissed,
};

/**
 * Lista de opciones de respuesta.
 *
 * Por que no usa `<RadioGroup>` de Radix: el contenido de cada opcion es HTML de
 * la base de datos que puede incluir fracciones apiladas, y necesitamos control
 * total sobre el area clicable, que aqui es la fila entera y no un circulo de
 * 24px. En una tablet compartida de colegio esa diferencia se traduce en
 * respuestas perdidas.
 *
 * Teclado, patron ARIA de `radiogroup` implementado a mano:
 *  - Tab entra y sale del grupo (una sola parada, no una por opcion);
 *  - Flechas arriba/izquierda y abajo/derecha mueven y seleccionan;
 *  - Home y End van a la primera y la ultima;
 *  - Espacio selecciona la opcion enfocada.
 * En modo `multi` cada opcion es un checkbox independiente y Tab si recorre una
 * a una, que es el patron correcto para casillas.
 */
export function ChoiceList({
  choices,
  value,
  onChange,
  mode = "single",
  labelledBy,
  disabled = false,
  review,
  className,
}: ChoiceListProps): ReactNode {
  const t = useI18n();
  const groupId = useId();
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const selected = new Set(value);

  const select = useCallback(
    (id: string): void => {
      if (disabled) return;
      if (mode === "single") {
        onChange([id]);
        return;
      }
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Se conserva el orden de `choices` para que la respuesta persistida sea
      // estable y comparable entre revisiones.
      onChange(choices.map((c) => c.id).filter((cid) => next.has(cid)));
    },
    [choices, disabled, mode, onChange, value],
  );

  const moveFocus = useCallback(
    (from: number, delta: number): void => {
      const count = choices.length;
      if (count === 0) return;
      const next = (from + delta + count) % count;
      const node = itemRefs.current[next];
      node?.focus();
      const target = choices[next];
      if (mode === "single" && target) select(target.id);
    },
    [choices, mode, select],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, index: number, id: string): void => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          moveFocus(index, 1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          moveFocus(index, -1);
          break;
        case "Home":
          event.preventDefault();
          moveFocus(-1, 1);
          break;
        case "End":
          event.preventDefault();
          moveFocus(0, -1);
          break;
        case " ":
        case "Enter":
          event.preventDefault();
          select(id);
          break;
        default:
          break;
      }
    },
    [moveFocus, select],
  );

  /** En un radiogroup solo hay UNA parada de tabulacion: la opcion elegida. */
  const rovingIndex = (() => {
    if (mode !== "single") return -1;
    const idx = choices.findIndex((c) => selected.has(c.id));
    return idx === -1 ? 0 : idx;
  })();

  return (
    <div
      role={mode === "single" ? "radiogroup" : "group"}
      aria-labelledby={labelledBy}
      aria-describedby={`${groupId}-help`}
      aria-disabled={disabled || undefined}
      className={cn("flex flex-col gap-2.5", className)}
    >
      <p id={`${groupId}-help`} className="text-body-sm text-[var(--cet-ink-muted)]">
        {t(mode === "single" ? UI_STRINGS.chooseOne : UI_STRINGS.chooseSeveral)}
      </p>

      {choices.map((choice, index) => {
        const isSelected = selected.has(choice.id);
        const reviewState = review?.[choice.id];
        return (
          <div
            key={choice.id}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            role={mode === "single" ? "radio" : "checkbox"}
            aria-checked={isSelected}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : mode === "single" ? (index === rovingIndex ? 0 : -1) : 0}
            onClick={() => select(choice.id)}
            onKeyDown={(event) => handleKeyDown(event, index, choice.id)}
            className={cn(
              "flex min-h-touch-comfy cursor-pointer items-start gap-3 rounded-md border-2 px-4 py-3",
              "bg-[var(--cet-surface)] text-body text-[var(--cet-ink)]",
              "border-[var(--cet-border-strong)]",
              "transition-colors duration-fast ease-cet motion-reduce:transition-none",
              !disabled && "hover:bg-[var(--cet-surface-2)]",
              // Seleccionado: borde grueso + relleno del indicador + aria-checked.
              // Tres senales, no solo color.
              isSelected && "border-[var(--cet-primary)] bg-[var(--cet-rule-bg)]",
              reviewState && REVIEW_STYLES[reviewState],
              disabled && "cursor-default opacity-90",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-6 w-6 flex-none items-center justify-center border-2",
                mode === "single" ? "rounded-pill" : "rounded-sm",
                isSelected
                  ? "border-[var(--cet-primary)] bg-[var(--cet-primary)] text-[var(--cet-on-primary)]"
                  : "border-[var(--cet-border-strong)]",
              )}
            >
              {isSelected ? (
                mode === "single" ? (
                  <span className="h-2.5 w-2.5 rounded-pill bg-[var(--cet-on-primary)]" />
                ) : (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" focusable="false">
                    <path
                      d="M2.5 8.5 6 12l7.5-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              ) : null}
            </span>
            <span className="cet-prose min-w-0 flex-1">{parseSafeHtml(choice.html)}</span>
            {/* Estado de revision: forma + texto + color. Los tres, siempre.
                El texto entra en el nombre accesible de la opcion, que es lo
                que anuncia el lector de pantalla al recorrer el radiogroup. */}
            {reviewState ? (
              <span className={cn("mt-0.5 flex flex-none items-center", REVIEW_INK[reviewState])}>
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="h-5 w-5">
                  <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  {REVIEW_GLYPH[reviewState]}
                </svg>
                <VisuallyHidden>{t(REVIEW_TEXT[reviewState])}</VisuallyHidden>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
