/**
 * @cet/ui — INVARIANTE: en el monorepo hay UNA paleta, y vive en `tokens.css`.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * QUE FALLO CIERRA ESTE FICHERO
 *
 * Habia dos juegos completos de tokens de color. `packages/ui/src/tokens.css`
 * definia `--cet-*`; `apps/web/src/app/globals.css` definia `--brand`, `--teal`,
 * `--amber`, `--surface`, `--card`, `--ink`, `--muted`, `--line`, `--ring`, con
 * sus propios valores y su propio bloque de tema oscuro. Y el que se ejecutaba
 * en la pantalla del alumno era el segundo.
 *
 * En tema oscuro no eran variaciones del mismo color, eran colores distintos:
 * superficie #0b1622 frente a #0b141f, tarjeta #12202f frente a #16222f, marca
 * #7cb2ea frente a #4a8fce, exito #5fd39f frente a #2fb782, peligro #ff8a80
 * frente a #f0705f. En `/learn/[lessonId]` convivian los dos sistemas: la pagina
 * pintaba con `text-muted` y `bg-ink`, y los componentes de `@cet/ui` que esa
 * misma pagina monta pintaban con `--cet-*`.
 *
 * El coste no fue estetico. El anillo de foco de la app (`--ring` #34c3b4) sobre
 * su relleno de marca (`--brand` #4a8fce) daba **1.57:1** contra un umbral de
 * 3:1: en tema oscuro, un alumno navegando con el tabulador no veia donde
 * estaba. Ese numero es hijo directo de la duplicacion —la app eligio un anillo
 * teal que el design system nunca eligio— y por eso lo que se vigila aqui no es
 * el anillo, es la duplicacion.
 *
 * LA REGLA
 *
 * Una hoja de estilos que no sea `tokens.css` puede dar NOMBRE a un color (un
 * alias: `--brand: var(--cet-primary)`), pero no puede darle VALOR. En cuanto
 * alguien escribe un hexadecimal en otra hoja, hay dos sitios donde cambiar el
 * mismo concepto, y la experiencia dice que solo se cambia uno.
 *
 * No es una regla sobre `globals.css`: cubre la familia. La proxima hoja que
 * alguien anada al monorepo queda vigilada el dia que la anada.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** cwd es `packages/ui` (ahi vive `vitest.config.ts`); la raiz esta dos arriba. */
const RAIZ = join(process.cwd(), "..", "..");

/** La unica hoja con permiso para escribir valores de color. */
const FUENTE_DE_VERDAD = join("packages", "ui", "src", "tokens.css");

function hojas(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === ".next" || entrada.name === "dist") continue;
    const p = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...hojas(p));
    else if (entrada.name.endsWith(".css")) out.push(p);
  }
  return out;
}

/**
 * Un valor que ES un color literal.
 *
 * Se aceptan a proposito los alias (`var(--x)`) y las mezclas que solo operan
 * sobre tokens (`color-mix(in srgb, var(--x) 12%, transparent)`): eso es apuntar
 * a la paleta, no inventarse un color. Lo que se rechaza es el hexadecimal, el
 * `rgb()`/`hsl()`/`oklch()` con numeros y los nombres de color de CSS que
 * aparecen de verdad en hojas de producto.
 */
const NOMBRES_DE_COLOR = /^(white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|gold|crimson)$/i;

function esColorLiteral(valor: string): boolean {
  const v = valor.trim();
  if (/#[0-9a-fA-F]{3,8}\b/.test(v)) return true;
  if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/.test(v)) return true;
  return NOMBRES_DE_COLOR.test(v);
}

interface Hallazgo {
  readonly fichero: string;
  readonly propiedad: string;
  readonly valor: string;
}

function customProperties(css: string): Array<{ propiedad: string; valor: string }> {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...sinComentarios.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    propiedad: m[1] as string,
    valor: (m[2] as string).trim(),
  }));
}

describe("invariante — una sola paleta en todo el monorepo", () => {
  const encontradas = [...hojas(join(RAIZ, "apps")), ...hojas(join(RAIZ, "packages"))].map((f) => ({
    ruta: f,
    relativa: relative(RAIZ, f).replace(/\\/g, "/"),
    css: readFileSync(f, "utf8"),
  }));

  const otras = encontradas.filter((h) => h.relativa !== FUENTE_DE_VERDAD.replace(/\\/g, "/"));

  it("el escaner encuentra hojas y encuentra la fuente de verdad", () => {
    // Sin estas tres condiciones el test pasaria en verde con un escaner roto:
    // cero ficheros, cero declaraciones, o la propia `tokens.css` desaparecida.
    expect(encontradas.map((h) => h.relativa)).toContain(FUENTE_DE_VERDAD.replace(/\\/g, "/"));
    expect(otras.length).toBeGreaterThan(0);
    expect(otras.reduce((n, h) => n + customProperties(h.css).length, 0)).toBeGreaterThan(0);
  });

  it("`tokens.css` sigue siendo la que tiene los colores", () => {
    // La otra forma de pasar en vacio: vaciar `tokens.css` y declarar victoria.
    const fuente = encontradas.find((h) => h.relativa === FUENTE_DE_VERDAD.replace(/\\/g, "/"));
    const colores = customProperties(fuente?.css ?? "").filter((d) => esColorLiteral(d.valor));
    expect(colores.length, "tokens.css se ha quedado sin colores: la paleta no esta en ninguna parte").toBeGreaterThan(
      50,
    );
  });

  it("ninguna otra hoja se inventa un color", () => {
    const hallazgos: Hallazgo[] = [];
    for (const hoja of otras) {
      for (const { propiedad, valor } of customProperties(hoja.css)) {
        if (esColorLiteral(valor)) hallazgos.push({ fichero: hoja.relativa, propiedad, valor });
      }
    }

    expect(
      hallazgos.map((h) => `${h.fichero}: ${h.propiedad}: ${h.valor}`),
      "Estas hojas declaran un valor de color propio. Eso vuelve a partir la paleta en dos, y\n" +
        "la mitad que se ejecuta no es la del design system. Mueve el color a\n" +
        `\`${FUENTE_DE_VERDAD}\` y deja aqui un alias: \`--mi-nombre: var(--cet-token)\`.`,
    ).toEqual([]);
  });
});
