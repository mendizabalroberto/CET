/**
 * Guarda de las transcripciones reales del repositorio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `packages/content/transcripts/` tiene el texto de las imágenes y los PDF
 * escaneados de Y6A, escrito mirando cada fichero. Sobre esos spans se hacen
 * citas literales que acaban en preguntas publicadas a un alumno.
 *
 * Nadie los vigilaba. Este fichero existe para que cuatro cosas no puedan pasar
 * en silencio:
 *
 *   1. una transcripción que ya no valida contra su esquema;
 *   2. una que describe OTRA versión del fichero (el sha256 no cuadra);
 *   3. una huérfana, que apunta a un fichero de Y6A que ya no está;
 *   4. un fichero del carril de visión SIN transcripción, que es trabajo
 *      pendiente que no aparece en ninguna lista.
 *
 * La segunda es la que de verdad justifica el fichero. Las otras tres rompen
 * algo y se notan; esa no rompe nada: describe otra cosa, y las citas siguen
 * cuadrando contra un texto que ya no corresponde a la imagen.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { inventory } from "../src/corpus/ingest.ts";
import {
  cargarTranscripcion,
  nombreDeTranscripcion,
  transcripcion,
  TRANSCRIPTS_DIR,
} from "../src/corpus/transcript.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dir = join(repoRoot, TRANSCRIPTS_DIR);

/** Las transcripciones SÍ están versionadas, así que esto funciona sin material. */
const ficheros = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];

/**
 * ¿Está el material fuente en este clon? `Y6A/` está en .gitignore a propósito
 * —es material del centro, propiedad de terceros— así que no existe en CI.
 */
const hayMaterial = existsSync(join(repoRoot, "Y6A"));
const describeConMaterial = hayMaterial ? describe : describe.skip;

describe("las transcripciones del repositorio", () => {
  it("hay alguna, y todas son .json", () => {
    // Sin esto, un directorio vacío haría pasar en verde todo lo que sigue: los
    // `for` sobre una lista vacía no comprueban nada. No se fija un número
    // esperado, que habría que editar en cada avance hasta que alguien lo borre.
    expect(ficheros.length).toBeGreaterThan(0);
  });

  for (const f of ficheros) {
    it(`${f} valida contra su esquema`, () => {
      const datos: unknown = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const r = transcripcion.safeParse(datos);
      expect(
        r.success,
        r.success
          ? ""
          : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "),
      ).toBe(true);
    });

    it(`${f} se llama como exige su propia ruta`, () => {
      // El cargador busca la transcripción por el nombre derivado de la ruta.
      // Una con el nombre cambiado a mano no la encuentra nadie: existe, es
      // válida, y el documento figura como no transcrito.
      const datos = transcripcion.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      expect(nombreDeTranscripcion(datos.path)).toBe(f);
    });
  }
});

describeConMaterial("las transcripciones frente al material real", () => {
  let porRuta: Map<string, ReturnType<typeof inventory>[number]>;

  beforeAll(() => {
    porRuta = new Map(inventory(repoRoot).map((e) => [e.path, e]));
  });

  for (const f of ficheros) {
    it(`${f} describe la version actual de su fichero`, () => {
      const datos = transcripcion.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      const entry = porRuta.get(datos.path);
      // Si el fichero no está, lo dice el test de huérfanas; aquí no se afirma
      // nada sobre él para no dar dos veces el mismo fallo con distinto nombre.
      if (!entry) return;
      expect(
        datos.checksum,
        `la transcripcion es de otra version de ${datos.path}: hay que rehacerla`,
      ).toBe(entry.checksum);
    });
  }

  it("ninguna transcripcion es huerfana", () => {
    const huerfanas = ficheros
      .map((f) => transcripcion.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))).path)
      .filter((p) => !porRuta.has(p));
    expect(huerfanas, `apuntan a ficheros que ya no existen: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("ningun fichero del carril de vision se queda sin transcribir", () => {
    // Solo se exige a los `vision` declarados por el inventario. Hay ademas PDF
    // clasificados `text_layer` que al abrirlos resultan ser escaneos, pero
    // averiguarlo obliga a extraer los veinte PDF y este test dejaria de ser
    // barato. De esos se encarga `pnpm corpus transcribe`, que si los abre.
    const pendientes = [...porRuta.values()]
      .filter((e) => e.method === "vision" && e.duplicateOf === null)
      .filter((e) => cargarTranscripcion(repoRoot, e.path, e.checksum) === null)
      .map((e) => e.path);
    expect(pendientes, `sin transcripcion: ${pendientes.join(", ")}`).toEqual([]);
  });
});
