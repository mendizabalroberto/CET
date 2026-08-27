/**
 * Lecciones que viven en el HTML estático, no en un array JS.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * English y Español no declaran `LESSONS[]` ni `TOPICS[]`: sus lecciones son
 * acordeones escritos a mano dentro de `<section id="learn">`:
 *
 *   <div class="topic open">
 *     <button …><span>🔤 1 · Present Simple <span class="tsub">— play / plays</span></span>…</button>
 *     <div class="body"> …bloques… </div>
 *   </div>
 *
 * El título sale del `<button>` (quitando el galón ▼) y el contenido del
 * `.body`. Si un acordeón no tiene `.body`, se LANZA en vez de emitir una
 * lección vacía: una lección sin contenido es peor que un error de build.
 */

import type { Locale } from "@cet/shared";
import { stableId } from "../ids.ts";
import type { Gap, Lesson, LessonBlock, SourceRef } from "../schema.ts";
import { extractBlocks, titleFromButton } from "./blocks.ts";
import { findClosingTag, sliceElementById, sliceElementsByClass } from "./html.ts";

export interface AccordionLessonsResult {
  readonly lessons: Lesson[];
  /**
   * Bloques de la sección que NO están dentro de ningún acordeón: la tarjeta de
   * introducción del panel. No se tiran; el llamante los pone en
   * `courseModule.overview`.
   */
  readonly overview: LessonBlock[];
  readonly gaps: Gap[];
}

/**
 * `skillCodesByIndex` asigna skills por posición. Si llegan más acordeones que
 * entradas, LANZA: significa que alguien añadió un tema al trainer y la
 * taxonomía no lo cubre — situación que debe verse en CI, no en producción.
 */
export function lessonsFromAccordions(
  html: string,
  opts: {
    readonly locale: Locale;
    readonly file: string;
    readonly sectionId: string;
    readonly skillCodesByIndex: readonly (readonly string[])[];
    readonly estimatedMinutes?: number;
  },
): AccordionLessonsResult {
  const section = sliceElementById(html, opts.sectionId);
  if (section === null) throw new Error(`no se encontró <… id="${opts.sectionId}"> en ${opts.file}`);

  const topics = sliceElementsByClass(section, "topic");
  if (topics.length === 0) throw new Error(`no hay acordeones .topic en #${opts.sectionId}`);

  const gaps: Gap[] = [];
  const lessons = topics.map((topicInner, i) => {
    const button = firstElementInner(topicInner, "button");
    const body = firstClassInner(topicInner, "body");
    if (body === null) throw new Error(`el acordeón ${i} de ${opts.file} no tiene .body`);

    const title = button === null ? `${i + 1}` : titleFromButton(button);
    if (title === "") throw new Error(`el acordeón ${i} de ${opts.file} no tiene título`);

    const source: SourceRef = {
      file: opts.file,
      symbol: `#${opts.sectionId} .topic`,
      index: i,
    };
    const { blocks, unmapped } = extractBlocks(body, opts.locale, source, [
      "lesson",
      opts.file,
      i,
    ]);
    if (blocks.length === 0) throw new Error(`el acordeón ${i} de ${opts.file} no produjo bloques`);
    for (const tag of unmapped) {
      gaps.push({
        area: `lección "${title}"`,
        symbol: `#${opts.sectionId} .topic`,
        reason: `elemento ${tag} sin mapeo a block_kind`,
      });
    }

    const skillCodes = opts.skillCodesByIndex[i];
    if (skillCodes === undefined) {
      throw new Error(
        `el acordeón ${i} ("${title}") de ${opts.file} no tiene skills asignados en la taxonomía`,
      );
    }

    return {
      id: stableId("lesson", opts.file, i),
      ord: i,
      // `title` ya viene escapado por `titleFromButton`: NO se re-sanea.
      title: opts.locale === "es" ? { es: title } : { en: title },
      estimatedMinutes: opts.estimatedMinutes ?? 20,
      skillCodes: [...skillCodes],
      blocks,
      source,
    };
  });

  // Todo lo de la sección salvo los acordeones. Se recorta por sustracción para
  // que un contenedor nuevo que alguien añada mañana aparezca aquí en vez de
  // desaparecer.
  let rest = section;
  for (const t of topics) rest = rest.replace(t, "");
  const overviewSource: SourceRef = {
    file: opts.file,
    symbol: `#${opts.sectionId} (fuera de .topic)`,
  };
  const overview = extractBlocks(rest, opts.locale, overviewSource, [
    "overview",
    opts.file,
    opts.sectionId,
  ]);
  for (const tag of overview.unmapped) {
    gaps.push({
      area: `introducción de #${opts.sectionId}`,
      symbol: overviewSource.symbol,
      reason: `elemento ${tag} sin mapeo a block_kind`,
    });
  }

  return { lessons, overview: overview.blocks, gaps };
}

function firstElementInner(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = findClosingTag(html, tag, start);
  return end === -1 ? null : html.slice(start, end);
}

function firstClassInner(html: string, className: string): string | null {
  const found = sliceElementsByClass(html, className);
  return found[0] ?? null;
}

/**
 * Bloques del panel indicado, para las materias cuyas lecciones vienen de un
 * array JS (Math, Science, Socials, ICT). En esas, el HTML de `#learn` contiene
 * solo la tarjeta de introducción y un contenedor vacío que el trainer rellena
 * en tiempo de ejecución — así que lo que queda aquí es exactamente el
 * contenido que ningún otro extractor recoge.
 */
export function overviewFromSection(
  html: string,
  opts: { readonly locale: Locale; readonly file: string; readonly sectionId: string },
): LessonBlock[] {
  const section = sliceElementById(html, opts.sectionId);
  if (section === null) return [];
  const source: SourceRef = {
    file: opts.file,
    symbol: `#${opts.sectionId} (introducción)`,
  };
  return extractBlocks(section, opts.locale, source, ["overview", opts.file, opts.sectionId]).blocks;
}
