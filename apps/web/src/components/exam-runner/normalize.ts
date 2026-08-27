/**
 * Normalización tolerante de la respuesta del servidor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 * El motor de servidor lo escribe otra vía en paralelo. Postgres devuelve
 * `snake_case`, la capa HTTP puede devolver `camelCase`, y un `format` puede
 * faltar sencillamente porque la vista `attempt_items_student` de DATA_MODEL §9
 * no lo incluye. Ninguna de esas tres cosas puede dejar a un niño delante de una
 * pantalla en blanco a mitad de un examen.
 *
 * Regla: aceptar ambas formas, inferir lo inferible, y NUNCA inventar nada que
 * puntúe. Si un ítem es irrecuperable, se descarta con un aviso y el examen
 * sigue con los demás: perder una pregunta es malo, perder el examen entero por
 * una pregunta rota es peor.
 *
 * Este módulo es puro: no toca red, ni DOM, ni relojes. Por eso se testea solo.
 */
import type { FeedbackMode, QuestionFormat, RenderedBody, StudentResponse } from "@cet/shared";

import type {
  AttemptItemStudent,
  AttemptResult,
  AttemptResultItem,
  StartAttemptResponse,
} from "./types";

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lee la primera clave presente. Cubre `camelCase` y `snake_case` a la vez. */
function pick(raw: Raw, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Postgres devuelve `numeric` como cadena a través de PostgREST. Ignorarlo
  // convertiría `max_points` en NaN y la nota máxima del examen en "NaN / NaN".
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

const FORMATS: readonly QuestionFormat[] = [
  "mcq_single",
  "mcq_multi",
  "true_false",
  "numeric",
  "fraction",
  "short_text",
  "long_text",
  "cloze",
  "ordering",
  "matching",
  "drag_drop",
  "hotspot",
];

const FEEDBACK_MODES: readonly FeedbackMode[] = ["never", "after_submit", "immediate"];

/**
 * Modo de feedback. **El desconocido cae a `never`**, no a `after_submit`.
 * Es la única elección segura: si no sabemos si el colegio permite enseñar las
 * soluciones, no se enseñan. Un fallo abierto aquí filtra respuestas correctas.
 */
export function normalizeFeedbackMode(value: unknown): FeedbackMode {
  return FEEDBACK_MODES.find((m) => m === value) ?? "never";
}

/**
 * Infiere el formato cuando el servidor no lo manda.
 *
 * Es un apaño explícito, no una fuente de verdad: solo distingue lo que se puede
 * distinguir mirando el enunciado renderizado. `fraction`, `ordering` y
 * `matching` NO son inferibles a partir de `RenderedBody`, así que caen a
 * `short_text`, que es el input que acepta cualquier cosa y no impide responder.
 * Un input equivocado se corrige; una pregunta que no se puede contestar, no.
 */
export function inferFormat(body: RenderedBody): QuestionFormat {
  const options = body.options;
  if (options && options.length > 0) {
    const looksBoolean =
      options.length === 2 &&
      options.every((o) => /^(true|false|verdadero|falso)$/i.test(o.html.trim()));
    return looksBoolean ? "true_false" : "mcq_single";
  }
  if (body.unit !== undefined) return "numeric";
  return "short_text";
}

function normalizeRenderedBody(value: unknown): RenderedBody | null {
  if (!isRecord(value)) return null;
  const stem = asString(pick(value, "stem"));
  if (!stem) return null;

  const rawOptions = pick(value, "options");
  const options: { id: string; html: string }[] = [];
  if (Array.isArray(rawOptions)) {
    for (const [index, entry] of rawOptions.entries()) {
      if (!isRecord(entry)) continue;
      const html = asString(pick(entry, "html", "text", "label"));
      if (html === null) continue;
      // Un id ausente se sustituye por la posición. Sin id, `ChoiceList` no
      // puede reportar QUÉ eligió el alumno, y eso rompe la reconstrucción
      // forense del intento. El servidor debería mandarlo siempre.
      options.push({ id: asString(pick(entry, "id")) ?? String(index), html });
    }
  }

  const figureSvg = asString(pick(value, "figureSvg", "figure_svg"));
  const figureAltRaw = pick(value, "figureAlt", "figure_alt");
  const unit = asString(pick(value, "unit"));
  const placeholder = asString(pick(value, "placeholder"));

  // `exactOptionalPropertyTypes` está activo: una clave presente con `undefined`
  // NO es lo mismo que una clave ausente. Se construye por asignación condicional.
  const body: {
    stem: string;
    options?: { id: string; html: string }[];
    figureSvg?: string;
    figureAlt?: { es?: string; en?: string };
    unit?: string;
    placeholder?: string;
  } = { stem };

  if (options.length > 0) body.options = options;
  if (figureSvg !== null) body.figureSvg = figureSvg;
  if (isRecord(figureAltRaw)) {
    const es = asString(figureAltRaw["es"]);
    const en = asString(figureAltRaw["en"]);
    if (es !== null || en !== null) {
      body.figureAlt = {
        ...(es !== null ? { es } : {}),
        ...(en !== null ? { en } : {}),
      };
    }
  }
  if (unit !== null) body.unit = unit;
  if (placeholder !== null) body.placeholder = placeholder;

  return body as RenderedBody;
}

/**
 * Respuesta del alumno. Lo que no encaje con el contrato se trata como
 * **ausente**, nunca como una respuesta a medias: `gradeUnknown()` en el
 * servidor hace lo mismo, y las dos rutas tienen que coincidir.
 */
export function normalizeStudentResponse(value: unknown): StudentResponse | null {
  if (!isRecord(value)) return null;
  const type = asString(pick(value, "type"));

  switch (type) {
    case "choice": {
      const ids = pick(value, "selectedIds", "selected_ids");
      if (!Array.isArray(ids)) return null;
      const selectedIds = ids.filter((id): id is string => typeof id === "string");
      return { type: "choice", selectedIds };
    }
    case "text": {
      const text = pick(value, "value");
      return typeof text === "string" ? { type: "text", value: text } : null;
    }
    case "ordering": {
      const order = pick(value, "order");
      if (!Array.isArray(order)) return null;
      return { type: "ordering", order: order.filter((o): o is string => typeof o === "string") };
    }
    case "matching": {
      const pairs = pick(value, "pairs");
      if (!Array.isArray(pairs)) return null;
      const clean: [string, string][] = [];
      for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [left, right] = pair;
        if (typeof left === "string" && typeof right === "string") clean.push([left, right]);
      }
      return { type: "matching", pairs: clean };
    }
    case "empty":
      return { type: "empty" };
    default:
      return null;
  }
}

