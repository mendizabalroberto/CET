"use client";

/**
 * @cet/ui — EffortTrend: la constancia, un dia por columna.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA PREGUNTA QUE RESPONDE
 * ===========================================================================
 * «180 minutos esta quincena» no distingue al alumno que estudia veinte minutos
 * cada tarde del que no toco nada en trece dias y se metio tres horas la vispera
 * del examen. Para el profesor esos dos ninos necesitan conversaciones opuestas,
 * y la suma —la unica cifra que suele haber— los pinta iguales. La silueta si
 * los separa, y se lee sin contar: parejo o un pico solo.
 *
 * Por eso es una columna por dia y no una linea: los dias son cubos discretos,
 * y una linea entre el lunes y el miercoles dibuja un martes que no existe.
 *
 * ===========================================================================
 * TRES ESTADOS, Y EL DE EN MEDIO ES EL QUE SIEMPRE SE PIERDE
 * ===========================================================================
 * Un dia puede estar en tres situaciones, y las tres se dibujan distinto SIN
 * usar el color (WCAG 1.4.1):
 *
 *   estudio        columna MACIZA, alta en proporcion a los minutos, con un
 *                  suelo de `MIN_ACTIVO` para que un dia de dos minutos exista
 *                  en pantalla en vez de desaparecer contra la linea base.
 *   estudio cero   ZOCALO MACIZO de `TICK_CERO` pegado a la linea base. Es un
 *                  dato, y por eso esta relleno como los demas datos: dice «ese
 *                  dia sabemos que fueron cero minutos».
 *   sin dato       columna HUECA de `TOCON_SIN_DATO` con el trazo DISCONTINUO,
 *                  el mismo guion con el que `MasteryLadder` marca lo que aun no
 *                  esta. Dice «de ese dia no tenemos registro».
 *
 * La diferencia entre los dos ultimos importa mas de lo que parece. Si el cero
 * se dibujara como un hueco, o el hueco como un cero, el profesor leeria «falto
 * cuatro dias» cuando lo que paso fue que el portatil del aula no sincronizo, y
 * eso es una conversacion con una familia basada en un fallo de infraestructura.
 * Son dos canales de forma —relleno macizo contra contorno, y trazo continuo
 * contra discontinuo— mas la altura, que tambien difiere. Ninguno es el tono: en
 * escala de grises, en blanco y negro y en deuteranopia se siguen distinguiendo.
 *
 * Y el hueco no puede ser mas alto que el suelo de un dia con estudio: un «sin
 * dato» que sobresale se lee como un dia bueno. `TOCON_SIN_DATO < MIN_ACTIVO`,
 * y hay una prueba que lo fija.
 *
 * ===========================================================================
 * SIN NINGUN DIA CON REGISTRO NO SE PINTA NADA
 * ===========================================================================
 * Catorce tocones huecos no son una grafica de constancia: son la ausencia de la
 * consulta dibujada como si fuera un resultado. Es la misma regla de
 * `MasteryOverview` y de `__tests__/progreso-viene-de-datos.test.tsx`. En cambio
 * una serie de ceros SI se pinta: catorce zocalos macizos son la respuesta
 * —dura, pero cierta— a «¿ha estudiado?».
 *
 * ===========================================================================
 * UN SOLO COLOR, Y NI SIQUIERA ES SUYO
 * ===========================================================================
 * Hay una sola serie, asi que no hay identidad que codificar y no hace falta
 * leyenda: el titulo del panel dice que se esta pintando. Las columnas usan
 * `currentColor`, como la escalera y la vista de conjunto, de modo que el
 * contraste del dibujo es por construccion el del texto que tiene al lado —ya
 * medido sobre el lavado y sobre la superficie, en claro y en oscuro—. La linea
 * base va al mismo tono con opacidad baja: es rejilla, no dato.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni una cadena de cara al usuario vive aqui. `summary` es el nombre accesible
 * del dibujo y va ademas escrito debajo, porque quien no puede contar columnas
 * necesita leerlo. Cada dia trae su propio `label` ya redactado y formateado por
 * la aplicacion —solo ella sabe de calendario, idioma y huso— y es lo que sale
 * al posar el raton sobre la columna.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { haySerieDeEsfuerzo, minutosDelDia, type EffortDay } from "./scorecard-data.js";

/** Ancho de columna. Muy por debajo del tope de 24 px: catorce dias en un movil. */
const ANCHO = 10;
/** Aire entre columnas. Es el separador; no se dibuja ningun borde para separar. */
const HUECO = 4;
/** Alto util del area de dibujo, de la linea base al maximo de la serie. */
const ALTO = 68;
/** Suelo de un dia CON estudio. Debajo de esto un dia corto no se veria. */
const MIN_ACTIVO = 10;
/** Zocalo macizo de un dia a cero. Un dato pequeno, pero un dato. */
const TICK_CERO = 3;
/** Tocon hueco de un dia sin registro. Por debajo del suelo de un dia activo. */
const TOCON_SIN_DATO = 7;

