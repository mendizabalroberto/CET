"use client";

/**
 * @cet/ui — CohortComparison: el alumno frente a la media de su clase.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA COMPARACION SE OCULTA SI LA COHORTE ES PEQUENA
 * ===========================================================================
 * El umbral y su justificacion viven en `scorecard-data.ts` (`MIN_COHORTE`), que
 * es tambien de donde lo lee el servidor. En resumen: por debajo de cinco
 * alumnos la media la mueve un solo companero y ademas se puede despejar su
 * dato restando, asi que la comparacion se retira ENTERA. No atenuada, no con un
 * asterisco, no «orientativa»: una cifra dudosa en una pantalla se lee como una
 * cifra, y la conclusion que invita a sacar sobre un nino de once anos es falsa.
 *
 * Lo que SI se pinta en su lugar, si la aplicacion lo pasa, es la frase que
 * explica por que no hay comparacion. Sin ella el profesor busca el fallo: un
 * bloque que a veces esta y a veces no, sin decir nada, se reporta como bug y se
 * «arregla» bajando el umbral. Si la aplicacion no pasa la frase no se escribe
 * ningun literal (AD-7) y el componente devuelve `null`: mejor la ausencia que
 * un hueco vacio.
 *
 * ===========================================================================
 * DOS BARRAS, Y LA DIFERENCIA NO ES DE COLOR
 * ===========================================================================
 * El alumno va MACIZO; la media de la clase, HUECA y con el trazo discontinuo
 * —el mismo guion con el que la casa marca «esto no es tuyo, es referencia»—.
 * Ademas cada barra lleva su rotulo escrito encima y su cifra escrita al lado,
 * asi que quitando el color entero la lectura no pierde nada. No hay ningun
 * `Record<estado, clase-de-color>` en este fichero, y no lo puede haber.
 *
 * ===========================================================================
 * LAS DOS BARRAS COMPARTEN EJE, Y NO LO ELIGEN ELLAS
 * ===========================================================================
 * Quien llama pasa las dos magnitudes ya normalizadas al MISMO 0..1. Es la unica
 * forma de que la comparacion sea honesta: dos escalas distintas en un dibujo
 * inventan una relacion que no esta en los datos, que es el error de grafica mas
 * caro que existe. Aqui no se calcula ninguna escala, precisamente para que no
 * haya dos.
 *
 * ===========================================================================
 * EL NOMBRE NO COMPARTE FILA CON LA BARRA
 * ===========================================================================
 * Rotulo arriba en su renglon; barra y cifra debajo. Es la leccion de obs003:
 * un rotulo con un vecino que no cede sitio se parte con el primer nombre largo
 * («Media de la clase de 6.º B»), y en produccion eso se vio como dos textos
 * pintados uno sobre otro.
 *
 * ===========================================================================
 * POR QUE SE MIDE EL SITIO EN VEZ DE ESTIRAR EL LIENZO (LA CORRECCION)
 * ===========================================================================
 * Estas barras se dibujaban con `viewBox="0 0 100 12"` y `preserveAspectRatio=
 * "none"`. Eso NO es una escala: es DOS escalas distintas, una por eje. En un
 * panel de 560 px, una unidad horizontal media 5.6 px y una vertical 1 px, con
 * tres consecuencias que se veian todas:
 *
 *  1. **Las esquinas salian elipses.** Un `rx={2}` se estira con el eje: el
 *     radio horizontal acababa siendo cinco veces el vertical, y el extremo de
 *     la barra era un ovalo distinto en cada ancho de panel.
 *  2. **El trazo se deformaba.** Habia que tapar el sintoma con
 *     `vector-effect="non-scaling-stroke"`; el guion de la barra hueca, en
 *     cambio, seguia contandose en unidades estiradas.
 *  3. **El dibujo mentia sobre si mismo.** El mismo `width` numerico valia
 *     cosas fisicas distintas segun el panel, asi que ninguna medida del SVG
 *     era comparable con nada.
 *
 * La correccion es la de `chart-chrome`: se MIDE el hueco con
 * `useAnchoDeGrafico` y se dibuja 1:1 —un pixel del `viewBox` es un pixel de la
 * pantalla—. Con eso `RADIO_DE_DATO` es un redondeo de 4 px de verdad, igual en
 * el movil y en el portatil, y `non-scaling-stroke` sobra y se ha retirado: ya
 * no hay nada que compensar.
 *
 * Se mide POR FILA (un `useAnchoDeGrafico` dentro de `FilaDeBarra`) y no una vez
 * para las dos: el carril de cada fila es lo que le deja la cifra escrita a su
 * derecha, y esa cifra no mide lo mismo en las dos filas («128 min» y «96 min»
 * en tabulares si, pero «1 h 05 min» y «12 min» no). Medir una vez y suponer que
 * la otra fila mide igual es volver a inventarse una escala.
 *
 * ===========================================================================
 * EL EXTREMO DE DATO REDONDEA; LA LINEA BASE APOYA CUADRADA
 * ===========================================================================
 * Una barra tiene un extremo que SIGNIFICA —donde acaba el valor— y otro que no:
 * el que apoya en el cero. Redondear los dos los iguala visualmente y ademas
 * despega la barra del origen. Un `rx` de SVG, sin embargo, redondea las cuatro
 * esquinas y no hay atributo para pedir dos.
 *
 * La barra tiene que seguir siendo un `<rect>` con su `width` legible —es lo que
 * comprueban las pruebas de que la longitud sale del dato—, asi que en vez de
 * cambiarla por un `<path>` se la desborda `RADIO_DE_DATO` px hacia la izquierda
 * y se recorta en el origen: las dos esquinas redondas de ese lado caen fuera
 * del recorte y lo que queda es un canto vivo. El `width` del rectangulo sigue
 * creciendo con el dato (lleva el desborde constante sumado), que es lo unico
 * que importa para comparar longitudes.
 *
 * El recorte se lleva por delante el trazo vertical de la barra HUECA en el
 * origen. No es un descuido: en su lugar hay una linea de origen —hairline
 * continua a `TINTA_DE_REJILLA`— que es la que cierra el contorno. El guion
 * queda asi reservado entero para «esto es la referencia, no es tuyo», que es lo
 * que significa en esta casa.
 *
 * ===========================================================================
 * SIN LINEA DE REFERENCIA CRUZANDO LA BARRA DEL ALUMNO (DECISION)
 * ===========================================================================
 * Se ha considerado marcar la media de la clase con una vertical fina sobre la
 * barra del alumno, para no tener que leer dos longitudes seguidas. Se ha
 * descartado, y conviene que quede escrito para no reabrirlo:
 *
 *  - En **guion** repetiria el canal que ya significa «referencia» en la barra
 *    de abajo, y un mismo canal con dos formas distintas de la misma idea se
 *    lee como dos ideas.
 *  - En **tinta de rejilla** seria una marca de DATO pintada con la tinta que
 *    en todo el informe significa «esto no es dato». Peor: caeria justo al lado
 *    de la linea de origen, que si es rejilla.
 *  - En **tinta plena** desaparece: dentro de la barra maciza del alumno va
 *    tinta sobre tinta, y fuera de ella va tinta sobre el lavado del panel, o
 *    sea que la marca solo se veria en la mitad de los casos —justo en los que
 *    el alumno va por debajo—.
 *
 * Y sobre todo: aqui hay DOS filas separadas por 12 px sobre el mismo eje. El
 * recorrido del ojo entre un extremo y el otro es de un centimetro. La linea de
 * referencia resuelve un problema que este dibujo no tiene, gastando un canal
 * que este dibujo si necesita.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import {
  GRUESO_MAXIMO,
  RADIO_DE_DATO,
  TINTA_DE_REJILLA,
  useAnchoDeGrafico,
} from "./chart-chrome.js";
import { hayCohorteSuficiente } from "./scorecard-data.js";

/**
 * Grueso de barra: la MITAD del tope de la casa (`GRUESO_MAXIMO`), no un 12
 * escrito a mano. El tope es para una marca suelta; aqui van dos barras apiladas
 * con su rotulo encima cada una, y una banda de 24 px por fila convertiria el
 * bloque en cuatro franjas gruesas sin aire entre ellas. Sale de la constante
 * para que subir el tope de la casa suba tambien esto, en proporcion.
 */
