/**
 * INVARIANTE: la parrilla de práctica y la rejilla de materias son la MISMA
 * librería visual, no dos aspectos parecidos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ CAZA
 * ===========================================================================
 * El fallo que este fichero existe para impedir no es "la tarjeta se ve fea":
 * es la DERIVA. `/learn` estrenó las tarjetas del design system el 2026-08-28 y
 * `/practice` se quedó con las píldoras de antes; el alumno pasaba de una a otra
 * y veía dos productos. Ese día el coste no lo pagó ningún test, porque cada
 * pantalla, por separado, estaba bien.
 *
 * Aquí no se comprueba una captura ni un píxel. Se comprueba que la tarjeta que
 * pinta `/practice` lleve **la caja del design system**, y la caja se lee de
 * `CARD_CHROME` —la constante que `SubjectCard` también usa—, no de una lista de
 * clases escrita a mano en este fichero. Si mañana el design system cambia de
 * radio o de sombra, las dos pantallas cambian juntas o esto se pone rojo. Es lo
 * que convierte "usamos el design system" en algo verificable por código de
 * salida.
 *
 * Este test vive en la APP y no en `@cet/ui` a propósito: lo que vigila no es
 * que el componente sea correcto —de eso se ocupa `tarjeta-de-tema.test.tsx`—
 * sino que la PANTALLA lo monte. Una tarjeta impecable que la pantalla no usa no
 * arregla nada, y era exactamente la situación de ayer.
 *
 * ===========================================================================
 * QUÉ SE COMPRUEBA ADEMÁS DE LA CAJA
 * ===========================================================================
 * Las cuatro cosas que en esta pantalla se pueden perder sin que se note: que
 * el rail y el lavado salgan de la paleta de materias y nunca de un
 * hexadecimal, que `mix` no se disfrace de materia —es un cruce, le toca la
 * identidad neutra—, que cada tarjeta siga diciéndole a la analítica qué tema
 * es, y que ningún texto baje de la escala tipográfica de la casa.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CARD_CHROME } from "@cet/ui";

import { getLearnDictionary } from "./dictionary";
import { practiceTopics, topicSubjectCode, MIXED_TOPIC_ID } from "./practice-topics";
import { PracticeTopicGrid } from "./PracticeTopicGrid";
import { UiLocaleProvider } from "./UiLocaleProvider";
import { summarisePracticeEvents, type AnsweredEvent } from "./practice-progress";

const locale = "es" as const;
const dictionary = getLearnDictionary(locale);
const topics = practiceTopics(dictionary);

/**
 * Las clases de la caja, tal y como las declara el design system.
 *
 * Se parten de la constante y no se copian: una lista escrita aquí se quedaría
 * atrás en cuanto alguien tocase `card-chrome.ts`, y este test empezaría a
 * aprobar justo la deriva que existe para impedir.
 */
const CAJA = CARD_CHROME.split(/\s+/).filter(Boolean);

function pintar(): HTMLElement {
  // Un escenario con evidencia en todos los grupos: así las tarjetas montan
  // todas sus filas y el marcado que se inspecciona es el completo.
  const eventos: AnsweredEvent[] = topics.flatMap((topic) => [
    ...Array.from({ length: 7 }, () => ({ engineKey: topic.id, isCorrect: true })),
    ...Array.from({ length: 3 }, () => ({ engineKey: topic.id, isCorrect: false })),
  ]);
  const { container } = render(
    <UiLocaleProvider locale={locale}>
      <PracticeTopicGrid
        topics={topics}
        dictionary={dictionary}
        progress={summarisePracticeEvents(eventos)}
      />
    </UiLocaleProvider>,
  );
  return container;
}

function tarjetas(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll("li a"));
}

