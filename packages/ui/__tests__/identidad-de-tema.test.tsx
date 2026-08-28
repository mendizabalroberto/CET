/**
 * @cet/ui — el tema se reconoce sin color, y sin leer.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Hermano de `identidad-de-materia.test.tsx`, pero un nivel mas abajo y con un
 * margen mas estrecho: en `/learn` la silueta compite con seis colores de
 * materia; en `/practice` las diez tarjetas son de Matematicas, comparten tono,
 * y en escala de grises comparten gris. Ahi la silueta no es un refuerzo del
 * color: es el UNICO canal que dice que tema es cada tarjeta.
 *
 * De ahi que esta prueba no se conforme con "las cadenas `d` son distintas".
 * Cuatro de los diez temas son de fracciones, y la forma facil de "dibujar"
 * diez iconos es dibujar uno y moverle un punto: eso pasaria un `Set` de
 * cadenas y dejaria al alumno diez medallones iguales. Por eso se comparan
 * tambien los trazos NORMALIZADOS —sin el ruido de los espacios y de los
 * decimales— y se persigue ademas el caso concreto de dos siluetas con el
 * mismo esqueleto de comandos y casi los mismos numeros.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubjectIcon } from "../src/navigation/SubjectIcon.js";
import { SUBJECT_CODES, UNKNOWN_SUBJECT } from "../src/navigation/subject-identity.js";
import { TopicIcon } from "../src/navigation/TopicIcon.js";
import { TOPIC_CODES, UNKNOWN_TOPIC } from "../src/navigation/topic-identity.js";

import { textoExpuesto } from "./texto-accesible.js";

/*
 * La lista se DERIVA del modulo de identidad, nunca se copia a mano: el dia que
 * `@cet/engine` registre un generador nuevo y aparezca en `TOPIC_CODES`, esta
 * prueba tiene que ponerse roja sola por la silueta que falta. Una lista
 * escrita aqui a mano no diria nada ese dia, que es justo el dia que importa.
 */
const CLAVES: readonly string[] = [...TOPIC_CODES, UNKNOWN_TOPIC];

function trazoDeTema(code: string): string {
  const { container } = render(<TopicIcon code={code} />);
  const path = container.querySelector("path");
  expect(path).not.toBeNull();
  return path?.getAttribute("d") ?? "";
}

function trazoDeMateria(code: string): string {
  const { container } = render(<SubjectIcon code={code} />);
  return container.querySelector("path")?.getAttribute("d") ?? "";
}

/** Un comando SVG o un numero; sirve tanto para `h0.01` como para `1 0 0-4.2`. */
const PIEZAS = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+/g;

function piezas(d: string): readonly string[] {
  return d.match(PIEZAS) ?? [];
}

function esComando(pieza: string): boolean {
  return /^[A-Za-z]$/.test(pieza);
}

/**
 * El dibujo sin el ruido de la escritura: comandos en mayuscula y numeros
 * redondeados al lienzo de 24. Dos siluetas que solo se diferencien en un
 * espacio, en una coma o en dos decimas de unidad colapsan aqui a la misma
 * cadena — y colapsar es exactamente lo que queremos que se vea.
 */
function trazoNormalizado(d: string): string {
  return piezas(d)
    .map((pieza) => (esComando(pieza) ? pieza.toUpperCase() : String(Math.round(Number(pieza)))))
    .join(" ");
}

/** Solo la secuencia de comandos: que clase de dibujo es, sin sus medidas. */
function esqueleto(d: string): string {
  return piezas(d)
    .filter(esComando)
    .join("")
    .toUpperCase();
}

function numeros(d: string): readonly number[] {
  return piezas(d)
    .filter((pieza) => !esComando(pieza))
    .map((pieza) => Math.round(Number(pieza)));
}

const TRAZOS = new Map(CLAVES.map((code) => [code, trazoDeTema(code)]));

function trazo(code: string): string {
  return TRAZOS.get(code) ?? "";
}

describe("TopicIcon: todas las claves tienen dibujo", () => {
  it.each(CLAVES)("%s dibuja una silueta, no un hueco", (code) => {
    const d = trazo(code);
    expect(d.length).toBeGreaterThan(0);
    expect(d.trimStart().startsWith("M")).toBe(true);
  });

  it("no hay mas siluetas que claves ni menos claves que siluetas", () => {
    expect(TRAZOS.size).toBe(TOPIC_CODES.length + 1);
  });
});

