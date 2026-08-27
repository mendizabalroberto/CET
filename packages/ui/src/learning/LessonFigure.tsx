"use client";

/**
 * @cet/ui — el dibujo de las figuras pedagogicas de leccion.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * TRES REGLAS QUE ESTE FICHERO NO PUEDE ROMPER
 * ===========================================================================
 *
 * 1 · SVG GENERADO EN EL CLIENTE, CERO IMAGENES.
 *     El destino es una tableta de colegio compartida con conexion mala. Un
 *     modelo de barras son doce rectangulos: no necesita un PNG de 40 kB que
 *     ademas no se puede traducir ni leer en voz alta. Aqui no hay `<img>`, ni
 *     `url()`, ni fuentes externas: solo geometria calculada a partir de los
 *     numeros que trae la figura.
 *
 * 2 · UNA VOZ, Y QUE DIGA LA FIGURA ENTERA.
 *     Cada figura es UN `role="img"` con el `aria-label` que produce
 *     `figureAltText`, y todo lo de dentro va `aria-hidden`. Sin eso un lector
 *     de pantalla leeria los digitos sueltos del dibujo —"5 9 2 3"— que es
 *     ruido, o repetiria la etiqueta. La etiqueta sale de los MISMOS numeros
 *     que el dibujo, asi que no puede desincronizarse de el.
 *
 * 3 · EL COLOR NUNCA ES EL UNICO CANAL.
 *     Lo pintado de una barra lleva ADEMAS trama diagonal; el sentido en que se
 *     mueven los digitos lleva ADEMAS flechas y el signo escrito; el peldano
 *     resaltado de la escalera lleva ADEMAS grosor y su conversion escrita. Un
 *     nino con deuteranopia —uno o dos por aula— tiene que poder leer la figura
 *     en escala de grises. Lo vigila
 *     `packages/ui/__tests__/figura-de-leccion-habla.test.tsx`.
 *
 * Nada de esto pasa por `sanitizeSvg`: aqui no hay ninguna cadena de marcado
 * que sanear. La figura son numeros y el marcado lo escribe React.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n, useLocale } from "../lib/i18n.js";
import {
  chainConversion,
  chainSteps,
  chainUnits,
  stepFactor,
  figureAltText,
  formatPlaced,
  placeDigits,
  shiftPlaces,
  shiftedDigits,
  type LessonFigure as Figura,
} from "./lesson-figure.js";

export interface LessonFigureProps {
  readonly figure: Figura;
  /** Pie de figura visible. El texto accesible NO depende de el. */
  readonly caption?: I18nText | undefined;
  readonly className?: string | undefined;
}

/* -------------------------------------------------------------------------- */
/* Piezas comunes                                                             */
/* -------------------------------------------------------------------------- */

const tinta = "var(--cet-ink)";
const linea = "var(--cet-line)";
const pintado = "var(--cet-primary)";
const superficie = "var(--cet-surface-2)";

/**
 * Punta de flecha dibujada como poligono y no como `marker`.
 *
 * Un `marker` vive en `<defs>` y se referencia por `id`. Dos figuras en la
 * misma pagina comparten el documento: dos `id` iguales y la segunda flecha se
 * queda sin punta. Un poligono suelto no tiene ese problema y ademas cuenta
 * como geometria propia, que es lo que hace que la direccion se perciba sin
 * color.
 */
function Punta({ x, y, hacia }: { x: number; y: number; hacia: 1 | -1 }): ReactNode {
  return <polygon points={`${x},${y} ${x - 7 * hacia},${y - 4} ${x - 7 * hacia},${y + 4}`} fill={tinta} />;
}

/* -------------------------------------------------------------------------- */
/* Barras de fraccion                                                         */
/* -------------------------------------------------------------------------- */

const BARRA_X = 6;
const BARRA_ANCHO = 236;
const BARRA_ALTO = 34;
const BARRA_SALTO = 44;

