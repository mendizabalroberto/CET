/**
 * INVARIANTE: el alumno sin colegio tiene biblioteca.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL FALLO QUE ESTE TEST FIJA, Y QUE ESTUVO EN PRODUCCIÓN
 * ===========================================================================
 * `getStudentCourses()` resolvía el alcance del alumno preguntando SIEMPRE por
 * `school_courses`, la tabla con la que un colegio enciende un curso global.
 * Para el hijo de un tutor se saltaba el viaje y devolvía la lista vacía, con
 * este comentario: «que es la respuesta correcta y no un fallo».
 *
 * No lo era. Medido el 01/09/2026 con un alumno de familia real:
 *
 *   - la base le concede las 33 lecciones de las 6 materias (`published`,
 *     `school_id` nulo, y `lessons_select` se apoya en `can_read_content(NULL)`,
 *     que es verdadero para cualquiera);
 *   - `/learn` le mostraba CERO;
 *   - en la telemetría queda el rastro: un `nav_route_changed` a `/learn` y ni
 *     un solo `lesson_opened`. Entró, no había nada que abrir, y se fue.
 *
 * El error de fondo fue tratar «no tiene colegio» como «tiene un colegio que no
 * ha encendido nada». `school_courses` existe para que un centro ACOTE la
 * biblioteca global a lo que da ese curso; quien no tiene centro no tiene quien
 * le acote nada, y su alcance es la biblioteca global entera — que es lo que
 * dice AD-2 y lo que `globalOrOwn(null)` ya devolvía.
 *
 * Nada fijaba la conducta: el atajo no tenía ni una prueba, así que se podía
 * reintroducir sin que nada se pusiera rojo. Eso es lo que cierra este fichero.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `queries.ts` es codigo de servidor y lo declara con `server-only`, que fuera
// de Next no resuelve. Mismo apano que `tema-claro-por-defecto.test.ts`.
vi.mock("server-only", () => ({}));

/** Tablas por las que se ha preguntado, en orden. */
let tablasConsultadas: string[] = [];
/** Filas que devuelve cada tabla. Lo que no esté aquí devuelve lista vacía. */
let respuestas: Record<string, Record<string, unknown>[]> = {};

/**
 * Un doble encadenable: `.select().eq().is().in().or().order()` y cualquier
 * otro filtro devuelven el mismo objeto, y el objeto es a la vez la promesa del
 * resultado. Así el test no tiene que saberse el orden exacto de los filtros
 * —que es detalle de implementación— y sí puede afirmar lo único que importa:
 * A QUÉ TABLA se le pregunta.
 */
function consulta(tabla: string): Record<string, unknown> {
  const filas = respuestas[tabla] ?? [];
  const resultado = { data: filas, error: null };
  const encadenable: Record<string, unknown> = {
    then: (resolver: (v: unknown) => unknown) => Promise.resolve(resultado).then(resolver),
  };
  for (const filtro of ["select", "eq", "is", "in", "or", "order", "filter", "neq"]) {
    encadenable[filtro] = () => encadenable;
  }
  return encadenable;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: (tabla: string) => {
        tablasConsultadas.push(tabla);
        return consulta(tabla);
      },
    }),
}));

beforeEach(() => {
  tablasConsultadas = [];
  respuestas = {};
});

describe("getStudentCourses · el alcance de quien no tiene colegio", () => {
  it("EL FALLO DEL 01/09/2026: sin colegio, la biblioteca global NO puede salir vacía", async () => {
    // Los seis cursos globales publicados que la base ya le concede.
    respuestas["courses"] = [
      { id: "c1", name: { es: "Matemáticas — 6º" }, year_level: 6, subject_id: "s1" },
    ];
    respuestas["course_modules"] = [
      { id: "m1", course_id: "c1", ord: 1, title: { es: "Fracciones" }, description: null },
    ];
    respuestas["lessons"] = [
      { id: "l1", module_id: "m1", ord: 1, title: { es: "Simplificar" }, estimated_minutes: 20 },
    ];
    respuestas["subjects"] = [{ id: "s1", name: { es: "Matemáticas" }, key: "math" }];

    const { getStudentCourses } = await import("./queries");
    const cursos = await getStudentCourses(null);

    // Lo que de verdad se afirma: que devuelve algo. Con el atajo viejo esto era
    // `[]` SIEMPRE, pasara lo que pasara en la base.
    expect(cursos).not.toBeNull();
    expect(cursos!.length).toBeGreaterThan(0);
  });

  it("sin colegio NO se pregunta por school_courses: no hay centro que encienda nada", async () => {
    respuestas["courses"] = [
      { id: "c1", name: { es: "Matemáticas — 6º" }, year_level: 6, subject_id: "s1" },
    ];

    const { getStudentCourses } = await import("./queries");
    await getStudentCourses(null);

    expect(tablasConsultadas).not.toContain("school_courses");
    // Y el alcance se resuelve por el catálogo global, que es de donde sale.
    expect(tablasConsultadas[0]).toBe("courses");
  });

  it("CON colegio se sigue respetando la activación: un centro acota su biblioteca", async () => {
    // La otra mitad del invariante. Si esto se rompiera, un colegio pasaría a
    // ver cursos que deliberadamente no ha encendido, que es el motivo entero
    // por el que `school_courses` existe.
    respuestas["school_courses"] = [{ course_id: "c1" }];
    respuestas["courses"] = [
      { id: "c1", name: { es: "Matemáticas — 6º" }, year_level: 6, subject_id: "s1" },
    ];

    const { getStudentCourses } = await import("./queries");
    await getStudentCourses("11111111-1111-4111-8111-111111111111");

    expect(tablasConsultadas[0]).toBe("school_courses");
  });

  it("un colegio que no ha encendido nada sigue viendo la lista vacía", async () => {
    // No es lo mismo «no tengo centro» que «mi centro no ha encendido nada», y
    // confundirlos fue justo el fallo. Este caso tiene que seguir vacío.
    respuestas["school_courses"] = [];

    const { getStudentCourses } = await import("./queries");
    const cursos = await getStudentCourses("11111111-1111-4111-8111-111111111111");

    expect(cursos).toEqual([]);
  });
});
