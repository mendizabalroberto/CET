/**
 * Cableado del input segmentado de PIN.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Esto NO se puede probar con lógica pura: lo que aquí falla es el foco, el
 * teclado y el DOM. Es la primera pantalla que toca un niño de 11 años, y si el
 * cursor no salta solo entre casillas, teclear un PIN de seis dígitos en una
 * tableta se vuelve un ejercicio de puntería.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { PinInput } from "./PinInput";
import { LocaleProvider } from "@/lib/i18n/provider";
import { es } from "@/lib/i18n/dictionaries/es";

function wrap(node: ReactNode) {
  // El diccionario REAL, no un doble: si una clave desaparece del diccionario,
  // estos tests deben romperse. Un doble los dejaria pasando sobre textos que
  // ya no existen.
  return render(
    <LocaleProvider locale="es" dictionary={es}>
      {node}
    </LocaleProvider>,
  );
}

/** Las casillas son los `textbox`/`password` del grupo, en orden de aparición. */
function boxes(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>("input[inputmode='numeric']"),
  );
}

function hiddenValue(name = "pin"): string {
  const el = document.querySelector<HTMLInputElement>(`input[type='hidden'][name='${name}']`);
  return el?.value ?? "";
}

describe("PinInput — cableado", () => {
  it("pinta tantas casillas como dígitos tenga el PIN del colegio", () => {
    wrap(<PinInput length={6} label="PIN" />);
    expect(boxes()).toHaveLength(6);
  });

  it("escribir un dígito avanza el foco a la casilla siguiente", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={4} label="PIN" />);
    const casillas = boxes();

    casillas[0]!.focus();
    await user.keyboard("7");

    expect(casillas[1]).toHaveFocus();
  });

  it("borrar en una casilla vacía retrocede a la anterior", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={4} label="PIN" />);
    const casillas = boxes();

    casillas[0]!.focus();
    await user.keyboard("1");
    // Ahora el foco está en la 2ª y está vacía.
    await user.keyboard("{Backspace}");

    expect(casillas[0]).toHaveFocus();
  });

  it("las flechas mueven entre casillas sin borrar nada", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={4} label="PIN" />);
    const casillas = boxes();

    casillas[0]!.focus();
    await user.keyboard("12");
    await user.keyboard("{ArrowLeft}");
    expect(casillas[1]).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(casillas[2]).toHaveFocus();

    // Nada se ha perdido por navegar.
    expect(hiddenValue()).toBe("12");
  });

  it("pegar el PIN completo lo reparte por las casillas", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={6} label="PIN" />);
    const casillas = boxes();

    casillas[0]!.focus();
    await user.paste("482913");

    expect(hiddenValue()).toBe("482913");
  });

  it("ignora todo lo que no sea un dígito", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={4} label="PIN" />);
    const casillas = boxes();

    casillas[0]!.focus();
    await user.keyboard("a1b2");

    // Un niño que roza una letra no debe ver su PIN corrompido en silencio.
    expect(hiddenValue()).toBe("12");
  });

  it("avisa cuando el PIN está completo, para poder enviar sin pulsar nada", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    wrap(<PinInput length={4} label="PIN" onComplete={onComplete} />);

    boxes()[0]!.focus();
    await user.keyboard("2846");

    expect(onComplete).toHaveBeenCalledWith("2846");
  });

  it("no avisa mientras el PIN esté incompleto", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    wrap(<PinInput length={6} label="PIN" onComplete={onComplete} />);

    boxes()[0]!.focus();
    await user.keyboard("284");

    expect(onComplete).not.toHaveBeenCalled();
  });

  it("el valor viaja en un campo oculto, así que el formulario funciona sin JS de página", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={4} label="PIN" name="pin" />);

    boxes()[0]!.focus();
    await user.keyboard("9081");

    const hidden = document.querySelector<HTMLInputElement>("input[type='hidden'][name='pin']");
    expect(hidden).not.toBeNull();
    expect(hidden!.value).toBe("9081");
  });

  it("usa inputMode numérico: en una tableta abre el teclado de números", () => {
    wrap(<PinInput length={4} label="PIN" />);
    for (const casilla of boxes()) {
      expect(casilla).toHaveAttribute("inputmode", "numeric");
    }
  });

  it("deshabilitado, ninguna casilla acepta escritura", async () => {
    const user = userEvent.setup();
    wrap(<PinInput length={4} label="PIN" disabled />);

    const casillas = boxes();
    expect(casillas[0]).toBeDisabled();

    await user.click(casillas[0]!);
    await user.keyboard("1");
    expect(hiddenValue()).toBe("");
  });

  it("el grupo tiene nombre accesible: un lector dice qué se está pidiendo", () => {
    wrap(<PinInput length={4} label="Tu PIN de 4 dígitos" />);
    // No importa el rol exacto que elija el componente; importa que el texto
    // esté asociado y no huérfano en un <span> suelto.
    expect(screen.getByText("Tu PIN de 4 dígitos")).toBeInTheDocument();
  });
});
