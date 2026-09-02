"use client";

/**
 * @cet/ui — EffortOutcomeScatter: ¿le cunde el tiempo que echa?
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ES OTRA PREGUNTA, NO OTRA VISTA DE LA MISMA
 * ===========================================================================
 * `EffortTrend` responde «¿cuanto tiempo echa?» y `DailyRhythm` «¿a que hora?».
 * Ninguna de las dos responde la que de verdad preocupa a un padre a la tercera
 * semana: «lleva una hora ahi sentado, ¿le esta sirviendo de algo?». Para eso
 * hacen falta las dos magnitudes CRUZADAS —el tiempo de un dia contra lo que
 * salio de ese dia—, y ese cruce no se ve en ninguna serie por separado: un
 * alumno que sube minutos y baja resultados dibuja dos lineas que suben y bajan
 * cada una a su aire, y hay que superponerlas mentalmente para ver el problema.
 *
 * Por eso es una nube y no dos series: cada dia es UN punto, y la relacion —o la
 * ausencia de relacion, que tambien es una respuesta— es la forma de la nube.
 *
 * ===========================================================================
 * NO SE PINTA NINGUNA RECTA DE TENDENCIA
 * ===========================================================================
 * Y es la decision mas importante de este fichero. Una recta ajustada sobre
 * cuatro o siete puntos tiene el aspecto de una conclusion —limpia, con
 * pendiente, dibujada con la misma tinta que los datos— y no lo es: con esos
 * tamanos la pendiente la decide practicamente cualquier dia suelto. El tutor no
 * tiene forma de saber que esa raya vale menos que los puntos que la rodean, asi
 * que leeria «esta demostrado que cuanto mas estudia, mas cunde». Los puntos se
 * dejan solos y quien saca la conclusion es quien mira.
 *
 * Esto NO ha cambiado al profesionalizar el dibujo, y conviene decir por que se
 * repite: al ganar el eje una rejilla rotulada, la nube empieza a PARECER una
 * grafica de manual, y la primera peticion que llega ante una grafica de manual
 * es «ponle la linea de tendencia». La respuesta sigue siendo no, y por el mismo
 * motivo: la rejilla mejora la lectura de la magnitud, no la del tamano de la
 * muestra. Las UNICAS lineas del dibujo son los dos ejes y —cuando la aplicacion
 * pasa cortes— la rejilla de esos cortes. Ninguna atraviesa los puntos.
 *
 * ===========================================================================
 * POR DEBAJO DE UN MINIMO DE DIAS NO SE PINTA NADA
 * ===========================================================================
 * El umbral y su porque viven en `scorecard-data.ts` (`MIN_DIAS_DISPERSION`).
 * En resumen: por dos puntos pasa exactamente una recta, asi que con dos dias la
 * nube dibuja SIEMPRE una tendencia perfecta que no existe. Es la misma regla
 * que la de `MIN_COHORTE` en `CohortComparison` y se resuelve igual: la nube se
 * retira ENTERA, y en su lugar va la frase que explica por que no esta —si la
 * aplicacion la pasa—. Sin frase, un bloque que aparece y desaparece sin decir
 * nada se reporta como fallo y se «arregla» bajando el umbral.
 *
 * ===========================================================================
 * DOS EJES INDEPENDIENTES, CADA UNO CON SU ESCALA
 * ===========================================================================
 * Al reves que en `CohortComparison`, aqui las dos magnitudes llegan en bruto:
 * son cosas distintas —minutos y lecciones— y no hay ninguna comparacion entre
 * ellas que una escala comun pudiera falsear. Cada eje se normaliza contra su
 * propio maximo.
 *
 * El origen es cero en los dos ejes SIEMPRE. Empezar un eje por encima de cero
 * exagera las diferencias —el engano de grafica mas repetido que hay— y en una
 * nube hace ademas algo peor que en una serie: mueve la NUBE ENTERA hacia una
 * esquina y le inventa una direccion. Esto no es negociable ni con rejilla ni
 * sin ella.
 *
 * ===========================================================================
 * DE «EL TOPE ESCRITO» A UNA ESCALA DE VERDAD (Y POR QUE SIGUEN LAS DOS)
 * ===========================================================================
 * La version anterior no tenia rejilla, y para que la nube dijera ademas la
 * MAGNITUD escribia el tope de cada eje al lado de su rotulo («60 min», «3
 * lecciones»). Aquello resolvia lo peor —dos semanas distintas no se pintaban
 * identicas— pero dejaba sin contestar la pregunta siguiente: un punto a media
 * altura, ¿son treinta minutos o cuarenta? Con un solo numero en el extremo, el
 * lector tiene que interpolar a ojo sobre un lienzo sin marcas.
 *
 * Por eso ahora se aceptan `xTicks` / `yTicks` (`AxisTick` de `scorecard-data`):
 * cortes con su valor Y su rotulo ya escrito por la aplicacion. Cuando llegan,
 * se dibuja la rejilla en esos valores y se rotulan en el margen; el tope del
 * eje pasa a ser el corte mas alto, que es la regla de `AxisTick` —manda quien
 * rotula, para que el ultimo rotulo no caiga por debajo del dato mas alto—.
 *
 * Y se conserva el comportamiento viejo INTACTO cuando no llegan cortes: se
 * escriben `xMaxText` / `yMaxText` al lado de los rotulos y la escala sale de
 * los datos. No es compatibilidad por pereza: la nube se monta tambien en sitios
 * donde el panel es estrecho y cuatro rotulos de eje no caben, y en esos sitios
 * el tope escrito sigue siendo la mejor respuesta disponible. Con cortes, en
 * cambio, el tope escrito NO se repite: diria dos veces el mismo numero, una en
 * el margen y otra en la frase.
 *
 * La rejilla es CONTINUA, nunca discontinua. El guion ya significa otra cosa en
 * esta casa —«esto no es tuyo, es referencia» en `CohortComparison`, «de ese dia
 * no tenemos registro» en `EffortTrend`—, y gastarlo aqui borraria la distincion
 * justo donde importa. Ver la cabecera de `chart-chrome`.
 *
 * ===========================================================================
 * EL LIENZO SE MIDE, NO SE ADIVINA
 * ===========================================================================
 * Antes el dibujo tenia 216 x 132 px clavados a mano. Un panel de informe mide
 * unos 560 px en un portatil: la nube ocupaba un tercio y dejaba dos tercios de
 * blanco al lado, que es exactamente el aspecto de «grafica de ejemplo» que un
 * padre no se cree. Y agrandar el `viewBox` no valia: al escalar el SVG escala
 * la letra de los rotulos, asi que el mismo dibujo saldria ilegible en el movil
 * y gigante en el portatil.
 *
 * Ahora el ancho lo da `useAnchoDeGrafico` y se dibuja 1:1 —un pixel del
 * `viewBox` es un pixel de pantalla—. El ALTO se deriva del ancho en vez de
 * fijarse: una nube muy apaisada aplasta el eje vertical y hace parecer plana
 * una relacion que no lo es, y una muy alta la exagera igual de mentirosamente.
 * Se usa algo mas de media altura por ancho, con suelo y techo (`ALTO_MINIMO`,
 * `ALTO_MAXIMO`): a 320 px sale una nube de proporcion casi cuadrada, que es lo
 * que cabe en un movil, y a 700 se detiene antes de convertirse en un poster.
 *
 * ===========================================================================
 * SIN COLOR NO SE PIERDE NADA
 * ===========================================================================
 * Una sola serie, un solo tono heredado (`currentColor`), todos los puntos
 * identicos. No hay ningun estado codificado en el color porque no hay estados:
 * lo que distingue a un punto de otro es su POSICION, que se ve igual en escala
 * de grises. Los ejes y la rejilla van al mismo tono muy atenuado: son rejilla,
 * no dato. Los rotulos del eje van en tinta heredada SIN atenuar —son texto, y
 * el texto atenuado sobre el lavado del panel se queda por debajo de 1.4.3—.
 *
 * ===========================================================================
 * EL ANILLO SUSTITUYE A LA TRANSPARENCIA
 * ===========================================================================
 * Dos dias con minutos parecidos caen casi encima. La version anterior lo
 * resolvia con `opacity 0.8`: el solape salia mas oscuro y se adivinaba que eran
 * dos. Se ha cambiado por un ANILLO de 2 px del color de la superficie alrededor
 * de cada punto, y el relleno vuelve a ser opaco. Dos motivos:
 *
 *  1. El anillo SEPARA de verdad. La transparencia dice «aqui hay mas de uno»
 *     pero no cuantos; con el anillo, tres dias solapados se siguen contando
 *     porque cada disco conserva su borde.
 *  2. La transparencia bajaba el contraste del punto contra el lavado del panel.
 *     Un punto de 8 px es un objeto grafico y le aplica el 3:1 de la 1.4.11;
 *     gastar un 20 % de la tinta en un efecto que ya hace el anillo es regalar
 *     margen de contraste a cambio de nada.
 *
 * El punto mide `RADIO_DE_DATO * 2` = 8 px de diametro, el minimo de la casa
 * para una marca que hay que ver y contar.
 *
 * ===========================================================================
 * EL BLANCO DE ALCANCE, Y POR QUE NO VIVE DENTRO DEL SVG
 * ===========================================================================
 * Un disco de 8 px es un blanco imposible con un dedo. Cada dia lleva encima un
 * cuadro transparente de `ALCANCE` (24 px), alcanzable con el tabulador, que
 * abre el mismo aviso al raton y al foco (`useAviso`). Se apunta al DIA.
 *
 * Y ese cuadro NO va dentro del `<svg>`. El dibujo entero es `aria-hidden` —el
 * grupo ya se llama con el resumen y la lista de abajo trae los datos, asi que
 * anunciar ademas el SVG diria la misma frase tres veces— y dentro de un
 * subarbol `aria-hidden` NO PUEDE haber nada enfocable: el foco caeria en un
 * elemento que el lector de pantalla no puede nombrar, que es la violacion
 * `aria-hidden-focus` y, antes que eso, un usuario de teclado oyendo silencio.
 *
 * La salida no es quitarle el `aria-hidden` al SVG —eso duplicaria el dibujo
 * entero en el arbol— sino darse cuenta de que los blancos de alcance y la LISTA
 * ALTERNATIVA quieren ser exactamente lo mismo: un elemento por dia, con la
 * frase ya redactada de ese dia. Asi que son lo mismo. La lista `<ul>` se coloca
 * en capa sobre el dibujo, cada `<li>` en la posicion de su punto, y dentro va
 * el blanco enfocable con la frase del dia como nombre accesible. Un solo nodo
 * por dia:
 *
 *  - el lector de pantalla recorre una lista de dias, en orden, como antes;
 *  - el teclado tabula por los mismos elementos y ve el aviso;
 *  - el raton apunta a un cuadro de 24 px;
 *  - y nadie oye el dia dos veces.
 *
 * La frase no se ve: no hay texto pintado, solo `aria-label`. Y el aviso sigue
 * siendo una capa de MEJORA — el resumen escrito y los rotulos de los ejes estan
 * siempre, sin posar el raton y sin tabular.
 *
 * ===========================================================================
 * LO QUE OYE QUIEN NO VE LA NUBE
 * ===========================================================================
 * El resumen —nombre accesible del grupo y ademas escrito— y la lista de los
 * dias con su par de cifras, ya redactada por la aplicacion. Una nube de puntos
 * es de lo menos accesible que existe: sin la lista, quien usa lector de
 * pantalla se queda con la frase y nada mas, y la frase es un resumen, no los
 * datos.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni un literal aqui dentro. Los rotulos de los ejes, sus topes, los cortes de
 * la rejilla, la frase de cada dia y el resumen llegan redactados y formateados
 * por la aplicacion.
 */

