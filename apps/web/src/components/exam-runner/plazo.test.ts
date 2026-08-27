/**
 * LA RED QUE ACEPTA LA CONEXIÓN Y NO CONTESTA NUNCA.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ REPRODUCE ESTE FICHERO
 * ===========================================================================
 * No es la red caída —esa funciona y está probada en `autosave.test.ts`—. Es la
 * otra: el wifi del colegio que sigue asociado pero ya no encamina, el portal
 * cautivo del hotel, el túnel. El `fetch` **no falla**: se queda colgado.
 *
 * Medido en navegador el 27/08 (`docs/superpowers/specs/2026-08-27-tactil-y-red.md`
 * §2.5): diez minutos simulados, **un solo envío, cero reintentos, cero avisos**,
 * el indicador diciendo «Guardando» y el cronómetro del examen bajando.
 *
 * Y al entregar: los tres botones del diálogo deshabilitados, sin mensaje, para
 * siempre. Para un niño de once años con el reloj corriendo eso es
 * indistinguible de haber perdido el examen (aunque no se pierda nada: la cola
 * vive en `localStorage` y `startAttempt` es idempotente).
 *
 * ===========================================================================
 * LA REGLA QUE FIJA
 * ===========================================================================
 * **Ninguna petición del examen puede esperar para siempre.** Toda llamada de
 * red se rinde en un plazo conocido, y rendirse produce un `ApiError` que la
 * cola sabe reintentar y la pantalla sabe contar.
 *
 * El `fetch` de estos tests NUNCA resuelve. Si el plazo no existe, el test no
 * falla con un `expect` rojo: se queda colgado hasta que vitest lo mata. Esa es
 * exactamente la forma del fallo que reproduce.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLAZO_ARRANCAR_MS,
  PLAZO_ENTREGAR_MS,
  PLAZO_GUARDAR_MS,
  PLAZO_RESULTADO_MS,
} from "@/lib/net/plazo";

import { fetchResult, saveAnswer, startAttempt, submitAttempt } from "./api";
import { AutosaveQueue, type AutosaveState } from "./autosave";
import { ApiError } from "./types";

/** Un `fetch` que acepta la conexión y no contesta jamás. Cuenta los intentos. */
function fetchColgado(): { readonly intentos: () => number } {
  let intentos = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      intentos += 1;
      return new Promise<never>((_resolve, reject) => {
        // Un `fetch` real SÍ rechaza cuando se aborta su señal. Sin esto el
        // stub sería más benévolo que el navegador y el test mentiría.
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }),
  );
  return { intentos: () => intentos };
}

const RESPUESTA = {
  attemptItemId: "item-1",
  response: { type: "text", value: "100" } as const,
  clientTs: "2026-08-27T13:00:00.000Z",
  timeOnItemMs: 1000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("una petición colgada se rinde en su plazo", () => {
  it("`saveAnswer` no espera para siempre", async () => {
    vi.useFakeTimers();
    fetchColgado();

    const promesa = saveAnswer("at-1", RESPUESTA);
    // `catch` inmediato: sin él, el rechazo que llega dentro del
    // `advanceTimersByTimeAsync` es un unhandled rejection que ensucia la salida.
    const resultado = promesa.then(
      () => "resolvió" as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(PLAZO_GUARDAR_MS + 100);

    await expect(resultado).resolves.toMatchObject({ kind: "timeout" });
  });

  it("`submitAttempt` no deja al alumno con el botón muerto", async () => {
    vi.useFakeTimers();
    fetchColgado();

    const resultado = submitAttempt("at-1", "student").then(
      () => "resolvió" as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(PLAZO_ENTREGAR_MS + 100);

    await expect(resultado).resolves.toMatchObject({ kind: "timeout" });
  });

  it("`startAttempt` no deja al alumno mirando el cargador", async () => {
    vi.useFakeTimers();
    fetchColgado();

    const resultado = startAttempt("a1", { retryOnStarting: false }).then(
      () => "resolvió" as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(PLAZO_ARRANCAR_MS + 100);

    await expect(resultado).resolves.toMatchObject({ kind: "timeout" });
  });

  it("`fetchResult` no deja la nota cargando eternamente", async () => {
    vi.useFakeTimers();
    fetchColgado();

    const resultado = fetchResult("at-1").then(
      () => "resolvió" as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(PLAZO_RESULTADO_MS + 100);

    await expect(resultado).resolves.toMatchObject({ kind: "timeout" });
  });
});

describe("el plazo no es tan corto como para matar una red lenta pero viva", () => {
  it("una respuesta que tarda 8 s se guarda, no se reintenta", async () => {
    // El riesgo del plazo corto: convertir un guardado que iba a llegar en un
    // reintento innecesario, y multiplicar el tráfico de treinta tabletas justo
    // cuando la red va justa. Ocho segundos es una red mala de verdad, no rota.
    vi.useFakeTimers();
    let intentos = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        intentos += 1;
        return new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ revision: 1 }) }), 8_000);
        });
      }),
    );

    const resultado = saveAnswer("at-1", RESPUESTA);
    await vi.advanceTimersByTimeAsync(8_100);

    await expect(resultado).resolves.toMatchObject({ ok: true, revision: 1 });
    expect(intentos).toBe(1);
  });
});

