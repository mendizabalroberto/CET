/**
 * Planes de estudio -> `StudyPlan`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Dos formas, y la diferencia importa:
 *
 *   Español   PLAN=[["Día 1 · …", ["tarea", "tarea"]]]     título + array
 *   English   PLAN=[["Day 1 · …", "tarea", "tarea"]]       título + resto plano
 *
 * Y las otras cuatro materias no tienen `PLAN` en absoluto: su plan es una
 * `<table class="t">` estática en la pestaña Study Plan, con columnas
 * Día | Qué hacer | Objetivo. Se extrae igualmente, porque es contenido
 * pedagógico real y dejarlo fuera sería perderlo.
 */

import type { I18nText, Locale } from "@cet/shared";
import type { JsValue } from "../js-literal.ts";
import { sanitizeHtml, sanitizeToText } from "../sanitize.ts";
import { stableId } from "../ids.ts";
import type { SourceRef, StudyPlan } from "../schema.ts";
import { extractBlocks, topLevelNodes } from "./blocks.ts";
import { findClosingTag } from "./html.ts";

function i18n(locale: Locale, text: string): I18nText {
  return locale === "es" ? { es: text } : { en: text };
}

/** `PLAN[]` en cualquiera de sus dos formas. */
export function planFromArray(
  plan: readonly JsValue[],
  opts: { readonly locale: Locale; readonly title: string; readonly source: SourceRef },
): StudyPlan {
  const days = plan.map((raw, i) => {
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new Error(`PLAN[${i}] debe ser [título, ...tareas]`);
    }
    const [head, ...rest] = raw;
    if (typeof head !== "string") throw new Error(`PLAN[${i}][0] no es el título`);

    // Forma anidada (Español) frente a forma plana (English).
    const rawTasks: JsValue[] =
      rest.length === 1 && Array.isArray(rest[0]) ? (rest[0]) : rest;
    if (rawTasks.length === 0) throw new Error(`PLAN[${i}] no tiene tareas`);

    const tasks = rawTasks.map((t, j) => {
      if (typeof t !== "string" || t.trim() === "") {
        throw new Error(`PLAN[${i}] tarea ${j} no es texto`);
      }
      return { ord: j, text: i18n(opts.locale, sanitizeHtml(t)) };
    });

    return {
      id: stableId("plan-day", opts.source.file, i),
      ord: i,
      title: i18n(opts.locale, sanitizeHtml(head)),
      tasks,
    };
  });

  if (days.length === 0) throw new Error("PLAN vacío");

  return {
    id: stableId("plan", opts.source.file),
    title: i18n(opts.locale, opts.title),
    days,
    notes: [],
    source: opts.source,
  };
}

/**
 * Plan en tabla estática (Math, Science, Socials, ICT).
 * Columnas esperadas: Día | Qué hacer | Objetivo. La tercera es opcional.
 * El resto del panel (listas de "las marcas que se pierden", consejos) se
 * conserva como `notes`, que son `lesson_blocks` normales.
 */
export function planFromPanel(
  panelHtml: string,
  opts: { readonly locale: Locale; readonly title: string; readonly source: SourceRef },
): StudyPlan {
  const table = firstTable(panelHtml);
  if (table === null) throw new Error(`no hay <table class="t"> en el panel de plan`);

  const rows: { cells: string[] }[] = [];
  for (const node of topLevelNodes(table.inner)) {
    if (node.kind !== "element") continue;
    const trs = node.tag === "tr" ? [node] : node.tag === "tbody" || node.tag === "thead" ? rowsOf(node.inner) : [];
    for (const tr of trs) {
      const cells = topLevelNodes(tr.inner)
        .flatMap((c) => (c.kind === "element" && (c.tag === "td" || c.tag === "th") ? [c] : []))
        .map((c) => ({ isHeader: c.tag === "th", html: c.inner }));
      if (cells.length >= 2 && !cells.every((c) => c.isHeader)) {
        rows.push({ cells: cells.map((c) => c.html) });
      }
    }
  }
  if (rows.length === 0) throw new Error("la tabla del plan no tiene filas de datos");

  const days = rows.map((row, i) => {
    const dayLabel = sanitizeToText(row.cells[0] ?? "") || String(i + 1);
    const body = sanitizeHtml(row.cells[1] ?? "");
    const target = row.cells[2] !== undefined ? sanitizeHtml(row.cells[2]) : undefined;
    const isEs = opts.locale === "es";
    const title = /^\d+$/.test(dayLabel) ? `${isEs ? "Día" : "Day"} ${dayLabel}` : dayLabel;
    return {
      id: stableId("plan-day", opts.source.file, i),
      ord: i,
      title: i18n(opts.locale, title),
      tasks: [
        {
          ord: 0,
          text: i18n(opts.locale, body),
          ...(target !== undefined && sanitizeToText(target) !== ""
            ? { target: i18n(opts.locale, target) }
            : {}),
        },
      ],
    };
  });

  // Todo lo del panel salvo la tabla del plan: consejos, listas de errores.
  const rest = panelHtml.slice(0, table.start) + panelHtml.slice(table.end);
  const { blocks } = extractBlocks(rest, opts.locale, opts.source, [
    "plan-notes",
    opts.source.file,
  ]);

  return {
    id: stableId("plan", opts.source.file),
    title: i18n(opts.locale, opts.title),
    days,
    notes: blocks,
    source: opts.source,
  };
}

function rowsOf(html: string): { tag: string; inner: string }[] {
  return topLevelNodes(html).flatMap((n) =>
    n.kind === "element" && n.tag === "tr" ? [{ tag: n.tag, inner: n.inner }] : [],
  );
}

function firstTable(html: string): { inner: string; start: number; end: number } | null {
  const re = /<table\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const cm = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (!cm || !cm[1]!.split(/\s+/).includes("t")) continue;
    const bodyStart = m.index + m[0].length;
    const closeAt = findClosingTag(html, "table", bodyStart);
    if (closeAt === -1) return null;
    return { inner: html.slice(bodyStart, closeAt), start: m.index, end: closeAt + "</table>".length };
  }
  return null;
}
