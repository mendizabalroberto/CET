/**
 * El cronómetro no paga el silencio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Estas pruebas van ANTES que el cronómetro y fijan la única cosa que de verdad
 * importa de él: que cuente lo MISMO que cuenta el informe del tutor. La
 * migración 0064 dejó escrito lo que pasa cuando no es así — una pestaña
 * olvidada convertida en 429 minutos de «estudio» en un niño de primaria, el
 * 94 % en un solo día. Si el cronómetro de pantalla dijera siete minutos y el
 * informe cuatro, uno de los dos miente y el niño se creería el suyo.
 *
 * Todo el tiempo entra como PARÁMETRO. No hay ni un `Date.now()` que espiar ni
 * un temporizador que adelantar: por eso este fichero no necesita navegador.
 */
import { describe, expect, it } from "vitest";

import {
  LATIDO_CADA_MS,
  arrancar,
  debeLatir,
  formatearMmSs,
  marcarLatido,
  minutosParaElResumen,
  msActivos,
  msBrutos,
  pausar,
  reanudar,
} from "./cronometro-activo";

/**
 * Los instantes son de un reloj MONÓTONO (`performance.now()`), no fechas. Se
 * arranca en 5000 y no en 0 a propósito: `performance.now()` vale lo que lleve
 * viva la página, nunca cero, y un cronómetro que confundiera el origen con el
 * cero daría de regalo todo lo anterior a su arranque.
 */
const T0 = 5_000;

describe("arrancar", () => {
  it("empieza corriendo y en cero, aunque el reloj monótono venga alto", () => {
    const c = arrancar(T0);
    expect(msActivos(c, T0)).toBe(0);
    expect(msBrutos(c, T0)).toBe(0);
  });

  it("acumula mientras corre", () => {
    const c = arrancar(T0);
    expect(msActivos(c, T0 + 12_000)).toBe(12_000);
  });
});

describe("pausar y reanudar", () => {
  it("el tiempo pausado NO cuenta como activo pero SÍ como bruto", () => {
    // El caso de 0064 en miniatura: cuatro minutos delante de la pantalla y
    // veinte con la pestaña oculta. Activo = 4 min, bruto = 24 min.
    let c = arrancar(T0);
    c = pausar(c, T0 + 4 * 60_000);
    c = reanudar(c, T0 + 24 * 60_000);

    expect(msActivos(c, T0 + 24 * 60_000)).toBe(4 * 60_000);
    expect(msBrutos(c, T0 + 24 * 60_000)).toBe(24 * 60_000);
  });

  it("sigue sumando después de reanudar", () => {
    let c = arrancar(T0);
    c = pausar(c, T0 + 60_000);
    c = reanudar(c, T0 + 600_000);
    expect(msActivos(c, T0 + 630_000)).toBe(90_000);
  });

  it("pausar dos veces no congela el tramo dos veces", () => {
    // Ocultar la pestaña y perder el foco llegan JUNTOS y en cualquier orden.
    // Si la segunda pausa volviera a acumular, el minuto se contaría dos veces.
    let c = arrancar(T0);
    c = pausar(c, T0 + 60_000);
    c = pausar(c, T0 + 90_000);
    expect(msActivos(c, T0 + 120_000)).toBe(60_000);
  });

  it("reanudar dos veces no reabre el tramo dos veces", () => {
    let c = arrancar(T0);
    c = reanudar(c, T0 + 30_000);
    expect(msActivos(c, T0 + 60_000)).toBe(60_000);
  });

  it("estando pausado, el activo no se mueve por mucho que pase el tiempo", () => {
    let c = arrancar(T0);
    c = pausar(c, T0 + 10_000);
    expect(msActivos(c, T0 + 10_000)).toBe(10_000);
    expect(msActivos(c, T0 + 3_600_000)).toBe(10_000);
  });
});

