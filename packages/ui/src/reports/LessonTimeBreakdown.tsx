"use client";

/**
 * @cet/ui — LessonTimeBreakdown: donde se concentra el esfuerzo.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * BARRAS HORIZONTALES, Y NO UN QUESO
 * ===========================================================================
 * La pregunta es «¿donde se le va el tiempo?», que es comparar magnitudes con
 * nombres largos. Un sector circular obliga a comparar angulos —que se compara
 * mal— y no tiene donde poner «Sumar y restar fracciones con distinto
 * denominador» sin una leyenda de colores que ademas seria el unico canal. Barras
 * horizontales sobre un eje comun: los nombres caben, la comparacion es de
 * longitud y se lee de arriba abajo.
 *
 * Ordenadas de mas a menos: asi la respuesta esta en la primera fila y el orden
 * es el propio dato. Entre iguales se conserva el orden de entrada (`sort` es
 * estable).
 *
 * ===========================================================================
 * UNA SERIE, UN EJE, NINGUNA LEYENDA
 * ===========================================================================
 * Todas las barras miden lo mismo —minutos— contra el mismo maximo, que sale de
 * la propia lista. Una sola serie no necesita leyenda: el titulo del panel dice
 * lo que se pinta, y una caja con un solo cuadradito de color repetiria el
 * titulo gastando sitio. El tono es `currentColor` en todas: no distingue nada,
 * porque lo que distingue las filas es el nombre escrito al lado y la longitud.
 *
 * Los minutos van ESCRITOS al final de cada barra. No es redundancia con el
 * dibujo: la barra responde «¿donde se concentra?» de un vistazo y la cifra
 * responde «¿cuanto?» —dos preguntas distintas—, y es lo unico que queda si el
 * dibujo no se puede ver.
 *
 * ===========================================================================
 * UNA CIFRA EN CADA FILA NO ES «UN NUMERO EN CADA PUNTO»
 * ===========================================================================
 * La regla de la casa contra rotular todos los puntos de una grafica es real y
 * aqui NO aplica, y conviene dejar escrito por que para que nadie «arregle» esto
 * borrando las cifras:
 *
 *  - Esa regla nace de las series densas —catorce dias, veinticuatro horas—,
 *    donde una cifra por marca produce una franja de numeros pequenos que se
 *    solapan, tapan la forma de la serie y no se leen ninguno. Ahi la forma es
 *    el dato y el numero es ruido.
 *  - Esto no es una serie: es una TABLA CON BARRAS. Hay una fila por leccion,
 *    cada una con su nombre escrito en su propio renglon, y la lista se lee
 *    linealmente de arriba abajo. La columna de cifras esta alineada y en
 *    tabulares: no se solapa con nada y se compara en vertical como una tabla.
 *  - Y sobre todo: aqui la cifra es el canal que SOBREVIVE sin el dibujo. Un
 *    reparto de tiempo que solo existiera como longitudes obligaria a medir con
 *    el ojo para saber si son 47 minutos o 40, que es justo lo que un tutor
 *    necesita saber exacto.
 *
 * Media docena de filas con una cifra cada una es una tabla legible. La regla
 * que se cita en contra habla de otra cosa.
 *
 * ===========================================================================
 * LA PARTE DEL TOTAL, SI LA APLICACION LA ESCRIBE
 * ===========================================================================
 * «47 min» responde cuanto; «el 44 % del tiempo» responde cuanta parte, que es
 * otra pregunta y muchas veces la que de verdad se hace un tutor. Se pinta si
 * viene, en `shareText`, y NO se calcula aqui: el paquete no sabe si el total
 * son estas lecciones o todas, ni sabe escribir un porcentaje en el idioma
 * activo (AD-7). Sin ese texto la fila se pinta igual, sin hueco.
 *
 * ===========================================================================
 * SIN NI UN MINUTO NO SE PINTA NADA
 * ===========================================================================
 * Una lista de lecciones a cero es la consulta vacia dibujada como resultado.
 * Misma regla que el resto de los indicadores de la casa.
 *
 * ===========================================================================
 * EL NOMBRE NO COMPARTE FILA CON LA BARRA
 * ===========================================================================
 * Nombre arriba en su renglon, barra y cifra debajo. Los nombres de leccion son
 * lo mas largo que hay en el producto y no ceden sitio a nada; ver obs003 y la
 * cabecera de `TopicCard`.
 *
 * ===========================================================================
 * POR QUE SE MIDE EL SITIO EN VEZ DE ESTIRAR EL LIENZO (LA CORRECCION)
 * ===========================================================================
 * Estas barras se dibujaban con `viewBox="0 0 100 12"` y `preserveAspectRatio=
 * "none"`, que no es una escala sino DOS —una por eje—. En un panel de 560 px
 * una unidad horizontal media 5.6 px y una vertical 1 px, y de ahi salian las
 * tres cosas que se veian: el `rx={2}` se estiraba en elipse, el trazo habia que
 * salvarlo con `vector-effect`, y el mismo `width` numerico valia distinto en
 * cada panel.
 *
 * La correccion es la de `chart-chrome`: se MIDE el hueco con
 * `useAnchoDeGrafico` y se dibuja 1:1 —un pixel del `viewBox` es un pixel de la
 * pantalla—, con lo que `RADIO_DE_DATO` es un redondeo de 4 px de verdad en
 * cualquier ancho. Se mide POR FILA, dentro de `FilaDeLeccion`, porque la cifra
 * escrita a la derecha no ocupa lo mismo en todas («1 h 05 min» frente a
 * «3 min») y por tanto el carril tampoco.
 *
 * ===========================================================================
 * EL EXTREMO DE DATO REDONDEA; LA LINEA BASE APOYA CUADRADA
 * ===========================================================================
 * El extremo derecho SIGNIFICA —es donde acaba el valor— y el izquierdo no: solo
 * apoya en el cero. `rx` redondea las cuatro esquinas y no hay atributo para
 * pedir dos, y la barra tiene que seguir siendo un `<rect>` con su `width`
 * legible. Asi que se la desborda `RADIO_DE_DATO` px hacia la izquierda y se
 * recorta en el origen: esas dos esquinas redondas caen fuera y queda un canto
 * vivo. El `width` sigue creciendo con los minutos, que es lo que se compara.
 *
 * ===========================================================================
 * LA FILA RESPONDE AL RATON Y AL TECLADO, Y NO CON UN TONO
 * ===========================================================================
 * Una lista larga de barras se recorre con el dedo o con el cursor perdiendo la
 * linea. La fila entera se ilumina al posar el raton y al recibir el foco, y las
 * dos respuestas son las MISMAS y son de forma: un contorno alrededor de la fila
 * y el nombre subrayado. Nada de un tono de fondo que desaparezca en escala de
 * grises.
 *
 * Es un punto de tabulacion por fila a proposito, no un descuido: si la
 * respuesta solo existiera al pasar el raton, quien navega con teclado no
 * tendria forma de seguir la fila —que es exactamente WCAG 2.1.1—.
 *
 * NO hay globo (`useAviso`) y es deliberado: los dos valores de la fila —los
 * minutos y, si viene, la parte del total— ya estan ESCRITOS ahi mismo. Un globo
 * repetiria lo que se lee sin acercar el raton, y para decir algo distinto
 * habria que redactar una frase dentro del paquete, que es el literal que AD-7
 * prohibe. El globo se reserva para los dibujos donde el valor no cabe escrito
 * —la serie de catorce dias, el reloj de veinticuatro horas—.
 */

