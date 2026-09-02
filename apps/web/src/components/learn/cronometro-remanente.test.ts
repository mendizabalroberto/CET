/**
 * INVARIANTE: recargar la página no pone el cronómetro a cero.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El cronómetro vivía en una `ref` de React, o sea en memoria. El niño que
 * llevaba doce minutos en una lección pulsaba F5 y veía «0:00»: no es un
 * contador, es una mentira, y encima una que le quita el mérito de lo que ya
 * había hecho. Reportado probando en producción el 01/09/2026.
 *
 * Se prueba la ARITMÉTICA de la reanudación y el DEPÓSITO por separado, sin
 * React ni navegador. La reanudación es donde vive el riesgo real —desplazar el
 * origen en vez de sumar por fuera— y una prueba de componente lo taparía todo
 * detrás de un render.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LATIDO_CADA_MS,
  debeLatir,
  msActivos,
  msBrutos,
  pausar,
  reanudarDesde,
} from "./cronometro-activo";
import { guardarTiempo, leerTiempo, olvidarTiempo, PREFIJO_CRONOMETRO } from "./cronometro-guardado";

const T0 = 1_000_000;

function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: almacenFalso() });
});

describe("reanudarDesde · continuar tras una recarga", () => {
  it("EL FALLO REPORTADO: el contador arranca donde se quedó, no en cero", () => {
    const c = reanudarDesde(T0, 12 * 60_000, 15 * 60_000);

    expect(msActivos(c, T0)).toBe(12 * 60_000);
    // Y sigue corriendo desde ahí.
    expect(msActivos(c, T0 + 30_000)).toBe(12 * 60_000 + 30_000);
  });

  it("lo bruto se reconstruye desplazando el ORIGEN, no sumando por fuera", () => {
    // `msBrutos` se define como `ahora - inicioMs`. Sumar el previo por fuera
    // habría creado un segundo camino para calcular lo mismo, y dos caminos
    // divergen: el día que alguien tocara `msBrutos` se olvidaría de este.
    const c = reanudarDesde(T0, 60_000, 90_000);
    expect(msBrutos(c, T0)).toBe(90_000);
    expect(msBrutos(c, T0 + 10_000)).toBe(100_000);
  });

  it("reanudar NO dispara un latido inmediato por tiempo ya reportado", () => {
    // Si `activoDelUltimoLatidoMs` arrancara en cero, cada F5 mandaría un evento
    // con el acumulado entero y la telemetría se llenaría de duplicados.
    const c = reanudarDesde(T0, 10 * LATIDO_CADA_MS, 10 * LATIDO_CADA_MS);
    expect(debeLatir(c, T0)).toBe(false);
    // Pero sí late cuando de verdad toca.
    expect(debeLatir(c, T0 + LATIDO_CADA_MS)).toBe(true);
  });

  it("un deposito incoherente no produce un cronómetro que se contradiga", () => {
    // `msBrutos` menor que `msActivos` es imposible. Puede llegar de un volcado
    // a medias o de una clave tocada a mano desde la consola.
    const c = reanudarDesde(T0, 60_000, 1_000);
    expect(msBrutos(c, T0)).toBeGreaterThanOrEqual(msActivos(c, T0));
  });

  it("valores negativos se tratan como cero y no como tiempo hacia atrás", () => {
    const c = reanudarDesde(T0, -5_000, -9_000);
    expect(msActivos(c, T0)).toBe(0);
    expect(msBrutos(c, T0)).toBe(0);
  });

  it("una pausa sobre un cronómetro reanudado conserva lo recuperado", () => {
    let c = reanudarDesde(T0, 60_000, 60_000);
    c = pausar(c, T0 + 5_000);
    // Una hora de reloj de pared con el cronómetro parado no añade nada.
    expect(msActivos(c, T0 + 3_600_000)).toBe(65_000);
  });
});

describe("depósito del cronómetro", () => {
  it("la clave es la ACTIVIDAD, no la sesión: dos lecciones no se mezclan", () => {
    // Lo que el niño lee como «llevas 12 min» es el tiempo en ESTA lección, no
    // en esta pestaña. Con la sesión en la clave, cerrar el navegador volvería a
    // empezar de cero y el contador seguiría mintiendo, solo que más despacio.
    guardarTiempo("leccion", "l1", { msActivos: 1_000, msBrutos: 2_000 });
    guardarTiempo("leccion", "l2", { msActivos: 7_000, msBrutos: 8_000 });

    expect(leerTiempo("leccion", "l1")?.msActivos).toBe(1_000);
    expect(leerTiempo("leccion", "l2")?.msActivos).toBe(7_000);
  });

  it("la misma id en pantallas distintas tampoco se mezcla", () => {
    guardarTiempo("leccion", "x", { msActivos: 1_000, msBrutos: 1_000 });
    guardarTiempo("practica", "x", { msActivos: 9_000, msBrutos: 9_000 });
    expect(leerTiempo("leccion", "x")?.msActivos).toBe(1_000);
  });

  it("una actividad nunca vista devuelve null, no ceros", () => {
    // `null` es «empieza de cero»; unos ceros guardados serían «ya estuviste
    // aquí y no hiciste nada», que no es lo mismo.
    expect(leerTiempo("leccion", "jamas-vista")).toBeNull();
  });

  it("terminar la actividad olvida su contador", () => {
    // Es el único momento en que empezar de cero significa algo: si no se
    // borrara, repetir la lección la vería arrancar con el tiempo de la vez
    // anterior y el niño no sabría si va rápido o lento.
    guardarTiempo("leccion", "l1", { msActivos: 5_000, msBrutos: 5_000 });
    olvidarTiempo("leccion", "l1");
    expect(leerTiempo("leccion", "l1")).toBeNull();
  });

  it("un depósito manipulado a mano se ignora en vez de creerselo", () => {
    window.localStorage.setItem(PREFIJO_CRONOMETRO + "leccion.l1", '{"v":1,"msActivos":"mucho"}');
    window.localStorage.setItem(PREFIJO_CRONOMETRO + "leccion.l2", "no soy json");
    window.localStorage.setItem(
      PREFIJO_CRONOMETRO + "leccion.l3",
      '{"v":99,"msActivos":1,"msBrutos":1}',
    );

    expect(leerTiempo("leccion", "l1")).toBeNull();
    expect(leerTiempo("leccion", "l2")).toBeNull();
    expect(leerTiempo("leccion", "l3")).toBeNull();
  });

  it("sin localStorage no lanza: se cuenta en memoria y ya", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("bloqueado");
      },
    });

    expect(() => guardarTiempo("leccion", "l1", { msActivos: 1, msBrutos: 1 })).not.toThrow();
    expect(leerTiempo("leccion", "l1")).toBeNull();
    expect(() => olvidarTiempo("leccion", "l1")).not.toThrow();
  });
});
