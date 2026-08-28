/**
 * @cet/ui — el icono de un tema de practica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ESTE COMPONENTE ES EL QUE IDENTIFICA EL TEMA
 * ===========================================================================
 * No el color: los diez temas de `/practice` son de la misma materia y por
 * tanto comparten el mismo tono. Lo unico que distingue «Simplificar» de
 * «Comparar» sin leer es esta silueta. Las tres reglas de dibujo son las de
 * `SubjectIcon`, y valen aqui por el mismo motivo:
 *
 *   1. SILUETAS DISTINTAS, no variaciones. Se tienen que distinguir a 20 px y
 *      en escala de grises, y ademas de las siete siluetas de materia: el
 *      alumno ve las dos familias en la misma sesion.
 *   2. SOLO TRAZO, con `currentColor`. El icono no trae color propio: hereda el
 *      del contenedor, que es quien ha medido su contraste.
 *   3. `aria-hidden`. El nombre del tema va escrito al lado, siempre.
 *
 * Grosor de trazo 2 sobre un lienzo de 24, como los de materia: sobrevive al
 * escalado del medallon sin cerrarse por dentro.
 */
import type { ReactNode, SVGProps } from "react";

import { cn } from "../lib/cn.js";

import { topicIdentity, type TopicIdentityCode } from "./topic-identity.js";

/**
 * Las once siluetas. La clave es la que ya normalizo `topicIdentity()`, no la
 * cruda: asi un tema desconocido no puede colarse hasta aqui y quedarse sin
 * dibujo.
 *
 * CUATRO DE LOS DIEZ TEMAS SON DE FRACCIONES, y es ahi donde el dibujo se cae
 * solo: `simplify`, `compare`, `fracop` y `mixed` acabarian siendo la misma
 * barrita con un adorno distinto. Por eso cada uno sale de una FAMILIA DE
 * OBJETO distinta —herramienta, aparato, signo, tarta— y no de una variacion
 * del mismo trazo: a 20 px lo que el ojo separa es la silueta entera, no el
 * adorno.
 *
 * Ninguna repite tampoco las siete de materia (cruz, libro, bocadillo, matraz,
 * globo, pantalla, marcador), porque el alumno ve las dos familias en la misma
 * sesion: por eso `fracop` es el signo de dividir y no otra cruz, y `word` es
 * un interrogante y no otro libro.
 */
const PATHS: Readonly<Record<TopicIdentityCode, string>> = {
  /*
   * Tijeras: simplificar es cortar, no calcular. Las anillas son grandes y las
   * hojas cortas A PROPOSITO: con hojas largas el medallon de 24 px se lee como
   * un aspa, y un aspa en una app de matematicas es el signo de multiplicar.
   * Lo que separa esta silueta del aspa son las dos anillas, asi que pesan.
   */
  simplify:
    "M9.4 4.6L15.6 13.2M14.6 4.6L8.4 13.2M6.6 13.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8M17.4 13.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8",
  /* Balanza de dos platos: comparar es pesar cual de las dos es mayor. */
  compare: "M12 4.8V19M8.6 19h6.8M5 8.4h14M5 8.4L2.4 12.6h5.2zM19 8.4L16.4 12.6h5.2z",
  /* Signo de dividir: la barra de fraccion con su cifra arriba y abajo. */
  fracop: "M4.5 12h15M12 6.6h0.01M12 17.4h0.01",
  /*
   * Ida y vuelta: dos flechas opuestas, que es lo que dice el rotulo del tema
   * («Impropias <-> mixtas»). Antes eran una tarta entera y media tarta, una al
   * lado de la otra; a 24 px eso no se leia como dos tartas sino como las
   * letras «OD», porque dos formas del mismo tamano y a la misma altura son la
   * composicion de dos glifos de texto. Un medallon que parece una palabra es
   * peor que ninguno: el alumno intenta leerlo.
   */
  mixed:
    "M4 8.6h16M4 8.6L7.2 5.6M4 8.6L7.2 11.6M20 15.4H4M20 15.4L16.8 12.4M20 15.4L16.8 18.4",
  /* Tira de decimas: la unidad partida en diez, que es de donde sale la coma. */
  decimal: "M3 8.6h18v6.8H3zM7.5 8.6v6.8M12 8.6v6.8M16.5 8.6v6.8",
  /* Flecha que salta por encima del punto: se mueven las cifras, no la coma. */
  powten: "M4 16C6.5 8 17.5 8 20 16M20 16L20.7 13.1M20 16L17.8 14M12 19.6h0.01",
  /* Escalera de unidades: la de km-m-cm, que ya se sube y se baja en clase. */
  metric: "M3.6 19.2h4.2v-4.2h4.2v-4.2h4.2v-4.2h3.4",
  /* Figura en L con la costura a la vista: dos rectangulos, no un poligono. */
  shape: "M4.6 4.6h7.8v7.8h7v7h-14.8zM4.6 12.4h7.8",
  /* Interrogante: el enunciado pregunta algo. Deliberadamente NO es un libro. */
  word: "M8.4 9.1a3.6 3.6 0 1 1 5.4 3.1c-1.2.7-1.8 1.5-1.8 2.8v0.9M12 19.6h0.01",
  /* Dado: `mix` no es un tema, es un sorteo entre los demas. */
  mix: "M4.8 4.8h14.4v14.4H4.8zM9 9h0.01M12 12h0.01M15 15h0.01",
  /* Rombo: el tema que este design system aun no conoce. */
  otro: "M12 3.8L20.2 12L12 20.2L3.8 12z",
};

export interface TopicIconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Clave del tema (`simplify`, `compare`, ...). Una desconocida cae en la neutra. */
  readonly code: string;
}

export function TopicIcon({ code, className, ...rest }: TopicIconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("h-6 w-6 flex-none", className)}
      {...rest}
    >
      <path
        d={PATHS[topicIdentity(code)]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