import { useId, type ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { GRUESO_MAXIMO, RADIO_DE_DATO, useAnchoDeGrafico } from "./chart-chrome.js";
import { hayTiempoPorLeccion, type LessonTime } from "./scorecard-data.js";

/**
 * Grueso de barra: la MITAD del tope de la casa (`GRUESO_MAXIMO`), no un 12
 * escrito a mano. El tope vale para una marca suelta; aqui hay una fila por
 * leccion, cada una con su nombre en su renglon, y bandas de 24 px apiladas
 * convierten la lista en un muro. Sale de la constante para que mover el tope de
 * la casa mueva esto tambien, en proporcion.
 */
const GRUESO = GRUESO_MAXIMO / 2;

/**
 * Aire alrededor del carril, en pixeles. Deja sitio al medio pixel de trazo que
 * cualquier marca pueda sacar por el borde sin que el lienzo lo recorte, y evita
 * tener que pintar fuera de la caja con `overflow-visible`.
 */
const HOLGURA = 1;

/** Alto del lienzo: el carril mas el aire de arriba y el de abajo. */
const ALTO = GRUESO + 2 * HOLGURA;

/** Suelo visible: una leccion con un minuto tiene que existir en pantalla. */
const MIN_VISIBLE = 2;

/**
 * Una leccion de la lista, con el anadido opcional de la parte del total.
 *
 * Extiende `LessonTime` en vez de cambiarlo porque `LessonTime` lo comparten el
 * scorecard y la consulta: una lista de `LessonTime` sigue entrando aqui tal
 * cual, y quien tenga el porcentaje redactado lo anade sin tocar a nadie mas.
 */
export interface LessonTimeRow extends LessonTime {
  /**
   * La parte del total ya redactada y formateada por la aplicacion («44 %»,
   * «casi la mitad»). Nunca se calcula aqui: el paquete no sabe cual es el
   * total ni sabe escribir el numero en el idioma activo (AD-7).
   */
  readonly shareText?: string | undefined;
}

export interface LessonTimeBreakdownProps {
  /** Las lecciones en cualquier orden: aqui se ordenan de mas a menos tiempo. */
  readonly items: readonly LessonTimeRow[];
  readonly className?: string | undefined;
}

/** Minutos utilizables. Lo que no es un numero valido cuenta como cero. */
function minutosDe(item: LessonTime): number {
  return Number.isFinite(item.minutes) && item.minutes > 0 ? item.minutes : 0;
}

interface FilaDeLeccionProps {
  readonly leccion: LessonTimeRow;
  /** Los minutos de esta leccion sobre los de la mayor de la lista: 0..1. */
  readonly parte: number;
}

/**
 * Una fila: nombre en su renglon, y debajo el carril medido con su cifra.
 *
 * Es un componente y no un trozo de JSX dentro del `map` porque cada fila mide
 * SU hueco con su propio `useAnchoDeGrafico`, y un hook no se llama en un bucle.
 */
function FilaDeLeccion({ leccion, parte }: FilaDeLeccionProps): ReactNode {
  const [ref, ancho] = useAnchoDeGrafico();
  const id = useId();
  const recorte = `${id}-origen`;

  const util = Math.max(1, ancho - 2 * HOLGURA);
  const largo = Math.min(util, Math.max(MIN_VISIBLE, parte * util));
  const reparto = leccion.shareText;

  return (
    <li
      data-cet-fila="leccion"
      // Alcanzable con el tabulador: ver la cabecera. La respuesta al foco y al
      // raton es la misma y es de forma —contorno y subrayado—, nunca un tono.
      tabIndex={0}
      className={cn(
        "group flex flex-col gap-1 rounded-md outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        "focus-visible:outline-[var(--cet-focus)]",
      )}
    >
      {/* Renglon propio. Ver la cabecera. */}
      <span className="text-body-sm font-semibold underline-offset-2 group-hover:underline group-focus-visible:underline">
        {leccion.name}
      </span>
      <div className="flex items-center gap-2">
        <div ref={ref} className="min-w-0 flex-1">
          <svg
            width={ancho}
            height={ALTO}
            viewBox={`0 0 ${ancho} ${ALTO}`}
            aria-hidden="true"
            className="block"
          >
            <defs>
              {/* El recorte empieza en el origen del carril: las esquinas
                  redondas que la barra desborda por la izquierda se quedan
                  fuera y el extremo que apoya sale cuadrado. */}
              <clipPath id={recorte}>
                <rect x={HOLGURA} y={0} width={Math.max(1, ancho - HOLGURA)} height={ALTO} />
              </clipPath>
            </defs>

            {/* El CARRIL. Es el sitio disponible —el maximo de la lista—, no una
                linea de rejilla: por eso sigue siendo un lavado del mismo tono al
                12 % y no una hairline a `TINTA_DE_REJILLA`. Una rejilla marca
                valores intermedios; esto marca el fondo contra el que se lee la
                longitud, y ademas alinea el cero de todas las filas sin gastar
                una linea extra. Cuadrado por los dos extremos: si redondeara el
                derecho, un carril casi vacio se leeria como una barra. */}
            <rect
              x={HOLGURA}
              y={HOLGURA}
              width={util}
              height={GRUESO}
              fill="currentColor"
              opacity={0.12}
            />

            <rect
              data-cet-barra="minutos"
              // Desborde a la izquierda: lo que el recorte convierte en canto
              // vivo. El `width` lleva el desborde constante sumado y sigue
              // siendo monotono en los minutos, que es lo que se compara.
              x={HOLGURA - RADIO_DE_DATO}
              y={HOLGURA}
              width={largo + RADIO_DE_DATO}
              height={GRUESO}
              rx={RADIO_DE_DATO}
              clipPath={`url(#${recorte})`}
              fill="currentColor"
            />
          </svg>
        </div>
        {/* La cifra, siempre escrita. Es lo unico que sobrevive si el dibujo no
            se ve, y responde una pregunta que la barra no. Ver la cabecera:
            esto es una tabla con barras, no una serie rotulada punto a punto. */}
        <span className="shrink-0 tabular-nums text-body-sm font-semibold">
          {leccion.minutesText}
        </span>
        {/* La parte del total, si la aplicacion la escribe. Se distingue de los
            minutos por el PESO de la letra, no por un gris: dentro de un panel
            de scorecard `--cet-ink-muted` se queda en 4.45:1 sobre el lavado de
            materia, por debajo de lo que exige WCAG 1.4.3. */}
        {reparto !== undefined && reparto.length > 0 ? (
          <span data-cet-parte="del-total" className="shrink-0 tabular-nums text-body-sm">
            {reparto}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function LessonTimeBreakdown({ items, className }: LessonTimeBreakdownProps): ReactNode {
  // Ni un minuto en toda la lista: no hay reparto que pintar. Ver la cabecera.
  // La condicion la decide `hayTiempoPorLeccion`, que es la misma que consulta
  // el scorecard para saber si monta el panel: una sola definicion.
  if (!hayTiempoPorLeccion(items)) return null;

  const maximo = Math.max(...items.map(minutosDe), 1);

  const ordenadas = [...items].sort((a, b) => minutosDe(b) - minutosDe(a));

  return (
    <ul
      data-cet-lista="tiempo-por-leccion"
      className={cn("m-0 flex list-none flex-col gap-3 p-0", className)}
    >
      {ordenadas.map((leccion, index) => (
        <FilaDeLeccion
          key={`${index}-${leccion.name}`}
          leccion={leccion}
          parte={minutosDe(leccion) / maximo}
        />
      ))}
    </ul>
  );
}