export interface EffortTrendProps {
  /** Un elemento por dia, en orden cronologico. Los dias a cero vienen incluidos. */
  readonly series: readonly EffortDay[];
  /**
   * La frase que resume el dibujo, ya contada e interpolada por quien llama.
   * Nunca se fabrica aqui: este componente no sabe de fechas ni de recuentos.
   */
  readonly summary: I18nText;
  readonly className?: string | undefined;
}

export function EffortTrend({ series, summary, className }: EffortTrendProps): ReactNode {
  const t = useI18n();
  const id = useId();

  // Sin dias, o con todos los dias sin registro, no hay dibujo. Ver la cabecera.
  // La condicion la decide `haySerieDeEsfuerzo`, que es tambien la que consulta
  // el scorecard para saber si monta el panel: una sola definicion.
  if (!haySerieDeEsfuerzo(series)) return null;

  /* El maximo de la propia serie es la escala. No hay un maximo fijo escondido:
     una escala constante haria que el dibujo se pintara igual pase lo que pase
     con los datos en cuanto todos los dias cayeran por debajo de ella. */
  const maximo = Math.max(
    ...series.map((d) => minutosDelDia(d) ?? 0),
    1,
  );

  const width = series.length * ANCHO + (series.length - 1) * HUECO;
  const texto = t(summary);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <svg
        width={width}
        height={ALTO}
        viewBox={`0 0 ${width} ${ALTO}`}
        role="img"
        aria-labelledby={`${id}-title`}
        // `overflow-visible`: el trazo de una columna hueca va centrado en el
        // borde, y en la primera y la ultima medio pixel cae fuera del
        // viewBox. Recortado, el guion de ese lado desaparece.
        className="block max-w-full overflow-visible"
        preserveAspectRatio="xMinYMax meet"
      >
        <title id={`${id}-title`}>{texto}</title>

        {/* Linea base. Rejilla: mismo tono, muy atenuada, continua y de un pixel.
            Sin ella los zocalos de los dias a cero flotan y dejan de leerse como
            «cero» para leerse como «migas». */}
        <line
          x1={0}
          y1={ALTO - 0.5}
          x2={width}
          y2={ALTO - 0.5}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.35}
        />

        {series.map((dia, index) => {
          const minutos = minutosDelDia(dia);
          const sinDato = minutos === null;
          const cero = minutos === 0;

          const alto = sinDato
            ? TOCON_SIN_DATO
            : cero
              ? TICK_CERO
              : // `ALTO - 1` y no `ALTO`: el trazo de un pixel va centrado en el
                // borde, asi que la columna mas alta perderia medio pixel por
                // arriba contra el limite del viewBox.
                Math.max(MIN_ACTIVO, Math.round((minutos / maximo) * (ALTO - 1)));

          const etiqueta = t(dia.label);

          return (
            <rect
              key={index}
              data-cet-dia={sinDato ? "sin-dato" : cero ? "cero" : "con-minutos"}
              x={index * (ANCHO + HUECO)}
              y={ALTO - alto}
              width={ANCHO}
              height={alto}
              // Extremo redondeado arriba; abajo la esquina se come el radio
              // contra la linea base, que es donde tiene que apoyarse.
              rx={2}
              // Con registro = MACIZO. Sin registro = HUECO y discontinuo. Dos
              // diferencias de forma; ninguna de tono. Ver la cabecera.
              fill={sinDato ? "none" : "currentColor"}
              // La columna maciza NO lleva trazo: un borde alrededor de una marca
              // anade tinta que no es dato, y quien separa las columnas es el
              // hueco. El contorno es la marca ENTERA del dia sin registro.
              stroke={sinDato ? "currentColor" : undefined}
              strokeWidth={sinDato ? 1 : undefined}
              strokeDasharray={sinDato ? "2 2" : undefined}
              opacity={sinDato ? 0.7 : 1}
            >
              {/* Lo que sale al posar el raton. El nombre accesible del dibujo ya
                  es el resumen; esto es la capa de detalle del que puede apuntar. */}
              {etiqueta.length > 0 ? <title>{etiqueta}</title> : null}
            </rect>
          );
        })}
      </svg>

      {/* El dibujo ya lleva el resumen en su <title>; repetirlo para el lector lo
          diria dos veces. Visualmente si tiene que estar: es el canal que no
          depende de contar columnas. Tinta heredada, nunca la atenuada: el panel
          es un lavado de materia y ahi el gris no llega a 4.5:1. */}
      <p aria-hidden="true" className="m-0 text-body-sm font-semibold">
        {texto}
      </p>
    </div>
  );
}
