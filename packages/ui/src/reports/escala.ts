/**
 * @cet/ui — escala: los cortes redondos de un eje de valores.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ESTA EN SU PROPIO FICHERO Y NO EN `chart-chrome`
 * ===========================================================================
 * Porque NO lleva "use client", y no puede llevarlo. Estas dos funciones son
 * aritmetica pura —ni React, ni DOM, ni estado— y quien mas las necesita es el
 * SERVIDOR: `lib/tutor/seguimiento.ts` reparte aqui la escala y luego la rotula
 * en el idioma del tutor, porque el paquete no sabe ni puede saber que la
 * unidad son minutos (AD-7). Importarlas desde `chart-chrome`, que si es un
 * modulo de cliente, arrastraria la frontera entera al servidor.
 *
 * No es una precaucion teorica: `apps/web/src/lib/rsc-boundary.test.ts` recorre
 * el arbol y pone rojo cualquier import de servidor que cruce a un modulo
 * "use client". Ya lo puso, y este fichero es la respuesta.
 *
 * Es el mismo reparto que ya hace `learning/block-kind.ts`, cuya cabecera
 * documenta el mismo par: la parte que dibuja lleva la directiva, la parte que
 * decide no.
 */

/**
 * Los valores redondos de un eje que llega hasta `maximo`.
 *
 * Devuelve cortes SIEMPRE terminados en 1, 2, 2.5 o 5 por una potencia de diez
 * —los numeros que un ojo suma sin pensar— y el ultimo es mayor o igual que el
 * maximo real. Es la diferencia entre un eje que dice «15, 30, 45» y uno que
 * dice «14.3, 28.6, 42.9»: el segundo es el que sale de repartir el maximo en
 * partes iguales, y no lo lee nadie.
 *
 * El cero NO viene en la lista: la linea base ya esta dibujada, y rotularla
 * ademas con un «0» metido debajo de las columnas es tinta que no anade nada.
 * La lista sale de menor a mayor.
 *
 * `soloEnteros` para las magnitudes que no admiten mitades. El eje de lecciones
 * terminadas rotulado «0,4 · 0,8 · 1,2» no es un eje mas fino: es un eje que
 * miente, porque media leccion terminada no existe y ninguna columna podra caer
 * nunca en esa linea. Con la bandera puesta el paso nunca baja de uno.
 */
export function cortesDelEje(maximo: number, cuantos = 3, soloEnteros = false): readonly number[] {
  if (!Number.isFinite(maximo) || maximo <= 0) return [];
  const objetivo = Math.max(1, Math.min(4, Math.round(cuantos)));

  const crudo = maximo / objetivo;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const normalizado = crudo / potencia;
  /* La escalera de pasos «bonitos». Es mas fina que la clasica 1-2-5 a
     proposito: con solo esos tres, un pico de 45 minutos cae en paso 20 y el eje
     sube hasta 60 —un tercio del dibujo vacio por encima de la columna mas
     alta—, mientras que con el 1.5 de esta escalera el paso es 15 y el eje
     termina justo en 45. Todos los valores de aqui dan cortes que un ojo suma
     sin pensar, tanto en minutos como en cuentas de lecciones. */
  const ESCALERA = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;
  const bonito = ESCALERA.find((paso) => normalizado <= paso) ?? 10;

  /* Con enteros se BAJA al paso entero, nunca se sube. El reparto ideal de un
     maximo de 3 lecciones en dos cortes da 1.5, y redondear al 2 mas cercano
     pone el tope del eje en 4: un cuarto del dibujo vacio por encima del mejor
     dia del niño, y un rotulo —«4 lecciones»— que nombra una cifra que no
     ocurrio. Truncando sale paso 1 y el eje termina exactamente en 3, que es
     donde estan los datos. El suelo de uno es obligatorio: un paso de cero no
     avanza y el bucle de abajo no terminaria nunca. */
  const paso = soloEnteros
    ? Math.max(1, Math.floor(bonito * potencia))
    : bonito * potencia;

  const cortes: number[] = [];
  for (let i = 1; i <= objetivo + 1; i += 1) {
    const valor = Number((paso * i).toFixed(6));
    cortes.push(valor);
    if (valor >= maximo) break;
  }
  return cortes;
}

/** El tope del eje: el ultimo corte, que siempre cubre el maximo de los datos. */
export function topeDelEje(maximo: number, cuantos = 3, soloEnteros = false): number {
  const cortes = cortesDelEje(maximo, cuantos, soloEnteros);
  const ultimo = cortes[cortes.length - 1];
  return ultimo === undefined || ultimo < maximo ? Math.max(maximo, 1) : ultimo;
}
