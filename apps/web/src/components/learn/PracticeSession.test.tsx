/**
 * Cableado del bucle de práctica.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La MÁQUINA del bucle (racha, aciertos, pistas) ya se prueba pura en
 * `practice-machine.test.ts`. Lo que se prueba aquí es lo otro: el cableado que
 * une esa máquina con el DOM, que es donde viven los fallos que un test puro no
 * puede ver.
 *
 * En concreto el foco. Al responder, el input se deshabilita; si nadie recoloca
 * el foco, se cae al `<body>` y quien navega con teclado o con lector de
 * pantalla se queda huérfano en CADA pregunta. En un bucle de 40 preguntas eso
 * no es un detalle de accesibilidad: es el producto entero roto para ese
 * alumno. El trainer original de Y6A lo hacía bien, y era invisible en el
 * código hasta que se prueba.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PracticeSession } from "./PracticeSession";
import { UiLocaleProvider } from "./UiLocaleProvider";
import { TelemetryProvider } from "@/lib/telemetry/provider";

/**
 * `math.simplify` en vez del tema mezclado: es determinista en su FORMA (siempre
 * pide simplificar una fracción y siempre acepta texto), así que el test no
 * depende de qué generador toque por azar.
 */
const TOPIC = "math.simplify";

/**
 * Se monta con `UiLocaleProvider`, igual que la pantalla real: sin él, todo
 * `@cet/ui` cae a inglés y el test estaría probando una pantalla que ningún
 * alumno español ve. Ver la cabecera de `UiLocaleProvider.tsx`.
 */
function renderPractice(topicId: string = TOPIC) {
  return render(
    <UiLocaleProvider locale="es">
      <TelemetryProvider>
        <PracticeSession topicId={topicId} locale="es" />
      </TelemetryProvider>
    </UiLocaleProvider>,
  );
}

/** El campo donde el alumno escribe su respuesta. */
function answerField(): HTMLElement {
  return screen.getByRole("textbox");
}

/**
 * El botón de acción: primero «Comprobar», después «Siguiente pregunta».
 *
 * Se busca por NOMBRE, no por posición. Antes era «el primer botón de la
 * pantalla», y eso dejó de ser cierto en cuanto la pregunta pasó a llevar un
 * teclado en pantalla delante. Un ayudante que depende del orden del DOM prueba
 * la maquetación de ayer, no la acción.
 */
function actionButton(): HTMLElement {
  return screen.getByRole("button", { name: /comprobar|siguiente/i });
}

describe("PracticeSession — cableado", () => {
  beforeEach(() => {
    // La cola de telemetría intenta enviar por red. En jsdom no hay servidor:
    // se responde 204 para que el bucle no quede pendiente de una promesa rota.
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
  });

  it("arranca con una pregunta y un campo donde escribir", async () => {
    renderPractice();
    await waitFor(() => {
      expect(answerField()).toBeInTheDocument();
    });
  });

  it("tras responder, el foco NO se cae al body", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    await user.type(answerField(), "2/3");
    await user.click(actionButton());

    await waitFor(() => {
      // Lo que importa no es a qué elemento va, sino que NO se quede en el
      // body: desde ahí, un lector de pantalla pierde el hilo por completo.
      expect(document.activeElement).not.toBe(document.body);
    });
  });

  it("el resultado se anuncia en una región viva, no solo con color", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    await user.type(answerField(), "2/3");
    await user.click(actionButton());

    await waitFor(() => {
      const live = document.querySelector("[aria-live]");
      expect(live).not.toBeNull();
      expect(live!.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });
  });

  /**
   * Estos dos tests miraban un `data-testid` que NO EXISTE en ningún sitio del
   * repositorio, y además el de la pista iba envuelto en un `if` que nunca se
   * cumplía porque `@cet/ui` caía a inglés. O sea: pasaban en verde sin
   * comprobar nada (HANDOFF §3, «un test que pasa puede estar pasando por el
   * motivo equivocado»). Se reescriben contra el DOM de verdad; el requisito que
   * protegen —que ni la solución ni la pista estén ahí antes de pedirlas— es el
   * mismo, y ahora sí se comprueba.
   */
  it("la solución no está en el DOM antes de pedirla", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const boton = screen.getByRole("button", { name: /cómo se hace/i });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
    // `hidden` no bastaría: el contenido seguiría en el HTML y basta con abrir
    // el inspector para leerlo antes de contestar.
    expect(panel?.textContent?.trim() ?? "").toBe("");
  });

  it("pedir la pista la muestra, y no antes", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const boton = screen.getByRole("button", { name: /pista/i });
    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel?.textContent?.trim() ?? "").toBe("");
    expect(panel).not.toBeVisible();

    await user.click(boton);

    await waitFor(() => {
      expect(panel).toBeVisible();
      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
    });
  });

  it("el campo de respuesta tiene nombre accesible", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const field = answerField();
    const hasLabel =
      field.getAttribute("aria-label") !== null ||
      field.getAttribute("aria-labelledby") !== null ||
      (field.id !== "" && document.querySelector(`label[for="${field.id}"]`) !== null);

    expect(hasLabel, "el input de respuesta no tiene etiqueta asociada").toBe(true);
  });

  it("todo `aria-describedby` apunta a un elemento que existe", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    // Un `aria-describedby` colgando de un id inexistente es peor que no
    // ponerlo: el lector no dice nada y el desarrollador cree que sí.
    const rotos: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[aria-describedby]"))) {
      for (const id of (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) {
        if (document.getElementById(id) === null) rotos.push(id);
      }
    }
    expect(rotos, `aria-describedby apuntando a ids inexistentes: ${rotos.join(", ")}`).toEqual([]);
  });
});

