/**
 * @cet/ui — teclado en pantalla de respuesta.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUE EXISTE
 *
 * El destino es una tableta de colegio compartida. Con el teclado del sistema,
 * el campo de respuesta queda tapado (hueco declarado en el spec de tactil: no
 * hay ni una linea de `visualViewport` en el repo). Con teclado propio, el del
 * sistema no aparece y el problema deja de existir.
 *
 * Lo que este fichero vigila, y por que cada cosa:
 *
 *  - QUE TECLAS SALEN. No es un teclado generico: las teclas se derivan de lo
 *    que la respuesta admite. Un nino al que le toca `math.compare` no necesita
 *    digitos, y uno al que le toca `math.mixed` SI necesita el espacio.
 *  - EL SEPARADOR DECIMAL SIGUE AL IDIOMA. En espanol el alumno ve "31,83" en
 *    el enunciado; darle un punto seria pedirle que escriba distinto de lo que
 *    lee. `parseAnswer` tolera las dos, pero la tolerancia del corrector no es
 *    excusa para una tecla incoherente.
 *  - SON BOTONES DE VERDAD. Un `div` con `onClick` deja fuera a quien navega
 *    con teclado y a quien usa lector de pantalla.
 *  - UN SOLO ALTO EN LA TABULACION. Doce botones metidos en el orden de
 *    tabulacion hacen insufrible llegar al resto de la pagina: el teclado usa
 *    tabindex movil (patron de barra de herramientas) y se recorre con flechas.
 */

import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { LocaleProvider } from "../src/lib/i18n.js";
import { AnswerKeypad } from "../src/input/AnswerKeypad.js";
import {
  keypadCharacters,
  keypadKeys,
  keypadLayoutFor,
} from "../src/input/keypad-layout.js";

/* ------------------------------------------------------------------ *
 * 1. Que teclas salen                                                 *
 * ------------------------------------------------------------------ */

function caracteres(spec: Parameters<typeof keypadLayoutFor>[0], locale: "es" | "en"): string {
  const layout = keypadLayoutFor(spec, locale);
  if (layout === null) return "";
  return [...keypadCharacters(layout)].sort().join("");
}

