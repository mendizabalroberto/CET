/**
 * @cet/ui — la identidad visual de un TEMA de practica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * UN NIVEL POR DEBAJO DE `subject-identity.ts`, Y CON LA MISMA REGLA
 * ===========================================================================
 * En `/learn` la silueta dice que MATERIA es. En `/practice` las diez tarjetas
 * son de la misma materia, asi que ahi la silueta tiene que decir que TEMA es.
 * El color no cambia entre temas y no puede cambiar: sigue siendo el de la
 * materia —rail, medallon y lavado—, y es refuerzo, nunca distintivo. Quien
 * quiera saber que hay debajo de la regla, esta escrita entera en
 * `subject-identity.ts`: en deuteranopia y en escala de grises los tonos de
 * materia son el mismo color.
 *
 * Por eso este modulo NO devuelve colores. Devuelve la clave de la silueta y
 * nada mas: el color viene aparte, de la materia a la que pertenece el tema.
 *
 * ===========================================================================
 * EL TEMA DESCONOCIDO, Y `mix`
 * ===========================================================================
 * La lista de temas se deriva del registro de `@cet/engine`, asi que un
 * generador nuevo aparece en la parrilla sin que nadie toque la interfaz. Eso
 * es una virtud del catalogo y un riesgo para el dibujo: el dia que se registre
 * `math.angles`, su tarjeta necesita una silueta que aun no existe. Cae en la
 * neutra, que es un tema de verdad y no un hueco.
 *
 * `mix` tampoco es un tema: es un sorteo entre los demas. Comparte la silueta
 * neutra a proposito — no pertenece a ninguna familia — y la app le da ademas
 * la identidad de materia neutra, que es lo que le pone el rail gris.
 */

/** Los diez temas que este design system sabe dibujar hoy. */
export const TOPIC_CODES = [
  "simplify",
  "compare",
  "fracop",
  "mixed",
  "decimal",
  "powten",
  "metric",
  "shape",
  "word",
  "mix",
] as const;

export type TopicCode = (typeof TOPIC_CODES)[number];

/** La silueta de un tema que este design system aun no conoce. */
export const UNKNOWN_TOPIC = "otro" as const;

export type TopicIdentityCode = TopicCode | typeof UNKNOWN_TOPIC;

function isKnown(code: string): code is TopicCode {
  return (TOPIC_CODES as readonly string[]).includes(code);
}

/**
 * La clave de silueta de un tema.
 *
 * Nunca lanza y nunca devuelve `null`: una pantalla de alumno no se cae porque
 * se haya registrado un generador nuevo.
 */
export function topicIdentity(code: string): TopicIdentityCode {
  return isKnown(code) ? code : UNKNOWN_TOPIC;
}
