/**
 * @cet/ui — el modulo puro de figuras de leccion.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUE ESTE MODULO SE PRUEBA SIN REACT
 *
 * `lesson-figure.ts` no tiene `"use client"` a proposito: `block-mapping.ts` de
 * la app corre en el SERVIDOR y necesita llamar a `parseLessonFigure` para
 * decidir si un bloque `interactive` es renderizable. Importar desde el
 * servidor un valor declarado en un modulo de cliente fue lo que tumbo la
 * pagina de leccion en produccion (`rsc-boundary.test.ts` lo vigila).
 *
 * Que sea puro tiene una segunda consecuencia, y es la importante: el TEXTO
 * ACCESIBLE de la figura se puede probar sin pintar nada. La alternativa
 * textual no es un adorno del componente, es la figura dicha con palabras, y
 * aqui se comprueba que dice los mismos numeros que el dibujo ensena.
 */

import { describe, expect, it } from "vitest";
import {
  LESSON_FIGURE_COMPONENTS,
  figureAltText,
  parseLessonFigure,
} from "../src/learning/lesson-figure.js";

describe("parseLessonFigure — barras de fraccion", () => {
  it("acepta dos barras con numerador y denominador", () => {
    const figura = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 5, denominator: 9 },
        { numerator: 2, denominator: 3 },
      ],
    });
    expect(figura).toEqual({
      component: "fraction-bars",
      bars: [
        { numerator: 5, denominator: 9 },
        { numerator: 2, denominator: 3 },
      ],
    });
  });

  it("rechaza una sola barra: una barra sola no compara nada", () => {
    expect(parseLessonFigure("fraction-bars", { bars: [{ numerator: 1, denominator: 2 }] })).toBeNull();
  });

  it("rechaza denominador cero, que no se puede dibujar en partes", () => {
    expect(
      parseLessonFigure("fraction-bars", {
        bars: [
          { numerator: 1, denominator: 0 },
          { numerator: 1, denominator: 2 },
        ],
      }),
    ).toBeNull();
  });

  it("rechaza un numerador mayor que el denominador: la barra se saldria", () => {
    expect(
      parseLessonFigure("fraction-bars", {
        bars: [
          { numerator: 5, denominator: 3 },
          { numerator: 1, denominator: 2 },
        ],
      }),
    ).toBeNull();
  });

  it("rechaza props que no son un objeto", () => {
    expect(parseLessonFigure("fraction-bars", null)).toBeNull();
    expect(parseLessonFigure("fraction-bars", "5/9")).toBeNull();
  });

  it("rechaza un componente que no existe", () => {
    expect(parseLessonFigure("holograma-3d", { bars: [] })).toBeNull();
  });
});

describe("figureAltText — barras de fraccion", () => {
  const cincoNovenosVsDosTercios = parseLessonFigure("fraction-bars", {
    bars: [
      { numerator: 5, denominator: 9 },
      { numerator: 2, denominator: 3 },
    ],
  });

  it("dice cuantas partes tiene cada barra y cuantas estan pintadas", () => {
    const texto = figureAltText(cincoNovenosVsDosTercios!, "es");
    expect(texto).toContain("9 partes iguales");
    expect(texto).toContain("5 pintadas");
    expect(texto).toContain("3 partes iguales");
    expect(texto).toContain("2 pintadas");
  });

  it("nombra la fraccion hablada, no los digitos sueltos", () => {
    // "cinco novenos", nunca "cinco nueve": es el mismo requisito que sostiene
    // `FractionText`, y aqui aplica igual porque la figura ES una fraccion.
    const texto = figureAltText(cincoNovenosVsDosTercios!, "es");
    expect(texto).toContain("cinco novenos");
    expect(texto).toContain("dos tercios");
  });

  it("dice cual esta mas pintada: es la pregunta que la figura contesta", () => {
    const texto = figureAltText(cincoNovenosVsDosTercios!, "es");
    // 5/9 = 0,555… < 2/3 = 0,666…
    expect(texto).toMatch(/barra 2/i);
  });

  it("dice que son iguales cuando lo son, en vez de elegir una al azar", () => {
    const equivalentes = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 2, denominator: 3 },
        { numerator: 4, denominator: 6 },
      ],
    });
    const texto = figureAltText(equivalentes!, "es");
    expect(texto).toMatch(/igual/i);
    expect(texto).not.toMatch(/barra 1 /i);
  });

  it("habla ingles cuando el idioma es ingles", () => {
    const texto = figureAltText(cincoNovenosVsDosTercios!, "en");
    expect(texto).toContain("equal parts");
    expect(texto).toContain("five ninths");
  });
});

