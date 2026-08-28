/**
 * @cet/ui — el icono de un tema de practica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ANDAMIO — LA GEOMETRIA LA ESCRIBE `prac-a-iconos`
 * ===========================================================================
 * Este fichero esta en el arbol con su INTERFAZ definitiva y once siluetas
 * provisionales para que `TopicCard` compile y se pueda probar desde el minuto
 * uno, sin esperar a que el contrato de los iconos termine. Lo que se sustituye
 * es el mapa `PATHS`; nada mas.
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
 * ANDAMIO: hoy las once comparten trazo. Ninguna prueba afirma nada sobre esta
 * geometria todavia; la que lo hara es `__tests__/identidad-de-tema.test.tsx`.
 */
const PATHS: Readonly<Record<TopicIdentityCode, string>> = {
  simplify: "M5 12h14",
  compare: "M5 12h14",
  fracop: "M5 12h14",
  mixed: "M5 12h14",
  decimal: "M5 12h14",
  powten: "M5 12h14",
  metric: "M5 12h14",
  shape: "M5 12h14",
  word: "M5 12h14",
  mix: "M5 12h14",
  otro: "M5 12h14",
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
