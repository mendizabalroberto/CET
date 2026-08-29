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
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { hayCohorteSuficiente } from "./scorecard-data.js";

/** Alto de barra. Por debajo del tope de 24 px de la casa para marcas de dato. */
const GRUESO = 12;
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
  const filas = [
    {
      clave: "alumno" as const,
      rotulo: t(studentLabel),
      cifra: studentValueText,
      parte: fraccion(studentRatio),
      propio: true,
    },
    {
      clave: "clase" as const,
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
        <div key={fila.clave} data-cet-fila={fila.clave} className="flex flex-col gap-1">
          {/* Renglon propio para el rotulo. Ver la cabecera. */}
          {fila.rotulo.length > 0 ? <span className="text-body-sm">{fila.rotulo}</span> : null}
          <span className="flex items-center gap-2">
            <svg
              width="100%"
              height={GRUESO}
              viewBox={`0 0 100 ${GRUESO}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              // `overflow-visible`: el trazo de la barra hueca va centrado en el
              // borde y medio pixel cae fuera del viewBox; recortado, el guion
              // de arriba y el de abajo se pierden.
              className="block h-3 min-w-0 flex-1 overflow-visible"
            >
              {/* La pista: mismo tono, muy atenuada. Es rejilla, no dato. */}
              <rect
                x={0}
                y={0}
                width={100}
                height={GRUESO}
                rx={2}
                fill="currentColor"
                opacity={0.12}
              />
              <rect
                data-cet-barra={fila.propio ? "alumno" : "clase"}
                x={0}
                y={0}
                width={Math.max(MIN_VISIBLE, fila.parte * 100)}
                height={GRUESO}
                rx={2}
                // El alumno macizo; la clase hueca y discontinua. Dos canales de
                // FORMA. El tono es el mismo en las dos.
                fill={fila.propio ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={fila.propio ? undefined : "3 2"}
                // El trazo va en unidades del viewBox y este se estira: sin
                // esto, el guion se deformaria con el ancho del panel.
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="shrink-0 tabular-nums text-body-sm font-semibold">{fila.cifra}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
