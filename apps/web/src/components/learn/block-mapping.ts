/**
 * `lesson_blocks.kind` -> componente de `@cet/ui`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * CONTRATO C5 DE `MODULES.md`
 * ===========================================================================
 * Todo HTML que venga de la base de datos pasa por el sanitizador de `@cet/ui`
 * ANTES de llegar a un componente. `@cet/ui` vuelve a sanear por dentro (es
 * idempotente y barato), así que hay dos barreras: si mañana alguien renderiza
 * un `LessonBlockContent` con otra cosa, el contenido ya viene limpio.
 *
 * En este fichero NO hay `dangerouslySetInnerHTML` ni lo habrá: el único punto
 * del sistema autorizado a usarlo es `packages/ui/src/lib/safe-html.tsx`.
 *
 * ===========================================================================
 * POR QUÉ ES UNA FUNCIÓN PURA Y NO UN COMPONENTE
 * ===========================================================================
 * El mapeo es donde se pierde contenido en silencio: un `kind` nuevo, un
 * `content` que no encaja, una imagen sin media. Como función pura se puede
 * probar los once `kind` sin montar React, y devuelve `null` de forma explícita
 * cuando un bloque no es renderizable, en vez de dejar un hueco en blanco en
 * mitad de una lección.
 */
import {
  isRenderableBlockKind,
  sanitizeHtml,
  sanitizeSvg,
  type LessonBlockContent,
  type LessonTableRow,
} from "@cet/ui";
import { resolveI18n, type BlockKind, type I18nText, type Locale } from "@cet/shared";

/** Media ya resuelta a URL por la capa de datos. `@cet/ui` es agnóstico de Storage. */
export interface LessonBlockMedia {
  readonly src: string;
  readonly alt: I18nText;
  /** Pista de subtítulos del vídeo. Sin ella el vídeo no se muestra. */
  readonly captionsSrc?: string | undefined;
}

/** Fila de `lesson_blocks` tal como sale de la consulta, sin tocar. */
export interface LessonBlockRow {
  readonly id: string;
  readonly ord: number;
  readonly kind: string;
  readonly content: unknown;
  readonly media?: LessonBlockMedia | null | undefined;
}

export interface MappedLessonBlock {
  readonly id: string;
  readonly ord: number;
  readonly kind: BlockKind;
  readonly content: LessonBlockContent;
}

/* -------------------------------------------------------------------------- */
/* Lectores defensivos de jsonb                                               */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `I18nText` de la base de datos. Es jsonb: el trigger de `0006_content.sql`
 * comprueba la forma, pero esta función no se apoya en eso — un dump antiguo o
 * una migración a medias produciría exactamente el objeto que rompería la
 * lección entera.
 */
export function readI18nText(value: unknown): I18nText | null {
  if (typeof value === "string") return value.trim() === "" ? null : { en: value, es: value };
  if (!isRecord(value)) return null;
  const en = typeof value.en === "string" && value.en.trim() !== "" ? value.en : undefined;
  const es = typeof value.es === "string" && value.es.trim() !== "" ? value.es : undefined;
  if (en === undefined && es === undefined) return null;
  return { ...(en === undefined ? {} : { en }), ...(es === undefined ? {} : { es }) };
}

