/**
 * El recolector de actos de interfaz: qué registra y, sobre todo, qué NO.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ SE PRUEBA AQUÍ Y POR QUÉ ASÍ
 * ===========================================================================
 * Estas pruebas son de FAMILIA, no de botones concretos. El recolector no sabe
 * nada de «practica.comprobar» ni de «examen.entregar»: sabe de `data-cet-id`.
 * Probar botones concretos ataría el test a la pantalla de hoy y no diría nada
 * de la regla.
 *
 * Las cuatro reglas que definen el fichero:
 *
 *   1. Sin `data-cet-id`, no hay evento. Es el limite del alcance, y es lo que
 *      separa medir de vigilar.
 *   2. Un `stopPropagation()` del componente no lo hace desaparecer. Los
 *      diálogos y los menús lo llaman constantemente; en fase de burbujeo, la
 *      mitad de los controles de un examen no se registrarían y nadie lo
 *      notaría, porque el botón seguiría funcionando.
 *   3. Un control montado en un PORTAL —todos los diálogos de React— se
 *      registra igual. El diálogo de entregar el examen es el control más
 *      cargado de significado de la aplicación.
 *   4. Una casilla emite un acto, no dos.
 */
import { createPortal } from "react-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UiInteractionScope } from "./UiInteractionScope";

const trackUi = vi.fn();
const trackNav = vi.fn();

vi.mock("@/lib/telemetry/provider", () => ({
  useTelemetry: () => ({
    track: vi.fn(),
    trackUi,
    trackNav,
    sessionId: "sesion-de-prueba",
    flush: vi.fn(),
  }),
}));

let ruta = "/practice";
vi.mock("next/navigation", () => ({
  usePathname: () => ruta,
}));

beforeEach(() => {
  trackUi.mockClear();
  trackNav.mockClear();
  ruta = "/practice";
});

describe("UiInteractionScope · qué se registra", () => {
  it("registra el control marcado y no el que no lo está", async () => {
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <button data-cet-id="practica.comprobar">Comprobar</button>
        <button>Un botón cualquiera sin marcar</button>
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("Comprobar"));
    await user.click(screen.getByText("Un botón cualquiera sin marcar"));

    expect(trackUi).toHaveBeenCalledTimes(1);
    expect(trackUi).toHaveBeenCalledWith(
      expect.objectContaining({ control: "practica.comprobar", action: "click" }),
    );
  });

  it("registra el clic sobre lo que hay DENTRO del control marcado", async () => {
    // Un botón con un icono y una etiqueta: el `event.target` es el `<span>`,
    // no el `<button>`. Sin el `closest`, cada botón con contenido dejaria de
    // medirse, que es la practica totalidad de ellos.
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <button data-cet-id="examen.entregar">
          <span>Entregar</span>
        </button>
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("Entregar"));

    expect(trackUi).toHaveBeenCalledWith(
      expect.objectContaining({ control: "examen.entregar" }),
    );
  });

  it("sobrevive a un stopPropagation del componente", async () => {
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <div onClick={(e) => e.stopPropagation()}>
          <button data-cet-id="dialogo.cerrar">Cerrar</button>
        </div>
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("Cerrar"));

    expect(trackUi).toHaveBeenCalledWith(expect.objectContaining({ control: "dialogo.cerrar" }));
  });

  it("registra los controles montados en un portal", async () => {
    const user = userEvent.setup();
    function ConPortal() {
      return createPortal(<button data-cet-id="examen.dialogo.entregar">Sí, entregar</button>, document.body);
    }
    render(
      <UiInteractionScope>
        <ConPortal />
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("Sí, entregar"));

    expect(trackUi).toHaveBeenCalledWith(
      expect.objectContaining({ control: "examen.dialogo.entregar" }),
    );
  });

  it("una casilla produce UN acto, con el valor resultante", async () => {
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <input type="checkbox" data-cet-id="ajustes.repaso" aria-label="Repaso" />
      </UiInteractionScope>,
    );

    await user.click(screen.getByLabelText("Repaso"));

    expect(trackUi).toHaveBeenCalledTimes(1);
    expect(trackUi).toHaveBeenCalledWith(
      expect.objectContaining({ control: "ajustes.repaso", action: "change", value: true }),
    );
  });

  it("el valor declarado en data-cet-value gana al del elemento", async () => {
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <button data-cet-id="examen.navegador" data-cet-value="7">
          7
        </button>
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("7"));

    expect(trackUi).toHaveBeenCalledWith(expect.objectContaining({ value: "7" }));
  });

  it("nunca registra el texto que escribe el alumno", async () => {
    // La respuesta viaja en `answer_submitted`, que es donde se puntúa y donde
    // está pensada la retención. Un campo de texto marcado no puede colar la
    // respuesta dentro de un evento de interfaz.
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <input type="text" data-cet-id="respuesta.campo" aria-label="Tu respuesta" />
      </UiInteractionScope>,
    );

    await user.type(screen.getByLabelText("Tu respuesta"), "3/4");
    await user.tab();

    for (const llamada of trackUi.mock.calls) {
      expect(llamada[0]?.value).toBeUndefined();
    }
  });
});

describe("UiInteractionScope · la superficie", () => {
  it("toma la superficie declarada por encima del control", async () => {
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <div data-cet-surface="exam">
          <button data-cet-id="examen.siguiente">Siguiente</button>
        </div>
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("Siguiente"));

    expect(trackUi).toHaveBeenCalledWith(expect.objectContaining({ surface: "exam" }));
  });

  it("sin superficie declarada, la deriva de la ruta", async () => {
    const user = userEvent.setup();
    render(
      <UiInteractionScope>
        <button data-cet-id="practica.saltar">Saltar</button>
      </UiInteractionScope>,
    );

    await user.click(screen.getByText("Saltar"));

    expect(trackUi).toHaveBeenCalledWith(expect.objectContaining({ surface: "practice" }));
  });
});

describe("UiInteractionScope · la navegación", () => {
  it("no emite una transición al entrar", () => {
    render(
      <UiInteractionScope>
        <span />
      </UiInteractionScope>,
    );
    expect(trackNav).not.toHaveBeenCalled();
  });

  it("emite la transición al cambiar de ruta", () => {
    const { rerender } = render(
      <UiInteractionScope>
        <span />
      </UiInteractionScope>,
    );

    ruta = "/exam";
    rerender(
      <UiInteractionScope>
        <span />
      </UiInteractionScope>,
    );

    expect(trackNav).toHaveBeenCalledWith("/practice", "/exam");
  });
});
