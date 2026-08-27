/**
 * GUARDIÁN DEL ARTEFACTO PUBLICADO QUE NADIE CONSUME.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * `packages/ui/package.json` exporta `"./tokens.css"`. `packages/ui/src/index.ts`
 * documenta, en su cabecera, que el consumidor "debe importar `@cet/ui/tokens.css`
 * una sola vez, en su layout raíz". Nadie lo hizo nunca.
 *
 * El resultado: **175 custom properties `--cet-*` y las reglas de `.cet-fraction`
 * no llegaban al navegador**, y 43 componentes de `@cet/ui` se pintaban contra
 * variables inexistentes. `pnpm verify` pasaba entero: el typecheck no mira CSS,
 * el lint no mira CSS, los tests de componente corren en jsdom —que no aplica
 * hojas de estilo— y `next build` compila igual de bien una app sin la mitad de
 * su CSS. Los 46 e2e también pasaban: comprueban texto, roles y cabeceras.
 *
 * El síntoma que lo destapó fue pedagógico, no visual: sin
 * `.cet-fraction { flex-direction: column }`, `5/6` se pinta en línea y el alumno
 * lee **56**. La pantalla le preguntaba si «56 > 512» y le corregía la respuesta.
 *
 * ===========================================================================
 * LA REGLA
 * ===========================================================================
 * Si un paquete del workspace EXPORTA un fichero `.css`, toda app que dependa de
 * ese paquete tiene que IMPORTARLO en algún sitio de su código.
 *
 * No es una regla sobre `tokens.css`: es sobre la familia entera —«el paquete lo
 * publica, el paquete documenta que hay que consumirlo, el build pasa, y no llega
 * al navegador»—. La siguiente hoja que alguien exporte queda cubierta el día que
 * la exporte, sin que nadie se acuerde de este fallo.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Raíz del monorepo: `apps/web/src/lib` → cuatro niveles arriba. */
const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));

interface HojaExportada {
  /** Especificador que un consumidor tiene que escribir: `@cet/ui/tokens.css`. */
  readonly especificador: string;
  /** Ruta real en disco, para poder decir en el error qué se está perdiendo. */
  readonly fichero: string;
}

interface PaqueteJson {
  readonly name?: string;
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function leerJson(ruta: string): PaqueteJson | null {
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8")) as PaqueteJson;
}

function subdirectorios(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isDirectory());
}

/** Hojas `.css` que un `package.json` publica por su campo `exports`. */
function hojasExportadas(pkg: PaqueteJson): HojaExportada[] {
  const nombre = pkg.name;
  if (nombre === undefined || pkg.exports === undefined) return [];
  const out: HojaExportada[] = [];
  for (const [subruta, destino] of Object.entries(pkg.exports)) {
    if (typeof destino !== "string" || !destino.endsWith(".css")) continue;
    const especificador = subruta === "." ? nombre : `${nombre}/${subruta.replace(/^\.\//, "")}`;
    out.push({ especificador, fichero: destino });
  }
  return out;
}

/** Todo el texto de los ficheros de una app donde puede vivir un import de CSS. */
function fuentesDe(appDir: string): string {
  const trozos: string[] = [];
  const visitar = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === ".next") continue;
        visitar(p);
      } else if (
        /\.(tsx?|jsx?|mjs|css)$/.test(entrada.name) &&
        // Los ficheros de prueba se excluyen a proposito: este mismo test nombra
        // `@cet/ui/tokens.css` en sus comentarios y se daba por satisfecho solo.
        // Un import dentro de un test tampoco carga nada en el navegador.
        !/\.test\.[jt]sx?$/.test(entrada.name)
      ) {
        trozos.push(readFileSync(p, "utf8"));
      }
    }
  };
  for (const sub of ["src", "app"]) {
    const d = join(appDir, sub);
    if (existsSync(d)) visitar(d);
  }
  return trozos.join("\n");
}

describe("invariante — una hoja de estilos exportada tiene que importarse", () => {
  const paquetes = subdirectorios(join(RAIZ, "packages"))
    .map((dir) => ({ dir, pkg: leerJson(join(dir, "package.json")) }))
    .filter((p): p is { dir: string; pkg: PaqueteJson } => p.pkg !== null);

  const apps = subdirectorios(join(RAIZ, "apps"))
    .map((dir) => ({ dir, pkg: leerJson(join(dir, "package.json")) }))
    .filter((a): a is { dir: string; pkg: PaqueteJson } => a.pkg !== null);

  it("el escáner encuentra hojas exportadas (si no, no está probando nada)", () => {
    const todas = paquetes.flatMap(({ pkg }) => hojasExportadas(pkg));
    expect(todas.map((h) => h.especificador)).toContain("@cet/ui/tokens.css");
  });

  it("cada app que depende del paquete importa sus hojas", () => {
    const huerfanas: string[] = [];

    for (const { dir: appDir, pkg: app } of apps) {
      const deps = { ...app.dependencies, ...app.devDependencies };
      const fuentes = fuentesDe(appDir);

      for (const { pkg } of paquetes) {
        if (pkg.name === undefined || !(pkg.name in deps)) continue;
        for (const hoja of hojasExportadas(pkg)) {
          // Vale cualquier forma de traerla: `import "…"` desde un módulo o
          // `@import "…"` desde otra hoja. Lo que no vale es que no aparezca.
          if (!fuentes.includes(hoja.especificador)) {
            huerfanas.push(`${app.name ?? appDir}: falta importar ${hoja.especificador}`);
          }
        }
      }
    }

    expect(
      huerfanas,
      "Estas hojas se publican en `exports` y ninguna app las carga. El build pasa,\n" +
        "el navegador se queda sin ellas. Impórtalas en el layout raíz de la app\n" +
        "(o desde su hoja global), o deja de exportarlas:\n  " +
        huerfanas.join("\n  "),
    ).toEqual([]);
  });
});
