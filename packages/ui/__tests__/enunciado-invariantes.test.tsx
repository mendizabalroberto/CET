/**
 * @cet/ui — invariantes de FAMILIA de un enunciado matematico.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Estos tests no protegen el fallo concreto que se acaba de arreglar: protegen
 * a sus hermanos. Los tres cierran una familia entera:
 *
 *   1. Ningun enunciado matematico puede perder su texto hablado.
 *   2. Ningun enunciado puede contener una raya horizontal que no sea una barra
 *      de fraccion.
 *   3. Ninguna marca que TENGA que verse puede dibujarse con `border`.
 *
 * El caso concreto —`2/10 ___ 2/8`, con tres rayas paralelas seguidas y un nino
 * sin saber cual separa numerador de denominador— lo caza el segundo. Los otros
 * dos existen porque el mismo fallo puede volver por otras dos puertas.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { MathStem } from "../src/learning/MathStem.js";
import { fractionToWords } from "../src/lib/fraction-words.js";
import { textoExpuesto } from "./texto-accesible.js";

const NBSP = " ";

function fh(n: number, d: number): string {
  return `<span class="f"><span class="a">${String(n)}</span><span class="b">${String(d)}</span></span>`;
}

function mixh(w: number, n: number, d: number): string {
  return `<span class="mixw">${String(w)}</span>${fh(n, d)}`;
}

function pintar(html: string): HTMLElement {
  const { container } = render(
    <LocaleProvider locale="es">
      <MathStem html={html} size="large" />
    </LocaleProvider>,
  );
  return container;
}

/* -------------------------------------------------------------------------- */
/* 1 · Ningun enunciado matematico pierde su texto hablado                     */
/* -------------------------------------------------------------------------- */

