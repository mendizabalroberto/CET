/**
 * @cet/ui — la figura de valor posicional y la escalera metrica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los casos son los de `Y6A/Math/Grade 5 Maths Exam Trainer.html`, con sus
 * numeros exactos. No se inventan aqui: si la figura contradijera al material
 * del colegio, la figura estaria mal.
 */

import { describe, expect, it } from "vitest";
import {
  chainConversion,
  chainUnits,
  figureAltText,
  formatPlaced,
  parseLessonFigure,
  placeDigits,
  shiftedDigits,
  type LessonFigure,
} from "../src/learning/lesson-figure.js";

type Shift = Extract<LessonFigure, { component: "place-value-shift" }>;

/** Parsea y estrecha, para que los tests hablen de la figura y no del union. */
const shift = (value: string, factor: number, direction: string): Shift | null => {
  const figura = parseLessonFigure("place-value-shift", { value, factor, direction });
  return figura === null || figura.component !== "place-value-shift" ? null : figura;
};

describe("parseLessonFigure — valor posicional", () => {
  it("acepta el caso de Y6A: 0,086 x 1.000", () => {
    expect(shift("0.086", 1000, "multiply")).toEqual({
      component: "place-value-shift",
      value: "0.086",
      factor: 1000,
      direction: "multiply",
    });
  });

  it("rechaza un factor que no sea 10, 100 o 1.000", () => {
    expect(shift("4.7", 5, "multiply")).toBeNull();
    expect(shift("4.7", 10000, "multiply")).toBeNull();
  });

  it("rechaza un valor que no sea un decimal escrito con punto", () => {
    expect(shift("4,7", 10, "multiply")).toBeNull();
    expect(shift("1e3", 10, "multiply")).toBeNull();
    expect(shift("-4.7", 10, "multiply")).toBeNull();
  });

  it("rechaza una direccion inventada", () => {
    expect(shift("4.7", 10, "sideways")).toBeNull();
  });
});

describe("mover los digitos sin aritmetica de coma flotante", () => {
  it("0,086 x 1.000 = 86, y no 0086: el cero de la izquierda no viaja", () => {
    const figura = shift("0.086", 1000, "multiply")!;
    expect(formatPlaced(shiftedDigits(figura), "es")).toBe("86");
  });

  it("0,29 x 100 = 29, donde la coma flotante da 28,999999999999996", () => {
    const figura = shift("0.29", 100, "multiply")!;
    expect(formatPlaced(shiftedDigits(figura), "es")).toBe("29");
    // La comprobacion que de verdad importa: el camino ingenuo miente, y con el
    // la tabla de valor posicional ensenaria a un nino un numero que no es.
    expect(String(0.29 * 100)).not.toBe("29");
  });

  it("9,3 : 100 = 0,093 — los ceros de posicion aparecen", () => {
    const figura = shift("9.3", 100, "divide")!;
    expect(formatPlaced(shiftedDigits(figura), "es")).toBe("0,093");
  });

  it("el separador decimal es la coma en espanol y el punto en ingles", () => {
    const figura = shift("9.3", 100, "divide")!;
    expect(formatPlaced(shiftedDigits(figura), "en")).toBe("0.093");
  });

  it("coloca cada digito en su columna", () => {
    expect(placeDigits("4.7")).toEqual([
      { digit: "4", exp: 0 },
      { digit: "7", exp: -1 },
    ]);
  });
});

describe("figureAltText — valor posicional", () => {
  it("dice de que columna a que columna va cada digito", () => {
    const texto = figureAltText(shift("4.7", 10, "multiply")!, "es");
    expect(texto).toContain("el 4 pasa de unidades a decenas");
    expect(texto).toContain("el 7 pasa de décimas a unidades");
  });

  it("dice el resultado, que es a lo que lleva la figura", () => {
    expect(figureAltText(shift("9.3", 100, "divide")!, "es")).toContain("Resultado: 0,093");
  });

  it("dice el sentido del movimiento, que es lo que el dibujo ensena", () => {
    expect(figureAltText(shift("4.7", 10, "multiply")!, "es")).toContain("a la izquierda");
    expect(figureAltText(shift("9.3", 100, "divide")!, "es")).toContain("a la derecha");
  });

  it("dice que la coma se queda quieta: es el error que el tema ataca", () => {
    expect(figureAltText(shift("4.7", 10, "multiply")!, "es")).toContain("La coma no se mueve");
  });
});

