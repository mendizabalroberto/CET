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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PracticeSession } from "./PracticeSession";
import { TelemetryProvider } from "@/lib/telemetry/provider";

/**
 * `math.simplify` en vez del tema mezclado: es determinista en su FORMA (siempre
 * pide simplificar una fracción y siempre acepta texto), así que el test no
 * depende de qué generador toque por azar.
 */
const TOPIC = "math.simplify";

function renderPractice() {
  return render(
    <TelemetryProvider>
      <PracticeSession topicId={TOPIC} locale="es" />
    </TelemetryProvider>,
  );
}

/** El campo donde el alumno escribe su respuesta. */
function answerField(): HTMLElement {
  return screen.getByRole("textbox");
}

/** El botón de acción: primero «Comprobar», después «Siguiente». */
function actionButton(): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const action = buttons.find((b) => b.getAttribute("type") === "submit") ?? buttons[0];
  if (action === undefined) throw new Error("no hay ningun boton en la pantalla de practica");
  return action;
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

  it("la respuesta correcta no está en el DOM antes de contestar", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    // Los paneles de pista y solución existen ocultos con `hidden` en muchas
    // implementaciones; ahí el contenido SÍ está en el HTML y basta con abrir
    // el inspector. Este test fija que no se renderice hasta pedirlo.
    const solucion = screen.queryByTestId("practice-solution");
    expect(solucion).toBeNull();
  });

  it("pedir la pista la muestra, y no antes", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const antes = screen.queryByTestId("practice-hint");
    expect(antes).toBeNull();

    const hintButton = screen
      .getAllByRole("button")
      .find((b) => /pista/i.test(b.textContent ?? ""));

    if (hintButton) {
      await user.click(hintButton);
      await waitFor(() => {
        expect(screen.queryByTestId("practice-hint")).not.toBeNull();
      });
    }
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
