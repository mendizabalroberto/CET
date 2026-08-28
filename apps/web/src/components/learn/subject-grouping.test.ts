/**
 * De cursos a materias: los casos que rompen la rejilla.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los tres que importan son el segundo, el tercero y el cuarto. Un colegio con
 * un curso por materia funciona con cualquier implementación; lo que distingue
 * una buena de una mala es el colegio que activa dos cursos de la misma materia
 * y el curso cuya materia no se puede ver.
 */
import { describe, expect, it } from "vitest";

import type { CourseSummary } from "./queries";
import {
  ORPHAN_PREFIX,
  courseLessonIds,
  findSubjectGroup,
  groupCoursesBySubject,
} from "./subject-grouping";

function course(overrides: Partial<CourseSummary> & { id: string }): CourseSummary {
  return {
    id: overrides.id,
    title: overrides.title ?? { es: "Curso", en: "Course" },
    yearLevel: overrides.yearLevel ?? 6,
    subject: overrides.subject ?? { es: "Matemáticas", en: "Maths" },
    subjectCode: overrides.subjectCode === undefined ? "math" : overrides.subjectCode,
    modules: overrides.modules ?? [],
    lessonCount: overrides.lessonCount ?? 0,
  };
}

function moduleWith(id: string, lessonIds: readonly string[]) {
  return {
    id,
    ord: 1,
    title: { es: "Unidad", en: "Unit" },
    description: null,
    lessons: lessonIds.map((lessonId, index) => ({
      id: lessonId,
      ord: index + 1,
      title: { es: "Lección", en: "Lesson" },
      estimatedMinutes: null,
    })),
  };
}

describe("groupCoursesBySubject", () => {
  it("da una tarjeta por materia", () => {
    const groups = groupCoursesBySubject(
      [
        course({ id: "c1", subjectCode: "math" }),
        course({ id: "c2", subjectCode: "ict", subject: { es: "Informática", en: "ICT" } }),
      ],
      "es",
    );
    expect(groups.map((g) => g.key).sort()).toEqual(["ict", "math"]);
  });

  /*
   * El caso del alumno que llega tarde y lleva el curso de repaso además del
   * suyo. Dos tarjetas «Matemáticas» idénticas serían indistinguibles.
   */
  it("funde dos cursos de la misma materia en una sola tarjeta, sumando sus lecciones", () => {
    const groups = groupCoursesBySubject(
      [
        course({ id: "c1", subjectCode: "math", modules: [moduleWith("m1", ["l1", "l2"])] }),
        course({ id: "c2", subjectCode: "math", modules: [moduleWith("m2", ["l3"])] }),
      ],
      "es",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.courses).toHaveLength(2);
    expect(groups[0]?.lessonIds).toEqual(["l1", "l2", "l3"]);
  });

  /*
   * `subjects` puede no ser visible aunque el curso sí lo sea. Esconder el curso
   * seria esconderle al alumno lecciones publicadas.
   */
  it("no esconde un curso cuya materia no es visible: le da grupo propio", () => {
    const groups = groupCoursesBySubject(
      [
        course({
          id: "c9",
          subjectCode: null,
          subject: null,
          title: { es: "Taller de lectura", en: "Reading club" },
          modules: [moduleWith("m1", ["l1"])],
        }),
      ],
      "es",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe(`${ORPHAN_PREFIX}c9`);
    expect(groups[0]?.name).toEqual({ es: "Taller de lectura", en: "Reading club" });
    expect(groups[0]?.lessonIds).toEqual(["l1"]);
  });

  it("da al grupo huérfano un code vacío, para que caiga en la identidad neutra", () => {
    const groups = groupCoursesBySubject([course({ id: "c9", subjectCode: null })], "es");
    expect(groups[0]?.code).toBe("");
  });

  it("no funde dos cursos huérfanos distintos en el mismo grupo", () => {
    const groups = groupCoursesBySubject(
      [
        course({ id: "c8", subjectCode: null, subject: null }),
        course({ id: "c9", subjectCode: null, subject: null }),
      ],
      "es",
    );
    expect(groups).toHaveLength(2);
  });

  it("usa el nombre de la MATERIA, no el del curso, cuando la materia se ve", () => {
    const groups = groupCoursesBySubject(
      [
        course({
          id: "c1",
          subjectCode: "math",
          subject: { es: "Matemáticas", en: "Maths" },
          title: { es: "Matemáticas Año 6", en: "Maths Year 6" },
        }),
      ],
      "es",
    );
    expect(groups[0]?.name).toEqual({ es: "Matemáticas", en: "Maths" });
  });

  it("da el mismo orden ante la misma entrada", () => {
    const input = [
      course({ id: "c2", subjectCode: "ict", subject: { es: "Informática", en: "ICT" } }),
      course({ id: "c1", subjectCode: "math" }),
    ];
    expect(groupCoursesBySubject(input, "es").map((g) => g.key)).toEqual(
      groupCoursesBySubject(input, "es").map((g) => g.key),
    );
  });

  it("sin cursos, ninguna materia", () => {
    expect(groupCoursesBySubject([], "es")).toEqual([]);
  });
});

describe("courseLessonIds", () => {
  it("recorre módulos y lecciones en orden", () => {
    expect(
      courseLessonIds(
        course({ id: "c1", modules: [moduleWith("m1", ["a", "b"]), moduleWith("m2", ["c"])] }),
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("un curso sin módulos no tiene lecciones", () => {
    expect(courseLessonIds(course({ id: "c1" }))).toEqual([]);
  });
});

describe("findSubjectGroup", () => {
  const groups = groupCoursesBySubject([course({ id: "c1", subjectCode: "math" })], "es");

  it("encuentra por clave", () => {
    expect(findSubjectGroup(groups, "math")?.key).toBe("math");
  });

  /* La página hace `notFound()` con esto; un throw sería la pantalla roja. */
  it("devuelve null y no lanza cuando la clave no existe", () => {
    expect(findSubjectGroup(groups, "music")).toBeNull();
  });
});
