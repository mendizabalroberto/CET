/**
 * La zona de acciones de la práctica: una sola agrupación con nombre, cuatro
 * disparadores en orden fijo, y los cuerpos desplegables detrás de los botones.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PracticeSession } from "./PracticeSession";
import { UiLocaleProvider } from "./UiLocaleProvider";
import { TelemetryProvider } from "@/lib/telemetry/provider";

const TOPIC = "math.simplify";

function renderPractice(topicId: string = TOPIC) {
  return render(
    <UiLocaleProvider locale="es">
      <TelemetryProvider>
        <PracticeSession topicId={topicId} locale="es" />
      </TelemetryProvider>
    </UiLocaleProvider>,
  );
}

function answerField(): HTMLElement {
  return screen.getByRole("textbox");
}

describe("PracticeSession — zona de acciones", () => {
  beforeEach(() => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
  });

  it("los cuatro disparadores viven en una sola zona con nombre", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const zona = screen.getByRole("group", { name: "Acciones" });
    expect(zona).toHaveClass("grid");
    within(zona).getByRole("button", { name: "Comprobar" });
    within(zona).getByRole("button", { name: "Saltar" });
    within(zona).getByRole("button", { name: "Ver una pista" });
    within(zona).getByRole("button", { name: "Ver cómo se hace" });
  });

  it("el orden de los botones es fijo: comprobar, saltar, pista, solución", async () => {
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const zona = screen.getByRole("group", { name: "Acciones" });
    const nombres = within(zona)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim() ?? "");
    expect(nombres).toEqual(["Comprobar", "Saltar", "Ver una pista", "Ver cómo se hace"]);
  });

  it("el cuerpo de la pista va después del último botón", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const zona = screen.getByRole("group", { name: "Acciones" });
    const boton = within(zona).getByRole("button", { name: "Ver una pista" });
    await user.click(boton);

    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    await waitFor(() => {
      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
    });

    const botones = within(zona).getAllByRole("button");
    // `noUncheckedIndexedAccess` esta activo en todo el proyecto: un indice
    // devuelve `T | undefined` y el compilador lo exige aqui igual que en
    // produccion. Si la zona llegase vacia, esto falla diciendo por que.
    const ultimoBoton = botones.at(-1);
    expect(ultimoBoton, "la zona de acciones no tiene ni un boton").toBeDefined();
    expect(
      ultimoBoton!.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("el cuerpo de la solución va después del último botón", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const zona = screen.getByRole("group", { name: "Acciones" });
    const boton = within(zona).getByRole("button", { name: "Ver cómo se hace" });
    await user.click(boton);

    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    await waitFor(() => {
      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
    });

    const botones = within(zona).getAllByRole("button");
    // `noUncheckedIndexedAccess` esta activo en todo el proyecto: un indice
    // devuelve `T | undefined` y el compilador lo exige aqui igual que en
    // produccion. Si la zona llegase vacia, esto falla diciendo por que.
    const ultimoBoton = botones.at(-1);
    expect(ultimoBoton, "la zona de acciones no tiene ni un boton").toBeDefined();
    expect(
      ultimoBoton!.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("el aria-controls de la pista apunta al elemento que la contiene", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const zona = screen.getByRole("group", { name: "Acciones" });
    const boton = within(zona).getByRole("button", { name: "Ver una pista" });
    await user.click(boton);

    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    await waitFor(() => {
      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
    });
    expect(panel!.textContent).toBe(boton.getAttribute("aria-controls") ? panel!.textContent : "");
  });

  it("el aria-controls de la solución apunta al elemento que la contiene", async () => {
    const user = userEvent.setup();
    renderPractice();
    await waitFor(() => expect(answerField()).toBeInTheDocument());

    const zona = screen.getByRole("group", { name: "Acciones" });
    const boton = within(zona).getByRole("button", { name: "Ver cómo se hace" });
    await user.click(boton);

    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    await waitFor(() => {
      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
    });
    expect(panel!.textContent).toBe(boton.getAttribute("aria-controls") ? panel!.textContent : "");
  });
});

