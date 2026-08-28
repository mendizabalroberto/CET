/**
 * Verificación de candidatos: la puerta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Un agente propone un bloque o una pregunta y jura haberlo sacado de un sitio.
 * Aquí se comprueba el juramento, y se comprueba **por código de salida**, no
 * leyendo la prosa con la que lo acompaña.
 *
 * Cuatro comprobaciones, en orden de coste:
 *
 *   1. FORMA      el payload valida contra el Zod del pack.
 *   2. SKILL      el `skillCode` existe en la taxonomía del curso.
 *   3. CITA       cada cita está contenida LITERALMENTE en el span que señala.
 *   4. RESPUESTA  la respuesta correcta aparece en lo citado.
 *
 * La cuarta es la que importa y la que casi nadie pone. Sin ella, un agente
 * puede citar impecablemente el párrafo correcto y aun así marcar mal la
 * respuesta: la cita existe, la pregunta miente. Es la versión en contenido del
 * test verde que pasa por el motivo equivocado, y ocurrió siete veces en un
 * solo día en el código de este mismo repositorio.
 */

import { lessonBlock, question } from "../schema.ts";
import { normalizeForQuote, type SourceSpan } from "./spans.ts";

export interface Citation {
  /** Posición del span dentro de su documento. Es la clave natural en fichero. */
  spanOrd: number;
  /** El trozo que el agente dice haber copiado. */
  quote: string;
}

export interface CandidateInput {
  kind: "lesson_block" | "question";
  payload: unknown;
  citations: Citation[];
}

export interface VerifyFailure {
  /** Código estable: sirve para contar por qué se cae un lote sin leer prosa. */
  code:
    | "schema"
    | "no_citations"
    | "span_missing"
    | "quote_not_literal"
    | "answer_not_cited"
    | "unknown_skill";
  detail: string;
}

export interface VerifyReport {
  ok: boolean;
  failures: VerifyFailure[];
}

/**
 * Marcadores de casilla y viñeta que una hoja de ejercicios pone delante de
 * cada opción. No son texto: son el hueco donde el alumno marca.
 *
 * La primera versión metía `a-d` en una clase de caracteres para cazar el
 * "a)" de una lista — y se comía la "c" de "conductors". Por eso la letra de
 * enumeración va aparte y EXIGE su punto o paréntesis detrás: sin separador no
 * es una enumeración, es una palabra.
 */
const MARCADORES = /^\s*[☐☑☒□○●•·*–—-]?\s*(?:[a-z][.)]\s+)?/iu;

/** Texto plano de un HTML de opción o enunciado. La cita es de texto, no de marcado. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/** Todas las variantes de idioma de un I18nText, como cadenas planas. */
function i18nValues(v: unknown): string[] {
  if (v === null || typeof v !== "object") return [];
  return Object.values(v as Record<string, unknown>)
    .filter((x): x is string => typeof x === "string")
    .map(stripHtml);
}

/**
 * Qué texto tiene que estar citado para que la respuesta no sea una invención.
 *
 * Para una pregunta de opción: el texto de CADA opción correcta. Para una de
 * respuesta escrita o numérica: la respuesta misma. Si el formato no declara
 * una respuesta en texto (emparejar, ordenar), devuelve vacío y la comprobación
 * 4 no aplica — decirlo aquí es más honesto que fingir que se comprobó.
 */
function answerTexts(payload: Record<string, unknown>): string[][] {
  const spec = payload.answerSpec as Record<string, unknown> | undefined;
  const body = payload.body as Record<string, unknown> | undefined;
  if (!spec || !body) return [];

  if (spec.type === "choice" && Array.isArray(spec.correctIds) && Array.isArray(body.options)) {
    const correct = new Set(spec.correctIds as unknown[]);
    return (body.options as Record<string, unknown>[])
      .filter((o) => correct.has(o.id))
      // Cada opción correcta es su propia exigencia: en una de respuesta
      // múltiple las dos tienen que estar sostenidas por el material.
      .map((o) => i18nValues(o.html));
  }
  if (spec.type === "text" && Array.isArray(spec.accepted)) {
    // Basta con que UNA de las formas aceptadas esté citada: son sinónimos de
    // la misma respuesta, no varias respuestas que haya que documentar todas.
    const accepted = spec.accepted.filter((a): a is string => typeof a === "string");
    return accepted.length > 0 ? [accepted] : [];
  }
  if (spec.type === "numeric" || spec.type === "fraction") {
    return typeof spec.canonical === "string" ? [[spec.canonical]] : [];
  }
  return [];
}

