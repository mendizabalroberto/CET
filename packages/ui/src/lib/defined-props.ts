/**
 * @cet/ui — puente entre nuestras props y las de Radix.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * EL PROBLEMA
 * El repositorio compila con `exactOptionalPropertyTypes: true`, que distingue
 * entre "la propiedad no esta" y "la propiedad esta y vale undefined".
 *
 * Nuestras props publicas se declaran `x?: T | undefined` a proposito: un
 * consumidor de React escribe cosas como `checked={quiza}` donde `quiza` puede
 * ser undefined, y obligarle a construir el objeto condicionalmente seria una
 * API hostil.
 *
 * Radix, en cambio, declara `x?: T` (opcional exacta). Pasarle undefined de
 * forma explicita es un error de tipos (TS2375).
 *
 * LA SOLUCION
 * Retirar en la frontera las claves cuyo valor es undefined. No es un cast:
 * el objeto que sale realmente no tiene esas claves, asi que el tipo dice la
 * verdad. Casteando se silenciaria el error sin cambiar el valor, que es
 * justo la clase de mentira que `exactOptionalPropertyTypes` existe para
 * impedir.
 */

/** `T` con todas sus claves opcionales y sin `undefined` entre los valores. */
export type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Devuelve una copia de `obj` sin las claves cuyo valor sea `undefined`.
 *
 * @example
 *   <RadixCheckbox.Root {...definedProps(rest)} />
 */
export function definedProps<T extends object>(obj: T): Defined<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj) as Array<keyof T & string>) {
    const value = obj[key];
    if (value !== undefined) out[key] = value;
  }
  return out as Defined<T>;
}