/**
 * El teclado en pantalla. Lo que se prueba aquí es el CABLEADO, no el
 * componente (eso está en `packages/ui/__tests__/teclado-en-pantalla.test.tsx`):
 * que la práctica lo monta, que las teclas que monta son las de ESTE tema, y que
 * al pulsarlas la respuesta llega hasta el corrector.
 */
describe("PracticeSession — teclado en pantalla", () => {
  beforeEach(() => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
  });

  function teclado(): HTMLElement {
    return screen.getByRole("group", { name: /teclado/i });
  }

  it("la práctica monta un teclado en pantalla", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());
    expect(teclado()).toBeInTheDocument();
  });

  it("el teclado de una fracción trae barra y espacio, y ningún separador decimal", async () => {
    renderPractice(); // math.simplify -> clave de tipo fraction
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    expect(within(teclado()).getByRole("button", { name: /barra/i })).toBeInTheDocument();
    expect(within(teclado()).getByRole("button", { name: /espacio/i })).toBeInTheDocument();
    expect(within(teclado()).queryByRole("button", { name: /coma decimal/i })).toBeNull();
  });

  it("el teclado de un número trae la coma decimal en español", async () => {
    renderPractice("math.decimal");
    await waitFor(() => expect(answerField()).toBeInTheDocument());
    expect(within(teclado()).getByRole("button", { name: /coma decimal/i })).toBeInTheDocument();
    expect(within(teclado()).queryByRole("button", { name: /barra/i })).toBeNull();
  });

  it("el teclado de `math.compare` son tres símbolos y borrar, sin dígitos", async () => {
    renderPractice("math.compare");
    await waitFor(() => expect(answerField()).toBeInTheDocument());
    expect(within(teclado()).getByRole("button", { name: /mayor que/i })).toBeInTheDocument();
    expect(within(teclado()).queryByRole("button", { name: "7" })).toBeNull();
  });

  it("teclear con el dedo llega hasta el corrector", async () => {
    const user = userEvent.setup();
    renderPractice("math.compare");
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    // Se pulsan los tres símbolos: uno de ellos es la respuesta, así que el
    // bucle tiene que salir de "answering" pase lo que pase. Lo que se prueba
    // es que la pulsación viaja: campo -> máquina -> corrector.
    await user.click(within(teclado()).getByRole("button", { name: /mayor que/i }));
    expect(answerField()).toHaveValue(">");
    await user.click(actionButton());
    await waitFor(() => expect(actionButton()).toHaveTextContent(/siguiente/i));
  });

  it("con teclado propio no se levanta el del sistema", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());
    // `inputMode="none"` es lo que impide que el teclado virtual del sistema
    // tape el campo: el hueco de `visualViewport` declarado en el spec táctil.
    // El campo sigue enfocable y escribible con teclado físico.
    expect(answerField()).toHaveAttribute("inputmode", "none");
    expect(answerField()).not.toHaveAttribute("readonly");
  });

  it("el teclado físico sigue funcionando: se escribe y Enter pasa de pregunta", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    await user.type(answerField(), "2/3");
    expect(answerField()).toHaveValue("2/3");
    await user.click(actionButton());
    await waitFor(() => expect(actionButton()).toHaveTextContent(/siguiente/i));

    const enunciado = screen.getByRole("article").textContent;
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("article").textContent).not.toBe(enunciado));
  });

  it("tras responder, el teclado queda deshabilitado", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    await user.type(answerField(), "2/3");
    await user.click(actionButton());

    await waitFor(() => {
      for (const b of within(teclado()).getAllByRole("button")) expect(b).toBeDisabled();
    });
  });

  it("el teclado no se cuela en el orden de tabulación", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());
    const alcanzables = within(teclado())
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") !== "-1");
    expect(alcanzables).toHaveLength(1);
  });
});