const GRUESO = GRUESO_MAXIMO / 2;

/**
 * Aire alrededor del carril, en pixeles. El trazo de la barra hueca va CENTRADO
 * en el borde del rectangulo, asi que medio pixel cae fuera por cada lado; sin
 * este margen el recorte del lienzo se lo comeria y el contorno saldria fino
 * arriba y abajo. Antes esto se resolvia con `overflow-visible`, que dejaba al
 * dibujo pintar fuera de su caja.
 */
const HOLGURA = 1;

/** Alto del lienzo: el carril mas el aire de arriba y el de abajo. */
const ALTO = GRUESO + 2 * HOLGURA;

/** Suelo visible de una barra con valor: un valor pequeno tiene que existir. */
const MIN_VISIBLE = 3;

export interface CohortComparisonProps {
  /**
   * Cuantos alumnos aportan al promedio, el propio incluido. Por debajo de
   * `MIN_COHORTE` no se pinta comparacion. Ver `scorecard-data.ts`.
   */
  readonly cohortSize: number;
  /** Rotulo de la barra del alumno («Ana», «Este alumno»). */
  readonly studentLabel: I18nText;
  /** Su valor ya formateado con unidades («128 min»). */
  readonly studentValueText: string;
  /** Su valor normalizado a 0..1 contra la MISMA escala que el de la clase. */
  readonly studentRatio: number;
  /** Rotulo de la barra de la clase («Media de la clase»). */
  readonly classLabel: I18nText;
  /** El valor medio ya formateado. */
  readonly classValueText: string;
  /** La media normalizada a 0..1 contra la MISMA escala que la del alumno. */
  readonly classRatio: number;
  /**
   * La frase que explica que no hay comparacion porque el grupo es pequeno.
   * Sin ella, con cohorte insuficiente no se pinta nada.
   */
  readonly tooSmallText?: I18nText | undefined;
  /** Nombre accesible del dibujo: la comparacion contada en una frase. */
  readonly summary: I18nText;
  readonly className?: string | undefined;
}

