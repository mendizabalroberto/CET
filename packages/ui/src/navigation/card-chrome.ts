/**
 * @cet/ui — la caja de las tarjetas de navegacion.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EXISTE ESTE FICHERO
 * ===========================================================================
 * `SubjectCard` (materias, en /learn) y `TopicCard` (temas, en /practice) son
 * la MISMA tarjeta con dentro dos cosas distintas. Cuando cada una llevaba su
 * lista de clases escrita a mano, las dos pantallas del mismo alumno empezaron
 * a divergir sin que ningun test lo viera: el radio de una, la sombra de la
 * otra, y cuatro pixeles de padding de diferencia que nadie decidio nunca.
 *
 * Aqui la caja se declara UNA vez. Cambiar el radio de las tarjetas del
 * producto es cambiar esta constante; no hay una segunda copia que se quede
 * atras. Es la misma disciplina que `tokens.css` impone al color, aplicada a la
 * geometria.
 *
 * ===========================================================================
 * QUE ES CAJA Y QUE NO
 * ===========================================================================
 * Caja es lo que hace que una tarjeta se vea como una tarjeta de esta casa:
 * area pulsable minima, radio, borde, rail, sombra, elevacion al pasar por
 * encima y el respeto por `prefers-reduced-motion`. NO es caja el CONTENIDO
 * —medallon, cifras, escalera—, que es justo lo que distingue a una tarjeta de
 * la otra, ni el color, que llega por `subjectIdentity()` y viaja en `style`
 * porque depende del dato.
 *
 * El rail (`border-s-4`) va del lado de la lectura, no a la izquierda: en un
 * idioma de derecha a izquierda tiene que cambiarse de lado solo. Por eso es
 * `border-s` y por eso el color lo pone `borderInlineStartColor`.
 */

import type { CSSProperties } from "react";

import type { SubjectIdentity } from "./subject-identity.js";

/**
 * Las clases de la caja. Una sola definicion para las dos tarjetas.
 *
 * `min-h-[var(--cet-touch-min)]` y no un `min-h-11` a pelo: el minimo tactil es
 * una decision del design system que vive en `tokens.css`, y aqui se lee, no se
 * vuelve a tomar.
 */
export const CARD_CHROME = [
  "flex min-h-[var(--cet-touch-min)] flex-col gap-3 rounded-md border border-[var(--cet-line)]",
  // El rail: el unico borde grueso, y del lado de la lectura.
  "border-s-4 px-4 py-4 no-underline shadow-card",
  "text-[var(--cet-ink)] hover:shadow-pop",
  "transition-shadow duration-slow ease-cet motion-reduce:transition-none",
].join(" ");

/**
 * Los dos colores de la tarjeta: el cuerpo y el rail.
 *
 * Salen los dos de la identidad de la MATERIA. Ninguno se escribe a mano, y
 * ningun otro par esta medido: sobre el lavado va `--cet-ink` y sobre el
 * relleno va `--cet-ink-inverse`. Ver `__tests__/contraste-materias.test.ts`.
 */
export function cardSkin(identity: SubjectIdentity): CSSProperties {
  return {
    backgroundColor: identity.soft,
    borderInlineStartColor: identity.fill,
  };
}

/**
 * El medallon: relleno saturado con la silueta en blanco encima.
 *
 * Es la unica combinacion medida sobre el relleno, y por eso el color de la
 * tinta no es un parametro.
 */
export function medallionSkin(identity: SubjectIdentity): CSSProperties {
  return {
    backgroundColor: identity.fill,
    color: "var(--cet-ink-inverse)",
  };
}

/** Las clases del medallon. 44 px: el mismo minimo tactil, aunque no se pulse. */
export const MEDALLION_CHROME =
  "flex h-11 w-11 flex-none items-center justify-center rounded-md";
