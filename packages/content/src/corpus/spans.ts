/**
 * El span: la unidad citable del corpus.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Un span es un trozo de material original —un párrafo, una fila de tabla, un
 * pie de figura— con su procedencia exacta. Todo lo que un agente proponga
 * tendrá que citar spans, y la cita se comprueba contra ESTE texto.
 *
 * `text` es texto plano y NO es `I18nText`: es material original en el idioma en
 * que lo escribió el profesor. Envolverlo en `{en: …}` obligaría a decidir un
 * idioma que nadie ha declarado, y a inventar la traducción que falta. El
 * idioma se declara a nivel de documento, que es donde se sabe.
 */

import { createHash } from "node:crypto";

/** Qué clase de material es el span. Decide cómo puede citarse. */
export type SpanKind =
  | "heading"
  | "paragraph"
  | "list_item"
  | "table_row"
  | "figure_caption"
  | "question"
  | "answer_key";

export interface SourceSpan {
  /** Orden dentro del documento. Estable entre ejecuciones: es la clave natural. */
  ord: number;
  /** Página (PDF) o diapositiva (PPTX). `null` en formatos sin paginación fija. */
  page: number | null;
  kind: SpanKind;
  text: string;
  /** sha256 del texto normalizado. Detecta que un documento cambió bajo los pies. */
  checksum: string;
}

export type ExtractionMethod = "office_xml" | "text_layer" | "vision" | "plain";

export interface SourceDocument {
  /** Ruta relativa a la raíz del repo, con `/` siempre (igual que `sourceRef.file`). */
  path: string;
  subjectCode: string;
  mime: string;
  bytes: number;
  /** sha256 del fichero entero. Dos ficheros idénticos son un solo documento. */
  checksum: string;
  extraction: ExtractionMethod;
  extractorVersion: string;
  pages: number | null;
  locale: string;
  spans: SourceSpan[];
}

/**
 * Normalización para comparar citas.
 *
 * Un modelo que copia un párrafo de un .docx devuelve comillas rectas donde
 * había tipográficas y un espacio donde había un no-separable. Exigir igualdad
 * byte a byte rechazaría citas honestas; no normalizar nada dejaría pasar
 * cualquier cosa. Esto es la línea: se unifica lo que el copiado rompe
 * (espacios, comillas, guiones) y NADA que cambie el significado.
 */
export function normalizeForQuote(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201f]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function checksumOf(s: string): string {
  return createHash("sha256").update(normalizeForQuote(s), "utf8").digest("hex");
}

export function fileChecksum(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Construye un span cerrando su checksum. Único sitio autorizado a crearlos. */
export function makeSpan(ord: number, kind: SpanKind, text: string, page: number | null): SourceSpan {
  return { ord, page, kind, text, checksum: checksumOf(text) };
}
