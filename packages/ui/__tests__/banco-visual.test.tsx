/**
 * @cet/ui — banco visual de enunciados matematicos.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUE EXISTE
 *
 * Que una fraccion apilada este BIEN COMPUESTA no lo demuestra ningun test de
 * render: `toBeInTheDocument()` pasa igual con la barra centrada que con la
 * barra torcida, encogida y flotando por encima de la linea base. Eso solo se
 * ve mirandolo.
 *
 * Este fichero hace dos cosas:
 *
 *   1. Comprueba lo que SI es comprobable de cada caso real (que conserva su
 *      texto accesible). Es un test de verdad, no un generador disfrazado.
 *   2. Vuelca el HTML que producen los componentes REALES a un fichero, para
 *      poder inyectarlo en una pagina de la app —con su hoja de estilo real, su
 *      preflight de Tailwind y su orden de capas— y capturarlo. Ese volcado es
 *      la unica forma honesta de ensenar un "antes" y un "despues".
 *
 * El volcado va al directorio temporal, nunca al repo: es un artefacto de
 * diagnostico, no codigo fuente. Si no se puede escribir, el test NO falla: la
 * suite no debe depender del sistema de ficheros.
 *
 * COMO SE CAPTURA (tres pasos, sin levantar la app):
 *
 *   1. CET_BANCO_HTML=<ruta>/banco.html pnpm --filter @cet/ui test
 *   2. cd apps/web && npx @tailwindcss/cli -i src/app/globals.css -o <ruta>/app.css
 *      — esta es la hoja REAL, con el preflight de Tailwind y el mismo orden de
 *        capas que la app; es donde se ve si la barra sobrevive.
 *   3. Un HTML que meta `app.css` en un <style> y el volcado en el <body>, y una
 *      captura de eso. No hace falta servidor ni sesion de nadie.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LocaleProvider } from "../src/lib/i18n.js";
import { MathStem } from "../src/learning/MathStem.js";

const NBSP = "\u00a0";

/** `fh` de @cet/engine. Repetido aqui para que @cet/ui no dependa del engine. */
function fh(n: number, d: number): string {
  return `<span class="f"><span class="a">${String(n)}</span><span class="b">${String(d)}</span></span>`;
}

function mixh(w: number, n: number, d: number): string {
  return `<span class="mixw">${String(w)}</span>${fh(n, d)}`;
}

/**
 * Los casos son los que el usuario ve rotos en sus capturas, no una muestra
 * favorable: el enunciado literal de `math.compare` con su hueco, denominadores
 * de distinto ancho juntos, y numeros mixtos.
 */
export const CASOS: ReadonlyArray<{ readonly titulo: string; readonly html: string }> = [
  {
    titulo: "compare — el enunciado exacto de la captura del usuario",
    html: `Escribe &gt;, &lt; o =${NBSP}${NBSP}${fh(2, 10)}${NBSP}___${NBSP}${fh(2, 8)}`,
  },
  {
    titulo: "compare — el de error01: 5/6 contra 5/12",
    html: `Escribe &gt;, &lt; o =${NBSP}${NBSP}${fh(5, 6)}${NBSP}___${NBSP}${fh(5, 12)}`,
  },
  { titulo: "fraccion simple entre texto", html: `${fh(3, 4)} de 20 es` },
  {
    titulo: "ancho de barra: 1, 2 y 3 cifras",
    html: `${fh(7, 8)} · ${fh(7, 16)} · ${fh(7, 100)} · ${fh(12, 5)}`,
  },
  { titulo: "numero mixto", html: `Convierte ${mixh(2, 1, 5)} en fraccion impropia` },
  {
    titulo: "suma de dos mixtos, con hueco al final",
    html: `${mixh(1, 3, 4)}${NBSP}+${NBSP}${mixh(2, 1, 4)}${NBSP}=${NBSP}___`,
  },
  { titulo: "metric — el hueco largo de seis guiones", html: `2,5 km${NBSP}=${NBSP}______ m` },
  {
    titulo: "linea base entre texto corrido",
    html: `Un cuarto se escribe ${fh(1, 4)} y la mitad ${fh(1, 2)}, ¿cual es mayor?`,
  },
];

describe("banco visual", () => {
  it("vuelca los casos reales para poder capturarlos, y todos conservan texto accesible", () => {
    const trozos: string[] = [];
    const sinTextoAccesible: string[] = [];

    for (const caso of CASOS) {
      const { container, unmount } = render(
        <LocaleProvider locale="es">
          <MathStem html={caso.html} size="large" />
        </LocaleProvider>,
      );

      const etiquetados = container.querySelectorAll('[role="img"][aria-label]');
      if (etiquetados.length === 0) sinTextoAccesible.push(caso.titulo);
      for (const nodo of etiquetados) {
        if (!nodo.getAttribute("aria-label")?.trim()) sinTextoAccesible.push(caso.titulo);
      }

      trozos.push(
        `<section class="caso"><p class="etiqueta">${caso.titulo}</p>` +
          `<div class="tarjeta">${container.innerHTML}</div></section>`,
      );
      unmount();
    }

    // El volcado se escribe ANTES de afirmar nada: si el banco esta roto, es
    // justo cuando mas falta hace poder mirarlo.
    const destino = process.env["CET_BANCO_HTML"];
    if (destino !== undefined && destino !== "") {
      const documento = `<!doctype html><meta charset="utf-8">
<div class="banco"><h1>Banco visual de enunciados</h1>${trozos.join("")}</div>`;
      try {
        mkdirSync(dirname(destino), { recursive: true });
        writeFileSync(destino, documento, "utf8");
      } catch {
        // Un banco que no se puede escribir no invalida el test: solo deja de
        // haber captura. La suite no debe romperse por un fallo de disco.
      }
    }

    expect(trozos).toHaveLength(CASOS.length);
    expect(sinTextoAccesible).toEqual([]);
  });
});
