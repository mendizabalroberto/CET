/**
 * GUARDIÁN DE LA PETICIÓN QUE ESPERA PARA SIEMPRE.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * El 27/08 se midió, en navegador, el peor fallo abierto del producto: con la
 * red del colegio *colgada* —asociada pero sin encaminar, o un portal cautivo—
 * el `fetch` del examen no fallaba, **se quedaba esperando**. Diez minutos
 * simulados: un solo envío, cero reintentos, cero avisos, el indicador diciendo
 * «Guardando» y el cronómetro bajando. Y al entregar, los tres botones del
 * diálogo muertos, sin mensaje, con el reloj corriendo.
 *
 * La causa era una línea que **no estaba**: `exam-runner/api.ts` componía su
 * `RequestInit` sin ningún `AbortSignal` con plazo. No hay typecheck, lint,
 * test de componente ni `next build` que vea eso: un `fetch` sin plazo es
 * código perfectamente válido que funciona en todas las redes menos en la del
 * destino, que es una tableta de colegio compartida con conexión mala.
 *
 * ===========================================================================
 * POR QUÉ ESTE TEST Y NO SOLO EL ARREGLO
 * ===========================================================================
 * Arreglar `api.ts` cierra el fallo de hoy. El de mañana es la siguiente
 * llamada que alguien escriba copiando el patrón — y el patrón que se copia es
 * justo el que no tiene plazo, porque es el más corto. Cuando se midió esto
 * había CINCO llamadas a `fetch` en la app y **ninguna** llevaba plazo.
 *
 * Por eso la regla no es «acuérdate de poner un plazo», que depende de que
 * alguien se acuerde. Es estructural:
 *
 *     NINGÚN MÓDULO LLAMA A `fetch` DIRECTAMENTE.
 *     Se pasa por `lib/net/plazo.ts`, que no sabe hacerlo sin plazo.
 *
 * Un cuello de botella se vigila con una búsqueda de texto; «pon un plazo» no
 * se vigila de ninguna forma. El día que alguien escriba `await fetch(...)`,
 * este test se pone rojo antes de que llegue a la tableta de un niño.
 *
 * VERIFICADO POR MUTACIÓN: se devolvió una llamada directa a `fetch` a
 * `telemetry/client.ts` y este test se puso rojo señalándola por fichero y
 * línea. Un invariante que no se ha visto fallar no es un invariante.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Raíz del monorepo: `apps/web/src/lib` → cuatro niveles arriba. */
const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * El ÚNICO módulo autorizado a llamar a `fetch`. Si algún día hace falta un
 * segundo (un worker, otra app), se añade aquí a conciencia y con su plazo —
 * no se silencia el test.
 */
const PORTEROS = ["apps/web/src/lib/net/plazo.ts"];

/**
 * Una llamada al `fetch` global. Cubre las tres formas de escribirla:
 * `fetch(...)`, `globalThis.fetch(...)` y `window.fetch(...)`.
 *
 * `fetchConPlazo(` y `fetchResult(` NO casan: tras `fetch` exigimos el paréntesis.
 * El `(?<![.\w$])` evita confundir un método `algo.fetch()` de una librería con
 * el global.
 */
