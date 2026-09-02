/**
 * La cola sobrevive a que se caiga la red y se cierre la pestaña.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL HUECO QUE ESTAS PRUEBAS CIERRAN
 * ===========================================================================
 * `TelemetryQueue` ya enviaba en lote, ya reintentaba con backoff y jitter, ya
 * devolvía el lote fallido a la cabeza de la cola, y ya hacía `sendBeacon` al
 * ocultarse la pestaña. Todo eso EN MEMORIA.
 *
 * Con lo cual el recorrido más probable de un colegio —se cae el wifi, el niño
 * sigue practicando, y luego cierra la tableta— perdía la sesión entera. Y sin
 * dejar rastro: `sendBeacon` tampoco sale sin red, así que no había ni un 5xx
 * en ningún log. Cero filas, y todo el mundo tan tranquilo.
 *
 * Se prueba el depósito por separado de la cola a propósito. El depósito es la
 * pieza con reglas propias —cuota, claves por sesión, JSON manipulable— y
 * mezclarlo con los temporizadores de la cola daría pruebas lentas y frágiles
 * que fallarían por motivos que no son el que se quiere vigilar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientEvent } from "@cet/shared";

import { guardar, MAX_BYTES, PREFIJO, rescatar } from "./deposito";

function evento(sessionId: string, seq: number): ClientEvent {
  return {
    sessionId,
    seq,
    eventType: "lesson_opened",
    payload: {},
    clientTs: new Date(2026, 8, 1).toISOString(),
  } as ClientEvent;
}

/** `localStorage` de mentira, con la misma superficie que usa el depósito. */
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

describe("depósito local de telemetría", () => {
  it("EL CASO QUE LO JUSTIFICA: lo guardado sobrevive y se recupera en el arranque siguiente", () => {
    // Se cae el wifi, la cola acumula, la pestaña muere.
    guardar("sesion-vieja", [evento("sesion-vieja", 0), evento("sesion-vieja", 1)]);

    // Arranca una sesión nueva y encuentra lo de la anterior.
    const rescatados = rescatar("sesion-nueva");

    expect(rescatados).toHaveLength(2);
    expect(rescatados[0]!.sessionId).toBe("sesion-vieja");
  });

  it("conserva `sessionId` y `seq` originales: no se renumeran", () => {
    // `seq` es lo que ordena una sesión y lo que hace visible un hueco.
    // Reetiquetar los rescatados con la sesión nueva mezclaría dos ratos
    // distintos del niño en una sola línea temporal.
    guardar("sesion-vieja", [evento("sesion-vieja", 7), evento("sesion-vieja", 8)]);

    const rescatados = rescatar("sesion-nueva");

    expect(rescatados.map((e) => e.seq)).toEqual([7, 8]);
    expect(rescatados.every((e) => e.sessionId === "sesion-vieja")).toBe(true);
  });

  it("NO rescata la sesión en curso: de esa se encarga la cola viva", () => {
    guardar("la-mia", [evento("la-mia", 0)]);
    expect(rescatar("la-mia")).toHaveLength(0);
  });

  it("rescatar BORRA lo rescatado: dos arranques no duplican los eventos", () => {
    // Si no se borrara, cada arranque volvería a subir lo mismo y el tiempo de
    // estudio del informe se multiplicaría solo. Un informe con el doble de
    // minutos no se ve roto, solo se lee mal, que es peor.
    guardar("sesion-vieja", [evento("sesion-vieja", 0)]);

    expect(rescatar("sesion-nueva")).toHaveLength(1);
    expect(rescatar("sesion-nueva")).toHaveLength(0);
  });

  it("dos pestañas no se pisan: cada sesión tiene su clave", () => {
    // `localStorage` es del ORIGEN, no de la pestaña. Con una sola clave, la
    // última pestaña en escribir borraría la cola de la otra sin que se notara.
    guardar("pestana-a", [evento("pestana-a", 0)]);
    guardar("pestana-b", [evento("pestana-b", 0)]);

    expect(rescatar("ninguna")).toHaveLength(2);
  });

  it("guardar una cola vacía limpia la clave en vez de dejar un cascarón", () => {
    guardar("s", [evento("s", 0)]);
    guardar("s", []);
    expect(rescatar("otra")).toHaveLength(0);
  });

  it("respeta la cuota recortando los MAS ANTIGUOS", () => {
    // `localStorage` da unos 5 MB por ORIGEN y lo comparte con todo lo demás
    // que guarde la aplicación. Comerse la cuota con telemetría rompería cosas
    // que sí le importan al niño.
    const muchos = Array.from({ length: 20_000 }, (_, i) => evento("s", i));
    guardar("s", muchos);

    const rescatados = rescatar("otra");
    expect(rescatados.length).toBeGreaterThan(0);
    expect(rescatados.length).toBeLessThan(muchos.length);
    // Lo reciente describe mejor lo que está pasando, así que se conserva el
    // final. El hueco que deja no es mudo: `seq` salta y el análisis lo cuenta.
    expect(rescatados[rescatados.length - 1]!.seq).toBe(19_999);
    expect(JSON.stringify({ v: 1, eventos: rescatados }).length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("una clave manipulada a mano no envenena el lote", () => {
    // Lo que hay en `localStorage` lo puede escribir cualquiera desde la
    // consola. Si colara basura en un lote, el servidor devolvería 400 y se
    // perderían TAMBIEN los eventos buenos que viajaban con ella.
    window.localStorage.setItem(PREFIJO + "trucada", '{"v":1,"eventos":[{"nada":true}]}');
    window.localStorage.setItem(PREFIJO + "rota", "no soy json");
    guardar("buena", [evento("buena", 0)]);

    const rescatados = rescatar("actual");

    expect(rescatados).toHaveLength(1);
    expect(rescatados[0]!.sessionId).toBe("buena");
  });

  it("sin localStorage no lanza: la telemetría degrada, la pantalla no se rompe", () => {
    // Modo privado de Safari, cuota llena, almacenamiento bloqueado por
    // política. Ninguno de esos puede tumbar la pantalla de un niño.
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("acceso denegado");
      },
    });

    expect(() => guardar("s", [evento("s", 0)])).not.toThrow();
    expect(rescatar("s")).toEqual([]);
  });
});
