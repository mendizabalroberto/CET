"use client";

/**
 * @cet/ui — EffortMeter: "cuanto esfuerzo mas", en cosas que se pueden contar.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL PROBLEMA QUE RESUELVE, Y EL QUE NO SE PUEDE CREAR
 * ===========================================================================
 * "Te falta el 40 %" no es accionable para un nino de once anos: no sabe cuantas
 * preguntas son, ni si son diez minutos o diez dias. Y "te faltan 200 preguntas"
 * es peor todavia: es honesto y hace abandonar. Las dos formas obvias fallan.
 *
 * Este componente solo sabe pintar UNA cosa: un objetivo pequeno, alcanzable de
 * una sentada, expresado en unidades que el alumno controla. Quien llama calcula
 * el numero a partir de datos reales; aqui solo se dibuja.
 *
 * `targets` esta acotado a `MAX_TARGETS`. No es un detalle de dibujo: es la
 * defensa de diseno. Si alguna vez el calculo produjera 200, este componente
 * no lo pintaria — cortaria en el tope y el numero grande no llegaria a la
 * pantalla de un nino. El objetivo tiene que ser pequeno POR CONSTRUCCION.
 *
 * ===========================================================================
 * NADA DEPENDE DEL COLOR
 * ===========================================================================
 * Los objetivos pendientes son circulos en contorno y el mensaje va SIEMPRE
 * escrito al lado ("2 aciertos y subes a Lo llevas bien"). Quitando el color, el
 * componente sigue diciendo lo mismo: la cuenta esta en la forma y en el texto.
 *
 * Sin nada pendiente (`targets <= 0`) devuelve `null`: no se inventa un aliento
 * generico donde no hay dato.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

/** Tope duro. Ver la cabecera: el objetivo tiene que caber en una sentada. */
export const MAX_TARGETS = 10;

export interface EffortMeterProps {
  /**
   * Cuantas cosas concretas faltan (aciertos, preguntas). Debe venir de un
   * calculo sobre datos reales, nunca de una constante de maquetacion.
   */
  readonly targets: number;
  /** El mensaje completo, ya interpolado por quien llama y traducido. */
  readonly message: I18nText;
  readonly className?: string | undefined;
}

const DOT = 9;
const GAP = 5;

export function EffortMeter({ targets, message, className }: EffortMeterProps): ReactNode {
  const t = useI18n();
  const id = useId();

  const pending = Math.min(Math.max(Math.trunc(targets), 0), MAX_TARGETS);
  if (pending <= 0) return null;

  const width = pending * DOT + (pending - 1) * GAP;
  const text = t(message);

  return (
    <p className={cn("flex flex-wrap items-center gap-2", className)}>
      <svg
        width={width}
        height={DOT}
        viewBox={`0 0 ${width} ${DOT}`}
        role="img"
        aria-labelledby={`${id}-title`}
        className="block shrink-0"
      >
        <title id={`${id}-title`}>{text}</title>
        {Array.from({ length: pending }, (_, index) => (
          <circle
            key={index}
            cx={index * (DOT + GAP) + DOT / 2}
            cy={DOT / 2}
            r={DOT / 2 - 0.75}
            fill="none"
            stroke="var(--cet-amber-text)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      {/* El dibujo ya lleva el texto en su <title>; repetirlo aqui para el
          lector lo diria dos veces. Visualmente si tiene que estar. */}
      <span aria-hidden="true" className="text-body-sm font-semibold text-[var(--cet-ink)]">
        {text}
      </span>
    </p>
  );
}