/** `null` si el ítem no es utilizable. El llamante lo descarta y sigue. */
export function normalizeAttemptItem(value: unknown, fallbackOrd: number): AttemptItemStudent | null {
  if (!isRecord(value)) return null;

  const id = asString(pick(value, "id", "attemptItemId", "attempt_item_id"));
  if (!id) return null;

  const body = normalizeRenderedBody(pick(value, "renderedBody", "rendered_body", "body"));
  if (!body) return null;

  const rawFormat = pick(value, "format", "questionFormat", "question_format");
  const format = FORMATS.find((f) => f === rawFormat) ?? inferFormat(body);

  return {
    id,
    ord: asNumber(pick(value, "ord")) ?? fallbackOrd,
    sectionOrd: asNumber(pick(value, "sectionOrd", "section_ord")),
    questionId: asString(pick(value, "questionId", "question_id")),
    questionVersionId: asString(pick(value, "questionVersionId", "question_version_id")),
    renderedBody: body,
    skillId: asString(pick(value, "skillId", "skill_id")),
    difficulty: asNumber(pick(value, "difficulty")),
    maxPoints: asNumber(pick(value, "maxPoints", "max_points")) ?? 1,
    format,
    savedResponse: normalizeStudentResponse(
      pick(value, "savedResponse", "saved_response", "response", "lastResponse", "last_response"),
    ),
    savedRevision: asNumber(pick(value, "savedRevision", "saved_revision", "revision")),
    matchLeft: normalizeSides(pick(value, "matchLeft", "match_left", "left")),
    matchRight: normalizeSides(pick(value, "matchRight", "match_right", "right")),
  };
}

/** Columnas de un `matching`. Ver el hueco de contrato H-3 en REVIEW.md. */
function normalizeSides(value: unknown): { id: string; html: string }[] | null {
  if (!Array.isArray(value)) return null;
  const sides: { id: string; html: string }[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) continue;
    const html = asString(pick(entry, "html", "text", "label"));
    if (html === null) continue;
    sides.push({ id: asString(pick(entry, "id")) ?? String(index), html });
  }
  return sides.length > 0 ? sides : null;
}

