/**
 * Fechas en la zona del colegio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El instante elegido, 2026-05-02T02:30:00Z, está a propósito de MADRUGADA en
 * UTC: en `America/Guatemala` (UTC−6) cae el día ANTERIOR. Un formateador que
 * ignorase la zona del colegio no solo daría otra hora, daría otra FECHA — que
 * es justo el fallo que arruina una reclamación por entrega fuera de plazo.
 */
import { describe, expect, it } from "vitest";

import {
  clockSkewMs,
  FALLBACK_TIME_ZONE,
  formatDurationMs,
  formatSchoolClock,
  formatSchoolTime,
  formatSignedDurationMs,
  normalizeTimeZone,
} from "./dates";

const MIDNIGHT_EDGE = "2026-05-02T02:30:00.000Z";

describe("normalizeTimeZone", () => {
  it("acepta una zona IANA válida", () => {
    expect(normalizeTimeZone("America/Guatemala")).toEqual({
      timeZone: "America/Guatemala",
      valid: true,
    });
  });

  it("degrada a UTC ante una zona inválida en vez de lanzar", () => {
    expect(normalizeTimeZone("Mordor/Barad-dur")).toEqual({
      timeZone: FALLBACK_TIME_ZONE,
      valid: false,
    });
    expect(normalizeTimeZone("")).toEqual({ timeZone: FALLBACK_TIME_ZONE, valid: false });
    expect(normalizeTimeZone(null)).toEqual({ timeZone: FALLBACK_TIME_ZONE, valid: false });
  });
});

describe("formatSchoolTime", () => {
  it("usa la zona del colegio, no la del proceso", () => {
    const utc = formatSchoolTime(MIDNIGHT_EDGE, "UTC", "en");
    const guatemala = formatSchoolTime(MIDNIGHT_EDGE, "America/Guatemala", "en");

    expect(utc).not.toBe(guatemala);
    // 02:30 UTC del día 2 son las 20:30 del día 1 en Guatemala (UTC−6).
    expect(utc).toContain("02:30");
    expect(utc).toContain("02");
    expect(guatemala).toContain("20:30");
    expect(guatemala).toContain("01");
  });

  it("respeta el horario de verano de la zona, no un desfase fijo", () => {
    // Madrid: UTC+1 en enero, UTC+2 en julio.
    const winter = formatSchoolTime("2026-01-15T12:00:00.000Z", "Europe/Madrid", "en");
    const summer = formatSchoolTime("2026-07-15T12:00:00.000Z", "Europe/Madrid", "en");
    expect(winter).toContain("13:00");
    expect(summer).toContain("14:00");
  });

  it("formatea en el idioma pedido", () => {
    const en = formatSchoolTime(MIDNIGHT_EDGE, "UTC", "en");
    const es = formatSchoolTime(MIDNIGHT_EDGE, "UTC", "es");
    expect(en).not.toBe(es);
    // Los dos apuntan al mismo instante, con el mismo reloj de 24 h.
    expect(en).toContain("02:30");
    expect(es).toContain("02:30");
  });

  it("recorta a la precisión pedida", () => {
    const date = formatSchoolTime(MIDNIGHT_EDGE, "UTC", "en", "date");
    const second = formatSchoolTime(MIDNIGHT_EDGE, "UTC", "en", "second");
    expect(date).not.toContain("02:30");
    expect(second).toContain("02:30:00");
  });

  it("degrada a UTC si la zona del colegio es basura", () => {
    expect(formatSchoolTime(MIDNIGHT_EDGE, "no-existe", "en")).toBe(
      formatSchoolTime(MIDNIGHT_EDGE, "UTC", "en"),
    );
  });

  it("devuelve cadena vacía —no 'Invalid Date'— ante un valor ausente o roto", () => {
    expect(formatSchoolTime(null, "UTC", "en")).toBe("");
    expect(formatSchoolTime(undefined, "UTC", "en")).toBe("");
    expect(formatSchoolTime("no es una fecha", "UTC", "en")).toBe("");
  });

  it("acepta un Date igual que una cadena ISO", () => {
    expect(formatSchoolTime(new Date(MIDNIGHT_EDGE), "UTC", "en")).toBe(
      formatSchoolTime(MIDNIGHT_EDGE, "UTC", "en"),
    );
  });
});

describe("formatSchoolClock", () => {
  it("da solo la hora, en la zona del colegio y en 24 h", () => {
    expect(formatSchoolClock(MIDNIGHT_EDGE, "UTC", "en")).toBe("02:30:00");
    expect(formatSchoolClock(MIDNIGHT_EDGE, "America/Guatemala", "en")).toBe("20:30:00");
  });

  it("devuelve cadena vacía sin valor", () => {
    expect(formatSchoolClock(null, "UTC", "es")).toBe("");
  });
});

describe("formatDurationMs", () => {
  it("por debajo de un segundo, milisegundos", () => {
    expect(formatDurationMs(0)).toBe("0 ms");
    expect(formatDurationMs(450)).toBe("450 ms");
  });

  it("segundos, minutos y horas", () => {
    expect(formatDurationMs(9_000)).toBe("9 s");
    expect(formatDurationMs(200_000)).toBe("3 min 20 s");
    expect(formatDurationMs(3_840_000)).toBe("1 h 04 min");
  });

  it("rechaza valores imposibles en vez de inventar", () => {
    expect(formatDurationMs(-1)).toBe("");
    expect(formatDurationMs(Number.NaN)).toBe("");
    expect(formatDurationMs(null)).toBe("");
    expect(formatDurationMs(undefined)).toBe("");
  });
});

describe("clockSkewMs / formatSignedDurationMs", () => {
  it("positivo cuando el navegador va adelantado", () => {
    const skew = clockSkewMs("2026-05-02T02:32:10.000Z", MIDNIGHT_EDGE);
    expect(skew).toBe(130_000);
    expect(formatSignedDurationMs(skew)).toBe("+2 min 10 s");
  });

  it("negativo cuando va atrasado, con signo menos tipográfico", () => {
    const skew = clockSkewMs("2026-05-02T02:29:15.000Z", MIDNIGHT_EDGE);
    expect(skew).toBe(-45_000);
    expect(formatSignedDurationMs(skew)).toBe("−45 s");
  });

  it("null si falta cualquiera de los dos relojes", () => {
    expect(clockSkewMs(null, MIDNIGHT_EDGE)).toBeNull();
    expect(clockSkewMs(MIDNIGHT_EDGE, null)).toBeNull();
    expect(formatSignedDurationMs(null)).toBe("");
  });
});