describe("invariante — práctica y materias comparten librería visual", () => {
  it("la tarjeta de práctica lleva la caja del design system, entera", () => {
    expect(CAJA.length, "CARD_CHROME está vacío: este test pasaría en vacío").toBeGreaterThan(5);

    const container = pintar();
    const tarjeta = tarjetas(container)[0];
    expect(tarjeta, "la parrilla no ha pintado ninguna tarjeta").toBeDefined();

    for (const clase of CAJA) {
      expect(
        (tarjeta as HTMLAnchorElement).className,
        `La tarjeta de práctica no lleva \`${clase}\`, que sí declara la caja del design ` +
          "system. Dos pantallas del mismo alumno con dos lenguajes visuales es lo que esta " +
          "prueba impide.",
      ).toContain(clase);
    }
    cleanup();
  });

  it("el objetivo pulsable es la tarjeta entera y llega al mínimo táctil", () => {
    const container = pintar();
    for (const tarjeta of tarjetas(container)) {
      // El mínimo táctil se declara con el token, no con un número: es una
      // decisión del design system, y aquí se lee, no se vuelve a tomar.
      expect(tarjeta.className).toContain("min-h-[var(--cet-touch-min)]");
      // El enlace ENVUELVE el contenido: el nombre del tema está dentro, no al
      // revés. Un `<a>` alrededor del solo título deja un objetivo de 18 px.
      expect(tarjeta.querySelector("span")).not.toBeNull();
    }
    cleanup();
  });

  it("el rail y el lavado salen de la paleta de materias, nunca de un hexadecimal", () => {
    const container = pintar();
    for (const tarjeta of tarjetas(container)) {
      for (const [nombre, valor] of [
        ["rail", tarjeta.style.borderInlineStartColor],
        ["lavado", tarjeta.style.backgroundColor],
      ] as const) {
        expect(
          /^var\(--cet-materia-[a-z]+(-suave)?\)$/.test(valor),
          `El ${nombre} de una tarjeta vale \`${valor}\`. Tiene que ser un token de materia: la ` +
            "paleta vive en tokens.css y en ningún otro sitio.",
        ).toBe(true);
      }
    }
    cleanup();
  });

  it("el sorteo `mix` no se disfraza de materia", () => {
    // No es un grupo: es un cruce entre los demás. Le corresponde la identidad
    // neutra, no el color de matemáticas.
    const mix = topics.find((topic) => topic.id === MIXED_TOPIC_ID);
    expect(mix, "no hay tema mezclado: este bloque pasaría en vacío").toBeDefined();
    expect(topicSubjectCode(mix!)).toBe("");

    const container = pintar();
    const tarjetaMix = tarjetas(container).find(
      (a) => a.getAttribute("data-cet-value") === MIXED_TOPIC_ID,
    );
    expect(tarjetaMix?.getAttribute("data-subject")).toBe("otra");
    cleanup();
  });

  it("cada tarjeta le sigue diciendo a la analítica qué tema es", () => {
    // El valor que la analítica guarda es la clave del GENERADOR, no la de la
    // silueta. Si alguien las funde, la serie histórica se rompe el día que
    // dejen de coincidir.
    const container = pintar();
    expect(tarjetas(container).map((a) => a.getAttribute("data-cet-value"))).toEqual(
      topics.map((topic) => topic.id),
    );
    for (const tarjeta of tarjetas(container)) {
      expect(tarjeta.getAttribute("data-cet-id")).toBe("practica.elegir-tema");
    }
    cleanup();
  });

  it("ningún texto de la tarjeta baja de la escala del design system", () => {
    // `text-xs` son 12 px. La escala de esta casa empieza en `text-body-sm`
    // (14.5 px) porque quien lee tiene once años y suele leer en una tableta.
    const container = pintar();
    for (const tarjeta of tarjetas(container)) {
      const clases = [tarjeta, ...Array.from(tarjeta.querySelectorAll("*"))]
        .map((el) => el.getAttribute("class") ?? "")
        .join(" ");
      for (const prohibida of ["text-xs", "text-[10px]", "text-[11px]", "text-[12px]"]) {
        expect(clases, `La tarjeta usa \`${prohibida}\`, por debajo de la escala.`).not.toContain(
          prohibida,
        );
      }
    }
    cleanup();
  });
});