describe("reloj monótono", () => {
  it("un instante ANTERIOR al último no resta tiempo", () => {
    // `performance.now()` no debería retroceder nunca, pero el activo se envía
    // a un esquema Zod `nonnegative`: un negativo aquí haría que el servidor
    // rechazara el lote ENTERO con un 400 y se perderían también los eventos
    // buenos que viajaban con él.
    const c = arrancar(T0);
    expect(msActivos(c, T0 - 5_000)).toBe(0);
    expect(msBrutos(c, T0 - 5_000)).toBe(0);
  });
});

describe("latido", () => {
  it("late cada 60 s de tiempo ACTIVO, no de reloj de pared", () => {
    // Lo que hace que el latido sirva de algo: una pestaña abierta y quieta no
    // late. Si latiera por reloj de pared, la sesión olvidada volvería a
    // inflarse sola, que es el defecto que 0064 cerró en la base de datos.
    let c = arrancar(T0);
    c = pausar(c, T0 + 10_000);
    expect(debeLatir(c, T0 + 3_600_000)).toBe(false);

    c = reanudar(c, T0 + 3_600_000);
    expect(debeLatir(c, T0 + 3_600_000 + 49_999)).toBe(false);
    expect(debeLatir(c, T0 + 3_600_000 + 50_000)).toBe(true);
  });

  it("después de marcar un latido no vuelve a latir hasta 60 s activos más", () => {
    let c = arrancar(T0);
    expect(debeLatir(c, T0 + LATIDO_CADA_MS)).toBe(true);
    c = marcarLatido(c, T0 + LATIDO_CADA_MS);
    expect(debeLatir(c, T0 + LATIDO_CADA_MS + 1)).toBe(false);
    expect(debeLatir(c, T0 + 2 * LATIDO_CADA_MS)).toBe(true);
  });

  it("un salto largo de una sola vez marca el latido al activo real, sin acumular deuda", () => {
    // Si `marcarLatido` guardara «el último múltiplo de 60 s» en vez del activo
    // real, un navegador que estrangula los temporizadores emitiría una ráfaga
    // de latidos atrasados al volver, y cada uno con el mismo total.
    let c = arrancar(T0);
    c = marcarLatido(c, T0 + 185_000);
    expect(debeLatir(c, T0 + 185_000)).toBe(false);
    expect(debeLatir(c, T0 + 245_000)).toBe(true);
  });
});

describe("formatearMmSs", () => {
  it("pinta 4:12", () => {
    expect(formatearMmSs(4 * 60_000 + 12_000)).toBe("4:12");
  });

  it("rellena los segundos con cero y no los minutos", () => {
    expect(formatearMmSs(9_000)).toBe("0:09");
    expect(formatearMmSs(0)).toBe("0:00");
  });

  it("trunca, no redondea: 59,9 s siguen siendo 0:59", () => {
    // Redondear enseñaría 1:00 antes de que el minuto exista. El niño ve un
    // número que todavía no ha ocurrido.
    expect(formatearMmSs(59_900)).toBe("0:59");
  });

  it("pasa de la hora sin volver a cero", () => {
    // 90 minutos son 90:00, no 1:30:00 ni 30:00. Un formato con horas obligaría
    // al niño a sumar; volver a cero le mentiría por una hora entera.
    expect(formatearMmSs(90 * 60_000)).toBe("90:00");
  });

  it("un tiempo negativo o ilegible se pinta como 0:00 y no como NaN:NaN", () => {
    expect(formatearMmSs(-1)).toBe("0:00");
    expect(formatearMmSs(Number.NaN)).toBe("0:00");
  });
});

describe("minutosParaElResumen", () => {
  it("redondea al minuto más cercano", () => {
    expect(minutosParaElResumen(7 * 60_000 + 20_000)).toBe(7);
    expect(minutosParaElResumen(7 * 60_000 + 40_000)).toBe(8);
  });

  it("nunca dice cero minutos: menos de medio minuto sigue siendo 1", () => {
    // «Has estado 0 minutos» le dice a un niño que lo que acaba de hacer no
    // contó. Contó: por eso el suelo es 1.
    expect(minutosParaElResumen(4_000)).toBe(1);
    expect(minutosParaElResumen(0)).toBe(1);
  });
});
