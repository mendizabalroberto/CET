/**
 * Tests del parser restringido de literales JS.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo importante aquí no es lo que acepta, es lo que RECHAZA: cada `expect(...)
 * .toThrow()` de este fichero es una vía por la que `eval` habría ejecutado
 * código del HTML fuente dentro del proceso del build.
 */

import { describe, expect, it } from "vitest";
import { JsLiteralError, parseJsLiteral } from "../src/js-literal.ts";
import {
  blankComments,
  readSymbol,
  readSymbolArray,
  SymbolNotFoundError,
} from "../src/extract/html.ts";

describe("parseJsLiteral — lo que acepta", () => {
  it("arrays y objetos anidados con comillas mezcladas", () => {
    expect(parseJsLiteral(`[{c:"ps", q:'¿Qué?', o:["a","b"], a:1}]`)).toEqual([
      { c: "ps", q: "¿Qué?", o: ["a", "b"], a: 1 },
    ]);
  });

  it("concatenación de strings (el HTML de Science y Socials)", () => {
    expect(parseJsLiteral(`[{html: '<div>' + 'uno' + '</div>'}]`)).toEqual([
      { html: "<div>uno</div>" },
    ]);
  });

  it("plantillas sin interpolación (las lecciones de Math)", () => {
    expect(parseJsLiteral("[{h:`línea 1\nlínea 2`}]")).toEqual([{ h: "línea 1\nlínea 2" }]);
  });

  it("comentarios de línea y de bloque entre elementos", () => {
    expect(parseJsLiteral(`[ /* acid */ 1, // dos
      2 ]`)).toEqual([1, 2]);
  });

  it("comas finales, números negativos, decimales y exponentes", () => {
    expect(parseJsLiteral(`[-1, 0.5, 1e3, {a:1,},]`)).toEqual([-1, 0.5, 1000, { a: 1 }]);
  });

  it("escapes, incluidos los pares suplentes de emoji", () => {
    expect(parseJsLiteral(`["a\\nb", "\\u00f1", "\\ud83c\\udf27", "\\u{1F600}"]`)).toEqual([
      "a\nb",
      "ñ",
      "🌧",
      "😀",
    ]);
  });

  it("preserva acentos, ñ y emoji literales byte a byte", () => {
    const input = `["Año — corazón, ¿sí? 🅰️ ✒️"]`;
    expect(parseJsLiteral(input)).toEqual(["Año — corazón, ¿sí? 🅰️ ✒️"]);
  });

  it("acepta llamadas SOLO si el llamante las declara", () => {
    const out = parseJsLiteral(`['<td>' + sym('cell', 120) + '</td>']`, {
      // El primer argumento se estrecha en vez de pasarlo por String(): sobre un
      // objeto, String() daria "[object Object]" sin avisar.
      calls: { sym: (args) => `[${typeof args[0] === "string" ? args[0] : JSON.stringify(args[0])}]` },
    });
    expect(out).toEqual(["<td>[cell]</td>"]);
  });
});

