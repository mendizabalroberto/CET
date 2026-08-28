/**
 * Inventario e ingesta determinista de Y6A.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este módulo decide, por fichero, QUIÉN puede leerlo — y ese reparto es la
 * pieza que gobierna todo el sistema:
 *
 *   office_xml  .docx/.pptx      determinista, aquí mismo
 *   plain       .txt             determinista, aquí mismo
 *   text_layer  .pdf con fuentes determinista, extractor aún no escrito
 *   vision      .pdf escaneado,  NADIE con texto: exige transcripción con visión,
 *               .jpg/.png/.webp  porque DeepSeek no ve imágenes (HANDOFF-DEEPSEEK §0.2)
 *
 * El inventario dice la verdad sobre lo que NO puede leer. Un pipeline que solo
 * presume de lo que consiguió es un pipeline en el que no se puede confiar
 * —misma regla que gobierna COVERAGE.md.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { docxToSpans, pptxToSpans } from "./office.ts";
import { DENSIDAD_MINIMA, PdfSinTextoError, pdfToSpans } from "./pdf.ts";
import { cargarTranscripcion } from "./transcript.ts";
import {
  fileChecksum,
  makeSpan,
  type ExtractionMethod,
  type SourceDocument,
} from "./spans.ts";

/**
 * Versión del extractor. Sube cuando cambie la SALIDA, no cuando cambie el
 * código.
 *
 * `corpus/2`: el extractor de PDF aprendió a unir fracciones apiladas y a
 * reconstruir columnas. Cambia lo que se lee de los exámenes de Math y de la
 * clave de respuestas — que pasó de basura intercalada a filas legibles.
 *
 * Los spans son INMUTABLES: un documento ya ingerido con `corpus/1` conserva
 * los suyos hasta que alguien lo reextrae a propósito. Esta cadena es lo que
 * permite saber, mirando una fila, con qué se sacó.
 */
export const EXTRACTOR_VERSION = "corpus/2";

const SUBJECT_BY_FOLDER: Record<string, string> = {
  English: "english",
  "Español": "spanish",
  ICT: "ict",
  Math: "math",
  Science: "science",
  Socials: "socials",
};

const MIME: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".html": "text/html",
};

export interface InventoryEntry {
  path: string;
  subjectCode: string;
  ext: string;
  bytes: number;
  checksum: string;
  method: ExtractionMethod | "html_trainer";
  /** Por qué se le asignó ese método. Se imprime en `corpus status`. */
  reason: string;
  /** Si es duplicado exacto de otro fichero ya visto, su ruta. */
  duplicateOf: string | null;
}

/**
 * ¿Tiene el PDF una capa de texto?
 *
 * Heurística sobre los bytes: un PDF con fuentes declara `/Font`. En PDF >= 1.5
 * los objetos pueden ir en `ObjStm` comprimidos, y entonces `/Font` no aparece
 * en claro — por eso un `objstm` presente sin `/Font` NO se declara escaneado a
 * la ligera: se marca `text_layer` y que falle el extractor, en vez de mandarlo
 * al carril caro por una suposición.
 */
function pdfHasTextLayer(buf: Buffer): boolean {
  const head = buf.toString("latin1");
  return head.includes("/Font") || head.includes("ObjStm");
}

function methodFor(ext: string, buf: () => Buffer): { method: InventoryEntry["method"]; reason: string } {
  if (ext === ".docx" || ext === ".pptx") return { method: "office_xml", reason: "OOXML: XML dentro del zip" };
  if (ext === ".txt") return { method: "plain", reason: "texto plano" };
  if (ext === ".html") return { method: "html_trainer", reason: "ya lo extrae el pipeline de trainers" };
  if (ext === ".pdf") {
    return pdfHasTextLayer(buf())
      ? { method: "text_layer", reason: "PDF con capa de texto" }
      : { method: "vision", reason: "PDF escaneado: sin capa de texto" };
  }
  return { method: "vision", reason: `imagen ${ext.slice(1)}: sin texto que extraer` };
}

/** Recorre Y6A y clasifica cada fichero. No lee contenido salvo lo necesario para clasificar. */
export function inventory(repoRoot: string): InventoryEntry[] {
  const base = join(repoRoot, "Y6A");
  const out: InventoryEntry[] = [];
  const seen = new Map<string, string>();

  for (const folder of readdirSync(base).sort()) {
    const subjectCode = SUBJECT_BY_FOLDER[folder];
    const dir = join(base, folder);
    if (!subjectCode || !statSync(dir).isDirectory()) continue;

    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (!st.isFile()) continue;
      const ext = extname(name).toLowerCase();
      const path = relative(repoRoot, abs).split(sep).join("/");

      let cached: Buffer | null = null;
      const buf = () => (cached ??= readFileSync(abs));
      const { method, reason } = methodFor(ext, buf);
      const checksum = fileChecksum(buf());
      const dup = seen.get(checksum) ?? null;
      if (!dup) seen.set(checksum, path);

      out.push({ path, subjectCode, ext, bytes: st.size, checksum, method, reason, duplicateOf: dup });
    }
  }
  return out;
}

