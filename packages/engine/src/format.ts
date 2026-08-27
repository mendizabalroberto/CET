/**
 * Formato numerico y fragmentos HTML de enunciado.
 *
 * `nf` es el de Y6A (separador de miles, sin fuzz de coma flotante) con dos
 * arreglos: numeros enormes ya no salen en notacion cientifica (que romperia el
 * parser de respuestas) y los no finitos fallan en voz alta en vez de imprimir
 * "NaN" en el examen de un nino.
 *
 * `decimal escalado`: en vez de arrastrar 0.1 + 0.2, los generadores trabajan con
 * (scaled, dp) — enteros — y solo al final producen el double. Asi la clave de
 * respuesta es exactamente el numero que el alumno puede escribir.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { Locale } from "@cet/shared";
import { EngineError } from "./errors.js";

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

export function pow10(exponent: number): number {
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 15) {
    throw new EngineError("invalid_exponent", `pow10 fuera de rango: ${String(exponent)}`);
  }
  return Math.pow(10, exponent);
}

/** Numero decimal exacto: value = scaled / 10^dp, con scaled entero. */
export interface ScaledDecimal {
  readonly scaled: number;
  readonly dp: number;
}

export function scaled(scaledValue: number, dp: number): ScaledDecimal {
  if (!Number.isSafeInteger(scaledValue)) {
    throw new EngineError("invalid_scaled", `scaled() exige un entero seguro: ${String(scaledValue)}`);
  }
  if (!Number.isInteger(dp) || dp < 0 || dp > 12) {
    throw new EngineError("invalid_scaled", `dp fuera de rango [0,12]: ${String(dp)}`);
  }
  return { scaled: scaledValue, dp };
}

export function scaledValue(value: ScaledDecimal): number {
  return value.dp === 0 ? value.scaled : value.scaled / pow10(value.dp);
}

/** Multiplica por 10^exponent sin perder exactitud (exponent puede ser negativo). */
export function scaledShift(value: ScaledDecimal, exponent: number): ScaledDecimal {
  const newDp = value.dp - exponent;
  if (newDp >= 0) return scaled(value.scaled, newDp);
  return scaled(value.scaled * pow10(-newDp), 0);
}

export function scaledMul(a: ScaledDecimal, b: ScaledDecimal): ScaledDecimal {
  return scaled(a.scaled * b.scaled, a.dp + b.dp);
}

/** Divide un decimal escalado entre un entero. Exige division exacta. */
export function scaledDivInt(a: ScaledDecimal, divisor: number): ScaledDecimal {
  if (!Number.isInteger(divisor) || divisor === 0) {
    throw new EngineError("invalid_scaled", `divisor invalido: ${String(divisor)}`);
  }
  if (a.scaled % divisor !== 0) {
    throw new EngineError(
      "inexact_division",
      `El generador intento producir ${a.scaled}/${divisor} con dp=${a.dp}, que no es exacto. ` +
        `Un enunciado con respuesta periodica no es aceptable.`,
    );
  }
  return scaled(a.scaled / divisor, a.dp);
}

/**
 * El `nf` de Y6A: separador de miles, sin ceros de cola, sin fuzz.
 *
 * Dos correcciones respecto del original:
 *   - Nunca devuelve notacion cientifica. `String(1e21)` da "1e+21" y
 *     `toFixed(0)` TAMBIEN da exponencial por encima de 1e21; se usa BigInt.
 *     Un numero que el alumno no puede teclear es una pregunta imposible.
 *   - Es sensible al idioma (AD-7): en espanol el separador de miles es el punto
 *     y el decimal es la coma. `parseAnswer` acepta las dos convenciones, asi que
 *     esto solo afecta a lo que se MUESTRA, nunca a lo que se corrige.
 */
export function nf(x: number, loc: Locale = "en"): string {
  if (!Number.isFinite(x)) {
    throw new EngineError("invalid_number", `nf() recibio un valor no finito: ${String(x)}`);
  }
  const rounded = Math.round(x * 1e6) / 1e6;
  let s: string;
  if (Math.abs(rounded) >= 1e21) {
    s = BigInt(Math.round(rounded)).toString();
  } else {
    s = String(rounded);
    if (s.includes("e") || s.includes("E")) {
      s = rounded.toFixed(Math.abs(rounded) < 1 ? 6 : 0);
    }
  }
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  const parts = s.split(".");
  const intPart = parts[0] ?? "0";
  const decPart = parts[1];
  const thousandsSep = loc === "es" ? "." : ",";
  const decimalSep = loc === "es" ? "," : ".";
  const grouped = intPart.replace(THOUSANDS, thousandsSep);
  return decPart === undefined ? grouped : `${grouped}${decimalSep}${decPart}`;
}

export function nfScaled(value: ScaledDecimal, loc: Locale = "en"): string {
  return nf(scaledValue(value), loc);
}

/* -------------------------------------------------------------------------- */
/* Fragmentos HTML (allowlist de renderedBody.stem)                            */
/* -------------------------------------------------------------------------- */

function escapeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new EngineError("invalid_number", `Fragmento HTML con numero no finito: ${String(value)}`);
  }
  return String(value);
}

/** Fraccion apilada. El `fh` de Y6A. La clase "f" esta en la allowlist de @cet/ui. */
export function fh(n: number, d: number): string {
  return `<span class="f"><span class="a">${escapeNumber(n)}</span><span class="b">${escapeNumber(d)}</span></span>`;
}

/** Numero mixto apilado. El `mixh` de Y6A. */
export function mixh(whole: number, n: number, d: number): string {
  return `<span class="mixw">${escapeNumber(whole)}</span>${fh(n, d)}`;
}

/** Espacio duro, como el `&nbsp;` que usan los enunciados de Y6A. */
export const NBSP = "&nbsp;";
