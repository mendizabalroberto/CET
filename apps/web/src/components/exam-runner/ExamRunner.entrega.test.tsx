/**
 * LO QUE VE EL ALUMNO CUANDO LA ENTREGA NO LLEGA.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FIJA ESTE FICHERO
 * ===========================================================================
 * Es la mitad de interfaz del fallo de la red colgada. La otra mitad —el plazo—
 * está en `plazo.test.ts`; sin ella nada de esto ocurriría nunca porque la
 * petición no termina.
 *
 * Lo medido en navegador el 27/08: el alumno pulsa «Sí, entregar» y los TRES
 * botones del diálogo quedan deshabilitados, sin ningún mensaje, mientras el
 * cronómetro sigue bajando. Y si el reloj llega a cero durante ese cuelgue,
 * `onExpired → doSubmit("timer")` sale por `guardRef.current.busy` sin hacer
 * absolutamente nada.
 *
 * ===========================================================================
 * LAS DOS REGLAS
 * ===========================================================================
 * 1. **Nunca un botón muerto.** Si la entrega no llega, el alumno ve qué ha
 *    pasado y tiene un botón vivo para reintentar.
 * 2. **No inventar tranquilidad** (R4 del repo). Mientras la entrega no conste,
 *    no se le dice que ha entregado. Se le dice la verdad: que sus respuestas
 *    están guardadas en el aparato y que seguimos intentándolo.
 *
 * Se renderiza el `ExamRunner` REAL contra un `fetch` colgado. Un test sobre
 * una función pura de estado pasaría en verde con el botón deshabilitado en el
 * JSX: lo que hay que probar es lo que el niño puede pulsar.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAZO_ENTREGAR_MS } from "@/lib/net/plazo";

import { ExamRunner } from "./ExamRunner";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/telemetry/provider", () => ({
  useTelemetry: () => ({ track: vi.fn() }),
}));

const AHORA = new Date("2026-08-27T13:00:00.000Z");

function respuestaStart(minutosRestantes: number): unknown {
  return {
    attemptId: "11111111-1111-4111-8111-111111111111",
    serverNow: AHORA.toISOString(),
    serverDeadlineAt: new Date(AHORA.getTime() + minutosRestantes * 60_000).toISOString(),
    allowBack: true,
    feedbackMode: "after_submit",
    resumed: false,
    items: [
      { id: "i1", ord: 1, renderedBody: { stem: "3/4 + 1/4" }, maxPoints: 1, format: "short_text" },
    ],
  };
}

/** `/start` y `/answer` contestan; `/submit` acepta la conexión y no contesta jamás. */
function redQueCuelgaAlEntregar(minutosRestantes = 25): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/submit")) {
        return new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }
      const cuerpo = url.includes("/start") ? respuestaStart(minutosRestantes) : { revision: 1 };
      return Promise.resolve({ ok: true, status: 200, json: async () => cuerpo });
    }),
  );
}

/**
 * La red colgada DE VERDAD: `/start` contesta (el examen llegó a abrirse) y a
 * partir de ahí nada vuelve — ni guardar ni entregar. Es lo que pasa cuando el
 * wifi del colegio deja de encaminar a mitad del examen, y la única forma de
 * medir el silencio real de la entrega: con `/answer` contestando, el vaciado
 * de la cola termina en milisegundos y el número sale más bonito de lo que es.
 */
function redColgadaDelTodo(minutosRestantes = 25): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/start")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => respuestaStart(minutosRestantes),
        });
      }
      return new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }),
  );
}

function boton(nombre: RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name: nombre });
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function entregar(): Promise<void> {
  await act(async () => {
    boton(/Entregar mi examen/i).click();
  });
  await act(async () => {
    boton(/Sí, entregar/i).click();
  });
}

beforeEach(() => {
  // `performance` va en la lista a propósito: `ExamTimer` descuenta con
  // `performance.now()` —un reloj monótono, para que cambiar la hora del
  // aparato no alargue el examen— y vitest NO lo falsea por defecto. Sin esto
  // el cronómetro no avanza ni un segundo y el test del tiempo agotado sería
  // verde sin haber probado nada.
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
  });
  vi.setSystemTime(AHORA);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("la entrega con la red colgada", () => {
  it("deja al alumno un botón vivo y un mensaje, en vez de tres botones muertos", async () => {
    redQueCuelgaAlEntregar();
    render(<ExamRunner assignmentId="a1" locale="es" resultHref="/exam/1/result" />);

    await waitFor(() => expect(screen.getByText(/3\/4/)).toBeInTheDocument());
    await entregar();

    // Mientras vuela, deshabilitado está BIEN: evita la doble entrega.
    expect(boton(/Entregando/i)).toBeDisabled();

    await avanzar(PLAZO_ENTREGAR_MS + 500);

    // Y a partir de aquí, ni un botón muerto ni una pantalla muda.
    // `Alert` pinta el título dos veces: una visible y otra como etiqueta de
    // tono para el lector de pantalla. Lo que se comprueba es que esté.
    expect(screen.getAllByText(/tardando/i).length).toBeGreaterThan(0);
    expect(boton(/Entregar mi examen/i)).toBeEnabled();
  });

  it("no le dice que ha entregado cuando no consta que entregara", async () => {
    redQueCuelgaAlEntregar();
    render(<ExamRunner assignmentId="a1" locale="es" resultHref="/exam/1/result" />);

    await waitFor(() => expect(screen.getByText(/3\/4/)).toBeInTheDocument());
    await entregar();
    await avanzar(PLAZO_ENTREGAR_MS + 500);

    // R4: silencioso es peor que ruidoso, pero mentir es peor que las dos.
    expect(screen.queryByText(/entregado/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/guardadas en este aparato/i).length).toBeGreaterThan(0);
  });

  it("si el reloj llega a cero durante el cuelgue, el alumno sigue pudiendo entregar", async () => {
    // El peor camino del producto y la pregunta 3 del spec. Hoy: `onExpired`
    // llama a `doSubmit("timer")`, que sale por `guard.busy` sin hacer nada, y
    // el botón principal queda deshabilitado por `timeUp` para siempre.
    // La respuesta NO puede ser «no pasa nada y se queda ahí».
    redQueCuelgaAlEntregar(1); // un minuto de examen
    render(<ExamRunner assignmentId="a1" locale="es" resultHref="/exam/1/result" />);

    await waitFor(() => expect(screen.getByText(/3\/4/)).toBeInTheDocument());
    await entregar();

    await avanzar(70_000); // se acaba el tiempo con la entrega en vuelo
    await avanzar(PLAZO_ENTREGAR_MS + 500); // y luego vence el plazo

    expect(screen.getAllByText(/Seguimos intentando entregarlo/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/guardadas en este aparato/i).length).toBeGreaterThan(0);
    expect(boton(/entregar/i)).toBeEnabled();
  });
});

