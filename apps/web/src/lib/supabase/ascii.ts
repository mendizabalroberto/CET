/**
 * Plegado a ASCII para valores que viajan en cabeceras HTTP.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTO VIVE EN SU PROPIO FICHERO
 * ===========================================================================
 * Estaba dentro de `admin.ts`, que importa `server-only` y por tanto no se
 * puede cargar desde una prueba. Una función de tres líneas que no se puede
 * probar es exactamente la que nadie prueba — y ésta tumbó una pantalla entera.
 * No tiene nada de servidor: es manipulación de texto.
 */

/**
 * Pliega un texto a ASCII imprimible.
 *
 * Una cabecera HTTP no admite caracteres fuera de ASCII: si se cuela uno,
 * `fetch` no llega a mandar la petición y `supabase-js` lo devuelve como
 * `{"message":"Something went wrong"}`, sin código y sin nombrar la cabecera.
 *
 * El 28 de agosto de 2026 eso dejó a todos los alumnos sin poder empezar un
 * examen: el motivo de escalada del motor dice «corrección», la «ó» entraba en
 * el recorte de 120 caracteres de `x-cet-admin-reason`, y `/api/attempts/start`
 * devolvía 500 con «findInProgressAttempt falló: ? Something went wrong». El
 * síntoma señalaba a la base de datos y la causa era una tilde.
 *
 * `NFD` separa cada letra de su tilde y el rango de diacríticos se lleva las
 * tildes sueltas, así que «corrección» queda «correccion» y el motivo se sigue
 * leyendo en el log. Lo que no tiene letra base —una comilla tipográfica, un
 * emoji— se cae: una cabecera incompleta es mejor que una petición que no sale.
 */
export function aAscii(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}