describe("unit-chain — la escalera de Y6A", () => {
  it("longitud usa 1.000, 100 y 10; masa y capacidad siempre 1.000", () => {
    expect(chainUnits("length")).toEqual(["km", "m", "cm", "mm"]);
    expect(chainUnits("mass")).toEqual(["t", "kg", "g", "mg"]);
    expect(chainUnits("capacity")).toEqual(["kL", "L", "mL"]);
    expect(chainConversion("length", "m", "cm")).toEqual({ factor: 100, direction: "multiply" });
    expect(chainConversion("mass", "kg", "g")).toEqual({ factor: 1000, direction: "multiply" });
  });

  it("compone los factores de varios peldanos: de km a cm son 100.000", () => {
    expect(chainConversion("length", "km", "cm")).toEqual({ factor: 100000, direction: "multiply" });
  });

  it("hacia la unidad grande se divide", () => {
    expect(chainConversion("mass", "g", "kg")).toEqual({ factor: 1000, direction: "divide" });
  });

  it("rechaza media conversion resaltada", () => {
    expect(parseLessonFigure("unit-chain", { quantity: "length", from: "km" })).toBeNull();
  });

  it("rechaza una unidad que no esta en esa escalera", () => {
    expect(parseLessonFigure("unit-chain", { quantity: "mass", from: "km", to: "g" })).toBeNull();
  });

  it("el texto alternativo recorre la escalera entera, no solo el resaltado", () => {
    const figura = parseLessonFigure("unit-chain", { quantity: "length", from: "km", to: "m" })!;
    const texto = figureAltText(figura, "es");
    expect(texto).toContain("km, m, cm, mm");
    expect(texto).toContain("de m a cm se multiplica por 100");
    expect(texto).toContain("Camino resaltado: de km a m se multiplica por 1000");
  });
});

/* -------------------------------------------------------------------------- */
/* Ninguna columna se puede quedar sin nombre hablado                         */
/* -------------------------------------------------------------------------- */

/**
 * `placeName` degradaba a la cadena `10^4`, que un lector de pantalla dice
 * "diez circunflejo cuatro". Y no era un caso raro: `25,5 km -> m` es un
 * ejercicio del tema 6 y llega a decenas de millar. El dibujo salia bien; se
 * degradaba solo la voz, es decir solo para quien no ve la figura.
 *
 * La defensa es doble y a proposito: la tabla de nombres cubre todo el rango
 * que el parseo admite, Y el parseo rechaza lo que se saliera. Un bloque que no
 * se puede decir en voz alta no se pinta.
 */
describe("nombres de columna", () => {
  it("25,5 x 1.000 se dice entero, sin potencias", () => {
    const figura = shift("25.5", 1000, "multiply")!;
    const texto = figureAltText(figura, "es");
    expect(texto).not.toMatch(/10\^/);
    expect(texto).toContain("el 2 pasa de decenas a decenas de millar");
    expect(texto).toContain("Resultado: 25500");
  });

  it("ninguna figura parseable produce jamas una potencia hablada", () => {
    // Barrido por el rango que `VALOR_DECIMAL` admite. Si alguien ensancha el
    // regex sin ensanchar la tabla de nombres, esto se pone rojo.
    const valores = ["0.000001", "9999999", "1234567.891234", "0.5", "7", "25.5"];
    let parseadas = 0;
    for (const value of valores) {
      for (const factor of [10, 100, 1000]) {
        for (const direction of ["multiply", "divide"]) {
          const figura = shift(value, factor, direction);
          if (figura === null) continue;
          parseadas += 1;
          for (const locale of ["es", "en"] as const) {
            expect(figureAltText(figura, locale), `${value} ${direction} ${factor}`).not.toMatch(/10\^/);
          }
        }
      }
    }
    // Si el parseo se volviera tan estricto que no quedara nada, este test
    // pasaria en vacio y no probaria nada.
    expect(parseadas).toBeGreaterThan(10);
  });

  it("rechaza el valor que no cabe en la tabla de nombres", () => {
    // 0,000001 : 1.000 caeria en 10^-9. Se descarta el bloque entero antes de
    // pintarlo: preferimos una leccion sin figura a una figura que no se puede oir.
    expect(shift("0.000001", 1000, "divide")).toBeNull();
  });
});

describe("bordes del valor de partida", () => {
  it("rechaza un valor sin ningun digito significativo", () => {
    // "0 x 10" producia «Los digitos se mueven 1 lugar a la izquierda: .»
    // —una frase que se queda a medias— y una figura que no ensena nada.
    expect(shift("0", 10, "multiply")).toBeNull();
    expect(shift("0.00", 10, "multiply")).toBeNull();
  });

  it("rechaza los ceros de relleno a la izquierda", () => {
    // "007.5" se pintaba tal cual en la tabla: 007,5 no es como se escribe un
    // numero, y en una leccion de valor posicional eso ensena justo lo contrario.
    expect(shift("007.5", 10, "multiply")).toBeNull();
    expect(shift("0.75", 10, "multiply")).not.toBeNull();
  });
});
