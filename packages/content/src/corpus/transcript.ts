/**
 * Transcripciones del carril de visión.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Treinta imágenes y once PDFs escaneados no tienen texto que extraer. Alguien
 * con ojos tiene que leerlos y escribir lo que ve. Ese alguien deja aquí un
 * fichero JSON, y a partir de ese momento el documento entra en el sistema por
 * la misma puerta que los demás: spans citables, contratos, verificación.
 *
 * DOS COSAS QUE ESTE FORMATO HACE CUMPLIR, Y POR QUÉ
 *
 * 1. La transcripción lleva el `checksum` del fichero de origen. Si la imagen
 *    cambia, la transcripción queda marcada como caduca y hay que rehacerla.
 *    Sin esto, una transcripción vieja sobre una imagen nueva es una mentira
 *    que nadie detecta: el texto parece bien y describe otra cosa.
 *
 * 2. Un span transcrito NO es lo mismo que uno extraído. `source_documents.
 *    extraction = 'vision'` lo dice en la base de datos, para que un revisor
 *    sepa, sin abrir el fichero, que ese texto es una INTERPRETACIÓN de una
 *    imagen y no una copia de un documento. Una cita contra un span de visión
 *    vale lo que valga la transcripción, y eso es una cadena más larga que la
 *    de un .docx.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { makeSpan, type SourceSpan } from "./spans.ts";

/** Dónde viven, relativo a la raíz del repositorio. */
export const TRANSCRIPTS_DIR = "packages/content/transcripts";

const spanTranscrito = z.object({
  /** Página del PDF o `1` para una imagen suelta. */
  page: z.number().int().positive(),
  kind: z.enum([
    "heading",
    "paragraph",
    "list_item",
    "table_row",
    "figure_caption",
    "question",
    "answer_key",
  ]),
  /**
   * Lo que pone, tal cual. Ni resumido ni corregido: si el original dice
   * "recieve", la transcripción dice "recieve". Una transcripción que arregla
   * la ortografía rompe todas las citas literales que dependan de ella.
   */
  text: z.string().min(1).max(8000),
});

export const transcripcion = z.object({
  /** Ruta del fichero de origen, relativa a la raíz, con `/`. */
  path: z.string().min(1).regex(/^[^\\]*$/, "usa `/` en las rutas, nunca `\\`"),
  /** sha256 del fichero transcrito. Ata la transcripción a ESE fichero. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  locale: z.enum(["en", "es"]),
  pages: z.number().int().positive(),
  /**
   * Quién o qué la produjo. No es decoración: un revisor tiene derecho a saber
   * si esto lo leyó una persona o un modelo, y cuál.
   */
  transcribedBy: z.string().min(1).max(64),
  /**
   * Lo que el transcriptor NO pudo leer: una fórmula borrosa, un diagrama sin
   * texto, una esquina cortada. Se declara. Un hueco callado es peor que un
   * hueco anotado, porque nadie sabe que está.
   */
  gaps: z.array(z.string()).default([]),
  spans: z.array(spanTranscrito).min(1),
});
export type Transcripcion = z.infer<typeof transcripcion>;

/** Nombre de fichero de la transcripción de una ruta dada. */
export function nombreDeTranscripcion(path: string): string {
  return `${path.replace(/^Y6A\//, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.json`;
}

export class TranscripcionCaducaError extends Error {
  constructor(path: string) {
    super(
      `la transcripción de \`${path}\` es de otra versión del fichero (el sha256 no coincide): hay que rehacerla`,
    );
    this.name = "TranscripcionCaducaError";
  }
}

export interface TranscripcionCargada {
  spans: SourceSpan[];
  pages: number;
  locale: string;
  transcribedBy: string;
  gaps: string[];
}

/**
 * Carga la transcripción de un fichero, si existe y corresponde a ESTE fichero.
 *
 * Devuelve `null` cuando no hay transcripción — eso no es un error, es "aún no
 * la ha hecho nadie". Lanza cuando la hay pero es de otra versión del fichero,
 * que sí lo es.
 */
export function cargarTranscripcion(
  repoRoot: string,
  path: string,
  checksum: string,
): TranscripcionCargada | null {
  const fichero = join(repoRoot, TRANSCRIPTS_DIR, nombreDeTranscripcion(path));
  if (!existsSync(fichero)) return null;

  const datos = transcripcion.parse(JSON.parse(readFileSync(fichero, "utf8")));
  if (datos.checksum !== checksum) throw new TranscripcionCaducaError(path);
  if (datos.path !== path) {
    throw new Error(`la transcripción ${fichero} dice ser de \`${datos.path}\`, no de \`${path}\``);
  }

  return {
    spans: datos.spans.map((s, i) => makeSpan(i, s.kind, s.text, s.page)),
    pages: datos.pages,
    locale: datos.locale,
    transcribedBy: datos.transcribedBy,
    gaps: datos.gaps,
  };
}
