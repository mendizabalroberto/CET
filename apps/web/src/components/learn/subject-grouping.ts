/**
 * De cursos a materias: la agrupación que hace posible la rejilla de `/learn`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ HACE FALTA AGRUPAR
 * ===========================================================================
 * `getStudentCourses()` devuelve CURSOS, y un curso es `(materia × año)`: en la
 * base de datos, `courses` tiene `subject_id` y `year_level`. El alumno, en
 * cambio, no piensa en cursos: piensa en «Matemáticas». Si un colegio activa
 * dos cursos de la misma materia —el de repaso del año anterior y el suyo, que
 * es exactamente lo que hace un colegio bilingüe con un alumno que llega tarde—
 * la pantalla enseñaría dos tarjetas «Matemáticas» idénticas y el alumno no
 * tendría forma de saber cuál es la suya.
 *
 * Así que la rejilla agrupa por materia y la pantalla de materia separa por
 * curso. Una tarjeta por materia; dentro, un bloque por curso si hay más de
 * uno.
 *
 * ===========================================================================
 * EL CURSO SIN MATERIA VISIBLE
 * ===========================================================================
 * `subjectCode` puede ser `null`: la fila de `subjects` puede haberse borrado, o
 * la RLS puede no dejarla ver aunque el curso sí sea visible. Ese curso NO se
 * esconde —sus lecciones existen y el alumno las necesita—: se le da un grupo
 * propio con clave `curso-<id>` y el nombre del curso.
 *
 * La clave viaja en la URL (`/learn/materia/<clave>`), así que ahí aparecería el
 * uuid del curso. Es aceptable y consistente: `/learn/<lessonId>` ya lleva el
 * uuid de la lección desde el primer día, y un id de curso no es un dato del
 * alumno. Lo que NO sería aceptable es esconderle lecciones publicadas para que
 * la URL quedara bonita.
 *
 * Este módulo es puro a propósito: ni Supabase, ni React, ni `server-only`. Es
 * la parte con reglas de la pantalla, y es la parte que se puede probar.
 */
import { resolveI18n, type I18nText, type Locale } from "@cet/shared";

import type { CourseSummary } from "./queries";

/** Prefijo de la clave sintética de un curso cuya materia no se puede ver. */
export const ORPHAN_PREFIX = "curso-";

export interface SubjectGroup {
  /** `subjects.code`, o `curso-<id>` si la materia no es visible. Va en la URL. */
  readonly key: string;
  /**
   * El `code` con el que se pide la identidad visual (icono y color). Para un
   * grupo huérfano es la cadena vacía: `subjectIdentity()` la trata como
   * desconocida y devuelve la identidad neutra, que es justo lo que queremos.
   */
  readonly code: string;
  readonly name: I18nText;
  readonly courses: readonly CourseSummary[];
  /** Todas las lecciones publicadas de la materia. Es el denominador del avance. */
  readonly lessonIds: readonly string[];
}

/** Todas las lecciones de un curso, en orden de módulo y de lección. */
export function courseLessonIds(course: CourseSummary): string[] {
  return course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
}

/**
 * Agrupa los cursos del alumno en materias.
 *
 * El orden de salida es estable pero NO definitivo: la rejilla lo reordena por
 * `subjectIdentity(code).order`, que es quien decide el sitio fijo de cada
 * materia. Aquí sólo se garantiza que dos ejecuciones con la misma entrada dan
 * la misma salida, para que la pantalla no baile entre recargas.
 */
export function groupCoursesBySubject(
  courses: readonly CourseSummary[],
  locale: Locale,
): SubjectGroup[] {
  const byKey = new Map<string, { code: string; name: I18nText; courses: CourseSummary[] }>();

  for (const course of courses) {
    const orphan = course.subjectCode === null || course.subjectCode.length === 0;
    const key = orphan ? `${ORPHAN_PREFIX}${course.id}` : (course.subjectCode as string);

    const existing = byKey.get(key);
    if (existing) {
      existing.courses.push(course);
      continue;
    }

    byKey.set(key, {
      code: orphan ? "" : (course.subjectCode as string),
      // El nombre de la materia manda sobre el del curso: «Matemáticas», no
      // «Matemáticas Año 6». El año se ve dentro, en el título del curso, y
      // sólo cuando hay más de uno.
      name: orphan || course.subject === null ? course.title : course.subject,
      courses: [course],
    });
  }

  return [...byKey.entries()]
    .map(([key, group]) => ({
      key,
      code: group.code,
      name: group.name,
      courses: group.courses,
      lessonIds: group.courses.flatMap(courseLessonIds),
    }))
    .sort((a, b) => resolveI18n(a.name, locale).localeCompare(resolveI18n(b.name, locale)));
}

/** El grupo cuya clave pide la URL, o `null`. No lanza: la página hace `notFound()`. */
export function findSubjectGroup(
  groups: readonly SubjectGroup[],
  key: string,
): SubjectGroup | null {
  return groups.find((group) => group.key === key) ?? null;
}
