"use client";

/**
 * @cet/ui — MasteryOverview: «como voy en general», en un solo dibujo.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA PREGUNTA QUE NADIE RESPONDIA
 * ===========================================================================
 * La escalera de `MasteryLadder` responde «como llevo ESTE tema». Repetida diez
 * veces no responde «como voy», igual que diez termometros no son un parte
 * meteorologico: para saberlo hay que recorrer las diez tarjetas y sumarlas de
 * cabeza, y eso no lo hace un nino de once anos.
 *
 * Esto es lo unico que hay en pantalla que agrega. Una columna por tema,
 * ordenadas de menos a mas nivel: la silueta que sale ES la respuesta. Sube por
 * la derecha = va bien; plana y baja = le queda casi todo. Se lee sin contar y
 * sin leer.
 *
 * ===========================================================================
 * POR QUE NO ES UN PORCENTAJE NI UNA MEDIA
 * ===========================================================================
 * Una media de niveles («2,4 sobre 4») es un numero que no significa nada para
 * el alumno y que ademas MIENTE por compresion: dominar cuatro temas y no haber
 * tocado los otros cuatro da la misma media que ir regular en los ocho, y son
 * dos situaciones que piden cosas distintas. Las columnas no comprimen: se ve
 * cuantas hay altas y cuantas quedan por levantar.
 *
 * ===========================================================================
 * LOS NO MEDIDOS TAMBIEN SE PINTAN, Y ES DELIBERADO
 * ===========================================================================
 * Un tema sin evidencia no se omite: se dibuja como un tocon HUECO y mucho mas
 * bajo que cualquier nivel. Sin el, tres columnas altas se leerian igual tanto
 * si el curso son tres temas como si son doce, y el dibujo estaria mintiendo por
 * omision. El tocon no dice «vas mal» —no esta relleno y no llega a la altura
 * del primer nivel— dice «esto esta sin medir», que es lo que pasa.
 *
 * ===========================================================================
 * SIN NINGUN TEMA MEDIDO NO SE PINTA NADA
 * ===========================================================================
 * Solo tocones seria una medida de cero para un alumno que no ha empezado, y
 * cero no es ausencia (ver `__tests__/progreso-viene-de-datos.test.tsx`). En esa
 * pantalla ya hablan las tarjetas con su «Sin practicar todavia».
 *
 * ===========================================================================
 * NADA DEPENDE DEL COLOR
 * ===========================================================================
 * Nivel = ALTURA. Medido / sin medir = macizo y alto contra hueco y bajo, que
 * son dos canales. Los cuatro niveles comparten tono, igual que en `MasteryLadder`,
 * asi que este fichero no declara ningun `Record<Nivel, clase-de-color>` y no
 * tiene nada que declarar en `estados-no-solo-color.test.tsx`. Ademas el resumen
 * va escrito al lado y en el nombre accesible del dibujo.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import type { MasteryLevel } from "../data/mastery-level.js";
import { MASTERY_STEPS } from "./MasteryLadder.js";

export interface MasteryOverviewProps {
  /**
   * Un elemento por tema, en cualquier orden: aqui se ordenan. `null` es «sin
   * evidencia suficiente», no «cero».
   */
  readonly levels: readonly (MasteryLevel | null)[];
  /**
   * La frase que resume el dibujo, ya contada e interpolada por quien llama.
   * Nunca se fabrica aqui: este componente no sabe de temas ni de recuentos.
   */
  readonly summary: I18nText;
  readonly className?: string | undefined;
}

/**
 * Geometria. Es el indicador MAS grande de la pantalla a proposito: es el unico
 * que responde «como voy», y lo que se lee de un vistazo tiene que ganar al
 * detalle que hay debajo.
 */
const BAR = 12;
const GAP = 6;
/**
 * Alto del tocon de un tema sin medir. Muy por debajo del primer nivel (11) para
 * que no se confunda con «empezando»: es «sin medir», no un nivel bajo.
 */
const STUB = 4;
/** Alto de un nivel: 1 -> STEP, 4 -> 4 * STEP. */
const STEP = 11;

/** Nivel en altura de columna. `null` es el tocon. */
function alturaDe(level: MasteryLevel | null): number {
  return level === null ? STUB : (MASTERY_STEPS.indexOf(level) + 1) * STEP;
}

export function MasteryOverview({ levels, summary, className }: MasteryOverviewProps): ReactNode {
  const t = useI18n();
  const id = useId();

  // Sin nada medido no hay dibujo. Ver la cabecera.
  if (levels.length === 0) return null;
  if (levels.every((l) => l === null)) return null;

  // De menos a mas. El orden de entrada es el de la parrilla, que es arbitrario
  // para esta pregunta; ordenar es lo que convierte diez barras en una silueta.
  const ordenados = [...levels].sort((a, b) => alturaDe(a) - alturaDe(b));

  const width = ordenados.length * BAR + (ordenados.length - 1) * GAP;
  const height = alturaDe("mastered");
  const text = t(summary);

  return (
    <p className={cn("flex flex-wrap items-center gap-3", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-title`}
        className="block shrink-0"
      >
        <title id={`${id}-title`}>{text}</title>
        {ordenados.map((level, index) => {
          const barHeight = alturaDe(level);
          const medido = level !== null;
          return (
            <rect
              key={`${index}-${level ?? "none"}`}
              x={index * (BAR + GAP)}
              y={height - barHeight}
              width={BAR}
              height={barHeight}
              rx={2}
              // `currentColor` por el mismo motivo que en `MasteryLadder`: asi el
              // contraste del dibujo es por construccion el del texto que tiene
              // al lado, que ya esta validado en los dos fondos.
              fill={medido ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1}
              // Medido = macizo y alto. Sin medir = hueco y bajo. Dos
              // diferencias de FORMA, ninguna de tono.
              //
              // Aqui NO se usa el trazo discontinuo que `MasteryLadder` usa para
              // sus peldanos pendientes, y es una decision medida, no un olvido:
              // a 4 px de alto un guion de 2-2 no se lee como contorno, se lee
              // como suciedad (comprobado en pantalla antes de cambiarlo). El
              // canal que aqui sustituye al guion es la ALTURA, que la escalera
              // no tenia disponible porque todos sus peldanos vacios miden lo
              // que les toca por posicion.
              opacity={medido ? 1 : 0.7}
            />
          );
        })}
      </svg>
      {/* El dibujo ya lleva el resumen en su <title>; repetirlo para el lector
          lo diria dos veces. Visualmente si tiene que estar: es el canal que no
          depende de contar columnas. */}
      <span aria-hidden="true" className="text-body-sm font-semibold text-[var(--cet-ink)]">
        {text}
      </span>
    </p>
  );
}