describe("parseJsLiteral — lo que rechaza (y por qué importa)", () => {
  const rejected: readonly [name: string, source: string][] = [
    ["llamada no declarada", `[alert(1)]`],
    ["llamada declarada con otro nombre", `[sym('cell')]`],
    ["acceso a propiedad global", `[process.env]`],
    ["identificador suelto", `[foo]`],
    ["función flecha", `[() => 1]`],
    ["expresión de función", `[function(){return 1}]`],
    ["ternario", `[a ? 1 : 2]`],
    ["interpolación de plantilla", "[`${process.env.SECRET}`]"],
    ["operador distinto de +", `[1 * 2]`],
    ["asignación", `[x = 1]`],
    ["hueco en el array", `[1,,2]`],
    ["array sin cerrar", `[1, 2`],
    ["objeto sin cerrar", `{a: 1`],
    ["string sin cerrar", `["abc]`],
    ["salto de línea dentro de un string simple", `["a\nb"]`],
    ["clave computada", `[{["x"+"y"]: 1}]`],
    ["clave duplicada", `[{a:1, a:2}]`],
    ["contenido tras el literal", `[1]; alert(1)`],
    ["comentario de bloque sin cerrar", `[1] /* nunca cierra`],
    ["concatenar un objeto", `[{a:1} + "x"]`],
  ];

  for (const [name, source] of rejected) {
    it(`rechaza: ${name}`, () => {
      expect(() => parseJsLiteral(source)).toThrow(JsLiteralError);
    });
  }

  it("bloquea la contaminación de prototipo", () => {
    expect(() => parseJsLiteral(`[{"__proto__": {"polluted": true}}]`)).toThrow(JsLiteralError);
    expect(() => parseJsLiteral(`[{"constructor": 1}]`)).toThrow(JsLiteralError);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("el error dice DÓNDE falló, no solo que falló", () => {
    try {
      parseJsLiteral(`[1, 2, alert(1)]`);
      expect.unreachable("debería haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(JsLiteralError);
      const e = err as JsLiteralError;
      expect(e.index).toBeGreaterThan(0);
      expect(e.context).toContain("alert");
    }
  });
});

describe("readSymbol — recorte del literal en el <script>", () => {
  const script = `
    var OTHER=[1];
    /* var BANK=[999]; <- en un comentario, no cuenta */
    var BANK=[{c:"ps", q:"a ] b", o:["x","y"], a:0}];
    var LBL={amz:'Amazon'};
  `;

  it("encuentra el símbolo y respeta los corchetes dentro de strings", () => {
    expect(readSymbolArray(script, "BANK", "t.html")).toEqual([
      { c: "ps", q: "a ] b", o: ["x", "y"], a: 0 },
    ]);
  });

  it("lee objetos además de arrays", () => {
    expect(readSymbol(script, "LBL", "t.html")).toEqual({ amz: "Amazon" });
  });

  it("no confunde un símbolo con otro que lo contiene como prefijo", () => {
    const s = `var BANKING=[1]; var BANK=[2];`;
    expect(readSymbolArray(s, "BANK", "t.html")).toEqual([2]);
    expect(readSymbolArray(s, "BANKING", "t.html")).toEqual([1]);
  });

  it("lanza SymbolNotFoundError si el símbolo no existe — nunca devuelve vacío", () => {
    expect(() => readSymbolArray(script, "MPARTS", "t.html")).toThrow(SymbolNotFoundError);
  });

  it("lanza si el literal está truncado", () => {
    expect(() => readSymbolArray(`var BANK=[1, 2`, "BANK", "t.html")).toThrow(JsLiteralError);
  });

  it("lanza si el símbolo no es un literal (p.ej. una llamada)", () => {
    expect(() => readSymbolArray(`var BANK=build();`, "BANK", "t.html")).toThrow(JsLiteralError);
  });
});

describe("blankComments — regresión de la pasada 2", () => {
  it("no se engancha a una declaración comentada", () => {
    const src = `/* var BANK=[999]; */ var BANK=[1];`;
    expect(readSymbolArray(src, "BANK", "t.html")).toEqual([1]);
  });

  it("un apóstrofo dentro de una expresión regular NO desactiva el blanqueo", () => {
    // Este es el código real de English, justo antes de su banco. Con un escáner
    // que solo conozca comillas, el `'` de la clase de caracteres abre un
    // "string" falso y el comentario de después deja de blanquearse.
    const src = [
      `function norm(s){return (s||"").replace(/[^a-z0-9' ]/g,"")}`,
      `/* var BANK=[999]; version vieja */`,
      `var BANK=[1];`,
    ].join("\n");
    expect(readSymbolArray(src, "BANK", "t.html")).toEqual([1]);
  });

  it("no confunde una división con el inicio de una expresión regular", () => {
    const src = `var ratio = total / count; /* var BANK=[999]; */ var BANK=[2];`;
    expect(readSymbolArray(src, "BANK", "t.html")).toEqual([2]);
  });

  it("no blanquea lo que parece un comentario dentro de un string", () => {
    expect(readSymbolArray(`var BANK=["http://x.test/*a*/b"];`, "BANK", "t.html")).toEqual([
      "http://x.test/*a*/b",
    ]);
  });

  it("lanza si el símbolo está declarado dos veces de verdad", () => {
    expect(() => readSymbolArray(`var BANK=[1]; var BANK=[2];`, "BANK", "t.html")).toThrow(
      /declarado 2 veces/,
    );
  });

  it("blankComments conserva la longitud del fichero", () => {
    const src = `var a=1; // hola\n/* mundo */ var b=2;`;
    expect(blankComments(src)).toHaveLength(src.length);
  });
});