describe("el registro de componentes", () => {
  it("no esta vacio (si lo estuviera, el invariante de familia pasaria en vacio)", () => {
    expect(LESSON_FIGURE_COMPONENTS.length).toBeGreaterThan(0);
  });

  it("ningun componente del registro se traga unos props vacios", () => {
    // OJO CON LO QUE ESTE TEST *NO* PRUEBA. Se llamaba "todo componente del
    // registro se parsea a una figura de ese componente", y no probaba eso:
    // `toBeNull()` tambien pasa para un nombre SIN rama de parseo, asi que un
    // registro con un nombre muerto habria pasado en verde.
    //
    // Lo que si prueba es lo de su nuevo nombre: ningun componente acepta un
    // bloque vacio y lo pinta a medias. Quien cierra la familia de verdad —que
    // todo nombre del registro SEPA producir una figura— es
    // `figura-de-leccion-habla.test.tsx`, que exige una muestra por componente
    // y falla si `parseLessonFigure` le devuelve null.
    for (const nombre of LESSON_FIGURE_COMPONENTS) {
      expect(parseLessonFigure(nombre, {}), nombre).toBeNull();
    }
  });

  it("no hay nombres repetidos en el registro", () => {
    expect(new Set(LESSON_FIGURE_COMPONENTS).size).toBe(LESSON_FIGURE_COMPONENTS.length);
  });
});

/* -------------------------------------------------------------------------- */
/* La voz no puede contradecir al dibujo                                      */
/* -------------------------------------------------------------------------- */

/**
 * Estos casos salieron de una revision, y todos son el MISMO fallo: la figura y
 * su voz salen de los mismos numeros —eso es cierto— pero la CONCLUSION se
 * calculaba mal, y una conclusion mal calculada miente igual que una etiqueta
 * escrita a mano. El nino que ve el dibujo y el que lo oye tienen que recibir
 * el mismo hecho.
 */
describe("figureAltText — empates parciales", () => {
  it("con dos barras empatadas y una tercera menor, NO nombra una ganadora", () => {
    // 1/2 = 2/4 > 1/4. Es el caso canonico de fracciones equivalentes de Y6A.
    // La version anterior decia "la barra 1 es la que esta mas pintada", que es
    // justo lo contrario de lo que ensena el dibujo.
    const figura = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 1, denominator: 2 },
        { numerator: 2, denominator: 4 },
        { numerator: 1, denominator: 4 },
      ],
    })!;
    const texto = figureAltText(figura, "es");
    expect(texto).not.toMatch(/la barra \d es la que/i);
    expect(texto).toContain("Las barras 1 y 2 están pintadas por igual");
  });

  it("compara sin coma flotante: 1/3 y 2/6 empatan de verdad", () => {
    const figura = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 1, denominator: 3 },
        { numerator: 2, denominator: 6 },
      ],
    })!;
    expect(figureAltText(figura, "es")).toMatch(/igual/i);
  });

  it("con una sola barra mas pintada la sigue nombrando", () => {
    const figura = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 5, denominator: 9 },
        { numerator: 2, denominator: 3 },
      ],
    })!;
    expect(figureAltText(figura, "es")).toContain("La barra 2 es la que está más pintada");
  });
});

describe("figureAltText — concordancia de numero", () => {
  it("dice «1 pintada» y no «1 pintadas», que es el caso mas comun", () => {
    const figura = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 1, denominator: 2 },
        { numerator: 3, denominator: 4 },
      ],
    })!;
    const texto = figureAltText(figura, "es");
    expect(texto).toContain("1 pintada,");
    expect(texto).not.toContain("1 pintadas");
    expect(texto).toContain("3 pintadas");
  });

  it("en ingles el singular tambien concuerda", () => {
    const figura = parseLessonFigure("fraction-bars", {
      bars: [
        { numerator: 1, denominator: 2 },
        { numerator: 3, denominator: 4 },
      ],
    })!;
    const texto = figureAltText(figura, "en");
    expect(texto).toContain("1 shaded,");
    expect(texto).not.toContain("1 shadeds");
  });
});
