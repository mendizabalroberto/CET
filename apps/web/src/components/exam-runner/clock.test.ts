/**
 * El reloj del alumno no participa en nada.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { clientClockSkewMs, initialRemainingMs, remainingMs } from "./clock";

const DEADLINE = "2026-05-04T10:25:00.000Z";
const SERVER_NOW = "2026-05-04T10:00:00.000Z";
const TWENTY_FIVE_MIN = 25 * 60 * 1000;

describe("initialRemainingMs", () => {
  it("es la diferencia entre dos instantes del SERVIDOR", () => {
    expect(initialRemainingMs(DEADLINE, SERVER_NOW)).toBe(TWENTY_FIVE_MIN);
  });

  it("da el mismo resultado con el reloj del cliente adelantado 30 minutos", () => {
    // Se simula manipulando `Date.now`, que es exactamente lo que haría un
    // alumno cambiando la hora del sistema. La función no lo consulta, así que
    // el resultado tiene que ser idéntico.
    const original = Date.now;
    try {
      Date.now = () => Date.parse(SERVER_NOW) + 30 * 60 * 1000;
      expect(initialRemainingMs(DEADLINE, SERVER_NOW)).toBe(TWENTY_FIVE_MIN);
    } finally {
      Date.now = original;
    }
  });

  it("da el mismo resultado con el reloj del cliente atrasado dos horas", () => {
    const original = Date.now;
    try {
      Date.now = () => Date.parse(SERVER_NOW) - 2 * 60 * 60 * 1000;
      expect(initialRemainingMs(DEADLINE, SERVER_NOW)).toBe(TWENTY_FIVE_MIN);
    } finally {
      Date.now = original;
    }
  });

  it("devuelve NaN con fechas ilegibles en vez de inventar un tiempo", () => {
    expect(Number.isNaN(initialRemainingMs("no es una fecha", SERVER_NOW))).toBe(true);
    expect(Number.isNaN(initialRemainingMs(DEADLINE, ""))).toBe(true);
  });
});

describe("remainingMs", () => {
  it("descuenta el intervalo monótono transcurrido", () => {
    expect(remainingMs(TWENTY_FIVE_MIN, 60_000)).toBe(TWENTY_FIVE_MIN - 60_000);
  });

  it("no baja de cero", () => {
    expect(remainingMs(TWENTY_FIVE_MIN, TWENTY_FIVE_MIN + 999_999)).toBe(0);
  });

  it("ignora un intervalo negativo: un reloj monótono no retrocede", () => {
    expect(remainingMs(TWENTY_FIVE_MIN, -500_000)).toBe(TWENTY_FIVE_MIN);
  });
});

describe("clientClockSkewMs", () => {
  it("mide el desfase pero no lo usa para nada: es solo un dato forense", () => {
    const skew = clientClockSkewMs(SERVER_NOW, Date.parse(SERVER_NOW) + 90_000);
    expect(skew).toBe(90_000);
    // Y con ese desfase, el tiempo restante sigue siendo el del servidor.
    expect(initialRemainingMs(DEADLINE, SERVER_NOW)).toBe(TWENTY_FIVE_MIN);
  });

  it("devuelve 0 y no NaN si la hora del servidor es ilegible", () => {
    expect(clientClockSkewMs("basura", 1_000)).toBe(0);
  });
});