import { useCallback, useId, useState, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import {
  ALCANCE,
  Aviso,
  RADIO_DE_DATO,
  TINTA_DE_REJILLA,
  useAnchoDeGrafico,
  useAviso,
} from "./chart-chrome.js";
import {
  cortesUtiles,
  hayDispersionSuficiente,
  puntosDeDispersion,
  type AxisTick,
  type EffortOutcomePoint,
} from "./scorecard-data.js";

/**
 * El alto sale del ancho. Poco mas de media altura por ancho: una nube mas
 * apaisada aplana las diferencias verticales y una mas alta las exagera, y las
 * dos deformaciones se leen como conclusiones. El suelo y el techo evitan los
 * dos extremos ridiculos: una tira de 90 px en un panel plegado y un cuadro de
 * 400 px en un monitor ancho.
 */
const PROPORCION = 0.56;
const ALTO_MINIMO = 140;
const ALTO_MAXIMO = 240;

/** Aire arriba y a la derecha: un punto en el maximo no puede salir cortado. */
const AIRE = 12;

/** Margen del eje cuando NO hay cortes rotulados: solo el sitio de la linea. */
const MARGEN_DESNUDO = 8;

/** Alto de la franja inferior cuando el eje horizontal lleva rotulos. */
const BANDA_DE_ROTULOS = 20;

/** Cuerpo de los rotulos de la rejilla. Pequeno, pero nunca atenuado. */
const CUERPO_DEL_ROTULO = 11;

/**
 * Ancho estimado de un caracter a `CUERPO_DEL_ROTULO`. Es una ESTIMACION a
 * proposito: medir texto de verdad exigiria pintarlo primero y volver a medir,
 * y un ciclo mas de render por un margen. Se estima ancho —los rotulos son
 * cifras, mas estrechas que la media— y se acota por arriba para que un rotulo
 * largo no se coma el dibujo.
 */
const ANCHO_POR_CARACTER = 6.2;
const CANAL_MINIMO = 26;
const CANAL_MAXIMO = 72;

/** Grosor del anillo del punto. Ver la cabecera: sustituye a la transparencia. */
const ANILLO = 2;

export interface EffortOutcomeScatterProps {
  /** Un punto por dia. Los dias sin esfuerzo no entran: ver `scorecard-data`. */
  readonly points: readonly EffortOutcomePoint[];
  /** La nube contada en una frase, ya redactada. Nombre accesible del grupo. */
  readonly summary: I18nText;
  /** Que mide el eje horizontal («Minutos estudiados»). */
  readonly xAxisLabel: I18nText;
  /** Que mide el eje vertical («Lecciones terminadas»). */
  readonly yAxisLabel: I18nText;
  /**
   * El tope del eje horizontal, con sus unidades y ya formateado («60 min»).
   * Se escribe SOLO cuando no hay `xTicks`: con rejilla rotulada seria el mismo
   * numero dicho dos veces. Ver la cabecera.
   */
  readonly xMaxText: string;
  /** Lo mismo para el eje vertical («3 lecciones»). Se calla si hay `yTicks`. */
  readonly yMaxText: string;
  /**
   * Los cortes rotulados del eje horizontal, de la aplicacion. Con ellos la nube
   * gana rejilla y escala leible; sin ellos se comporta como siempre.
   */
  readonly xTicks?: readonly AxisTick[] | undefined;
  /** Los cortes rotulados del eje vertical. Mismo trato. */
  readonly yTicks?: readonly AxisTick[] | undefined;
  /**
   * La frase que explica que no hay nube porque hay pocos dias. Sin ella, con
   * pocos dias no se pinta nada en absoluto.
   */
  readonly tooFewText?: I18nText | undefined;
  readonly className?: string | undefined;
}

export function EffortOutcomeScatter({
  points,
  summary,
  xAxisLabel,
  yAxisLabel,
  xMaxText,
  yMaxText,
  xTicks,
  yTicks,
  tooFewText,
  className,
}: EffortOutcomeScatterProps): ReactNode {
  const t = useI18n();
  const id = useId();
  const [contenedor, ancho] = useAnchoDeGrafico();
  const { aviso, mostrar, ocultar } = useAviso();

  /*
   * El dia resaltado, aparte del aviso. El aviso sabe DONDE y QUE dice; para
   * engordar el disco correcto hace falta saber CUAL es, y dos dias pueden caer
   * en el mismo sitio con la misma frase imposible de distinguir por sus
   * coordenadas. El indice no miente.
   */
  const [activo, setActivo] = useState<number | null>(null);

  const encender = useCallback(
    (indice: number, x: number, y: number, texto: string) => {
      setActivo(indice);
      mostrar({ x, y, texto });
    },
    [mostrar],
  );
  const apagar = useCallback(() => {
    setActivo(null);
    ocultar();
  }, [ocultar]);

  /* La puerta. Ver la cabecera y `scorecard-data.ts`. */
  if (!hayDispersionSuficiente(points)) {
    const frase = t(tooFewText);
    if (frase.length === 0) return null;
    return (
      <p data-cet-dispersion="oculta" className={cn("m-0 text-body-sm font-semibold", className)}>
        {frase}
      </p>
    );
  }

  const utiles = puntosDeDispersion(points);
  const cortesX = cortesUtiles(xTicks);
  const cortesY = cortesUtiles(yTicks);
  const hayRejillaX = cortesX.length > 0;
  const hayRejillaY = cortesY.length > 0;

  /*
   * El tope manda el que rotula (regla de `AxisTick`), pero nunca por debajo del
   * dato: un corte mas bajo que el maximo real sacaria el punto del lienzo, y un
   * punto fuera del marco es un dato perdido, no un eje mal rotulado.
   */
  const topeCorteX = cortesX[cortesX.length - 1]?.value ?? 0;
  const topeCorteY = cortesY[cortesY.length - 1]?.value ?? 0;
  const maxX = Math.max(...utiles.map((p) => p.x), topeCorteX, 1);
  const maxY = Math.max(...utiles.map((p) => p.y), topeCorteY, 1);

  const alto = Math.round(
    Math.min(ALTO_MAXIMO, Math.max(ALTO_MINIMO, ancho * PROPORCION)),
  );

  /* El canal de la izquierda solo existe si hay rotulos que meter en el. */
  const letras = cortesY.reduce((n, c) => Math.max(n, c.text.length), 0);
  const izquierda = hayRejillaY
    ? Math.round(
        Math.min(CANAL_MAXIMO, Math.max(CANAL_MINIMO, letras * ANCHO_POR_CARACTER + 8)),
      )
    : MARGEN_DESNUDO;
  const abajo = hayRejillaX ? BANDA_DE_ROTULOS : MARGEN_DESNUDO;

  /* El marco del dibujo. El disco y su anillo caben enteros dentro. */
  const borde = RADIO_DE_DATO + ANILLO;
  const x0 = izquierda + borde;
  const x1 = Math.max(x0 + 1, ancho - AIRE);
  const y0 = AIRE;
  const y1 = Math.max(y0 + 1, alto - abajo - borde);
  const baseY = alto - abajo;

  /* El origen es cero en los dos ejes, siempre. Ver la cabecera. */
  const px = (v: number): number => x0 + (v / maxX) * (x1 - x0);
  const py = (v: number): number => y1 - (v / maxY) * (y1 - y0);

  const colocados = utiles.map((punto) => ({
    punto,
    cx: px(punto.x),
    cy: py(punto.y),
    frase: t(punto.label),
  }));

  return (
    <div
      data-cet-dispersion="visible"
      className={cn("flex flex-col gap-2", className)}
      role="group"
      aria-labelledby={`${id}-resumen`}
    >
      {/* El resumen nombra al grupo entero y ademas se lee. */}
      <p id={`${id}-resumen`} className="m-0 text-body-sm font-semibold">
        {t(summary)}
      </p>

      {/* El eje vertical se rotula ARRIBA y en horizontal, no girado noventa
          grados al costado. Un texto vertical no se lee de un vistazo, y ademas
          «Lecciones terminadas» giradas obligarian a reservar ancho que en un
          movil de 360 no sobra. El tope va al lado solo si no hay rejilla. */}
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body-sm">
        <span className="font-semibold">{t(yAxisLabel)}</span>
        {!hayRejillaY && <span className="tabular-nums opacity-80">{yMaxText}</span>}
      </p>

      <div ref={contenedor} className="relative w-full">
        <svg
          width={ancho}
          height={alto}
          viewBox={`0 0 ${ancho} ${alto}`}
          // El dibujo NO es el nombre accesible: el grupo entero ya se llama con
          // el resumen, y la lista en capa —que es ademas el blanco de alcance—
          // trae los datos. Dentro de aqui no hay NADA enfocable; ver la
          // cabecera, seccion «el blanco de alcance».
          aria-hidden="true"
          focusable="false"
          className="block"
        >
          {/* La rejilla del eje vertical: continua, un pixel, muy atenuada. */}
          {cortesY.map((corte) => (
            <line
              key={`y-${corte.value}`}
              data-cet-rejilla="dispersion-y"
              x1={izquierda}
              y1={py(corte.value)}
              x2={ancho - AIRE / 2}
              y2={py(corte.value)}
              stroke="currentColor"
              strokeWidth={1}
              opacity={TINTA_DE_REJILLA}
            />
          ))}

          {/* La del eje horizontal. */}
          {cortesX.map((corte) => (
            <line
              key={`x-${corte.value}`}
              data-cet-rejilla="dispersion-x"
              x1={px(corte.value)}
              y1={y0 - AIRE / 2}
              x2={px(corte.value)}
              y2={baseY}
              stroke="currentColor"
              strokeWidth={1}
              opacity={TINTA_DE_REJILLA}
            />
          ))}

          {/* Los dos ejes. Mismo tono, un pixel, algo menos recesivos que la
              rejilla: son el marco contra el que se lee todo lo demas. */}
          <line
            x1={izquierda}
            y1={y0 - AIRE / 2}
            x2={izquierda}
            y2={baseY}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.35}
          />
          <line
            x1={izquierda}
            y1={baseY}
            x2={ancho}
            y2={baseY}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.35}
          />

          {/* Los rotulos. Tinta heredada y sin atenuar: son TEXTO. */}
          {cortesY.map((corte) => (
            <text
              key={`ty-${corte.value}`}
              data-cet-rotulo="dispersion-y"
              x={izquierda - 6}
              y={py(corte.value)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={CUERPO_DEL_ROTULO}
              fill="currentColor"
              className="tabular-nums"
            >
              {corte.text}
            </text>
          ))}
          {cortesX.map((corte, i) => (
            <text
              key={`tx-${corte.value}`}
              data-cet-rotulo="dispersion-x"
              x={px(corte.value)}
              y={baseY + CUERPO_DEL_ROTULO + 3}
              textAnchor={i === cortesX.length - 1 ? "end" : "middle"}
              fontSize={CUERPO_DEL_ROTULO}
              fill="currentColor"
              className="tabular-nums"
            >
              {corte.text}
            </text>
          ))}

          {/* Un dia, un disco. Anillo del color de la superficie para que dos
              dias solapados se sigan pudiendo contar. Ver la cabecera. */}
          {colocados.map(({ punto, cx, cy }, index) => (
            <circle
              key={`${index}-${punto.x}-${punto.y}`}
              data-cet-punto="dia"
              cx={cx}
              cy={cy}
              // El dia bajo el raton o bajo el foco crece. Es un cambio de
              // TAMANO, no de tono: se ve igual en escala de grises.
              r={activo === index ? RADIO_DE_DATO + 3 : RADIO_DE_DATO}
              fill="currentColor"
              stroke="var(--cet-surface)"
              strokeWidth={ANILLO}
            />
          ))}
        </svg>

        {/* LA LISTA Y EL BLANCO DE ALCANCE SON EL MISMO ELEMENTO. Ver la
            cabecera: un solo nodo por dia, enfocable, con la frase del dia como
            nombre accesible. No pinta nada; el disco de debajo ya es la marca. */}
        <ul
          data-cet-lista="dias-de-dispersion"
          className="pointer-events-none absolute inset-0 m-0 list-none p-0"
        >
          {colocados.map(({ punto, cx, cy, frase }, index) => (
            <li
              key={`${index}-${punto.x}-${punto.y}`}
              className="pointer-events-auto absolute"
              style={{
                left: `${cx}px`,
                top: `${cy}px`,
                width: `${ALCANCE}px`,
                height: `${ALCANCE}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span
                role="img"
                aria-label={frase}
                tabIndex={0}
                className="block h-full w-full rounded-full"
                onMouseEnter={() => encender(index, cx, cy, frase)}
                onMouseLeave={apagar}
                onFocus={() => encender(index, cx, cy, frase)}
                onBlur={apagar}
              />
            </li>
          ))}
        </ul>

        <Aviso dato={aviso} ancho={ancho} />
      </div>

      {/* El rotulo del eje horizontal, debajo del eje que describe. */}
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body-sm">
        <span className="font-semibold">{t(xAxisLabel)}</span>
        {!hayRejillaX && <span className="tabular-nums opacity-80">{xMaxText}</span>}
      </p>
    </div>
  );
}