describe("keypadLayoutFor — las teclas salen del item, no de un teclado generico", () => {
  it("una respuesta numerica trae los diez digitos y el separador decimal", () => {
    expect(caracteres({ answerType: "numeric" }, "en")).toBe(".0123456789");
  });

  it("en espanol el separador decimal es la coma, que es lo que el alumno lee", () => {
    expect(caracteres({ answerType: "numeric" }, "es")).toBe(",0123456789");
  });

  it("una fraccion trae la barra y el espacio, porque `1 3/4` y `7/4` valen igual", () => {
    // `math.mixed` y `math.fracop` producen canonicas mixtas ("3 1/4", "1 3/10").
    // Sin la tecla de espacio el alumno no puede escribir su propia respuesta.
    expect(caracteres({ answerType: "fraction" }, "es")).toBe(" /0123456789");
  });

  it("una fraccion NO trae separador decimal: no es la notacion que se le pide", () => {
    expect(caracteres({ answerType: "fraction" }, "es")).not.toContain(",");
  });

  it("`> < =` sale del placeholder del item, y no arrastra digitos", () => {
    expect(caracteres({ answerType: "text", placeholder: "> < =" }, "es")).toBe("<=>");
  });

  it("un texto cuyo placeholder es prosa no inventa un teclado", () => {
    // Preferimos quedarnos sin teclado —y dejar el del sistema— antes que
    // ofrecer teclas que no sirven para contestar.
    expect(keypadLayoutFor({ answerType: "text", placeholder: "escribe la palabra" }, "es")).toBeNull();
  });

  it("lo que no se teclea no lleva teclado", () => {
    expect(keypadLayoutFor({ answerType: "choice" }, "es")).toBeNull();
    expect(keypadLayoutFor({ answerType: "ordering" }, "es")).toBeNull();
  });

  it("toda tecla tiene nombre accesible en los dos idiomas", () => {
    for (const spec of [
      { answerType: "numeric" },
      { answerType: "fraction" },
      { answerType: "text", placeholder: "> < =" },
    ] as const) {
      const layout = keypadLayoutFor(spec, "es");
      expect(layout).not.toBeNull();
      for (const key of keypadKeys(layout!)) {
        // `I18nText` deja los idiomas opcionales (basta con uno), pero el nombre
        // de una tecla tiene que existir en los dos: un boton sin nombre en el
        // idioma del alumno no existe para su lector de pantalla.
        for (const idioma of ["es", "en"] as const) {
          const nombre = key.label[idioma] ?? "";
          expect(nombre.trim().length, `tecla ${key.id} sin nombre en ${idioma}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("siempre hay una tecla de borrar: sin ella un error obliga a empezar de cero", () => {
    for (const spec of [
      { answerType: "numeric" },
      { answerType: "fraction" },
      { answerType: "text", placeholder: "> < =" },
    ] as const) {
      const layout = keypadLayoutFor(spec, "es");
      expect(keypadKeys(layout!).some((k) => k.action === "backspace")).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. El componente                                                    *
 * ------------------------------------------------------------------ */

/** Envoltorio controlado, como lo monta la practica de verdad. */
function Banco({
  answerType = "numeric",
  placeholder,
  disabled = false,
  inicial = "",
}: {
  answerType?: string;
  placeholder?: string;
  disabled?: boolean;
  inicial?: string;
}) {
  const [value, setValue] = useState(inicial);
  const ref = useRef<HTMLInputElement | null>(null);
  const layout = keypadLayoutFor({ answerType, placeholder }, "es");
  return (
    <LocaleProvider locale="es">
      <input ref={ref} aria-label="Tu respuesta" value={value} onChange={(e) => setValue(e.target.value)} />
      {layout ? (
        <AnswerKeypad layout={layout} value={value} onChange={setValue} targetRef={ref} disabled={disabled} />
      ) : null}
    </LocaleProvider>
  );
}

describe("AnswerKeypad — se puede usar con el dedo, con el tabulador y con lector", () => {
  it("cada tecla es un <button> de verdad", () => {
    render(<Banco />);
    const teclas = screen.getAllByRole("button");
    expect(teclas.length).toBeGreaterThan(10);
    for (const tecla of teclas) expect(tecla.tagName).toBe("BUTTON");
  });

  it("todas las teclas declaran objetivo tactil de 44 px", () => {
    render(<Banco />);
    for (const tecla of screen.getAllByRole("button")) {
      expect(tecla.className, `tecla "${tecla.textContent ?? ""}" sin alto minimo`).toMatch(/min-h-touch/);
      expect(tecla.className, `tecla "${tecla.textContent ?? ""}" sin ancho minimo`).toMatch(/min-w-touch/);
    }
  });

  it("ninguna tecla sale en blanco", () => {
    // Una tecla sin nada dentro es un boton vacio: el lector la nombra, pero el
    // nino que la ve no sabe que hace. Vale texto o un glifo dibujado — la de
    // espacio lleva SVG porque "␣" se pinta como una mota de polvo.
    render(<Banco answerType="fraction" />);
    for (const tecla of screen.getAllByRole("button")) {
      const pinta =
        (tecla.textContent ?? "").trim().length > 0 || tecla.querySelector("svg path") !== null;
      expect(pinta, `tecla vacia: ${tecla.getAttribute("aria-label") ?? "?"}`).toBe(true);
    }
  });

  it("tocar una tecla escribe en el campo", async () => {
    const user = userEvent.setup();
    render(<Banco />);
    await user.click(screen.getByRole("button", { name: "3" }));
    await user.click(screen.getByRole("button", { name: "7" }));
    expect(screen.getByLabelText("Tu respuesta")).toHaveValue("37");
  });

  it("borrar quita el ultimo caracter, no toda la respuesta", async () => {
    const user = userEvent.setup();
    render(<Banco inicial="123" />);
    await user.click(screen.getByRole("button", { name: /borrar/i }));
    expect(screen.getByLabelText("Tu respuesta")).toHaveValue("12");
  });

  it("escribe donde esta el cursor, no siempre al final", async () => {
    const user = userEvent.setup();
    render(<Banco inicial="14" />);
    const campo = screen.getByLabelText<HTMLInputElement>("Tu respuesta");
    campo.focus();
    campo.setSelectionRange(1, 1);
    await user.click(screen.getByRole("button", { name: "9" }));
    expect(campo).toHaveValue("194");
  });

  it("el teclado entero es UN solo alto de tabulacion", () => {
    render(<Banco />);
    const enfocables = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") !== "-1");
    expect(enfocables).toHaveLength(1);
  });

  it("dentro del teclado se navega con las flechas", async () => {
    const user = userEvent.setup();
    render(<Banco />);
    await user.tab();
    await user.tab(); // el campo primero, el teclado despues
    expect(screen.getByRole("button", { name: "1" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "2" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "5" })).toHaveFocus();
  });

  it("las flechas saltan los huecos de la rejilla", async () => {
    const user = userEvent.setup();
    render(<Banco answerType="fraction" />);
    await user.tab();
    await user.tab();
    // Ultima fila: [hueco] [0] [hueco] [hueco]. A la izquierda del 0 no hay
    // tecla, asi que la flecha tiene que seguir hasta la anterior de verdad
    // —el espacio, ultima de la fila de arriba— en vez de comerse la pulsacion
    // en una casilla vacia.
    screen.getByRole("button", { name: "0" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /espacio/i })).toHaveFocus();
  });

  it("arriba y abajo no se salen de la rejilla", async () => {
    const user = userEvent.setup();
    render(<Banco />);
    screen.getByRole("button", { name: "2" }).focus();
    await user.keyboard("{ArrowUp}");
    // Ya estaba en la primera fila: se queda, no salta a la última.
    expect(screen.getByRole("button", { name: "2" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("button", { name: "0" })).toHaveFocus();
  });

  it("el tabulador SALE del teclado en un solo salto", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Banco />
        <button type="button">Comprobar</button>
      </>,
    );
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Comprobar" })).toHaveFocus();
  });

  it("deshabilitado no escribe, y lo dice de una forma que no es solo el color", async () => {
    const user = userEvent.setup();
    render(<Banco inicial="5" disabled />);
    const tecla = screen.getByRole("button", { name: "3" });
    expect(tecla).toBeDisabled();
    await user.click(tecla);
    expect(screen.getByLabelText("Tu respuesta")).toHaveValue("5");
  });

  it("el grupo tiene nombre accesible y explica como se recorre", () => {
    render(<Banco />);
    const grupo = screen.getByRole("group", { name: /teclado/i });
    const describedBy = grupo.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent ?? "").toMatch(/flechas/i);
  });

  it("no tiene violaciones de axe", async () => {
    const { container } = render(<Banco />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("un teclado de comparacion no ensena digitos", () => {
    render(<Banco answerType="text" placeholder="> < =" />);
    expect(screen.queryByRole("button", { name: "7" })).toBeNull();
    expect(screen.getByRole("button", { name: /mayor que/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /menor que/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /igual/i })).toBeInTheDocument();
  });

  it("no secuestra el teclado fisico: teclear en el campo sigue funcionando", async () => {
    const user = userEvent.setup();
    render(<Banco />);
    const campo = screen.getByLabelText("Tu respuesta");
    await user.click(campo);
    await user.keyboard("1 3/4");
    expect(campo).toHaveValue("1 3/4");
  });

  it("pulsar una tecla no roba el foco del campo (el cursor no se pierde)", async () => {
    const user = userEvent.setup();
    render(<Banco />);
    const campo = screen.getByLabelText("Tu respuesta");
    campo.focus();
    await user.click(screen.getByRole("button", { name: "8" }));
    expect(campo).toHaveFocus();
  });

  it("no emite onChange cuando esta deshabilitado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const layout = keypadLayoutFor({ answerType: "numeric" }, "es");
    render(
      <LocaleProvider locale="es">
        <AnswerKeypad layout={layout!} value="" onChange={onChange} disabled />
      </LocaleProvider>,
    );
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