describe("invariante: toda fraccion de un enunciado se anuncia con palabras", () => {
  // Barrido, no un caso suelto: denominadores con nombre, sin nombre, de dos y
  // tres cifras, impropias y mixtos. Si alguien anade una via de renderizado
  // que se salte `FractionText`, alguna de estas cae.
  const PARES: ReadonlyArray<readonly [number, number]> = [
    [1, 2],
    [3, 4],
    [2, 3],
    [5, 6],
    [7, 8],
    [2, 10],
    [5, 12],
    [7, 16],
    [7, 100],
    [12, 5],
    [3, 17],
  ];

  it.each(PARES)("%i/%i se dice con palabras y nunca como dos numeros sueltos", (n, d) => {
    const contenedor = pintar(fh(n, d));
    const dicho = textoExpuesto(contenedor);

    expect(dicho).toBe(fractionToWords({ numerator: n, denominator: d }, "es"));
    // La lectura mala concreta: "dos diez" en vez de "dos decimos".
    expect(dicho).not.toMatch(new RegExp(`\\b${String(n)}\\s*${String(d)}\\b`));
    // Y en general: en un enunciado hablado no debe quedar ningun digito suelto.
    expect(dicho).not.toMatch(/\d/);
  });

  it("un numero mixto se anuncia como un solo numero", () => {
    expect(textoExpuesto(pintar(mixh(2, 1, 5)))).toBe("dos y un quinto");
    expect(textoExpuesto(pintar(mixh(1, 3, 4)))).toBe("uno y tres cuartos");
  });

  it("ningun elemento marcado como imagen se queda sin nombre", () => {
    const contenedor = pintar(`${fh(2, 10)}${NBSP}___${NBSP}${mixh(1, 3, 4)}`);
    const imagenes = contenedor.querySelectorAll('[role="img"]');
    expect(imagenes.length).toBeGreaterThan(0);
    for (const img of imagenes) {
      expect(img.getAttribute("aria-label")?.trim(), img.outerHTML).toBeTruthy();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2 · Ninguna raya horizontal que no sea una barra de fraccion                */
/* -------------------------------------------------------------------------- */

/**
 * Caracteres que, repetidos, se pintan como una raya horizontal larga y por
 * tanto son indistinguibles de una barra de fraccion dentro de un enunciado.
 * El guion bajo es el que causo el fallo; los demas estan por la misma razon,
 * para que nadie lo reintroduzca con otro caracter.
 */
const RAYA_FALSA = /(_{2,}|—{2,}|―{2,}|‾{2,}|▁{2,}|-{3,}|\.{4,})/;

/** Los enunciados reales que producen los generadores, con sus huecos. */
const ENUNCIADOS: ReadonlyArray<readonly [string, string]> = [
  ["compare con hueco", `Escribe &gt;, &lt; o =${NBSP}${NBSP}${fh(2, 10)}${NBSP}___${NBSP}${fh(2, 8)}`],
  ["compare 5/6 vs 5/12", `Escribe &gt;, &lt; o =${NBSP}${NBSP}${fh(5, 6)}${NBSP}___${NBSP}${fh(5, 12)}`],
  ["metric con hueco largo", `2,5 km${NBSP}=${NBSP}______ m`],
  ["suma de mixtos", `${mixh(1, 3, 4)}${NBSP}+${NBSP}${mixh(2, 1, 4)}${NBSP}=${NBSP}___`],
  ["hueco al principio", `___${NBSP}+${NBSP}5 = 12`],
  ["dos huecos", `___ + ___ = 10`],
  ["hueco pegado a texto", `El resultado es___aqui`],
];

describe("invariante: en un enunciado, la unica raya horizontal es una barra de fraccion", () => {
  it.each(ENUNCIADOS)("%s no deja ninguna raya falsa en el texto", (_titulo, html) => {
    const contenedor = pintar(html);
    // Se mira el TEXTO pintado, que es lo que el ojo lee como una raya.
    expect(contenedor.textContent ?? "").not.toMatch(RAYA_FALSA);
  });

  it.each(ENUNCIADOS)("%s tampoco deja la raya en lo que se oye", (_titulo, html) => {
    expect(textoExpuesto(pintar(html))).not.toMatch(RAYA_FALSA);
  });

  it("el hueco existe como elemento con nombre, no desaparece sin mas", () => {
    const contenedor = pintar(`${fh(2, 10)}${NBSP}___${NBSP}${fh(2, 8)}`);
    const huecos = contenedor.querySelectorAll(".cet-blank");
    expect(huecos).toHaveLength(1);
    expect(huecos[0]?.getAttribute("role")).toBe("img");
    expect(huecos[0]?.getAttribute("aria-label")).toBe("hueco para tu respuesta");
  });

  it("un guion bajo suelto de la prosa NO se convierte en hueco", () => {
    // `archivo_final` es texto, no una pregunta con un espacio que rellenar.
    const contenedor = pintar("Abre el archivo_final y comprueba el resultado");
    expect(contenedor.querySelectorAll(".cet-blank")).toHaveLength(0);
    expect(contenedor.textContent).toContain("archivo_final");
  });

  it("el hueco se anuncia en el idioma del alumno", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <MathStem html={`2 km${NBSP}=${NBSP}______ m`} size="large" />
      </LocaleProvider>,
    );
    expect(container.querySelector(".cet-blank")?.getAttribute("aria-label")).toBe(
      "blank for your answer",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 3 · Ninguna marca obligatoria se dibuja con `border`                        */
/* -------------------------------------------------------------------------- */

/**
 * POR QUE ESTE TEST.
 *
 * `tokens.css` entra en `@layer cet-tokens`, declarada ANTES que `base`, y en
 * `base` vive el preflight de Tailwind con `*, ::before, ::after { border: 0
 * solid }`. En la cascada gana la capa, no la especificidad: cualquier borde
 * declarado en `tokens.css` lo borra el preflight.
 *
 * Eso ya paso: la barra de la fraccion desaparecio y `5/6` se veia como un "5"
 * encima de un "6", sin notacion. Se rescato con una regla dentro de la app, en
 * otro paquete — una dependencia invisible y facil de romper.
 *
 * Las piezas nuevas se dibujan con `background` y `box-shadow`, que el preflight
 * no toca. Este test impide que alguien vuelva a poner un `border` ahi y
 * reintroduzca el fallo entero sin enterarse.
 */
describe("invariante: la barra y el hueco no dependen de un `border`", () => {
  const AQUI = dirname(fileURLToPath(import.meta.url));
  const TOKENS = readFileSync(join(AQUI, "..", "src", "tokens.css"), "utf8");

  /**
   * Las clases que `FractionText` y `AnswerBlank` pintan de verdad.
   *
   * NO entra `.cet-fraction` / `.cet-fraction-den`: son la red de seguridad para
   * HTML crudo que no pasa por `parseSafeHtml`, siguen dibujando la barra con
   * `border-top` y siguen dependiendo del rescate que la app tiene en
   * `globals.css`. Ese camino no lo usa hoy ninguna pantalla del producto; el
   * dia que se retire, esta lista se queda igual y la de exenciones desaparece.
   */
  const CLASES_VIVAS = [
    "cet-frac-wrap",
    "cet-frac",
    "cet-frac-n",
    "cet-frac-d",
    "cet-frac-bar",
    "cet-frac-whole",
    "cet-blank",
  ] as const;

  /** Bloques `selector { ... }` cuyo selector usa exactamente alguna clase dada. */
  function bloquesDe(css: string, clases: readonly string[]): Array<[string, string]> {
    const fuera: Array<[string, string]> = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      const selector = (m[1] ?? "").trim();
      // Token exacto: `.cet-frac` no debe casar con `.cet-fraction`.
      const usadas = selector.match(/\.[a-z0-9-]+/g) ?? [];
      if (usadas.some((u) => clases.includes(u.slice(1)))) fuera.push([selector, m[2] ?? ""]);
    }
    return fuera;
  }

  it("ninguna regla de `.cet-frac*` o `.cet-blank` declara un borde", () => {
    const bloques = bloquesDe(TOKENS, CLASES_VIVAS);
    expect(bloques.length).toBeGreaterThan(0);

    for (const [selector, cuerpo] of bloques) {
      // `border-radius` es geometria, no una linea: se permite.
      const bordes = cuerpo
        .split(";")
        .map((d) => d.trim())
        .filter((d) => /^border(?!-radius)[a-z-]*\s*:/.test(d));
      expect(bordes, `${selector} dibuja con border, y el preflight lo borrara`).toEqual([]);
    }
  });

  it("la barra de la fraccion se pinta con un fondo, que es lo que sobrevive", () => {
    const bloques = bloquesDe(TOKENS, ["cet-frac-bar"]);
    const cuerpo = bloques.map(([, c]) => c).join(";");
    expect(cuerpo).toMatch(/background-color\s*:/);
  });
});
