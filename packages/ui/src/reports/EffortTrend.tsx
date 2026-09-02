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
 * EL LIENZO SE MIDE, YA NO SE ESCRIBE A MANO   (sustituye a ANCHO/HUECO fijos)
 * ===========================================================================
 * Hasta ahora el ancho salia de una cuenta: `dias * 10 + huecos * 4`. Catorce
 * dias daban 192 px clavados, y un panel de informe mide unos 560 en portatil:
 * el dibujo flotaba en un tercio de su sitio con dos tercios de blanco al lado,
 * que es el aspecto exacto de «grafica de ejemplo» que un padre no se cree. Y la
 * salida facil —dejar que el SVG se estire con `preserveAspectRatio`— es peor,
 * porque al escalar el lienzo escala tambien la letra de los rotulos: el mismo
 * dibujo saldria con el eje ilegible en el movil y gigante en el portatil.
 *
 * Por eso el ancho lo da ahora `useAnchoDeGrafico()`, que MIDE el contenedor, y
 * se dibuja 1:1: un pixel del `viewBox` es un pixel de pantalla, siempre. Las
 * columnas se reparten el ancho medido en carriles iguales y el grueso sale del
 * carril menos el aire, TOPADO en `GRUESO_MAXIMO`: una columna nunca llena su
 * carril —el sobrante es aire, no columna— y con catorce dias en un movil de
 * 320 px sigue habiendo grueso suficiente para leer la silueta.
 *
 * ===========================================================================
 * LA ESCALA VERTICAL LA ROTULA QUIEN SABE HABLAR   (`yTicks`, opcional)
 * ===========================================================================
 * Una silueta sin eje contesta «¿fue parejo?» pero no «¿cuanto?»: la columna mas
 * alta podian ser doce minutos o dos horas. Con `yTicks` aparece la regla — una
 * linea de rejilla continua por corte y su rotulo en la calle de la izquierda—,
 * y entonces el TOPE de la escala es el corte mas alto, no el maximo del dato:
 * si el tope lo pusiera el dato, el ultimo rotulo caeria por debajo de la
 * columna mas alta y la regla mentiria. Los cortes los redondea `cortesDelEje`
 * y los rotula la aplicacion (`cortesUtiles`), porque decir «30 min» en el
 * idioma del tutor es texto de cara al usuario y aqui no vive ninguno (AD-7).
 *
 * Sin `yTicks` el dibujo es EXACTAMENTE el de antes —escala del dato, sin
 * rejilla y sin calle—, para que quien ya llamaba no cambie nada: la regla es
 * una mejora que se pide, no un impuesto.
 *
 * La rejilla va CONTINUA a proposito. El guion ya significa otra cosa en esta
 * casa —«de ese dia no tenemos registro» tres parrafos mas arriba— y gastarlo
 * tambien en la rejilla borraria la distincion justo donde importa.
 *
 * ===========================================================================
 * LA MARCA APOYA, NO FLOTA
 * ===========================================================================
 * Una columna con las cuatro esquinas redondeadas parece una pastilla suelta a
 * la que le han quitado el suelo. El extremo de DATO —arriba— se redondea
 * (`RADIO_DE_DATO`), y el extremo de la LINEA BASE se cuadra con un remate de
 * ese mismo alto: el ojo ve la columna nacer de la base. El zocalo del dia a
 * cero y el tocon del dia sin registro no se redondean nada: son demasiado
 * bajos para que un radio signifique algo y demasiado importantes para que se
 * confundan con una miga redonda.
 *
 * ===========================================================================
 * EL DETALLE TIENE QUE LLEGAR TAMBIEN POR TECLADO
 * ===========================================================================
 * El `<title>` del `<rect>` es el globo del navegador: tarda medio segundo, no
 * se puede estilar y —lo que de verdad importa— NO APARECE CON EL TECLADO. Quien
 * navegaba con tabulador se quedaba sin la capa de detalle entera. Encima de las
 * columnas va ahora una rejilla de blancos transparentes de `ALCANCE` px como
 * minimo —se apunta al DIA, no a la columna de diez pixeles, que con un dedo es
 * un blanco imposible— con `tabIndex` y su nombre accesible, y el globo propio
 * (`useAviso`) responde IGUAL al raton y al foco. El `<title>` se queda: no
 * cuesta nada y algunas ayudas tecnicas lo leen.
 *
 * El dia apuntado ademas se realza con un recuadro, que es forma y no tono: en
 * escala de grises se sigue viendo cual esta activo.
 *
 * Y sigue siendo capa de MEJORA, nunca la unica: el resumen escrito no depende
 * de posar el raton. Un valor que solo existe al apuntarlo es un valor que no
 * existe para media plantilla.
 *
 * ===========================================================================
 * UN SOLO NUMERO SOBRE EL DIBUJO, Y SOLO SI LO ESCRIBEN
 * ===========================================================================
 * Rotular las catorce columnas convierte la silueta en una tabla mal maquetada:
 * lo que se lee de un vistazo deja de leerse. Se rotula UNA cifra, la del dia
 * mas alto, que es la que ancla mentalmente la escala del resto — y solo si la
 * aplicacion la manda ya escrita en `peakText`. Sin ese texto no hay rotulos
 * directos: fabricar aqui «44 min» seria el literal que AD-7 prohibe, y elegir
 * el formato sin saber el idioma seria peor que no rotular.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni una cadena de cara al usuario vive aqui. `summary` es el nombre accesible
 * del dibujo y va ademas escrito debajo, porque quien no puede contar columnas
 * necesita leerlo. Cada dia trae su propio `label` ya redactado y formateado por
 * la aplicacion —solo ella sabe de calendario, idioma y huso— y es lo que sale
 * al posar el raton sobre la columna. Los anclajes del eje horizontal (`tick`),
 * los rotulos de la escala (`yTicks`) y el rotulo del pico (`peakText`) llegan
 * igual: ya escritos.
 */