const LLAMADA_A_FETCH = /(?:globalThis|window|self)\.fetch\s*\(|(?<![.\w$])fetch\s*\(/;

/** Quita comentarios: un `fetch(` citado en una explicación no es una llamada. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

interface Hallazgo {
  readonly fichero: string;
  readonly linea: number;
  readonly texto: string;
}

function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  const visitar = (actual: string): void => {
    for (const entrada of readdirSync(actual, { withFileTypes: true })) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        if (["node_modules", ".next", "dist", ".turbo"].includes(entrada.name)) continue;
        visitar(ruta);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
      // Los tests doblan `fetch` a propósito: es su trabajo.
      if (/\.test\.[jt]sx?$/.test(entrada.name)) continue;
      salida.push(ruta);
    }
  };
  visitar(dir);
  return salida;
}

/** Todas las carpetas `src` de apps y paquetes del workspace. */
function raicesDeCodigo(): string[] {
  const raices: string[] = [];
  for (const grupo of ["apps", "packages"]) {
    const base = join(RAIZ, grupo);
    for (const nombre of readdirSync(base)) {
      const src = join(base, nombre, "src");
      try {
        if (statSync(src).isDirectory()) raices.push(src);
      } catch {
        /* el paquete no tiene `src`; no es un error */
      }
    }
  }
  return raices;
}

function rutaRelativa(fichero: string): string {
  return relative(RAIZ, fichero).split(sep).join("/");
}

const FICHEROS = raicesDeCodigo().flatMap(ficherosDeCodigo);

const HALLAZGOS: Hallazgo[] = FICHEROS.flatMap((fichero) => {
  const limpio = sinComentarios(readFileSync(fichero, "utf8"));
  return limpio
    .split("\n")
    .map((texto, i) => ({ fichero: rutaRelativa(fichero), linea: i + 1, texto: texto.trim() }))
    .filter((l) => LLAMADA_A_FETCH.test(l.texto));
});

describe("invariante — ninguna petición de la app puede esperar sin plazo", () => {
  /**
   * Ningún invariante puede pasar en vacío. Un escáner que deja de encontrar
   * ficheros —porque cambió una ruta, porque alguien movió `src`— pasaría
   * siempre y en verde, que es la peor forma de fallar.
   */
  it("el escáner recorre código de verdad", () => {
    expect(FICHEROS.length).toBeGreaterThan(50);
    expect(FICHEROS.map(rutaRelativa)).toContain("apps/web/src/lib/net/plazo.ts");
  });

  it("el escáner sabe reconocer una llamada a `fetch` (si no, no prueba nada)", () => {
    // Sin esto el test podría estar en verde por no encontrar NINGUNA llamada,
    // que es exactamente el modo de fallo silencioso que persigue.
    expect(LLAMADA_A_FETCH.test("const r = await fetch(url, init);")).toBe(true);
    expect(LLAMADA_A_FETCH.test("return globalThis.fetch(url);")).toBe(true);
    // Y no confundirse con lo que sí está permitido.
    expect(LLAMADA_A_FETCH.test("await fetchConPlazo(url, init, PLAZO_GUARDAR_MS);")).toBe(false);
    expect(LLAMADA_A_FETCH.test("const r = await fetchResult(id);")).toBe(false);
    expect(LLAMADA_A_FETCH.test("await supabase.functions.fetch(x);")).toBe(false);
  });

  it("la llamada real a `fetch` existe y vive en el portero", () => {
    const enPorteros = HALLAZGOS.filter((h) => PORTEROS.includes(h.fichero));
    expect(
      enPorteros.length,
      "nadie llama ya a `fetch`: o el escáner se rompió, o `lib/net/plazo.ts` dejó de hacer su trabajo",
    ).toBeGreaterThan(0);
  });

  it("nadie más llama a `fetch`", () => {
    const infractores = HALLAZGOS.filter((h) => !PORTEROS.includes(h.fichero)).map(
      (h) => `${h.fichero}:${h.linea}  ${h.texto}`,
    );

    expect(
      infractores,
      "Estas llamadas van al `fetch` global, que **puede esperar para siempre**.\n" +
        "Con la red del colegio colgada eso es un niño mirando «Guardando» con el\n" +
        "cronómetro bajando, o tres botones muertos al entregar.\n\n" +
        "Usa `fetchConPlazo(url, init, PLAZO_*)` de `@/lib/net/plazo`, que no sabe\n" +
        "hacerlo sin plazo, y elige el plazo razonándolo como los que ya hay:\n  " +
        infractores.join("\n  "),
    ).toEqual([]);
  });
});