function BarrasDeFraccion({ figure }: { figure: Extract<Figura, { component: "fraction-bars" }> }): ReactNode {
  const alto = figure.bars.length * BARRA_SALTO + 6;

  return (
    <svg
      viewBox={`0 0 300 ${alto}`}
      width="100%"
      role="presentation"
      aria-hidden="true"
      style={{ maxWidth: "26rem", height: "auto" }}
    >
      {figure.bars.map((bar, fila) => {
        const y = fila * BARRA_SALTO + 4;
        const ancho = BARRA_ANCHO / bar.denominator;
        const trozos = Array.from({ length: bar.denominator }, (_, i) => i);
        return (
          <g key={fila}>
            {trozos.map((i) => {
              const x = BARRA_X + i * ancho;
              const lleno = i < bar.numerator;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={ancho}
                    height={BARRA_ALTO}
                    fill={lleno ? pintado : superficie}
                    stroke={tinta}
                    strokeWidth={1}
                  />
                  {/* La trama. Es geometria, no un `fill`: en escala de grises y
                      bajo deuteranopia sigue distinguiendo lo pintado. */}
                  {lleno ? (
                    <line
                      x1={x}
                      y1={y + BARRA_ALTO}
                      x2={x + ancho}
                      y2={y}
                      stroke="var(--cet-on-primary)"
                      strokeWidth={1.5}
                    />
                  ) : null}
                </g>
              );
            })}
            {/* La fraccion escrita al lado de su barra: tercer canal, y ademas
                es la notacion que el alumno tiene que aprender a leer. */}
            <text x={BARRA_X + BARRA_ANCHO + 10} y={y + 15} fontSize={13} fill={tinta}>
              {bar.numerator}
            </text>
            <line
              x1={BARRA_X + BARRA_ANCHO + 8}
              y1={y + 19}
              x2={BARRA_X + BARRA_ANCHO + 26}
              y2={y + 19}
              stroke={tinta}
              strokeWidth={1.5}
            />
            <text x={BARRA_X + BARRA_ANCHO + 10} y={y + 32} fontSize={13} fill={tinta}>
              {bar.denominator}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabla de valor posicional                                                  */
/* -------------------------------------------------------------------------- */

/** Cabecera de la columna `10^exp`, escrita como numero: 100, 10, 1, 0,1… */
function cabeceraColumna(exp: number, locale: string): string {
  if (exp >= 0) return String(10 ** exp);
  const ceros = "0".repeat(Math.abs(exp) - 1);
  return `0${locale === "es" ? "," : "."}${ceros}1`;
}

const COL = 42;
const FILA_ALTO = 30;

function ValorPosicional({
  figure,
}: {
  figure: Extract<Figura, { component: "place-value-shift" }>;
}): ReactNode {
  const locale = useLocale();
  const origen = placeDigits(figure.value);
  const destino = shiftedDigits(figure);
  const salto = shiftPlaces(figure);

  // Las columnas son la union de las dos filas: asi el digito que se mueve
  // TIENE columna a la que llegar, que es justo lo que la figura ensena.
  const exps = [...origen, ...destino].map((d) => d.exp);
  const alto = Math.max(0, ...exps);
  const bajo = Math.min(0, ...exps);
  const columnas: number[] = [];
  for (let e = alto; e >= bajo; e -= 1) columnas.push(e);

  // La banda de arriba es para el signo de la operacion. Sin ella el "× 1.000"
  // se pintaba encima de la primera columna y no habia forma de leer ninguno.
  const x = (exp: number): number => 8 + (alto - exp) * COL;
  const ancho = columnas.length * COL + 16;
  const yCab = 34;
  const yOrigen = 82;
  const yDestino = 146;
  const yAlto = 190;

  const enRango = (exp: number): boolean => exp <= alto && exp >= bajo;

  return (
    <svg
      viewBox={`0 0 ${ancho} ${yAlto}`}
      width="100%"
      role="presentation"
      aria-hidden="true"
      style={{ maxWidth: "30rem", height: "auto" }}
    >
      {columnas.map((exp) => (
        <g key={exp}>
          <rect
            x={x(exp)}
            y={yCab - 12}
            width={COL - 4}
            height={FILA_ALTO}
            fill={superficie}
            stroke={linea}
            strokeWidth={1}
          />
          <text x={x(exp) + (COL - 4) / 2} y={yCab + 6} fontSize={11} fill={tinta} textAnchor="middle">
            {cabeceraColumna(exp, locale)}
          </text>
          <rect
            x={x(exp)}
            y={yOrigen - 12}
            width={COL - 4}
            height={FILA_ALTO}
            fill="none"
            stroke={linea}
            strokeWidth={1}
          />
          <rect
            x={x(exp)}
            y={yDestino - 12}
            width={COL - 4}
            height={FILA_ALTO}
            fill="none"
            stroke={linea}
            strokeWidth={1}
          />
        </g>
      ))}

      {/* La coma. Se dibuja una sola vez, en la MISMA x para las dos filas: es
          el hecho que el tema entero intenta meter en la cabeza. */}
      {bajo < 0 ? (
        <line
          x1={x(0) + COL - 4}
          y1={yCab - 14}
          x2={x(0) + COL - 4}
          y2={yDestino + FILA_ALTO - 10}
          stroke={pintado}
          strokeWidth={2.5}
          strokeDasharray="5 3"
        />
      ) : null}

      {origen.map((d) => (
        <text
          key={`o${d.exp}`}
          x={x(d.exp) + (COL - 4) / 2}
          y={yOrigen + 8}
          fontSize={17}
          fill={tinta}
          textAnchor="middle"
        >
          {d.digit}
        </text>
      ))}

      {destino.map((d) => (
        <text
          key={`d${d.exp}`}
          x={x(d.exp) + (COL - 4) / 2}
          y={yDestino + 8}
          fontSize={17}
          fill={tinta}
          textAnchor="middle"
        >
          {d.digit}
        </text>
      ))}

      {/* Una flecha por digito que viaja: la direccion se ve en la geometria,
          no en el tono. Los ceros de relleno no viajan y no llevan flecha. */}
      {origen
        .filter((d) => d.digit !== "0" && enRango(d.exp + salto))
        .map((d) => {
          const x1 = x(d.exp) + (COL - 4) / 2;
          const x2 = x(d.exp + salto) + (COL - 4) / 2;
          const hacia: 1 | -1 = x2 >= x1 ? 1 : -1;
          return (
            <g key={`f${d.exp}`}>
              <path
                d={`M ${x1} ${yOrigen + 14} C ${x1} ${yOrigen + 40}, ${x2} ${yDestino - 34}, ${x2} ${yDestino - 20}`}
                fill="none"
                stroke={tinta}
                strokeWidth={1.5}
              />
              <Punta x={x2} y={yDestino - 18} hacia={hacia} />
            </g>
          );
        })}

      {/* El signo escrito. Es el canal que sobrevive a cualquier daltonismo y a
          una fotocopia en blanco y negro. */}
      <text x={8} y={16} fontSize={14} fill={tinta}>
        {`${figure.direction === "multiply" ? "×" : "÷"} ${figure.factor}`}
      </text>
      <text x={ancho - 8} y={yDestino + 40} fontSize={14} fill={tinta} textAnchor="end">
        {`= ${formatPlaced(destino, locale === "es" ? "es" : "en")}`}
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Escalera de unidades                                                       */
/* -------------------------------------------------------------------------- */

const CAJA = 54;
const HUECO = 74;

function EscaleraDeUnidades({
  figure,
}: {
  figure: Extract<Figura, { component: "unit-chain" }>;
}): ReactNode {
  const unidades = chainUnits(figure.quantity);
  const pasos = chainSteps(figure.quantity);
  const conv =
    figure.from !== undefined && figure.to !== undefined
      ? chainConversion(figure.quantity, figure.from, figure.to)
      : null;
  const desde = figure.from === undefined ? -1 : unidades.indexOf(figure.from);
  const hasta = figure.to === undefined ? -1 : unidades.indexOf(figure.to);
  const dentroDelCamino = (i: number): boolean =>
    desde >= 0 && hasta >= 0 && i >= Math.min(desde, hasta) && i < Math.max(desde, hasta);
  /**
   * Se engorda SOLO la fila de flechas por la que se viaja: la de arriba si se
   * multiplica, la de abajo si se divide.
   *
   * Antes se engordaban las dos, y entonces `km -> m` y `m -> km` producian
   * EXACTAMENTE el mismo dibujo: el sentido viajaba unicamente en la linea
   * escrita de abajo. Para el nino que aun lee con esfuerzo, la escalera no
   * decia hacia donde iba. Ahora la flecha gruesa apunta al camino, que es
   * ademas el mnemotecnico del tema: hacia la unidad pequena se multiplica.
   */
  const gruesa = (i: number, fila: "multiply" | "divide"): number =>
    dentroDelCamino(i) && conv !== null && conv.direction === fila ? 3 : 1;

  const x = (i: number): number => 6 + i * (CAJA + HUECO);
  const ancho = unidades.length * CAJA + (unidades.length - 1) * HUECO + 12;
  const yCaja = 34;

  return (
    <svg
      viewBox={`0 0 ${ancho} ${conv === null ? 96 : 124}`}
      width="100%"
      role="presentation"
      aria-hidden="true"
      style={{ maxWidth: "34rem", height: "auto" }}
    >
      {unidades.map((unidad, i) => {
        const resaltada = i === desde || i === hasta;
        return (
          <g key={unidad}>
            <rect
              x={x(i)}
              y={yCaja}
              width={CAJA}
              height={32}
              rx={6}
              fill={resaltada ? pintado : superficie}
              stroke={tinta}
              // El grosor es el canal no cromatico del resaltado: se ve igual en
              // escala de grises que en color.
              strokeWidth={resaltada ? 3 : 1}
            />
            <text
              x={x(i) + CAJA / 2}
              y={yCaja + 21}
              fontSize={15}
              fill={resaltada ? "var(--cet-on-primary)" : tinta}
              textAnchor="middle"
            >
              {unidad}
            </text>
          </g>
        );
      })}

      {pasos.map((paso, i) => {
        const x1 = x(i) + CAJA;
        const x2 = x(i + 1);
        return (
          <g key={paso.from + paso.to}>
            {/* Arriba, hacia la derecha: a la unidad pequena se MULTIPLICA. */}
            <line x1={x1 + 4} y1={yCaja - 8} x2={x2 - 10} y2={yCaja - 8} stroke={tinta} strokeWidth={gruesa(i, "multiply")} />
            <Punta x={x2 - 4} y={yCaja - 8} hacia={1} />
            <text x={(x1 + x2) / 2} y={yCaja - 14} fontSize={11} fill={tinta} textAnchor="middle">
              {`× ${stepFactor(paso)}`}
            </text>
            {/* Abajo, hacia la izquierda: a la unidad grande se DIVIDE. */}
            <line x1={x2 - 4} y1={yCaja + 42} x2={x1 + 10} y2={yCaja + 42} stroke={tinta} strokeWidth={gruesa(i, "divide")} />
            <Punta x={x1 + 4} y={yCaja + 42} hacia={-1} />
            <text x={(x1 + x2) / 2} y={yCaja + 56} fontSize={11} fill={tinta} textAnchor="middle">
              {`÷ ${stepFactor(paso)}`}
            </text>
          </g>
        );
      })}

      {/* La conversion resaltada, escrita. Sin esto el resaltado seria solo un
          borde mas grueso, y el alumno tendria que deducir el factor. */}
      {conv !== null && figure.from !== undefined && figure.to !== undefined ? (
        <text x={6} y={118} fontSize={13} fill={tinta}>
          {`${figure.from} → ${figure.to} : ${conv.direction === "multiply" ? "×" : "÷"} ${conv.factor}`}
        </text>
      ) : null}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* La figura                                                                  */
/* -------------------------------------------------------------------------- */

function Dibujo({ figure }: { figure: Figura }): ReactNode {
  switch (figure.component) {
    case "fraction-bars":
      return <BarrasDeFraccion figure={figure} />;
    case "place-value-shift":
      return <ValorPosicional figure={figure} />;
    case "unit-chain":
      return <EscaleraDeUnidades figure={figure} />;
    default: {
      const exhaustive: never = figure;
      return exhaustive;
    }
  }
}

/**
 * Apoyo visual de una leccion: el mismo contenido dicho por otra via.
 *
 * No es decoracion. Cada figura existe porque hay un hecho —de tamano, de
 * posicion o de direccion— que el parrafo de al lado no consigue ensenar, y que
 * un dibujo si. Por eso la figura no sustituye al texto: lo repite.
 */
export function LessonFigure({ figure, caption, className }: LessonFigureProps): ReactNode {
  const locale = useLocale();
  const t = useI18n();
  const label = figureAltText(figure, locale);

  return (
    <figure className={cn("my-3 flex flex-col items-center gap-2", className)}>
      {/* UN solo nodo anunciado, con la figura entera dicha. Todo lo de dentro
          va `aria-hidden` para que el lector no recite los digitos sueltos. */}
      <div
        role="img"
        aria-label={label}
        className="w-full rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] px-3 py-3"
      >
        <Dibujo figure={figure} />
      </div>
      {caption ? (
        <figcaption className="text-center text-body-sm text-[var(--cet-ink-muted)]">
          {t(caption)}
        </figcaption>
      ) : null}
    </figure>
  );
}