import { useId, useState, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import {
  ALCANCE,
  Aviso,
  GRUESO_MAXIMO,
  RADIO_DE_DATO,
  TINTA_DE_REJILLA,
  useAnchoDeGrafico,
  useAviso,
} from "./chart-chrome.js";
import {
  cortesUtiles,
  haySerieDeEsfuerzo,
  minutosDelDia,
  type AxisTick,
  type EffortDay,
} from "./scorecard-data.js";

/**
 * Alto util del area de dibujo, de la linea base al maximo de la serie.
 *
 * ES UNA PROPORCION Y NO UN NUMERO, y esta es la segunda mitad de medir el
 * sitio. Con el alto clavado en 68 px el dibujo llenaba el ancho del panel y
 * seguia siendo una linea de firma: 600 px de ancho por 68 de alto es una
 * proporcion de nueve a uno, la de un `sparkline` metido en un renglon de texto,
 * y en esa franja aplastada dos dias que se diferencian en veinte minutos se
 * diferencian en seis pixeles. Un dibujo que ocupa el panel entero y no deja
 * ver la diferencia que mide es peor que uno pequeno, porque parece que si.
 *
 * Los topes: por debajo de 96 px la silueta deja de tener forma en un movil, y
 * por encima de 200 el panel obliga a hacer scroll para leer la frase que va
 * justo debajo del dibujo y que es la que lo explica.
 */
function altoDelPlano(ancho: number): number {
  return Math.round(Math.max(96, Math.min(200, ancho * 0.3)));
}
/** Suelo de un dia CON estudio. Debajo de esto un dia corto no se veria. */
const MIN_ACTIVO = 10;
/** Zocalo macizo de un dia a cero. Un dato pequeno, pero un dato. */
const TICK_CERO = 3;
/** Tocon hueco de un dia sin registro. Por debajo del suelo de un dia activo. */
const TOCON_SIN_DATO = 7;

/**
 * Aire entre dos columnas contiguas. Es el separador —no se dibuja ningun borde
 * para separar—, y se encoge con el carril cuando los dias son muchos: cuatro
 * pixeles fijos con veinte columnas se comerian la mitad del dibujo.
 */
const HUECO_MAXIMO = 4;
/** Grueso por debajo del cual una columna deja de ser una silueta y es una raya. */
const GRUESO_MINIMO = 2;

/**
 * Calle de la izquierda para los rotulos de la escala. Solo existe cuando hay
 * `yTicks`: sin regla que rotular seria un margen vacio robandole ancho al
 * dibujo. Cuarenta pixeles caben «120 min» a cuerpo 10 sin recortar.
 */
const CALLE = 40;
/** Franja del eje horizontal, DENTRO del alto del svg: nunca un scroll anidado. */
const BANDA_EJE = 14;
/** Aire reservado arriba para el rotulo del pico, para que no se salga del lienzo. */
const BANDA_PICO = 14;
/** Cuerpo de los rotulos del dibujo. Fijo en px porque el lienzo no escala. */
const CUERPO = 10;

export interface EffortTrendProps {
  /** Un elemento por dia, en orden cronologico. Los dias a cero vienen incluidos. */
  readonly series: readonly EffortDay[];
  /**
   * La frase que resume el dibujo, ya contada e interpolada por quien llama.
   * Nunca se fabrica aqui: este componente no sabe de fechas ni de recuentos.
   */
  readonly summary: I18nText;
  /**
   * La escala vertical, ya redondeada y ROTULADA por la aplicacion. Ausente, el
   * dibujo se comporta como siempre: escala del dato, sin rejilla y sin calle.
   * Presente, el tope de la escala es el corte mas alto (ver la cabecera).
   */
  readonly yTicks?: readonly AxisTick[] | undefined;
  /**
   * La cifra del dia mas alto, ya escrita («44 min»). Es el UNICO rotulo directo
   * del dibujo y es opcional: sin el no se rotula ninguna columna. Ver la
   * cabecera — aqui no se fabrica texto de cara al usuario (AD-7).
   */
  readonly peakText?: string | undefined;
  readonly className?: string | undefined;
}

export function EffortTrend({
  series,
  summary,
  yTicks,
  peakText,
  className,
}: EffortTrendProps): ReactNode {
  const t = useI18n();
  const id = useId();
  const [caja, ancho] = useAnchoDeGrafico();
  const { aviso, mostrar, ocultar } = useAviso();
  // El indice apuntado va aparte del globo: el globo solo sabe donde y que dice,
  // y el realce necesita saber QUE dia es para recuadrarlo.
  const [apuntado, setApuntado] = useState<number | null>(null);

  // Sin dias, o con todos los dias sin registro, no hay dibujo. Ver la cabecera.
  // La condicion la decide `haySerieDeEsfuerzo`, que es tambien la que consulta
  // el scorecard para saber si monta el panel: una sola definicion.
  if (!haySerieDeEsfuerzo(series)) return null;

  const cortes = cortesUtiles(yTicks);
  const hayRegla = cortes.length > 0;
  const hayAnclas = series.some((d) => d.tick !== undefined && d.tick.length > 0);
  const hayPico = peakText !== undefined && peakText.length > 0;

  /* El maximo de la propia serie es la escala MIENTRAS no haya regla rotulada.
     No hay un maximo fijo escondido: una escala constante haria que el dibujo se
     pintara igual pase lo que pase con los datos en cuanto todos los dias
     cayeran por debajo de ella. Con regla manda el corte mas alto, porque quien
     rotula la escala es quien decide hasta donde llega. */
  const maximo = Math.max(...series.map((d) => minutosDelDia(d) ?? 0), 1);
  const topeDeCorte = cortes[cortes.length - 1]?.value ?? 0;
  const tope = hayRegla ? Math.max(topeDeCorte, 1) : maximo;

  // El alto sale del ancho medido, igual que todo lo demas. Ver `altoDelPlano`.
  const ALTO = altoDelPlano(ancho);

  const calle = hayRegla ? CALLE : 0;
  const bandaEje = hayAnclas ? BANDA_EJE : 0;
  const bandaPico = hayPico ? BANDA_PICO : 0;

  const altoTotal = bandaPico + ALTO + bandaEje;
  const base = bandaPico + ALTO; // La linea base, en coordenadas del lienzo.
  const anchoUtil = Math.max(ALCANCE, ancho - calle);

  // Un carril por dia; la columna vive centrada en el suyo y nunca lo llena.
  const carril = anchoUtil / series.length;
  const hueco = Math.min(HUECO_MAXIMO, carril * 0.3);
  const grueso = Math.max(GRUESO_MINIMO, Math.min(GRUESO_MAXIMO, carril - hueco));
  const centroDe = (index: number): number => calle + carril * (index + 0.5);

  // `ALTO - 1` y no `ALTO`: el trazo de un pixel va centrado en el borde, asi que
  // la columna mas alta perderia medio pixel por arriba contra el limite.
  const UTIL = ALTO - 1;
  const altoDe = (minutos: number): number =>
    Math.min(UTIL, Math.max(MIN_ACTIVO, Math.round((minutos / tope) * UTIL)));

  // El dia mas alto CON estudio: el unico que puede llevar rotulo directo.
  let indicePico = -1;
  let minutosPico = -1;
  series.forEach((dia, index) => {
    const m = minutosDelDia(dia);
    if (m !== null && m > minutosPico) {
      minutosPico = m;
      indicePico = index;
    }
  });

  const texto = t(summary);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div ref={caja} className="relative w-full">
        <svg
          width={ancho}
          height={altoTotal}
          viewBox={`0 0 ${ancho} ${altoTotal}`}
          role="img"
          aria-labelledby={`${id}-title`}
          // `overflow-visible`: el trazo de una columna hueca va centrado en el
          // borde, y en la primera y la ultima medio pixel cae fuera del
          // viewBox. Recortado, el guion de ese lado desaparece.
          className="block overflow-visible"
        >
          <title id={`${id}-title`}>{texto}</title>

          {/* La regla. Lineas continuas de un pixel al tono de la tinta, muy
              atenuadas: se ven si se buscan y no compiten con las columnas. El
              rotulo NO se atenua —es texto y tiene que medir su contraste—. */}
          {cortes.map((corte) => {
            const y = base - (Math.min(corte.value, tope) / tope) * UTIL;
            return (
              <g key={corte.value}>
                <line
                  x1={calle}
                  y1={y}
                  x2={ancho}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  opacity={TINTA_DE_REJILLA}
                />
                <text
                  x={calle - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={CUERPO}
                  fill="currentColor"
                >
                  {corte.text}
                </text>
              </g>
            );
          })}

          {/* Linea base. Rejilla: mismo tono, muy atenuada, continua y de un pixel.
              Sin ella los zocalos de los dias a cero flotan y dejan de leerse como
              «cero» para leerse como «migas». */}
          <line
            x1={calle}
            y1={base - 0.5}
            x2={ancho}
            y2={base - 0.5}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.35}
          />

          {series.map((dia, index) => {
            const minutos = minutosDelDia(dia);
            const sinDato = minutos === null;
            const cero = minutos === 0;

            const alto = sinDato ? TOCON_SIN_DATO : cero ? TICK_CERO : altoDe(minutos);
            const x = centroDe(index) - grueso / 2;
            const y = base - alto;

            // Arriba se redondea el extremo de DATO; abajo se cuadra con un
            // remate. Las marcas bajas —zocalo y tocon— no se redondean nada.
            const redondeo = sinDato || alto <= RADIO_DE_DATO ? 0 : RADIO_DE_DATO;

            const etiqueta = t(dia.label);

            return (
              <g key={index}>
                <rect
                  data-cet-dia={sinDato ? "sin-dato" : cero ? "cero" : "con-minutos"}
                  x={x}
                  y={y}
                  width={grueso}
                  height={alto}
                  rx={redondeo}
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

                {/* El remate cuadrado del pie. Mismo relleno, sin radio: la
                    columna apoya en la base en vez de flotar redondeada. */}
                {redondeo > 0 ? (
                  <rect
                    aria-hidden="true"
                    x={x}
                    y={base - RADIO_DE_DATO}
                    width={grueso}
                    height={RADIO_DE_DATO}
                    fill="currentColor"
                  />
                ) : null}
              </g>
            );
          })}

          {/* El unico rotulo directo: la cifra del dia mas alto, si la escriben. */}
          {hayPico && indicePico >= 0 && minutosPico > 0 ? (
            <text
              data-cet-pico="dia"
              x={centroDe(indicePico)}
              y={base - altoDe(minutosPico) - 4}
              textAnchor="middle"
              fontSize={CUERPO}
              fontWeight={600}
              fill="currentColor"
            >
              {peakText}
            </text>
          ) : null}

          {/* Los anclajes del eje horizontal, en su propia franja del lienzo. */}
          {series.map((dia, index) =>
            dia.tick !== undefined && dia.tick.length > 0 ? (
              <text
                key={`tick-${index}`}
                data-cet-ancla="dia"
                x={centroDe(index)}
                y={base + BANDA_EJE - 3}
                textAnchor="middle"
                fontSize={CUERPO}
                fill="currentColor"
                opacity={0.85}
              >
                {dia.tick}
              </text>
            ) : null,
          )}

          {/* El realce del dia apuntado: un recuadro que aparece. Es forma, no
              tono; en escala de grises se sigue viendo cual esta activo. */}
          {apuntado !== null ? (
            <rect
              aria-hidden="true"
              data-cet-realce="dia"
              x={centroDe(apuntado) - Math.max(ALCANCE, carril) / 2}
              y={bandaPico}
              width={Math.max(ALCANCE, carril)}
              height={ALTO}
              rx={3}
              fill="currentColor"
              fillOpacity={0.08}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
          ) : null}

          {/* La capa de blancos. Transparente, de `ALCANCE` px como minimo y de
              alto entero: se apunta al DIA. Va la ultima para quedar por encima.
              Es focalizable, y un descendiente focalizable NO se vuelve
              presentacional dentro de un `role="img"`, asi que conserva su
              nombre accesible tambien para el lector de pantalla. */}
          {series.map((dia, index) => {
            const etiqueta = t(dia.label);
            const blanco = Math.max(ALCANCE, carril);
            const minutos = minutosDelDia(dia);
            const alto =
              minutos === null ? TOCON_SIN_DATO : minutos === 0 ? TICK_CERO : altoDe(minutos);
            const apuntar = (): void => {
              setApuntado(index);
              if (etiqueta.length > 0) {
                mostrar({ x: centroDe(index), y: base - alto, texto: etiqueta });
              }
            };
            const soltar = (): void => {
              setApuntado(null);
              ocultar();
            };

            return (
              <rect
                key={`blanco-${index}`}
                data-cet-alcance="dia"
                role="img"
                aria-label={etiqueta}
                tabIndex={0}
                x={centroDe(index) - blanco / 2}
                y={bandaPico}
                width={blanco}
                height={ALTO}
                fill="transparent"
                className="outline-none"
                onMouseEnter={apuntar}
                onMouseLeave={soltar}
                onFocus={apuntar}
                onBlur={soltar}
              />
            );
          })}
        </svg>

        <Aviso dato={aviso} ancho={ancho} />
      </div>

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
