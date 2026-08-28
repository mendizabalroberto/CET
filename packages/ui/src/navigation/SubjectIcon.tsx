/**
 * @cet/ui — el icono de una materia.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ESTE COMPONENTE ES EL QUE IDENTIFICA LA MATERIA
 * ===========================================================================
 * No el color. Los seis colores de materia son el mismo color en deuteranopia
 * (1.02 a 1.34 entre pares) y el mismo gris en escala de grises (#666666 a
 * #717171). Lo que distingue una materia de otra es esta silueta.
 *
 * De ahi las tres reglas con las que estan dibujados los siete iconos:
 *
 *   1. SILUETAS DISTINTAS, no variaciones. Cruz, libro, bocadillo, matraz,
 *      globo, pantalla, marcador. Se distinguen a 20 px y en gris; si dos de
 *      ellos se parecen, el fallo es de dibujo y se arregla aqui.
 *   2. SOLO TRAZO, con `currentColor`. El icono no trae color propio: hereda el
 *      del contenedor, que es quien ha medido su contraste. Un icono con su
 *      hexadecimal dentro seria una segunda paleta.
 *   3. `aria-hidden`. El nombre de la materia va escrito al lado, siempre. Un
 *      icono anunciado lo diria dos veces, y "imagen: matraz" no le dice a
 *      nadie que eso son Ciencias.
 *
 * El grosor de trazo es 2 sobre un lienzo de 24: sobrevive al escalado a 20 px
 * del medallon pequeno sin cerrarse por dentro.
 */
import type { ReactNode, SVGProps } from "react";

import { cn } from "../lib/cn.js";

import { subjectIdentity, type SubjectIdentityCode } from "./subject-identity.js";

/**
 * Las siete siluetas. La clave es el `code` YA normalizado por
 * `subjectIdentity()`, no el crudo de la base de datos: asi un `code`
 * desconocido no puede colarse hasta aqui y quedarse sin dibujo.
 */
const PATHS: Readonly<Record<SubjectIdentityCode, string>> = {
  /* Cruz de operaciones. La forma mas simple del lote, y la materia mas usada. */
  math: "M12 4.5v15M4.5 12h15",
  /* Libro abierto por el lomo. */
  english: "M12 6.2c-2.6-1.6-5.2-1.9-8-1.2v12.4c2.8-.7 5.4-.4 8 1.2m0-12.4c2.6-1.6 5.2-1.9 8-1.2v12.4c-2.8-.7-5.4-.4-8 1.2m0-12.4v12.4",
  /* Bocadillo de dialogo: la lengua se habla. */
  spanish: "M4 5.5h16v10H10l-5 4.2v-4.2H4z",
  /* Matraz Erlenmeyer. */
  science: "M9.5 3.5h5M10.5 3.5v5.6L5.2 18.4A1.6 1.6 0 0 0 6.6 20.8h10.8a1.6 1.6 0 0 0 1.4-2.4L13.5 9.1V3.5M7.8 14.5h8.4",
  /* Globo con meridiano y ecuador. */
  socials: "M12 3.2a8.8 8.8 0 100 17.6 8.8 8.8 0 000-17.6M3.4 12h17.2M12 3.2c2.5 2.7 2.5 15 0 17.6M12 3.2c-2.5 2.7-2.5 15 0 17.6",
  /* Pantalla con peana. */
  ict: "M3.5 5h17v10.5h-17zM9 20h6M12 15.5V20",
  /* Marcador: la materia que este design system aun no conoce. */
  otra: "M6.5 3.5h11v17l-5.5-4-5.5 4z",
};

export interface SubjectIconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** `subjects.code`. Uno desconocido cae en la silueta neutra. */
  readonly code: string;
}

export function SubjectIcon({ code, className, ...rest }: SubjectIconProps): ReactNode {
  const identity = subjectIdentity(code);

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("h-6 w-6 flex-none", className)}
      {...rest}
    >
      <path
        d={PATHS[identity.code]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