/** I18nText -> cadena en el idioma pedido -> SANEADA. Nunca devuelve HTML crudo. */
function readSafeHtml(value: unknown, locale: Locale): string | null {
  const text = readI18nText(value);
  if (text === null) return null;
  const clean = sanitizeHtml(resolveI18n(text, locale));
  return clean.trim() === "" ? null : clean;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/* -------------------------------------------------------------------------- */
/* El mapeo                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Traduce una fila de `lesson_blocks` al contenido que `LessonBlock` sabe pintar.
 * Devuelve `null` cuando el bloque no es renderizable; quien llama decide si eso
 * merece un aviso al alumno o simplemente se omite.
 */
export function mapLessonBlock(row: LessonBlockRow, locale: Locale): MappedLessonBlock | null {
  if (!isRenderableBlockKind(row.kind)) return null;

  const content = mapContent(row, row.kind, locale);
  if (content === null) return null;

  return { id: row.id, ord: row.ord, kind: row.kind, content };
}

function mapContent(
  row: LessonBlockRow,
  kind: BlockKind,
  locale: Locale,
): LessonBlockContent | null {
  const raw: Record<string, unknown> = isRecord(row.content) ? row.content : {};

  switch (kind) {
    /* --- prosa: .rule / .eg / .tip / .warn / texto suelto / fórmula --- */
    case "rule":
    case "example":
    case "tip":
    case "warning":
    case "text":
    case "formula": {
      const html = readSafeHtml(raw.html, locale);
      if (html === null) return null;
      const label = readI18nText(raw.label);
      // `text` no admite `label` en el contrato de @cet/ui.
      if (kind === "text") return { kind: "text", html };
      return label === null ? { kind, html } : { kind, html, label };
    }

    /* --- lista ordenada de pasos: el .steps de Y6A --- */
    case "steps": {
      if (!Array.isArray(raw.steps)) return null;
      const steps = raw.steps
        .map((step) => readSafeHtml(step, locale))
        .filter((step): step is string => step !== null);
      if (steps.length === 0) return null;
      const label = readI18nText(raw.label);
      return label === null ? { kind: "steps", steps } : { kind: "steps", steps, label };
    }

    /* --- tabla --- */
    case "table": {
      if (!Array.isArray(raw.headers) || !Array.isArray(raw.rows)) return null;
      const headers = raw.headers
        .map((header) => readI18nText(header))
        .filter((header): header is I18nText => header !== null);
      if (headers.length === 0) return null;

      const rows: LessonTableRow[] = raw.rows
        .filter((cells): cells is unknown[] => Array.isArray(cells))
        .map((cells) => ({
          // El HTML de cada celda también viene de la base de datos.
          cells: cells.map((cell) => readSafeHtml(cell, locale) ?? ""),
        }));
      if (rows.length === 0) return null;

      // `caption` es obligatorio en el contrato de @cet/ui: una tabla sin
      // leyenda es una tabla que un lector de pantalla no sabe presentar.
      const caption = readI18nText(raw.caption) ?? { en: "Table", es: "Tabla" };
      return { kind: "table", caption, headers, rows };
    }

    /* --- imagen: la accesibilidad vive en media_assets.alt_text (NOT NULL) --- */
    case "image": {
      const media = row.media;
      if (!media) return null;
      const caption = readI18nText(raw.caption);
      return {
        kind: "image",
        src: media.src,
        alt: media.alt,
        ...(caption === null ? {} : { caption }),
      };
    }

    /* --- vídeo: sin subtítulos no se publica (DATA_MODEL §3) --- */
    case "video": {
      const media = row.media;
      if (!media) return null;
      const captionsSrc = readString(raw.captionsSrc) ?? media.captionsSrc ?? null;
      // Deliberado: preferimos no mostrar el vídeo a mostrarlo sin subtítulos.
      // Un `<track src="">` apuntaría a la propia página y engañaría al alumno
      // sordo haciéndole creer que hay subtítulos.
      if (captionsSrc === null) return null;
      return { kind: "video", src: media.src, title: media.alt, captionsSrc };
    }

    /* --- widget: `{ component, props }` en la base de datos --- */
    case "interactive": {
      const component = readString(raw.component);
      if (component === null) return null;
      const props = isRecord(raw.props) ? raw.props : {};
      // Hoy el único widget soportado es la figura SVG de los "labs" de Y6A.
      // Un `component` desconocido devuelve null en vez de un hueco mudo.
      const svg = readString(props.svg);
      const alt = readI18nText(props.alt);
      if (svg === null || alt === null) return null;
      const clean = sanitizeSvg(svg);
      if (clean.trim() === "") return null;
      return { kind: "interactive", svg: clean, alt };
    }

    default: {
      // `isRenderableBlockKind` ya estrechó a BlockKind; esto es la red por si
      // mañana crece el enum: el compilador obliga a añadir el caso.
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** Mapea la lección entera y descarta lo irrenderizable, conservando el orden. */
export function mapLessonBlocks(
  rows: readonly LessonBlockRow[],
  locale: Locale,
): MappedLessonBlock[] {
  return [...rows]
    .sort((a, b) => a.ord - b.ord)
    .map((row) => mapLessonBlock(row, locale))
    .filter((block): block is MappedLessonBlock => block !== null);
}