/** Normaliza a 0..1. Lo que no es un numero utilizable vale cero, no `NaN`. */
function fraccion(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return Math.min(valor, 1);
}

/** Lo que hace falta para pintar una de las dos filas. Todo ya resuelto. */
interface FilaDeBarraProps {
  readonly clave: "alumno" | "clase";
  readonly rotulo: string;
  readonly cifra: string;
  readonly parte: number;
  /** `true` = el alumno (macizo). `false` = la clase (hueca y discontinua). */
  readonly propio: boolean;
}

/**
 * Una fila: rotulo en su renglon, y debajo el carril medido con su cifra.
 *
 * Es un componente y no un trozo de JSX en el bucle porque cada fila mide SU
 * hueco con su propio `useAnchoDeGrafico`, y un hook no se llama dentro de un
 * `map`. Ver la cabecera: los dos carriles no tienen por que medir igual.
 */
function FilaDeBarra({ clave, rotulo, cifra, parte, propio }: FilaDeBarraProps): ReactNode {
  const [ref, ancho] = useAnchoDeGrafico();
  const id = useId();
  const recorte = `${id}-origen`;

  // El carril util: el lienzo menos el aire de los dos lados.
  const util = Math.max(1, ancho - 2 * HOLGURA);
  const largo = Math.min(util, Math.max(MIN_VISIBLE, parte * util));

  return (
    <div data-cet-fila={clave} className="flex flex-col gap-1">
      {/* Renglon propio para el rotulo. Ver la cabecera. */}
      {rotulo.length > 0 ? <span className="text-body-sm">{rotulo}</span> : null}
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
              {/* El recorte empieza en el origen del carril: las dos esquinas
                  redondas que la barra desborda por la izquierda se quedan
                  fuera y el extremo que apoya sale cuadrado. */}
              <clipPath id={recorte}>
                <rect x={HOLGURA} y={0} width={Math.max(1, ancho - HOLGURA)} height={ALTO} />
              </clipPath>
            </defs>

            {/* El CARRIL. Es el sitio disponible, no una linea de rejilla: por
                eso sigue siendo un lavado del mismo tono al 12 % y no una
                hairline a `TINTA_DE_REJILLA`. Una rejilla marca valores; esto
                marca el fondo contra el que se lee la longitud. Cuadrado por los
                dos extremos a proposito: si redondeara el derecho, un carril
                vacio se leeria como una barra llena. */}
            <rect
              x={HOLGURA}
              y={HOLGURA}
              width={util}
              height={GRUESO}
              fill="currentColor"
              opacity={0.12}
            />

            {/* La LINEA DE ORIGEN: hairline continua a la tinta de rejilla de la
                casa. Hace dos cosas a la vez: dice donde esta el cero comun de
                las dos barras y cierra el contorno de la hueca, cuyo canto
                izquierdo se lleva el recorte. Continua, nunca discontinua: el
                guion significa otra cosa en este mismo dibujo. */}
            <rect
              x={0}
              y={0}
              width={HOLGURA}
              height={ALTO}
              fill="currentColor"
              opacity={TINTA_DE_REJILLA}
            />

            <rect
              data-cet-barra={propio ? "alumno" : "clase"}
              // Desborde a la izquierda: lo que el recorte convierte en canto
              // vivo. El `width` lleva el desborde sumado y sigue siendo
              // monotono en el dato, que es lo que se compara.
              x={HOLGURA - RADIO_DE_DATO}
              y={HOLGURA}
              width={largo + RADIO_DE_DATO}
              height={GRUESO}
              rx={RADIO_DE_DATO}
              clipPath={`url(#${recorte})`}
              // El alumno macizo; la clase hueca y discontinua. Dos canales de
              // FORMA. El tono es el mismo en las dos.
              fill={propio ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray={propio ? undefined : "3 2"}
            />
          </svg>
        </div>
        <span className="shrink-0 tabular-nums text-body-sm font-semibold">{cifra}</span>
      </div>
    </div>
  );
}

export function CohortComparison({
  cohortSize,
  studentLabel,
  studentValueText,
  studentRatio,
  classLabel,
  classValueText,
  classRatio,
  tooSmallText,
  summary,
  className,
}: CohortComparisonProps): ReactNode {
  const t = useI18n();
  const id = useId();

  /* La puerta. Ver la cabecera y `scorecard-data.ts`. */
  if (!hayCohorteSuficiente(cohortSize)) {
    const aviso = t(tooSmallText);
    if (aviso.length === 0) return null;
    return (
      <p
        data-cet-comparacion="oculta"
        className={cn("m-0 text-body-sm font-semibold", className)}
      >
        {aviso}
      </p>
    );
  }

  const texto = t(summary);
  const filas: readonly FilaDeBarraProps[] = [
    {
      clave: "alumno",
      rotulo: t(studentLabel),
      cifra: studentValueText,
      parte: fraccion(studentRatio),
      propio: true,
    },
    {
      clave: "clase",
      rotulo: t(classLabel),
      cifra: classValueText,
      parte: fraccion(classRatio),
      propio: false,
    },
  ];

  return (
    <div
      data-cet-comparacion="visible"
      className={cn("flex flex-col gap-3", className)}
      role="group"
      aria-labelledby={`${id}-resumen`}
    >
      {/* El resumen es el nombre accesible del grupo entero y esta escrito: un
          lector recorre las dos filas y ademas oye la conclusion. */}
      <p id={`${id}-resumen`} className="m-0 text-body-sm font-semibold">
        {texto}
      </p>

      {filas.map((fila) => (
        <FilaDeBarra key={fila.clave} {...fila} />
      ))}
    </div>
  );
}