describe("cuánto dura de verdad el silencio de la entrega", () => {
  it("mide el suelo con una respuesta sin enviar en la cola", async () => {
    // La primera versión de estos tests NUNCA encolaba una respuesta, así que
    // medía 25 s y no vio nunca el suelo real. `doSubmit` hace
    // `await queue.flush({ hastaVaciar: true })` DENTRO del cerrojo y antes de
    // entregar: con la red colgada eso es el plazo de guardar (12 s) MÁS el de
    // entregar (25 s). Este test fija el número para que la decisión de no
    // reintentar automáticamente se tome sobre la aritmética correcta.
    redColgadaDelTodo();
    render(<ExamRunner assignmentId="a1" locale="es" resultHref="/exam/1/result" />);
    await waitFor(() => expect(screen.getByText(/3\/4/)).toBeInTheDocument());

    // El niño responde la última pregunta. Esto deja algo en la cola.
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "1" } });
    });
    await entregar();

    // Mientras vuela, el botón se llama «Entregando…», así que no basta con
    // buscarlo por su nombre normal: hay que preguntar si EXISTE alguno vivo
    // con el que el alumno pueda volver a intentarlo.
    const hayBotonVivo = (): boolean =>
      screen
        .queryAllByRole("button", { name: /Entregar mi examen|Intentar entregar otra vez/i })
        .some((b) => !b.hasAttribute("disabled"));

    let segundosMuertos = 0;
    while (segundosMuertos < 60 && !hayBotonVivo()) {
      await avanzar(1_000);
      segundosMuertos += 1;
    }

    // eslint-disable-next-line no-console
    console.log(`SEGUNDOS CON EL BOTON DESHABILITADO: ${segundosMuertos}`);

    // El suelo real son 37 s (12 de vaciado + 25 de entrega), no 25.
    expect(segundosMuertos).toBeGreaterThan(30);
    expect(segundosMuertos).toBeLessThanOrEqual(40);
    // Y cuando vuelve, vuelve con mensaje. Nunca un botón vivo sin explicación.
    expect(screen.getAllByText(/tardando/i).length).toBeGreaterThan(0);
  });
});

describe("no se entrega sin la última respuesta del alumno", () => {
  it("manda lo que escribió mientras volaba el guardado anterior, y luego entrega", async () => {
    // El fallo que encontró la revisión, visto desde la pantalla: con red lenta
    // pero VIVA el niño corrige su respuesta mientras la anterior viaja, pulsa
    // «Entregar», y la entrega salía sin la corrección. Después
    // `clearPersisted()` la borraba del disco: se perdía de verdad.
    const peticiones: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/start")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => respuestaStart(25) });
        }
        if (url.includes("/answer")) {
          const cuerpo = JSON.parse(String(init?.body)) as { response: { value: string } };
          peticiones.push(`answer:${cuerpo.response.value}`);
          // Red lenta pero viva: dos segundos por guardado.
          return new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ revision: 1 }) }), 2_000);
          });
        }
        peticiones.push("submit");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "submitted", attemptId: "a", scoreRaw: 1, scoreMax: 1 }),
        });
      }),
    );

    render(<ExamRunner assignmentId="a1" locale="es" resultHref="/exam/1/result" />);
    await waitFor(() => expect(screen.getByText(/3\/4/)).toBeInTheDocument());

    const campo = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(campo, { target: { value: "7" } });
    });
    await avanzar(900); // pasa el debounce: «7» sale hacia el servidor

    // Se lo piensa mejor con «7» todavía en vuelo.
    await act(async () => {
      fireEvent.change(campo, { target: { value: "42" } });
    });

    await entregar();
    await avanzar(20_000);

    expect(peticiones).toContain("answer:42");
    expect(
      peticiones.indexOf("answer:42"),
      "se entregó antes de mandar la última respuesta del alumno",
    ).toBeLessThan(peticiones.indexOf("submit"));
  });
});
