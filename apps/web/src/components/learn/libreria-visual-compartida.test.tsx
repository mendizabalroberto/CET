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
 * Aquí no se comprueba una captura ni un píxel. Se comprueba que las decisiones
 * de caja de la tarjeta de práctica sean LAS MISMAS que las de `SubjectCard`,
 * leyéndolas del componente real y no de una lista escrita a mano: si mañana
 * `SubjectCard` cambia de radio o de sombra y la práctica no la sigue, esto se
 * pone rojo. Es lo que convierte "usamos el design system" en algo que se puede
 * verificar por código de salida.
 *
 * ===========================================================================
 * LAS DOS DIFERENCIAS QUE SÍ SE PERMITEN, Y POR QUÉ
 * ===========================================================================
 *  - **El lavado del cuerpo** (`--cet-materia-*-suave`). `SubjectCard` lo usa
 *    porque encima solo lleva `--cet-ink`; la tarjeta de práctica lleva además
 *    texto atenuado, y `--cet-ink-muted` sobre ese lavado no llega al 4.5:1 de
 *    WCAG 1.4.3 en tres de los siete tonos. Se queda en `bg-card`.
 *  - **El medallón.** Identifica la MATERIA, y los diez temas son de la misma:
 *    diez iconos idénticos no distinguen nada y se comen el ancho del nombre.
 *
 * Las dos están escritas en la cabecera de `PracticeTopicGrid.tsx`. Si alguien
 * las cambia, que sea a la vista.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { getLearnDictionary } from "./dictionary";
import { practiceTopics, topicSubjectCode, MIXED_TOPIC_ID } from "./practice-topics";
import { PracticeTopicGrid } from "./PracticeTopicGrid";
import { UiLocaleProvider } from "./UiLocaleProvider";
import { summarisePracticeEvents, type AnsweredEvent } from "./practice-progress";

const locale = "es" as const;
const dictionary = getLearnDictionary(locale);
const topics = practiceTopics(dictionary);

/**
 * El fuente de `card-chrome.ts`, que es la referencia.
 *
 * Es LA definición de la caja: `SubjectCard` (materias) y la tarjeta de tema la
 * importan las dos, así que comprobar contra este fichero es comprobar contra lo
 * que de verdad se pinta en `/learn`. Antes este test leía `SubjectCard.tsx`, y
 * dejó de valer el día que la caja salió de allí: la referencia tiene que ser el
 * sitio donde vive la decisión, no el primero que la usó.
 *
 * Se localiza desde el punto de entrada de `@cet/ui` que resuelve Node —el
 * `src/index.ts` del paquete—, no con un `../../../..` a pelo: así el test sigue
 * valiendo si el paquete se mueve dentro del monorepo.
 */
function fuenteDeLaCaja(): string {
  const require = createRequire(import.meta.url);
  const entrada = require.resolve("@cet/ui");
  const ruta = resolve(dirname(entrada), "navigation/card-chrome.ts");
  return readFileSync(ruta, "utf8");
}

/** Las clases de caja que definen el lenguaje de la tarjeta. */
const CAJA = ["rounded-md", "border-s-4", "shadow-card", "hover:shadow-pop", "duration-slow"];

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
        locale={locale}
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
  it("la caja de la tarjeta usa las mismas clases que SubjectCard", () => {
    const referencia = fuenteDeLaCaja();
    const container = pintar();
    const primera = tarjetas(container)[0];
    expect(primera, "la parrilla no ha pintado ninguna tarjeta").toBeDefined();

    for (const clase of CAJA) {
      expect(
        referencia.includes(clase),
        `\`${clase}\` ya no está en card-chrome.ts: la referencia de este test ha cambiado y hay ` +
          "que decidir a la vez qué hace la tarjeta de práctica.",
      ).toBe(true);
      expect(
        (primera as HTMLAnchorElement).className,
        `La tarjeta de práctica no usa \`${clase}\`, que sí usa la caja del design system. Dos ` +
          "pantallas del mismo alumno con dos lenguajes visuales es lo que esta prueba impide.",
      ).toContain(clase);
    }
    cleanup();
  });

  it("el objetivo pulsable es la tarjeta entera y llega al mínimo táctil", () => {
    const container = pintar();
    for (const tarjeta of tarjetas(container)) {
      expect(tarjeta.className).toContain("min-h-touch");
      // El enlace ENVUELVE el contenido: el nombre del tema está dentro, no al
      // revés. Un `<a>` alrededor del solo título deja un objetivo de 18 px.
      expect(tarjeta.querySelector("span")).not.toBeNull();
    }
    cleanup();
  });

  it("el rail toma su color de la paleta de materias, y nunca un hexadecimal", () => {
    const container = pintar();
    for (const tarjeta of tarjetas(container)) {
      const color = tarjeta.style.borderInlineStartColor;
      expect(
        /^var\(--cet-materia-[a-z]+\)$/.test(color),
        `El rail de una tarjeta vale \`${color}\`. Tiene que ser un token de materia: la paleta ` +
          "vive en tokens.css y en ningún otro sitio.",
      ).toBe(true);
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
