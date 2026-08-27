/**
 * Bancos de preguntas de Y6A -> preguntas con `answer_spec`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Las seis materias escriben "la misma" estructura de tres formas distintas:
 *
 *   English / Español   var BANK=[{c:"ps", q, o:[...], a:1, e:"..."}]
 *   Science             var BANK=[{t:'acid', q, o:[...], a:0, e:'...', h:'pista'}]
 *   Socials / ICT       var Q={ amz:[{q, o:[...], a:1, e:'...'}], ... }
 *
 * La clave de categoría es `c` en unas, `t` en otras, y en Socials/ICT es la
 * clave del objeto contenedor. Este módulo tolera las tres y normaliza a una
 * sola forma. La tolerancia acaba ahí: si a una entrada le falta `q`, `o` o `a`,
 * o si `a` no apunta a una opción existente, LANZA. Una pregunta con la clave
 * mal es peor que una pregunta que falta.
 */

import type { I18nText, Locale } from "@cet/shared";
import type { JsValue } from "../js-literal.ts";
import { sanitizeHtml, sanitizeToText } from "../sanitize.ts";
import { stableId } from "../ids.ts";
import type { Question, SourceRef } from "../schema.ts";

export class BankEntryError extends Error {
  constructor(symbol: string, index: number, detail: string) {
    super(`${symbol}[${index}]: ${detail}`);
    this.name = "BankEntryError";
  }
}

/** Entrada de banco ya normalizada, antes de convertirse en `Question`. */
export interface NormalizedEntry {
  readonly category: string;
  readonly stem: string;
  readonly options: readonly string[];
  readonly answerIndex: number;
  readonly explanation?: string;
  readonly hint?: string;
  /** Figura del enunciado (`img` en el banco de Science). */
  readonly figure?: string;
  readonly symbol: string;
  readonly index: number;
}

/**
 * Normaliza un array de banco. `categoryKey` dice dónde buscar la categoría:
 * `"c"`, `"t"` o `{fixed: "amz"}` cuando viene de la clave del objeto padre.
 */
export function normalizeBank(
  entries: readonly JsValue[],
  symbol: string,
  categorySource: "c" | "t" | { readonly fixed: string },
  indexOffset = 0,
): NormalizedEntry[] {
  return entries.map((raw, i) => {
    const index = i + indexOffset;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BankEntryError(symbol, index, "la entrada no es un objeto");
    }
    const e = raw as Record<string, JsValue>;

    const category =
      typeof categorySource === "object"
        ? categorySource.fixed
        : readString(e[categorySource], symbol, index, `clave de categoría \`${categorySource}\``);

    const stem = readString(e["q"], symbol, index, "enunciado `q`");

    const rawOptions = e["o"];
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
      throw new BankEntryError(symbol, index, "`o` debe ser un array de 2 o más opciones");
    }
    const options = rawOptions.map((o, j) => {
      if (typeof o !== "string" && typeof o !== "number") {
        throw new BankEntryError(symbol, index, `la opción ${j} no es texto`);
      }
      return String(o);
    });

    const answerIndex = e["a"];
    if (typeof answerIndex !== "number" || !Number.isInteger(answerIndex)) {
      throw new BankEntryError(symbol, index, "`a` debe ser el índice entero de la respuesta");
    }
    if (answerIndex < 0 || answerIndex >= options.length) {
      throw new BankEntryError(
        symbol,
        index,
        `\`a\`=${answerIndex} fuera de rango (hay ${options.length} opciones)`,
      );
    }

    // Dos opciones idénticas hacen que "la respuesta correcta" sea ambigua en
    // cuanto la UI baraja: hay dos botones indistinguibles y solo uno puntúa.
    const seen = new Map<string, number>();
    for (const [j, opt] of options.entries()) {
      const key = sanitizeToText(opt).toLowerCase();
      const prev = seen.get(key);
      if (prev !== undefined) {
        throw new BankEntryError(symbol, index, `opciones ${prev} y ${j} son idénticas: "${key}"`);
      }
      seen.set(key, j);
    }

    const explanation = optionalString(e["e"]);
    const hint = optionalString(e["h"]);
    const figure = optionalString(e["img"]);

    return {
      category,
      stem,
      options,
      answerIndex,
      ...(explanation !== undefined ? { explanation } : {}),
      ...(hint !== undefined ? { hint } : {}),
      ...(figure !== undefined ? { figure } : {}),
      symbol,
      index,
    };
  });
}

function readString(v: JsValue | undefined, symbol: string, index: number, what: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new BankEntryError(symbol, index, `falta ${what}`);
  }
  return v;
}

function optionalString(v: JsValue | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return undefined;
  return v.trim() === "" ? undefined : v;
}

/* -------------------------------------------------------------------------- */

export interface ToQuestionOptions {
  readonly locale: Locale;
  readonly file: string;
  /** categoría de Y6A -> código de skill del pack. */
  readonly skillOf: (category: string) => string;
  readonly difficulty?: number;
}

/**
 * Convierte una entrada normalizada en una `Question` estática del pack.
 *
 * Formato: `true_false` cuando las dos opciones son exactamente verdadero/falso
 * (ICT tiene varias), `mcq_single` en el resto. Distinguirlo importa porque la
 * UI de una verdadero/falso no debe barajar opciones.
 */
export function toStaticQuestion(entry: NormalizedEntry, opts: ToQuestionOptions): Question {
  // La figura va DENTRO del enunciado: separarla obligaría a un campo nuevo en
  // `body` que ni la UI ni el motor esperan. El saneador la limpia igual.
  const stem = sanitizeHtml(
    entry.figure === undefined ? entry.stem : `${entry.stem}<br>${entry.figure}`,
  );
  const options = entry.options.map((html, i) => ({
    id: `o${i + 1}`,
    html: i18n(opts.locale, sanitizeHtml(html)),
  }));
  const correctId = `o${entry.answerIndex + 1}`;

  const plain = entry.options.map((o) => sanitizeToText(o).toLowerCase());
  const isTrueFalse =
    plain.length === 2 &&
    ((plain[0] === "true" && plain[1] === "false") ||
      (plain[0] === "false" && plain[1] === "true") ||
      (plain[0] === "verdadero" && plain[1] === "falso") ||
      (plain[0] === "falso" && plain[1] === "verdadero"));

  const source: SourceRef = { file: opts.file, symbol: entry.symbol, index: entry.index };
  const skillCode = opts.skillOf(entry.category);

  const solution = entry.explanation !== undefined ? sanitizeHtml(entry.explanation) : undefined;
  const hint = entry.hint !== undefined ? sanitizeHtml(entry.hint) : undefined;

  return {
    kind: "static",
    // El id se deriva de (fichero, símbolo, índice): reordenar el banco cambia
    // los ids, corregir una errata no.
    id: stableId("question", opts.file, entry.symbol, entry.index),
    skillCode,
    format: isTrueFalse ? "true_false" : "mcq_single",
    locale: opts.locale,
    body: { stem: i18n(opts.locale, stem), options },
    answerSpec: { type: "choice", correctIds: [correctId] },
    ...(hint !== undefined ? { hint: i18n(opts.locale, hint) } : {}),
    ...(solution !== undefined ? { solution: i18n(opts.locale, solution) } : {}),
    difficulty: opts.difficulty ?? 2,
    maxPoints: 1,
    gradingMode: "auto",
    tags: [`y6a:${entry.category}`],
    source,
  };
}

function i18n(locale: Locale, text: string): I18nText {
  return locale === "es" ? { es: text } : { en: text };
}
