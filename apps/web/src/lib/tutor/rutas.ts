/**
 * Las rutas de la zona del tutor, en un sitio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `lib/routes.ts` guarda las PORTADAS y la matriz de autorización; esto son las
 * rutas profundas de un hijo concreto, que llevan un id dentro y por tanto no
 * son constantes. Se escriben aquí y no en cada página porque cuatro pantallas
 * se enlazan entre sí —ficha, índice de materias, materia y lección— y un
 * literal repetido cuatro veces es como una de ellas se queda atrás el día que
 * la ruta cambie.
 *
 * TODO SEGMENTO VARIABLE VA `encodeURIComponent`. El id viene de la base, pero
 * la clave de materia es `subjects.code` —dato de contenido, editable desde el
 * panel— y un `/` dentro partiría la URL en dos.
 */

export interface RutasDeHijo {
  /** Su ficha: seguimiento, enlace y aparatos. */
  readonly ficha: string;
  /** El índice de sus materias. */
  readonly contenido: string;
  /** Lo que ha practicado, pregunta a pregunta. */
  readonly practica: string;
  /** El plan de estudio: boletín, propuesta y tareas. */
  readonly plan: string;
  readonly materia: (clave: string) => string;
  readonly leccion: (lessonId: string) => string;
}

export function rutasDeHijo(studentId: string): RutasDeHijo {
  const base = `/tutor/hijos/${encodeURIComponent(studentId)}`;
  return {
    ficha: base,
    contenido: `${base}/contenido`,
    practica: `${base}/practica`,
    plan: `${base}/plan`,
    materia: (clave) => `${base}/contenido/materia/${encodeURIComponent(clave)}`,
    leccion: (lessonId) => `${base}/contenido/leccion/${encodeURIComponent(lessonId)}`,
  };
}
