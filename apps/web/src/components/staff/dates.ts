/**
 * Fechas y duraciones en la zona horaria DEL COLEGIO.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ NO SE USA LA ZONA DEL NAVEGADOR
 * ===========================================================================
 * `schools.timezone` existe porque las ventanas de examen se evalúan ahí
 * (DATA_MODEL §1). Si el profesor viera las horas en la zona de su portátil,
 * un intento entregado a las 09:58 hora del colegio podría leerse como las
 * 15:58 y parecer fuera de plazo. En una reclamación de nota eso no es un
 * detalle cosmético: es la diferencia entre "entregó a tiempo" y "no".
 *
 * Además, el formateo se hace SIEMPRE en el servidor. Un `toLocaleString()` en
 * el cliente produce una cadena distinta en el servidor y en el navegador, y
 * React lo denuncia como error de hidratación — pero solo a veces, según dónde
 * esté el revisor.
 * ===========================================================================
 *
 * Módulo PURO salvo por `Intl`. Sin `Date.now()`: todo instante entra como
 * argumento, que es lo que lo hace testeable.
 */
import type { Locale } from "@cet/shared";

/** Zona de reserva cuando la del colegio no es válida para `Intl`. */
export const FALLBACK_TIME_ZONE = "UTC";

const BCP47: Record<Locale, string> = { es: "es-ES", en: "en-GB" };

/**
 * `Intl.DateTimeFormat` lanza `RangeError` con una zona desconocida. Un dato
 * malo en `schools.timezone` no puede tumbar la pantalla del profesor, así que
 * se degrada a UTC — y el llamante puede avisar de que lo hizo.
 */
export function normalizeTimeZone(timeZone: string | null | undefined): {
  timeZone: string;
  valid: boolean;
} {
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    return { timeZone: FALLBACK_TIME_ZONE, valid: false };
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(0);
    return { timeZone, valid: true };
  } catch {
    return { timeZone: FALLBACK_TIME_ZONE, valid: false };
  }
}

export type DatePrecision = "date" | "minute" | "second";

/**
 * Formatea un instante ISO (o `Date`) en la zona del colegio.
 *
 * @returns Cadena vacía si el valor es nulo o no parsea. Nunca "Invalid Date":
 *   una fecha rota debe verse como un hueco, no como ruido técnico en medio de
 *   una tabla.
 */
export function formatSchoolTime(
  value: string | Date | null | undefined,
  timeZone: string | null | undefined,
  locale: Locale,
  precision: DatePrecision = "minute",
): string {
  const date = toDate(value);
  if (date === null) return "";

  const zone = normalizeTimeZone(timeZone).timeZone;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "2-digit",
  };
  if (precision !== "date") {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.hour12 = false;
  }
  if (precision === "second") options.second = "2-digit";

  return new Intl.DateTimeFormat(BCP47[locale], options).format(date);
}

/** Solo la hora, para las líneas de tiempo donde la fecha ya está en la cabecera. */
export function formatSchoolClock(
  value: string | Date | null | undefined,
  timeZone: string | null | undefined,
  locale: Locale,
): string {
  const date = toDate(value);
  if (date === null) return "";
  return new Intl.DateTimeFormat(BCP47[locale], {
    timeZone: normalizeTimeZone(timeZone).timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Duración legible: `1 h 04 min`, `3 min 20 s`, `450 ms`.
 *
 * No se localiza con `Intl.RelativeTimeFormat` a propósito: eso produce "hace
 * 3 minutos", que es una fecha relativa, no una duración. `h`/`min`/`s`/`ms`
 * son símbolos del SI y se escriben igual en los dos idiomas.
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} h ${pad(minutes)} min`;
  if (minutes > 0) return `${minutes} min ${pad(seconds)} s`;
  return `${seconds} s`;
}

/**
 * Diferencia entre el reloj del navegador y el del servidor para una misma
 * revisión. Positivo = el navegador iba adelantado.
 *
 * Se muestra porque un desfase grande explica cosas que si no parecen fraude:
 * un alumno cuyo portátil va veinte minutos adelantado genera `client_ts`
 * imposibles. El servidor nunca puntúa con esos valores (DATA_MODEL §0), pero
 * el profesor sí tiene que poder verlos.
 */
export function clockSkewMs(
  clientTs: string | null | undefined,
  serverTs: string | null | undefined,
): number | null {
  const client = toDate(clientTs);
  const server = toDate(serverTs);
  if (client === null || server === null) return null;
  return client.getTime() - server.getTime();
}

/** Desfase con signo, ya formateado: `+2 min 10 s` / `−45 s`. */
export function formatSignedDurationMs(ms: number | null): string {
  if (ms === null) return "";
  const formatted = formatDurationMs(Math.abs(ms));
  if (formatted === "") return "";
  // U+2212 MINUS SIGN, no el guion del teclado: en una tabla de cifras se
  // distingue del guion de "sin dato".
  return `${ms < 0 ? "−" : "+"}${formatted}`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