describe("TopicIcon: siluetas distintas, no variaciones", () => {
  it("las once son distintas dos a dos", () => {
    const trazos = CLAVES.map(trazo);
    expect(new Set(trazos).size).toBe(CLAVES.length);
  });

  /*
   * El colador anterior deja pasar el copiar-pegar con un retoque: el mismo
   * dibujo con un espacio mas o una decima menos. Normalizado, ese retoque
   * desaparece y las dos claves caen en la misma cadena.
   */
  it("siguen siendo distintas cuando se les quita el ruido de la escritura", () => {
    const normalizados = CLAVES.map((code) => trazoNormalizado(trazo(code)));
    expect(new Set(normalizados).size).toBe(CLAVES.length);
  });

  /*
   * Y el caso que de verdad arruina `/practice`: dos siluetas que son el mismo
   * dibujo con un punto movido. Comparten esqueleto de comandos y casi todos
   * los numeros; a 20 px son el mismo medallon aunque las cadenas no coincidan.
   * Se exige que dos siluetas con el mismo esqueleto discrepen en mas de la
   * mitad de sus numeros — o, dicho de otro modo, que sean otro dibujo.
   */
  it("ninguna pareja es la misma silueta con un punto movido", () => {
    const gemelas: string[] = [];

    for (let i = 0; i < CLAVES.length; i += 1) {
      for (let j = i + 1; j < CLAVES.length; j += 1) {
        const uno = trazo(CLAVES[i] ?? "");
        const otro = trazo(CLAVES[j] ?? "");
        if (esqueleto(uno) !== esqueleto(otro)) continue;

        const numsUno = numeros(uno);
        const numsOtro = numeros(otro);
        if (numsUno.length !== numsOtro.length) continue;

        const iguales = numsUno.filter((n, k) => n === numsOtro[k]).length;
        if (iguales / numsUno.length > 0.5) {
          gemelas.push(`${CLAVES[i] ?? ""} y ${CLAVES[j] ?? ""}`);
        }
      }
    }

    expect(gemelas).toEqual([]);
  });

  /*
   * El alumno ve las dos familias en la misma sesion: la rejilla de materias y
   * la de temas. Un tema con la cruz de `math` o con el libro de `english`
   * dentro seria un icono que miente sobre a que familia pertenece.
   */
  it("ninguna repite una silueta de materia", () => {
    const materias = [...SUBJECT_CODES, UNKNOWN_SUBJECT].map(trazoDeMateria);
    const deMateria = new Set(materias);
    const deMateriaNormalizados = new Set(materias.map(trazoNormalizado));

    for (const code of CLAVES) {
      expect(deMateria.has(trazo(code))).toBe(false);
      expect(deMateriaNormalizados.has(trazoNormalizado(trazo(code)))).toBe(false);
    }
  });
});

describe("TopicIcon: ni color propio ni anuncio", () => {
  it.each(CLAVES)("%s hereda el color del contenedor que lo ha medido", (code) => {
    const { container } = render(<TopicIcon code={code} />);
    const svg = container.querySelector("svg");
    const path = container.querySelector("path");

    expect(svg?.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(path?.getAttribute("stroke")).toBe("currentColor");
    expect(path?.getAttribute("fill")).toBe("none");
  });

  it.each(CLAVES)("%s es decorativo: el nombre del tema va escrito al lado", (code) => {
    const { container } = render(<TopicIcon code={code} />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.querySelector("title")).toBeNull();
    expect(svg?.getAttribute("aria-label")).toBeNull();
    expect(textoExpuesto(container)).toBe("");
  });
});

describe("TopicIcon: un tema que este design system aun no conoce", () => {
  /*
   * El caso que revienta produccion sin que nadie lo note en desarrollo: se
   * registra el generador `math.angles`. Su tarjeta no puede salir con el
   * medallon vacio ni tumbar la pantalla; cae en la silueta neutra, que es un
   * dibujo de verdad y no un hueco.
   */
  it.each(["math.angles", "", "SIMPLIFY", "fracop2"])(
    "un code desconocido (%s) pinta la silueta neutra",
    (code) => {
      const d = trazoDeTema(code);
      expect(d).toBe(trazo(UNKNOWN_TOPIC));
      expect(d.length).toBeGreaterThan(0);
    },
  );
});