export function normalizeStartResponse(value: unknown): StartAttemptResponse | null {
  if (!isRecord(value)) return null;

  const attemptId = asString(pick(value, "attemptId", "attempt_id", "id"));
  const serverDeadlineAt = asString(pick(value, "serverDeadlineAt", "server_deadline_at"));
  const serverNow = asString(pick(value, "serverNow", "server_now", "serverNowAt"));
  if (!attemptId || !serverDeadlineAt || !serverNow) return null;

  const rawItems = pick(value, "items");
  const items: AttemptItemStudent[] = [];
  if (Array.isArray(rawItems)) {
    for (const [index, raw] of rawItems.entries()) {
      const item = normalizeAttemptItem(raw, index + 1);
      if (item) items.push(item);
    }
  }
  // El orden lo manda `ord`, no el orden del array: si el servidor cambia la
  // consulta y deja de ordenar, el alumno vería las preguntas barajadas
  // respecto de lo que quedó grabado en `attempt_items`, y la reconstrucción
  // forense diría otra cosa que la pantalla.
  items.sort((a, b) => a.ord - b.ord);

  return {
    attemptId,
    items,
    serverDeadlineAt,
    serverNow,
    allowBack: asBoolean(pick(value, "allowBack", "allow_back"), true),
    feedbackMode: normalizeFeedbackMode(pick(value, "feedbackMode", "feedback_mode")),
    resumed: asBoolean(pick(value, "resumed", "isResumed"), false),
  };
}

function normalizeResultItem(value: unknown, fallbackOrd: number): AttemptResultItem | null {
  if (!isRecord(value)) return null;
  const attemptItemId = asString(pick(value, "attemptItemId", "attempt_item_id", "id"));
  if (!attemptItemId) return null;

  const isCorrectRaw = pick(value, "isCorrect", "is_correct");
  return {
    attemptItemId,
    ord: asNumber(pick(value, "ord")) ?? fallbackOrd,
    isCorrect: typeof isCorrectRaw === "boolean" ? isCorrectRaw : null,
    pointsAwarded: asNumber(pick(value, "pointsAwarded", "points_awarded")) ?? 0,
    maxPoints: asNumber(pick(value, "maxPoints", "max_points")) ?? 1,
    correctAnswer: asString(pick(value, "correctAnswer", "correct_answer", "canonical")),
    response: normalizeStudentResponse(pick(value, "response", "studentResponse")),
    rationale: asString(pick(value, "rationale")),
  };
}

/**
 * Resultado del intento.
 *
 * FORMA REAL DEL SERVIDOR (`AttemptResultPayload` en `src/lib/exam/types.ts`):
 * la nota viene ANIDADA en `score` (`null` mientras no esté corregido) y la
 * revisión se llama `review`, no `items`. Se aceptan también las dos formas
 * planas por si el contrato se mueve; lo que no se acepta es fallar en
 * silencio y enseñarle "0 / 0" a un niño que ha sacado un 18.
 */
export function normalizeResult(value: unknown): AttemptResult | null {
  if (!isRecord(value)) return null;

  const status = asString(pick(value, "status"));
  if (!status) return null;

  const feedbackMode = normalizeFeedbackMode(pick(value, "feedbackMode", "feedback_mode"));

  const score = isRecord(pick(value, "score")) ? (pick(value, "score") as Raw) : null;
  const scoreRaw = asNumber(score ? pick(score, "scoreRaw", "score_raw") : pick(value, "scoreRaw", "score_raw"));
  const scoreMax = asNumber(score ? pick(score, "scoreMax", "score_max") : pick(value, "scoreMax", "score_max"));
  const scorePct = asNumber(score ? pick(score, "scorePct", "score_pct") : pick(value, "scorePct", "score_pct"));
  const passedRaw = score ? pick(score, "passed") : pick(value, "passed");

  const rawItems = pick(value, "review", "items");
  let items: AttemptResultItem[] | null = null;
  if (Array.isArray(rawItems)) {
    items = [];
    for (const [index, raw] of rawItems.entries()) {
      const item = normalizeResultItem(raw, index + 1);
      if (item) items.push(item);
    }
    items.sort((a, b) => a.ord - b.ord);
  }

  return {
    status: status as AttemptResult["status"],
    attemptId: asString(pick(value, "attemptId", "attempt_id")),
    scoreRaw,
    scoreMax,
    scorePct,
    passed: typeof passedRaw === "boolean" ? passedRaw : null,
    feedbackMode,
    items,
  };
}
