/**
 * Libreria de fracciones portada de los trainers Y6A (bloque TINY FRACTION LIBRARY).
 *
 * Cambios respecto del original, todos deliberados:
 *   - `parseAnswer` (el `parseAns` de Y6A) NUNCA lanza: devuelve null ante basura.
 *   - Se rechazan magnitudes fuera del entero seguro: 999999999999999999999/7 no
 *     puede "casi" funcionar, tiene que fallar limpio.
 *   - Se acepta la coma decimal ("1,75") porque la plataforma es es/en (AD-7),
 *     y el separador de miles que produce nf() ("1,234.5").
 *   - `isSimplest` tambien mira la parte fraccionaria de un numero mixto:
 *     "1 6/8" ya no cuela como simplificado (en Y6A si colaba).
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { EngineError } from "./errors.js";

export interface Frac {
  readonly n: number;
  readonly d: number;
}

/** Limite de magnitud aceptado en una entrada de alumno. Muy por encima de lo pedagogico. */
const MAX_MAGNITUDE = 1e15;
/** Decimales que se conservan al parsear. Mas alla es ruido. */
const MAX_DECIMALS = 12;
/** Longitud maxima de una respuesta parseable. Corta ataques de entrada gigante. */
const MAX_INPUT_LENGTH = 64;

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 1;
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

/** Constructor normalizado: signo siempre en el numerador, siempre reducida. */
export function frac(n: number, d = 1): Frac {
  if (!Number.isFinite(n) || !Number.isFinite(d)) {
    throw new EngineError("invalid_fraction", `frac(${String(n)}, ${String(d)}): no finito`);
  }
  if (d === 0) {
    throw new EngineError("invalid_fraction", "frac() con denominador 0");
  }
  let num = n;
  let den = d;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
}

export function fadd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function fsub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function fmul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

export function fdiv(a: Frac, b: Frac): Frac {
  if (b.n === 0) {
    throw new EngineError("division_by_zero", "fdiv() entre una fraccion de valor 0");
  }
  return frac(a.n * b.d, a.d * b.n);
}

export function fval(a: Frac): number {
  return a.n / a.d;
}

/** Igualdad exacta por productos cruzados, con salida segura si desbordan. */
export function feq(a: Frac, b: Frac): boolean {
  const left = a.n * b.d;
  const right = b.n * a.d;
  if (Number.isSafeInteger(left) && Number.isSafeInteger(right)) {
    return left === right;
  }
  return Math.abs(fval(a) - fval(b)) < 1e-9;
}

/** "3/4", "5" (cuando d === 1). El `fstr` de Y6A. */
export function fstr(a: Frac): string {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}

/** "1 3/4" para impropias. El `mixStr` de Y6A. */
export function mixStr(a: Frac): string {
  if (a.d === 1) return String(a.n);
  if (Math.abs(a.n) < a.d) return `${a.n}/${a.d}`;
  const whole = Math.floor(Math.abs(a.n) / a.d);
  const rest = Math.abs(a.n) % a.d;
  const sign = a.n < 0 ? "-" : "";
  return rest === 0 ? `${sign}${whole}` : `${sign}${whole} ${rest}/${a.d}`;
}

/** Comparacion numerica tolerante a la fuzz de coma flotante. El `eqNum` de Y6A. */
export function eqNum(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

function isSafeMagnitude(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_MAGNITUDE;
}

/**
 * Normaliza una entrada de alumno antes de parsearla.
 * Se hace aparte para poder testearla y para que el corrector numerico la reutilice.
 */
export function normalizeAnswerInput(raw: string): string {
  return raw
    .normalize("NFKC")
    // Menos unicode, guiones tipograficos y barra de fraccion -> ASCII.
    .replace(/[−‐‑‒–—―]/g, "-")
    .replace(/[⁄∕]/g, "/")
    // Cualquier especie de espacio (incluido NBSP) -> espacio normal.
    .replace(/[\s\u200B\uFEFF]+/g, " ")
    .trim();
}

/**
 * Resuelve la ambiguedad de los separadores.
 *
 * El problema es real, no teorico: en un examen en espanol la clave se MUESTRA
 * como "41.000 m" y el alumno la teclea tal cual. Leer "41.000" como 41 seria
 * marcar mal una respuesta correcta. En ingles pasa lo simetrico con "1,234".
 *
 * Como el corrector no conoce el idioma del examen (la firma `Grader` del
 * contrato solo recibe respuesta + clave), NO se adivina: se devuelven TODAS las
 * lecturas plausibles y el corrector acepta si alguna coincide con la clave.
 *
 *   "1,234"   -> [1234, 1.234]     (miles en ingles / decimal en espanol)
 *   "41.000"  -> [41000, 41]       (miles en espanol / decimal en ingles)
 *   "1,234.5" -> [1234.5]          (formato ingles completo, sin ambiguedad)
 *   "1.234,5" -> [1234.5]          (formato espanol completo, sin ambiguedad)
 *   "1,75"    -> [1.75]
 *   "1,2,3"   -> []                (ilegible: se rechaza en vez de inventar)
 */
function separatorReadings(s: string): string[] {
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (!hasComma && !hasDot) return [s];

  if (hasComma && hasDot) {
    if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) return [s.replace(/,/g, "")];
    if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) {
      return [s.replace(/\./g, "").replace(",", ".")];
    }
    return [];
  }

  const readings: string[] = [];
  if (hasComma) {
    if (/^-?\d{1,3}(?:,\d{3})+$/.test(s)) readings.push(s.replace(/,/g, ""));
    if ((s.match(/,/g) ?? []).length === 1) readings.push(s.replace(",", "."));
    return readings;
  }

  if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) readings.push(s.replace(/\./g, ""));
  readings.push(s);
  return readings;
}