describe("la cola de autoguardado con la red colgada", () => {
  it("reintenta y avisa, en vez de decir «Guardando» diez minutos", async () => {
    // Éste es el test del apéndice A.3 del spec, con el resultado ESPERADO en
    // vez del medido. La cola usa el `saveAnswer` real: el plazo tiene que
    // llegarle desde la capa de red, no desde un doble de pruebas.
    vi.useFakeTimers();
    const { intentos } = fetchColgado();
    // Con el instante de cada cambio: lo que hay que acotar no es que el
    // indicador diga «Guardando» —mientras de verdad se está enviando, eso es
    // la verdad— sino CUÁNTO lo dice seguido. El fallo medido fueron diez
    // minutos clavado en «Guardando».
    const estados: { estado: AutosaveState; en: number }[] = [];

    const queue = new AutosaveQueue("medicion", {
      send: async (pending) => saveAnswer("at-1", pending),
      onStateChange: (state) => estados.push({ estado: state, en: Date.now() }),
      onDeadlinePassed: () => undefined,
      storage: null,
    });
    queue.start();
    queue.queue(RESPUESTA);

    await vi.advanceTimersByTimeAsync(600_000); // diez minutos de examen

    const nombres = estados.map((e) => e.estado);
    expect(intentos(), "ni un reintento en diez minutos").toBeGreaterThan(4);
    // `timeout` y no `offline`: la revisión señaló que la primera versión de
    // este test fijaba en verde justo la afirmación que el cambio evitaba.
    expect(nombres).toContain("timeout");
    expect(nombres).not.toContain("offline");
    expect(nombres).toContain("retrying");

    // El tramo más largo diciendo «Guardando» sin cambiar de idea.
    let peorTramo = 0;
    for (const [i, e] of estados.entries()) {
      if (e.estado !== "saving") continue;
      const finaliza = estados[i + 1]?.en ?? Date.now();
      peorTramo = Math.max(peorTramo, finaliza - e.en);
    }
    expect(peorTramo, "el alumno se quedó mirando «Guardando»").toBeLessThanOrEqual(13_000);

    // Y lo que NO cambia: la respuesta sigue pendiente, no se ha tirado.
    expect(queue.hasPending).toBe(true);

    queue.stop();
  });

  it("`flush()` no devuelve el control mientras hay un envío colgado", async () => {
    // La segunda mitad de la causa: `flush()` salía por `inFlight !== null` y
    // devolvía enseguida. `doSubmit` hace `await queue.flush()` antes de
    // entregar precisamente para que la última respuesta llegue; si ese `await`
    // es un no-op, el alumno entrega sin su última respuesta.
    vi.useFakeTimers();
    // En un objeto y no en un `let`: TypeScript estrecha a `never` una variable
    // que solo se asigna dentro de una callback, y `resolverEnvio?.()` deja de
    // compilar. Una propiedad no sufre ese estrechamiento.
    const envio: { resolver: (() => void) | null } = { resolver: null };
    const queue = new AutosaveQueue("flush", {
      send: () =>
        new Promise<{ revision: number }>((resolve) => {
          envio.resolver = () => resolve({ revision: 1 });
        }),
      onStateChange: () => undefined,
      onDeadlinePassed: () => undefined,
      storage: null,
    });
    queue.queue(RESPUESTA);

    let primeroTerminado = false;
    let segundoTerminado = false;
    void queue.flush().then(() => (primeroTerminado = true));
    await vi.advanceTimersByTimeAsync(900); // pasa el debounce, el envío vuela

    void queue.flush().then(() => (segundoTerminado = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(segundoTerminado, "el segundo flush devolvió antes de que el envío llegara").toBe(false);

    envio.resolver?.();
    await vi.advanceTimersByTimeAsync(10);
    expect(primeroTerminado).toBe(true);
    expect(segundoTerminado).toBe(true);

    queue.stop();
  });
});

/**
 * ===========================================================================
 * SEGUNDA VUELTA — lo que la revisión encontró que la primera no cerraba
 * ===========================================================================
 */

describe("flush() tiene que vaciar la cola, no solo esperar a un ciclo", () => {
  it("envía lo que el alumno escribió DESPUÉS de arrancar el ciclo en curso", async () => {
    // El agujero: `runCycle` fotografía `pending` al empezar. Un `flush()` que
    // llega a mitad esperaba a ese ciclo —mejor que irse de vacío— pero el
    // ciclo solo manda la foto vieja. Con una red lenta pero VIVA (2-3 s por
    // guardado) eso es: el niño responde la última pregunta, pulsa Entregar,
    // `doSubmit` hace `await queue.flush()`, la entrega sale, tiene éxito, y
    // `clearPersisted()` borra del disco una respuesta que nunca viajó.
    vi.useFakeTimers();
    const enviados: string[] = [];
    const queue = new AutosaveQueue("entrega", {
      send: async (pending) => {
        enviados.push(pending.attemptItemId);
        await new Promise((r) => setTimeout(r, 2_000)); // red lenta pero viva
        return { revision: 1 };
      },
      onStateChange: () => undefined,
      onDeadlinePassed: () => undefined,
      storage: null,
    });

    queue.queue({ ...RESPUESTA, attemptItemId: "i1" });
    await vi.advanceTimersByTimeAsync(900); // pasa el debounce: ciclo con la foto [i1]
    expect(enviados).toEqual(["i1"]);

    // El niño responde la última pregunta mientras i1 todavía vuela.
    queue.queue({ ...RESPUESTA, attemptItemId: "i2" });

    // Y pulsa «Entregar»: esto es exactamente lo que hace `doSubmit`.
    const flushDeEntrega = queue.flush({ hastaVaciar: true });
    await vi.advanceTimersByTimeAsync(20_000);
    await flushDeEntrega;

    expect(enviados, "flush() devolvió sin enviar la última respuesta del alumno").toEqual([
      "i1",
      "i2",
    ]);
    expect(queue.hasPending, "doSubmit entregaría con respuestas sin enviar").toBe(false);

    queue.stop();
  });

  it("no se queda dando vueltas para siempre si los envíos fallan", async () => {
    // El otro extremo del mismo arreglo: si un ciclo falla, insistir en bucle
    // aquí es un bucle caliente que cuelga la entrega. Ya hay un reintento con
    // backoff programado; `flush()` tiene que devolver el control.
    vi.useFakeTimers();
    let intentos = 0;
    const queue = new AutosaveQueue("fallo", {
      send: async () => {
        intentos += 1;
        await Promise.resolve();
        throw new ApiError("offline", 0, "sin red");
      },
      onStateChange: () => undefined,
      onDeadlinePassed: () => undefined,
      storage: null,
    });

    queue.queue({ ...RESPUESTA, attemptItemId: "i1" });
    await vi.advanceTimersByTimeAsync(900);

    // Devuelve, y en un número acotado de intentos: si esto se colgara, el
    // test moriría por timeout igual que el fallo original.
    await queue.flush({ hastaVaciar: true });
    expect(intentos).toBeLessThan(20);
    expect(queue.hasPending).toBe(true);

    queue.stop();
  });
});

describe("el plazo cubre la petición entera, no solo las cabeceras", () => {
  it("un cuerpo que no llega nunca también se rinde", async () => {
    // `fetch` resuelve con las CABECERAS. Un proxy o portal de colegio que
    // acepta, contesta 200 y deja el cuerpo a medias reproduce el fallo
    // original entero: cola bloqueada y «Guardando» eterno.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise(() => {}), // el cuerpo nunca llega
        }),
      ),
    );

    const resultado = saveAnswer("at-1", RESPUESTA).then(
      () => "resolvió" as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(PLAZO_GUARDAR_MS + 1_000);

    await expect(resultado).resolves.toMatchObject({ kind: "timeout" });
  });
});

describe("un plazo agotado no se le cuenta al alumno como «sin conexión»", () => {
  it("la cola distingue el cuelgue de la red caída", async () => {
    // Se introdujo `kind: "timeout"` justamente para no afirmar «no llegamos a
    // internet» cuando la petición pudo llegar. Si la cola lo colapsa a
    // `offline`, el indicador dice «Sin conexión. Seguimos guardando en este
    // dispositivo.» y volvemos a afirmar lo que no consta.
    vi.useFakeTimers();
    fetchColgado();
    const estados: AutosaveState[] = [];

    const queue = new AutosaveQueue("cuelgue", {
      send: async (pending) => saveAnswer("at-1", pending),
      onStateChange: (state) => estados.push(state),
      onDeadlinePassed: () => undefined,
      storage: null,
    });
    queue.start();
    queue.queue(RESPUESTA);

    await vi.advanceTimersByTimeAsync(PLAZO_GUARDAR_MS + 1_000);

    expect(estados).toContain("timeout");
    expect(estados, "un cuelgue no es una red caída").not.toContain("offline");

    queue.stop();
  });
});