/**
 * Construye el documento a partir de su transcripcion, si la hay.
 *
 * Se consulta desde DOS sitios, y esa es la correccion: no solo desde el carril
 * `vision`, tambien desde el de PDF cuando el extractor descubre —al abrirlo—
 * que el fichero era un escaneo. La heuristica de bytes clasifica esos PDF como
 * `text_layer` porque declaran fuentes; solo al intentar leerlos se ve que no
 * hay texto. Sin esta segunda consulta, siete transcripciones de English ya
 * escritas y validas se quedaban sin usar, y el comando decia que el fichero
 * "exige el carril vision" con la transcripcion de ese carril en el disco.
 */
function documentoDeVision(
  repoRoot: string,
  entry: InventoryEntry,
  common: Omit<SourceDocument, "extraction" | "pages" | "spans" | "locale" | "extractorVersion">,
): SourceDocument | null {
  const t = cargarTranscripcion(repoRoot, entry.path, entry.checksum);
  if (t === null) return null;
  return {
    ...common,
    extractorVersion: `vision/${t.transcribedBy}`,
    locale: t.locale,
    extraction: "vision",
    pages: t.pages,
    spans: t.spans,
  };
}

export class NotIngestibleError extends Error {
  constructor(public readonly entry: InventoryEntry) {
    super(`\`${entry.path}\` exige el carril \`${entry.method}\`: ${entry.reason}`);
    this.name = "NotIngestibleError";
  }
}

/**
 * Ingiere un fichero del carril determinista. Lanza si el fichero pertenece a
 * otro carril: preferimos parar a producir spans a medias que nadie audita.
 */
export async function ingest(repoRoot: string, entry: InventoryEntry): Promise<SourceDocument> {
  if (entry.method === "html_trainer") throw new NotIngestibleError(entry);

  const locale = entry.subjectCode === "spanish" ? "es" : "en";
  const common = {
    path: entry.path,
    subjectCode: entry.subjectCode,
    mime: MIME[entry.ext] ?? "application/octet-stream",
    bytes: entry.bytes,
    checksum: entry.checksum,
  };

  // Carril de vision: no hay texto que extraer, hay una transcripcion que
  // alguien con ojos escribio. Si no existe todavia, es un encargo pendiente,
  // no un error del extractor.
  if (entry.method === "vision") {
    const doc = documentoDeVision(repoRoot, entry, common);
    if (doc === null) {
      throw new NotIngestibleError({
        ...entry,
        reason: "sin transcripcion todavia: `pnpm corpus transcribe --list`",
      });
    }
    return doc;
  }

  // Los bytes se leen AQUI y no antes: un documento de vision no los necesita
  // —su checksum ya viene del inventario y su texto, de la transcripcion— y
  // leerlos arriba hacia que un fichero inexistente fallara con un ENOENT en
  // vez de con el motivo real.
  const buf = readFileSync(join(repoRoot, entry.path));
  const deterministaComun = { ...common, extractorVersion: EXTRACTOR_VERSION, locale };

  if (entry.ext === ".docx") {
    return { ...deterministaComun, extraction: "office_xml", pages: null, spans: docxToSpans(buf) };
  }
  if (entry.ext === ".pptx") {
    const { spans, pages } = pptxToSpans(buf);
    return { ...deterministaComun, extraction: "office_xml", pages, spans };
  }
  if (entry.ext === ".pdf") {
    let resultado;
    try {
      resultado = await pdfToSpans(buf);
    } catch (error) {
      // Un PDF escaneado se declara `text_layer` por la heuristica de bytes y
      // solo se descubre al abrirlo. Aqui se corrige el carril, en vez de
      // dejarlo pasar con cero spans.
      if (error instanceof PdfSinTextoError) {
        // Si alguien YA lo transcribio, manda la transcripcion. Rendirse aqui
        // teniendola en el disco fue el fallo que dejo siete documentos de
        // English fuera del corpus: el comando decia "exige el carril vision"
        // con el fichero de ese carril ya escrito al lado.
        const transcrito = documentoDeVision(repoRoot, entry, common);
        if (transcrito !== null) return transcrito;
        throw new NotIngestibleError({ ...entry, method: "vision", reason: error.message });
      }
      throw error;
    }
    if (resultado.densidad < DENSIDAD_MINIMA) {
      // Igual que arriba: una transcripcion completa vale mas que cuatro
      // palabras sueltas flotando sobre una imagen.
      const transcrito = documentoDeVision(repoRoot, entry, common);
      if (transcrito !== null) return transcrito;
      throw new NotIngestibleError({
        ...entry,
        method: "vision",
        reason:
          `solo ${Math.round(resultado.densidad)} caracteres por pagina en ${resultado.pages}: ` +
          "es una imagen con texto encima, no un documento de texto",
      });
    }
    return { ...deterministaComun, extraction: "text_layer", pages: resultado.pages, spans: resultado.spans };
  }
  // .txt — una línea no vacía, un span. Sin adivinar estructura.
  const spans = buf
    .toString("utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l, i) => makeSpan(i, "paragraph", l, null));
  return { ...deterministaComun, extraction: "plain", pages: null, spans };
}