const RE_MIXED = /^(-?\d+) (\d+)\s*\/\s*(\d+)$/;
const RE_FRACTION = /^(-?\d+)\s*\/\s*(-?\d+)$/;
const RE_DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Intenta una unica lectura ya desambiguada. null si no es un numero valido. */
function parseSingleReading(raw: string): Frac | null {
  const s = raw.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");

  const mixed = RE_MIXED.exec(s);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!isSafeMagnitude(whole) || !isSafeMagnitude(num) || !isSafeMagnitude(den)) return null;
    if (den === 0) return null;
    // Un mixto con parte fraccionaria impropia ("1 5/4") es notacion incorrecta,
    // pero se acepta su valor: el corrector decide si penaliza la forma.
    const total = whole < 0 ? whole * den - num : whole * den + num;
    if (!Number.isSafeInteger(total)) return null;
    return frac(total, den);
  }

  const fraction = RE_FRACTION.exec(s);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (!isSafeMagnitude(num) || !isSafeMagnitude(den)) return null;
    if (den === 0) return null;
    return frac(num, den);
  }

  if (RE_DECIMAL.test(s)) {
    const negative = s.startsWith("-");
    const body = negative ? s.slice(1) : s;
    const dot = body.indexOf(".");
    const intPart = dot === -1 ? body : body.slice(0, dot);
    let decPart = dot === -1 ? "" : body.slice(dot + 1);
    if (decPart.length > MAX_DECIMALS) decPart = decPart.slice(0, MAX_DECIMALS);
    const digits = `${intPart === "" ? "0" : intPart}${decPart}`;
    const numerator = Number(digits);
    const denominator = Math.pow(10, decPart.length);
    if (!isSafeMagnitude(numerator) || !Number.isSafeInteger(numerator)) return null;
    if (!Number.isSafeInteger(denominator)) return null;
    return frac(negative ? -numerator : numerator, denominator);
  }

  return null;
}

/**
 * TODAS las lecturas plausibles de lo que escribio el alumno, sin repetidos.
 * Vacio cuando no hay ninguna. Es lo que usan los correctores numerico y de
 * fracciones: aceptan si CUALQUIERA coincide con la clave, que es como se
 * resuelve el punto/coma sin conocer el idioma del examen.
 *
 * Contrato duro: no lanza jamas.
 */
export function parseAnswerReadings(input: unknown): Frac[] {
  if (typeof input !== "string") return [];
  if (input.length > MAX_INPUT_LENGTH * 4) return [];

  const normalized = normalizeAnswerInput(input);
  if (normalized.length === 0 || normalized.length > MAX_INPUT_LENGTH) return [];

  const out: Frac[] = [];
  for (const reading of separatorReadings(normalized)) {
    const parsed = parseSingleReading(reading);
    if (parsed === null) continue;
    if (out.some((existing) => existing.n === parsed.n && existing.d === parsed.d)) continue;
    out.push(parsed);
  }
  return out;
}

/**
 * El `parseAns` de Y6A, endurecido.
 * "7/4", "1 3/4", "1.75" y "1,75" devuelven la MISMA fraccion. Basura -> null.
 * Cuando la entrada es ambigua devuelve la lectura PREFERIDA (miles antes que
 * decimal); para corregir usa `parseAnswerReadings`, que no descarta la otra.
 *
 * Contrato duro: esta funcion no lanza jamas.
 */
export function parseAnswer(input: unknown): Frac | null {
  return parseAnswerReadings(input)[0] ?? null;
}

/**
 * El `isSimplest` de Y6A, ampliado.
 * Solo juzga la FORMA escrita: si el alumno responde con un decimal o un entero
 * no hay nada que simplificar y devuelve true. Si escribe "a/b" o "w a/b",
 * exige gcd(a, b) === 1.
 */
export function isSimplest(input: unknown): boolean {
  if (typeof input !== "string") return true;
  const s = normalizeAnswerInput(input).replace(/\s*\/\s*/g, "/");

  const mixed = RE_MIXED.exec(s);
  if (mixed) {
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!isSafeMagnitude(num) || !isSafeMagnitude(den) || den === 0) return true;
    return gcd(num, den) === 1;
  }

  const fraction = RE_FRACTION.exec(s);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (!isSafeMagnitude(num) || !isSafeMagnitude(den) || den === 0) return true;
    return gcd(num, den) === 1;
  }

  return true;
}

/** Fraccion propia aleatoria con denominador amable. El `properFrac` de Y6A. */
export const FRIENDLY_DENOMINATORS = [2, 3, 4, 5, 6, 8, 9, 10, 12] as const;
