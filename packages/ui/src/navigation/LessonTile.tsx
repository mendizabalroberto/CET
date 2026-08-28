"use client";

/**
 * @cet/ui — LessonTile.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EXISTE
 * ===========================================================================
 * Dentro de una materia el alumno veia una lista de enlaces de texto: todas las
 * lecciones iguales, sin saber cual habia abierto ya ni por donde iba. La ficha
 * arregla dos fallos concretos:
 *
 *   1. El objetivo pulsable era el titulo, de unos pocos pixeles de alto. Aqui
 *      el enlace ENVUELVE la ficha entera y declara `min-h-touch`
 *      (--cet-touch-min = 44px), que es el minimo de 2.5.5 y lo que hace falta
 *      con un dedo de once anos sobre el portatil tactil del colegio.
 *   2. El estado no se veia. Ahora se dice por TRES canales a la vez, y en este
 *      orden: la silueta del glifo, el texto para el lector, y el color.
 *
 * ===========================================================================
 * EL COLOR ES EL TERCER CANAL, NUNCA EL PRIMERO
 * ===========================================================================
 * En deuteranopia (Vienot 1999) el verde y el rojo de esta paleta son el mismo
 * color, 1.29:1 entre ellos — esta escrito y medido en la seccion ACENTO VIVO
 * de `tokens.css`. Uno de cada doce ninos varones no los distingue. Por eso los
 * tres estados no comparten dibujo repintado: son tres geometrias distintas
 * (anillo vacio / anillo medio lleno / marca de verificacion) y cada uno lleva
 * ademas su texto en `VisuallyHidden`. Quitado el color, la ficha sigue
 * diciendo lo mismo. Lo vigilan `__tests__/fichas-de-leccion.test.tsx` y, para
 * toda la familia, `__tests__/estados-no-solo-color.test.tsx`.
 *
 * `started` es un estado de primera clase, no un `not_started` con matiz: el
 * alumno que abrio la leccion y se fue necesita ver por donde iba, y esa es
 * justo la informacion que una lista de enlaces le negaba.
 *
 * ===========================================================================
 * SIN TEXTOS PROPIOS (AD-7)
 * ===========================================================================
 * Ni una cadena de cara al usuario vive aqui. `stateLabel` es OBLIGATORIA: un
 * tipo que dejara omitirla seria un tipo que permite publicar el estado solo en
 * glifo y color, que es exactamente el fallo que este fichero existe para
 * evitar. El `href` y el `title` llegan ya resueltos por la app: este
 * componente no sabe de rutas, ni de base de datos, ni de idiomas.
 */

import { type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";

export type LessonState = "not_started" | "started" | "completed";

/** Un trazo del glifo. `filled` distingue el relleno de la silueta del trazo. */
interface Stroke {
  readonly d: string;
  readonly filled: boolean;
}

/**
 * La forma y la tinta de cada estado, juntas a proposito.
 *
 * Van en un solo mapa porque son una sola decision: cambiar la tinta sin mirar
 * la forma es como se llega a tres estados que solo se diferencian en el color.
 * Aqui las dos cosas estan a la vista en la misma linea.
 *
 * Las tres geometrias son distintas de verdad, no el mismo dibujo repintado:
 * anillo vacio, anillo con la mitad rellena, y marca de verificacion.
 */
const GLYPH: Readonly<
  Record<LessonState, { readonly ink: string; readonly marks: readonly Stroke[] }>
> = {
  not_started: {
    ink: "text-[var(--cet-ink-muted)]",
    marks: [],
  },
  started: {
    // El azul del sistema es "la tarea en la que estas", no un acierto.
    ink: "text-[var(--cet-step-vivid-text)]",
    marks: [{ d: "M9 2.7a5.3 5.3 0 0 1 0 10.6Z", filled: true }],
  },
  completed: {
    ink: "text-[var(--cet-ok-accent)]",
    marks: [{ d: "M5.4 8.3 7.7 10.6 12 5.9", filled: false }],
  },
};

/** El anillo comun. No identifica nada por si solo: lo que dice el estado va dentro. */
const RING = "M9 1.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8Z";

export interface LessonTileProps {
  /** Ya resuelto al idioma por la app. */
  readonly title: string;
  /** Ya construido por la app. Este componente no sabe de rutas. */
  readonly href: string;
  readonly state: LessonState;
  /** `estimated_minutes`; `null` = no consta, y entonces no se pinta cifra alguna. */
  readonly minutes: number | null;
  /** El texto del estado. Obligatorio: sin el, el estado se quedaria en glifo y color. */
  readonly stateLabel: I18nText;
  /** El texto de los minutos ya interpolado ("12 min"). Solo se lee si `minutes` consta. */
  readonly minutesLabel?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * Ficha de leccion: un unico enlace que envuelve estado, titulo y minutos.
 *
 * Un enlace de verdad y no un `div` con manejador: asi funcionan el teclado, el
 * "abrir en pestana nueva" y el lector de pantalla sin escribir una linea de
 * JavaScript. Este componente no tiene estado propio ni escucha eventos; de
 * cliente es solo por `useI18n`, igual que `ProgressBar`.
 */
export function LessonTile({
  title,
  href,
  state,
  minutes,
  stateLabel,
  minutesLabel,
  className,
}: LessonTileProps): ReactNode {
  const t = useI18n();
  const glyph = GLYPH[state];
  const stateText = t(stateLabel);
  const minutesText = t(minutesLabel);
  const showMinutes = minutes !== null;

  return (
    <a
      href={href}
      data-state={state}
      className={cn(
        "flex min-h-touch w-full items-center gap-3 rounded-md border border-[var(--cet-line)]",
        "bg-[var(--cet-surface)] px-3 py-2.5 text-body no-underline",
        "text-[var(--cet-ink)] hover:bg-[var(--cet-surface-2)]",
        className,
      )}
    >
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        focusable="false"
        className={cn("h-5 w-5 flex-none", glyph.ink)}
      >
        <path d={RING} fill="none" stroke="currentColor" strokeWidth="1.6" />
        {glyph.marks.map((mark) => (
          <path
            key={mark.d}
            d={mark.d}
            fill={mark.filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={mark.filled ? "0" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <span className="min-w-0 flex-1 font-semibold">{title}</span>

      {/*
       * El estado en texto. Va detras del titulo para que el nombre accesible
       * de la ficha empiece por la leccion y no por "Terminada", que es lo que
       * el alumno oiria repetido doce veces seguidas al recorrer la lista.
       */}
      <VisuallyHidden>{stateText}</VisuallyHidden>

      {showMinutes ? (
        <span className="flex flex-none items-center gap-1 text-[var(--cet-ink-muted)]">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="h-4 w-4">
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M8 4.6V8l2.4 1.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          {/*
           * Con etiqueta traducida, la cifra suelta se esconde del lector y este
           * oye "12 minutos" en su idioma. Sin ella la cifra se lee tal cual:
           * un numero no es un literal traducible, pero tampoco lleva unidad.
           */}
          <span aria-hidden={minutesText.length > 0 ? "true" : undefined} className="tabular-nums">
            {minutes}
          </span>
          {minutesText.length > 0 ? <VisuallyHidden>{minutesText}</VisuallyHidden> : null}
        </span>
      ) : null}
    </a>
  );
}