/**
 * Verifica un candidato contra los spans de su documento.
 *
 * `spans` va indexado por `ord`, que es lo que el agente cita: pedirle un UUID
 * a un modelo es pedirle que lo invente.
 */
export function verifyCandidate(
  candidate: CandidateInput,
  spans: ReadonlyMap<number, SourceSpan>,
  knownSkillCodes: ReadonlySet<string>,
): VerifyReport {
  const failures: VerifyFailure[] = [];

  // 1 · FORMA
  const schema = candidate.kind === "question" ? question : lessonBlock;
  const parsed = schema.safeParse(candidate.payload);
  if (!parsed.success) {
    failures.push({
      code: "schema",
      detail: parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
        .join(" · "),
    });
    // Sin forma válida, el resto de comprobaciones hablarían de campos que no
    // existen. Se para aquí y se dice por qué.
    return { ok: false, failures };
  }

  const payload = candidate.payload as Record<string, unknown>;

  // 2 · SKILL
  if (candidate.kind === "question") {
    const code = payload.skillCode;
    if (typeof code !== "string" || !knownSkillCodes.has(code)) {
      failures.push({
        code: "unknown_skill",
        detail: `\`${String(code)}\` no está en la taxonomía del curso`,
      });
    }
  }

  // 3 · CITA
  if (candidate.citations.length === 0) {
    failures.push({ code: "no_citations", detail: "el candidato no cita ningún span" });
  }

  const citedText: string[] = [];
  for (const c of candidate.citations) {
    const span = spans.get(c.spanOrd);
    if (!span) {
      failures.push({ code: "span_missing", detail: `no existe el span ord=${c.spanOrd}` });
      continue;
    }
    const haystack = normalizeForQuote(span.text);
    const needle = normalizeForQuote(c.quote);
    if (!haystack.includes(needle)) {
      failures.push({
        code: "quote_not_literal",
        detail:
          `la cita al span ${c.spanOrd} no está en el original.\n` +
          `      cita:     «${needle.slice(0, 120)}»\n` +
          `      original: «${haystack.slice(0, 120)}»`,
      });
      continue;
    }
    citedText.push(haystack);
  }

  // 4 · RESPUESTA
  if (candidate.kind === "question") {
    const needed = answerTexts(payload);

    // Una hoja de ejercicios imprime sus opciones con la casilla en blanco:
    //
    //     [16] ☐ conductors
    //     [17] ☐ insulators
    //
    // Citar "☐ conductors" para justificar que la respuesta es "conductors" no
    // demuestra NADA: el documento enumera las dos opciones y no dice cual es.
    // Sin esta exclusion, la comprobacion 4 se satisface sola en cualquier
    // ejercicio con respuestas en blanco, y deja pasar preguntas cuya respuesta
    // sale del conocimiento del modelo. Es exactamente el fallo que esta
    // comprobacion existia para impedir, escondido un nivel mas abajo.
    const opciones = new Set(
      ((payload.body as { options?: Record<string, unknown>[] } | undefined)?.options ?? [])
        .flatMap((o) => i18nValues(o["html"]))
        .map((t) => normalizeForQuote(t)),
    );
    const esOpcionImpresa = (texto: string): boolean => {
      const limpio = normalizeForQuote(texto.replace(MARCADORES, ""));
      // Caso 1: el span ES una opcion suelta ("☐ conductors").
      if (opciones.has(limpio)) return true;
      // Caso 2: el span enumera VARIAS opciones en una linea, que es como lo
      // imprime un examen: "a) 0.256 b) 2.56 c) 0.0256 d) 25,600". Contiene la
      // respuesta correcta, si — y tambien las tres falsas. Una linea que
      // contiene dos o mas de las opciones no afirma cual es la buena: las
      // enumera. Sin este caso, cualquier examen SIN RESOLVER justifica todas
      // sus propias respuestas.
      let cuantas = 0;
      for (const o of opciones) if (o !== "" && limpio.includes(o)) cuantas += 1;
      return cuantas >= 2;
    };

    const cited = citedText.filter((t) => !esOpcionImpresa(t)).join(String.fromCharCode(10));
    for (const group of needed) {
      // Un grupo = una respuesta. Sus miembros son formas alternativas de la
      // misma: basta con que UNA esté citada.
      const forms = group.map(normalizeForQuote).filter((f) => f !== "");
      if (forms.length > 0 && !forms.some((f) => cited.includes(f))) {
        failures.push({
          code: "answer_not_cited",
          detail: `la respuesta correcta «${(forms[0] ?? "").slice(0, 80)}» no aparece en lo citado`,
        });
      }
    }
  }

  return { ok: failures.length === 0, failures };
}
