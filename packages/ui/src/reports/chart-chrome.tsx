"use client";

/**
 * @cet/ui — chart-chrome: el armazon comun de los graficos del informe.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EXISTE
 * ===========================================================================
 * Los cinco dibujos de esta carpeta nacieron cada uno con su lienzo de tamano
 * fijo escrito a mano —216 px la nube, 238 el reloj, 192 la constancia— y ese
 * numero era el problema entero. Un panel de informe mide unos 560 px en un
 * portatil y unos 300 en un movil; un dibujo de 192 px clavados queda flotando
 * en un tercio del panel con dos tercios de blanco al lado, que es exactamente
 * el aspecto de «grafica de ejemplo» que un padre no se cree. Y agrandar el
 * `viewBox` no lo arregla: al escalar el SVG escala tambien la letra de los
 * rotulos, asi que el mismo dibujo sale con el eje ilegible en el movil y
 * gigante en el portatil.
 *
 * La unica forma de que un dibujo LLENE su sitio sin deformar la letra es medir
 * el sitio. Eso es `useAnchoDeGrafico`: un `ResizeObserver` sobre el contenedor
 * que devuelve el ancho REAL en pixeles, con el que cada grafico se dibuja 1:1.
 * Ni escalado, ni `preserveAspectRatio`, ni trazos deformados: un pixel del
 * `viewBox` es un pixel de la pantalla, siempre.
 *
 * ===========================================================================
 * LO QUE ESTE FICHERO NO HACE
 * ===========================================================================
 * No dibuja ningun dato y no escribe ningun texto de cara al usuario (AD-7).
 * Da tres cosas: la medida del contenedor, la escala redondeada del eje y la
 * capa de aviso que se comparte entre los dibujos. Los rotulos del eje llegan
 * ya redactados por la aplicacion, como todo lo demas de esta carpeta.
 *
 * ===========================================================================
 * LA REJILLA ES REJILLA, NO DATO
 * ===========================================================================
 * Lineas de un pixel, CONTINUAS y muy atenuadas, del mismo tono que la tinta.
 * Continuas a proposito: una rejilla discontinua se lee como un umbral o una
 * proyeccion —y ademas el guion ya significa otra cosa en esta casa: «esto no
 * es tuyo, es referencia» en `CohortComparison` y «de ese dia no tenemos
 * registro» en `EffortTrend`—. Gastar el mismo canal en la rejilla borraria esa
 * distincion justo donde importa.
 *
 * ===========================================================================
 * EL AVISO NO ES LA UNICA FORMA DE LEER UN VALOR
 * ===========================================================================
 * Un `<title>` dentro de un `<rect>` es el globo del navegador: tarda medio
 * segundo, no se puede estilar y —lo que de verdad importa— NO APARECE CON EL
 * TECLADO. Quien navega con tabulador se quedaba sin la capa de detalle entera.
 * `useAviso` la sustituye por un globo propio que responde igual al raton y al
 * foco, y las marcas se hacen alcanzables con `tabIndex`.
 *
 * Y sigue siendo una capa de MEJORA, nunca la unica: cada grafico mantiene su
 * resumen escrito y su lista alternativa. Un valor que solo existe al posar el
 * raton es un valor que no existe para media plantilla.
 *
 * ===========================================================================
 * EL BLANCO DE ALCANCE
 * ===========================================================================
 * Una columna de diez pixeles de ancho es un blanco imposible con un dedo.
 * `ALCANCE` fija el minimo de 24 px de la casa, y las marcas llevan encima un
 * rectangulo transparente de ese ancho: se apunta al DIA, no a la columna.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "../lib/cn.js";

/**
 * Ancho con el que se dibuja antes de haber medido nada: el render del servidor
 * y el primero del cliente. Tiene que ser el MISMO en los dos o React avisa de
 * una hidratacion divergente, asi que es una constante y no una suposicion
 * sobre la ventana. 320 es el movil pequeno de referencia de la casa: si la
 * medida no llegara nunca, lo que queda es el dibujo del movil, que se lee en
 * todas partes; al reves —dibujar ancho y quedarse ancho— se sale del panel.
 */
export const ANCHO_INICIAL = 320;

/** Blanco minimo de una marca apuntable. Es el minimo de la casa para el dedo. */
export const ALCANCE = 24;

/** Grueso maximo de una barra o columna. Nunca llena su carril: el aire separa. */
export const GRUESO_MAXIMO = 24;

/** Radio del extremo de dato de una barra. El otro extremo apoya cuadrado. */
export const RADIO_DE_DATO = 4;

/** Opacidad de la rejilla y de los ejes. Recesivos: se ven si se buscan. */
export const TINTA_DE_REJILLA = 0.28;

