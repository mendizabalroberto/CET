/**
 * @cet/ui — la identidad visual de una materia.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL COLOR NO ES LA IDENTIDAD
 * ===========================================================================
 * Este modulo traduce el `subjects.code` de la base de datos a lo que hace
 * falta para pintar una materia. Devuelve tres cosas, y el orden en que se
 * enumeran no es casual:
 *
 *   1. `icono`   — la silueta. Es el canal que sobrevive a la ceguera al color
 *                  y a la escala de grises, asi que es el que IDENTIFICA.
 *   2. `orden`   — en que sitio de la rejilla va. Fijo, para que la materia del
 *                  alumno este siempre en la misma casilla: la memoria
 *                  espacial es el segundo canal, y funciona sin mirar.
 *   3. `color`   — el nombre del token. Refuerzo, y nada mas.
 *
 * Los seis colores de materia son INDISTINGUIBLES entre si en deuteranopia
 * (ratios de 1.02 a 1.34) y en escala de grises (#666666 a #717171). Esta
 * medido en `tokens.css` y en `__tests__/contraste-materias.test.ts`. Un
 * componente que use el color para decir CUAL es la materia esta roto para uno
 * de cada doce ninos varones, aunque se vea perfecto en la pantalla de quien lo
 * escribio.
 *
 * ===========================================================================
 * POR QUE NO SE LEE `subjects.color` NI `subjects.icon`
 * ===========================================================================
 * Existen las dos columnas en la tabla (migracion 0005) y son nullable. Un hex
 * que escribe un colegio no tiene contraste garantizado con el blanco del
 * medallon ni con la tinta, y no hay ningun sitio donde medirlo antes de
 * pintarlo. La paleta del producto vive en `tokens.css` y solo ahi — lo vigila
 * `__tests__/una-sola-paleta.test.ts`.
 *
 * ===========================================================================
 * EL CODIGO DESCONOCIDO
 * ===========================================================================
 * `subjects.code` lo pone el colegio y el unico limite de la base de datos es
 * el formato (`^[a-z][a-z0-9_]{1,31}$`). Un colegio que de de alta `music` es
 * un caso NORMAL, no un error. Sin identidad neutra, la tarjeta saldria con
 * `var(--cet-materia-music)`, que en CSS no existe y por tanto es transparente:
 * una tarjeta invisible, en produccion, para el colegio que mas se ha molestado
 * en configurar su curriculo. Por eso `otra` tiene sus dos tokens medidos como
 * los demas y su propio icono.
 */

/** Las seis materias que este design system conoce, en su orden de rejilla. */
export const SUBJECT_CODES = [
  "math",
  "english",
  "spanish",
  "science",
  "socials",
  "ict",
] as const;

export type SubjectCode = (typeof SUBJECT_CODES)[number];

/** La identidad neutra de un `code` que no esta en la lista. */
export const UNKNOWN_SUBJECT = "otra" as const;

/** Lo que devuelve `subjectIdentity()`. Un `code` cualquiera cae en `otra`. */
export type SubjectIdentityCode = SubjectCode | typeof UNKNOWN_SUBJECT;

export interface SubjectIdentity {
  /** El code reconocido, o `otra`. Es la clave del icono. */
  readonly code: SubjectIdentityCode;
  /** Token de relleno: rail, medallon, barra. `var(--cet-materia-math)`. */
  readonly fill: string;
  /** Token del lavado del cuerpo. `var(--cet-materia-math-suave)`. */
  readonly soft: string;
  /**
   * Posicion fija en la rejilla. Las desconocidas van al final, y entre ellas
   * se ordenan por nombre en la pantalla; aqui todas valen lo mismo a proposito:
   * este modulo no sabe de nombres ni de idiomas.
   */
  readonly order: number;
}

const ORDER: Readonly<Record<SubjectCode, number>> = {
  math: 0,
  english: 1,
  spanish: 2,
  science: 3,
  socials: 4,
  ict: 5,
};

/** Las desconocidas detras de las seis conocidas, pase lo que pase. */
const ORDER_UNKNOWN = SUBJECT_CODES.length;

function isKnown(code: string): code is SubjectCode {
  return (SUBJECT_CODES as readonly string[]).includes(code);
}

/**
 * La identidad de una materia a partir de su `code`.
 *
 * Nunca lanza y nunca devuelve `null`: una pantalla de alumno no se cae porque
 * un colegio haya dado de alta una materia nueva.
 */
export function subjectIdentity(code: string): SubjectIdentity {
  const key: SubjectIdentityCode = isKnown(code) ? code : UNKNOWN_SUBJECT;
  return {
    code: key,
    fill: `var(--cet-materia-${key})`,
    soft: `var(--cet-materia-${key}-suave)`,
    order: key === UNKNOWN_SUBJECT ? ORDER_UNKNOWN : ORDER[key],
  };
}
