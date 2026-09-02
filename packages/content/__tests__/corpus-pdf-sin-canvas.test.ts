/**
 * `pdfToSpans` en un Node SIN `@napi-rs/canvas`: la función de Vercel.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El 2026-09-02 la subida del boletín fallaba en producción con «DOMMatrix is
 * not defined»: pdfjs lo toma de `@napi-rs/canvas`, dependencia opcional que
 * el despliegue no lleva, y aquí en local —donde sí está— ningún test lo
 * veía. Este test oculta esa dependencia en un proceso hijo (ver
 * `fixtures/sin-canvas.cjs`) y comprueba que la extracción sigue leyendo el
 * PDF entero con el `DOMMatrix` mínimo de `dom-matrix.ts`.
 *
 * Es un proceso aparte, y no un `vi.mock`, porque lo que hay que reproducir
 * es la resolución de módulos de Node: pdfjs pide el paquete con un
 * `createRequire` propio que el runner de Vitest no intercepta.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DomMatrixMinima, asegurarDomMatrix } from "../src/corpus/dom-matrix.ts";

const aqui = dirname(fileURLToPath(import.meta.url));

describe("pdfToSpans sin @napi-rs/canvas", () => {
  it("lee el boletín del e2e igual que con canvas, con el DOMMatrix mínimo instalado", () => {
    const salida = execFileSync(
      process.execPath,
      [
        "--require",
        join(aqui, "fixtures", "sin-canvas.cjs"),
        "--import",
        "tsx",
        join(aqui, "fixtures", "pdf-sin-canvas.ts"),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );
    const ultimaLinea = salida.trim().split("\n").at(-1) ?? "";
    const resultado = JSON.parse(ultimaLinea) as { textos: string[]; polyfillInstalado: boolean };

    expect(resultado.polyfillInstalado).toBe(true);
    for (const materia of [
      "English",
      "Math",
      "Science",
      "Spanish",
      "Social Studies",
      "Information & Communication Technology",
    ]) {
      expect(resultado.textos.some((t) => t.includes(materia)), materia).toBe(true);
    }
  });

  it("el preload de verdad oculta el paquete (si no, el test de arriba sería un falso verde)", () => {
    const salida = execFileSync(
      process.execPath,
      [
        "--require",
        join(aqui, "fixtures", "sin-canvas.cjs"),
        "-e",
        "try{require('@napi-rs/canvas');console.log('RESUELTO')}catch(e){console.log('OCULTO:'+e.code)}",
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(salida).toContain("OCULTO:MODULE_NOT_FOUND");
  });
});

describe("DomMatrixMinima", () => {
  it("nace como identidad y acepta seis números", () => {
    expect(new DomMatrixMinima().isIdentity).toBe(true);
    const m = new DomMatrixMinima([2, 0, 0, 3, 4, 5]);
    expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([2, 0, 0, 3, 4, 5]);
  });

  it("multiplica e invierte como una matriz afín 2D", () => {
    const m = new DomMatrixMinima([2, 0, 0, 4, 10, 20]);
    const producto = m.multiply(m.inverse());
    expect(producto.a).toBeCloseTo(1);
    expect(producto.d).toBeCloseTo(1);
    expect(producto.e).toBeCloseTo(0);
    expect(producto.f).toBeCloseTo(0);
    expect(m.translate(1, 1).e).toBe(12);
    expect(m.scale(2).a).toBe(4);
  });

  it("asegurarDomMatrix no pisa un DOMMatrix que ya exista", () => {
    const g = globalThis as { DOMMatrix?: unknown };
    const previo = g.DOMMatrix;
    class Ajeno {}
    g.DOMMatrix = Ajeno;
    try {
      expect(asegurarDomMatrix()).toBe(false);
      expect(g.DOMMatrix).toBe(Ajeno);
    } finally {
      if (previo === undefined) delete g.DOMMatrix;
      else g.DOMMatrix = previo;
    }
  });
});