/**
 * Mide el ancho REAL del contenedor y lo mantiene al dia.
 *
 * Devuelve la referencia que hay que colgar del `div` que envuelve al dibujo y
 * el ancho en pixeles. Antes de la primera medida vale `ANCHO_INICIAL`.
 *
 * `ResizeObserver` y no el evento `resize` de la ventana: el panel cambia de
 * ancho tambien cuando la ventana no cambia —al plegarse una seccion, al
 * cargar una fuente que ensancha un rotulo, al aparecer una barra de scroll— y
 * el evento de ventana no se entera de ninguna de las tres.
 */
export function useAnchoDeGrafico(): readonly [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(ANCHO_INICIAL);

  useEffect(() => {
    const nodo = ref.current;
    if (nodo === null) return;

    // Entornos de prueba y navegadores sin `ResizeObserver`: se mide una vez y
    // se deja quieto. Peor que observar, muchisimo mejor que no dibujar.
    if (typeof ResizeObserver === "undefined") {
      const medida = Math.round(nodo.getBoundingClientRect().width);
      if (medida > 0) setAncho(medida);
      return;
    }

    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (entrada === undefined) return;
      const medida = Math.round(entrada.contentRect.width);
      // Un contenedor oculto mide cero. Quedarse con el ancho anterior evita
      // dibujar un lienzo de anchura nula que luego habria que rehacer entero.
      if (medida > 0) setAncho(medida);
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return [ref, ancho] as const;
}

/*
 * La escala del eje NO vive aqui: vive en `escala.ts`, que no lleva
 * "use client". La reparte el servidor —es quien luego la rotula en el idioma
 * del tutor— y desde aqui solo se vuelve a exportar para que los dibujos de
 * esta carpeta la tengan a mano sin importar de dos sitios. La cabecera de
 * `escala.ts` cuenta por que la frontera esta donde esta.
 */
export { cortesDelEje, topeDelEje } from "./escala.js";

/** Lo que hay que saber para pintar un globo: donde y que dice. */
export interface DatoDeAviso {
  /** Coordenada horizontal en pixeles dentro del contenedor medido. */
  readonly x: number;
  /** Coordenada vertical en pixeles dentro del contenedor medido. */
  readonly y: number;
  /** La frase ya redactada por la aplicacion. Nunca se fabrica aqui. */
  readonly texto: string;
}

/**
 * El estado del globo, con la pareja de acciones que responden IGUAL al raton y
 * al foco. Que las dos entradas compartan camino no es comodidad: es la unica
 * forma de que no diverjan, que es como el teclado se quedo fuera la vez
 * anterior.
 */
export function useAviso(): {
  readonly aviso: DatoDeAviso | null;
  readonly mostrar: (dato: DatoDeAviso) => void;
  readonly ocultar: () => void;
} {
  const [aviso, setAviso] = useState<DatoDeAviso | null>(null);
  const mostrar = useCallback((dato: DatoDeAviso) => setAviso(dato), []);
  const ocultar = useCallback(() => setAviso(null), []);
  return { aviso, mostrar, ocultar };
}

export interface AvisoProps {
  readonly dato: DatoDeAviso | null;
  /** Ancho del contenedor, para que el globo no se salga por los lados. */
  readonly ancho: number;
  readonly className?: string | undefined;
}

/**
 * El globo. Va en tinta inversa sobre la tinta de la pagina —el unico bloque
 * opaco del informe— para despegarse del lavado del panel sin depender de una
 * sombra, y con `pointer-events-none` para no perseguirse a si mismo cuando el
 * raton lo alcanza.
 *
 * NO SE ANUNCIA AL LECTOR DE PANTALLA. La marca que lo abre ya lleva su propia
 * etiqueta accesible con la misma frase; anunciarlo aqui la diria dos veces.
 */
export function Aviso({ dato, ancho, className }: AvisoProps): ReactNode {
  if (dato === null) return null;

  // El globo se centra sobre la marca y se frena contra los bordes. Sin esto,
  // el aviso del primer dia y el del ultimo se salen del panel y se recortan.
  const HOLGURA = 72;
  const x = Math.min(Math.max(dato.x, HOLGURA), Math.max(HOLGURA, ancho - HOLGURA));

  return (
    <span
      aria-hidden="true"
      data-cet-aviso="grafico"
      className={cn(
        "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md px-2 py-1",
        "bg-[var(--cet-ink)] text-[var(--cet-ink-inverse)] text-body-sm font-semibold leading-tight",
        // `shadow-pop` y no `shadow-card`: el globo flota SOBRE el dibujo, y la
        // sombra de tarjeta —pensada para una caja apoyada en la pagina— no lo
        // despega lo suficiente de las columnas que tiene justo debajo.
        "whitespace-nowrap shadow-pop",
        className,
      )}
      style={{ left: `${x}px`, top: `${dato.y - 8}px` }}
    >
      {dato.texto}
    </span>
  );
}
