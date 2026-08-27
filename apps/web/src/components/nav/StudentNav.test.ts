/**
 * La lista de caminos sin salida del examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Esta condición decide si un alumno con un examen cronometrado abierto tiene o
 * no un atajo para irse a leer la lección que lo explica. Vive en una función
 * con nombre, y no en un `&&` dentro del JSX, precisamente para poder probarla:
 * es de las cosas que se rompen en silencio cuando alguien añade una ruta.
 */
import { describe, expect, it } from "vitest";

import { esModoExamen } from "./StudentNav";

describe("esModoExamen", () => {
  it("el examen EN CURSO no lleva navegación", () => {
    expect(esModoExamen("/exam/458bed52-93fb-44e1-8425-59c79056876d/run")).toBe(true);
    // Next.js normaliza sin barra final, pero un enlace escrito a mano puede traerla.
    expect(esModoExamen("/exam/458bed52-93fb-44e1-8425-59c79056876d/run/")).toBe(true);
  });

  it("el índice de exámenes SÍ lleva navegación: todavía no ha empezado nada", () => {
    expect(esModoExamen("/exam")).toBe(false);
    expect(esModoExamen("/exam/458bed52-93fb-44e1-8425-59c79056876d")).toBe(false);
  });

  it("el resultado SÍ lleva navegación: ya ha terminado todo", () => {
    expect(esModoExamen("/exam/458bed52-93fb-44e1-8425-59c79056876d/result")).toBe(false);
  });

  it("no se deja engañar por una ruta que solo TERMINA en /run", () => {
    // Sin anclar el patrón, cualquier cosa acabada en "run" se quedaría sin
    // navegación y el alumno volvería a estar encerrado, ahora sin motivo.
    expect(esModoExamen("/learn/como-correr-un-maraton/run")).toBe(false);
    expect(esModoExamen("/practice/run")).toBe(false);
    expect(esModoExamen("/exam/run")).toBe(false);
  });

  it("las secciones normales del alumno llevan navegación", () => {
    expect(esModoExamen("/learn")).toBe(false);
    expect(esModoExamen("/learn/c4f3bc7f-e465-5f62-a374-0b060f5ff05c")).toBe(false);
    expect(esModoExamen("/practice")).toBe(false);
    expect(esModoExamen("/practice/math.fractions.simplify")).toBe(false);
    expect(esModoExamen("/account")).toBe(false);
  });
});
