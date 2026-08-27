/**
 * @cet/ui — INVARIANTE DE FAMILIA: ninguna figura de leccion es muda,
 * ninguna dice lo suyo solo con el color.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FAMILIA CIERRA
 * ===========================================================================
 * Las lecciones de matematicas van a llenarse de apoyos visuales: barras de
 * fraccion hoy, y manana un modelo de area, una recta numerica, un reparto.
 * Cada uno de esos dibujos puede nacer con los dos mismos fallos, y ninguno de
 * los dos se ve en una revision de codigo ni en un test de render:
 *
 *   1. MUDO. La figura explica algo y no se puede oir. El nino que usa lector
 *      de pantalla se queda sin la explicacion entera, no sin un adorno.
 *   2. SOLO COLOR. Lo pintado y lo no pintado se distinguen unicamente por el
 *      tono. Bajo deuteranopia —uno o dos ninos por aula— la figura deja de
 *      decir nada, y encima parece correcta en la captura de quien la escribio.
 *
 * Este fichero no prueba una figura: recorre el REGISTRO
 * `LESSON_FIGURE_COMPONENTS` y exige de cada miembro las dos cosas. Una figura
 * nueva sin muestra declarada pone el test rojo el dia que se escribe, sin que
 * nadie tenga que acordarse de este comentario.
 *
 * ===========================================================================
 * COMO SE DEMUESTRA CADA UNA, Y POR QUE ASI
 * ===========================================================================
 * Las dos se demuestran RENDERIZANDO y comparando DOS muestras del mismo
 * componente que significan cosas distintas (`a` y `b`). Comparar dos es lo que
 * hace la prueba dificil de enganar:
 *
 *   - Un `aria-label` fijo ("figura de fracciones") pasaria un test de "tiene
 *     etiqueta". No pasa este: `a` y `b` tendrian la misma voz.
 *   - Un relleno de color como unico canal pasaria cualquier test de render.
 *     No pasa este: quitados los atributos de color, `a` y `b` quedan con la
 *     misma geometria y el mismo texto.
 *
 * Y los canales se comprueban POR SEPARADO, que es la parte que costo una
 * revision. La version anterior comparaba UNA firma con todo dentro, y eso solo
 * probaba «queda ALGUN canal», no «queda el canal que la cabecera nombra»: se
 * podia borrar la trama diagonal de las barras —que existe para la
 * deuteranopia— y el test seguia verde, porque la fraccion escrita al lado
 * tapaba el hueco. Con dos canales redundantes hay holgura para perder uno en
 * una refactorizacion sin que nada avise. Ahora se exige que `a` y `b` difieran
 * en la GEOMETRIA sola Y en el TEXTO solo. No nombra ningun elemento concreto,
 * asi que no se vuelve fragil: no dice «tiene que haber un <line>», dice «el
 * dibujo tiene que cambiar de forma».
 *
 * `textoExpuesto` recorre el arbol como la accesibilidad, no como el DOM: por
 * eso lo que se afirma es «esto se dice en voz alta», no «existe tal atributo».
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { LessonFigure } from "../src/learning/LessonFigure.js";
import {
  LESSON_FIGURE_COMPONENTS,
  figureAltText,
  parseLessonFigure,
} from "../src/learning/lesson-figure.js";
import { textoExpuesto } from "./texto-accesible.js";

/* ------------------------------------------------------------------ *
 * Las muestras: dos props del mismo componente con SIGNIFICADO distinto
 * ------------------------------------------------------------------ */

interface Muestra {
  /** Por que `a` y `b` significan cosas distintas para el alumno. */
  readonly difieren: string;
  readonly a: Record<string, unknown>;
  readonly b: Record<string, unknown>;
  /** Hechos que el dibujo ensena y que la voz TIENE que decir tambien. */
  readonly debeDecir: readonly string[];
}

const MUESTRAS: Readonly<Record<string, Muestra>> = {
  "fraction-bars": {
    difieren:
      "Misma reja de dos mitades: en `a` hay una pintada y en `b` las dos. " +
      "Si lo pintado se distinguiera solo por el relleno, las dos figuras " +
      "serian el mismo dibujo con otro color.",
    a: {
      bars: [
        { numerator: 1, denominator: 2 },
        { numerator: 1, denominator: 2 },
      ],
    },
    b: {
      bars: [
        { numerator: 2, denominator: 2 },
        { numerator: 1, denominator: 2 },
      ],
    },
    debeDecir: ["partes iguales", "pintadas"],
  },
  "place-value-shift": {
    difieren:
      "Los mismos digitos y la misma tabla; lo unico que cambia es hacia donde " +
      "se mueven. Una flecha que solo cambiara de color no diria nada.",
    a: { value: "4.7", factor: 10, direction: "multiply" },
    b: { value: "4.7", factor: 10, direction: "divide" },
    debeDecir: ["La coma no se mueve", "Resultado:"],
  },
  "unit-chain": {
    difieren:
      "La misma escalera con el camino resaltado en un sentido y en el otro: " +
      "en `a` se multiplica y en `b` se divide.",
    a: { quantity: "length", from: "km", to: "m" },
    b: { quantity: "length", from: "m", to: "km" },
    debeDecir: ["Escalera de unidades", "se multiplica por"],
  },
};

/* ------------------------------------------------------------------ *
 * Firma no cromatica: lo que queda de un dibujo al quitarle el color
 * ------------------------------------------------------------------ */

/**
 * Atributos que NO cuentan como senal visual.
 *
 * Los de color son obvios. `aria-label` esta aqui por un motivo que costo una
 * mutacion descubrir: al principio no estaba, y con el dentro la prueba pasaba
 * con las barras pintadas SOLO por relleno —quitada la trama y quitada la
 * fraccion escrita—, porque las dos figuras seguian teniendo etiquetas
 * accesibles distintas. Pero el `aria-label` es el canal de quien NO VE la
 * figura; el nino con deuteranopia la ve perfectamente y lo que necesita es que
 * el DIBUJO cambie. Contar la etiqueta aqui convertia este test en una segunda
 * copia del de la voz, y dejaba entrar exactamente el fallo que persigue.
 */
const NO_CUENTAN = new Set([
  "fill",
  "stroke",
  "color",
  "class",
  "style",
  "opacity",
  "aria-label",
  "role",
]);

/**
 * Canal 1 — LA FORMA. Que dibujo se ve, sin leer nada y sin ver los colores:
 * las etiquetas de los elementos y sus atributos geometricos. El contenido de
 * texto NO entra aqui a proposito; ese es el canal 2.
 */
function firmaDeForma(raiz: HTMLElement): string {
  return Array.from(raiz.querySelectorAll("*"))
    .map((nodo) => {
      const attrs = Array.from(nodo.attributes)
        .filter((a) => !NO_CUENTAN.has(a.name))
        .map((a) => `${a.name}=${a.value}`)
        .sort()
        .join(",");
      return `${nodo.tagName}[${attrs}]`;
    })
    .join("|");
}

/**
 * Canal 2 — LO ESCRITO DENTRO DEL DIBUJO. Lo que lee quien ve la figura: los
 * numeros, los signos, las unidades. No incluye el `aria-label`, que es de
 * quien no la ve y ya tiene sus propios tests.
 */
function firmaDeTexto(raiz: HTMLElement): string {
  return (raiz.textContent ?? "").trim();
}

function pintar(component: string, props: Record<string, unknown>): HTMLElement {
  const figura = parseLessonFigure(component, props);
  expect(figura, `la muestra de ${component} no se parsea: ${JSON.stringify(props)}`).not.toBeNull();
  const { container } = render(
    <LocaleProvider locale="es">
      <LessonFigure figure={figura!} />
    </LocaleProvider>,
  );
  return container;
}

/* ------------------------------------------------------------------ *
 * El invariante
 * ------------------------------------------------------------------ */

describe("invariante — toda figura de leccion habla, y no solo con color", () => {
  it("el registro no esta vacio (un escaner sin figuras pasaria siempre)", () => {
    expect(LESSON_FIGURE_COMPONENTS.length).toBeGreaterThan(0);
  });

  it("toda figura del registro tiene muestra declarada, y no sobra ninguna", () => {
    const sinMuestra = LESSON_FIGURE_COMPONENTS.filter((c) => !(c in MUESTRAS));
    expect(
      sinMuestra,
      "Estas figuras se pintan en una leccion y nadie ha demostrado que se " +
        "puedan oir ni que se entiendan sin color. Anade su muestra a MUESTRAS " +
        "en este fichero:\n  " + sinMuestra.join("\n  "),
    ).toEqual([]);

    const sobran = Object.keys(MUESTRAS).filter((c) => !LESSON_FIGURE_COMPONENTS.includes(c));
    expect(sobran, "muestras de figuras que ya no existen").toEqual([]);
  });

  /**
   * Y la tercera cosa, que no es de accesibilidad y sin embargo es la que mas
   * cara salio: UNA FIGURA QUE NINGUNA LECCION PIDE NO EXISTE PARA EL ALUMNO,
   * Y UNA QUE LA LECCION PIDE MAL TAMPOCO.
   *
   * Las tres figuras se escribieron, se probaron, se capturaron y se dieron por
   * entregadas. Contra produccion:
   *
   *   select kind, count(*) from lesson_blocks group by 1;
   *   -- example 18 · rule 14 · tip 6 · warning 6 · text 4 · steps 3 · table 1
   *
   * Cero filas `interactive`. El encargo no estaba cumplido, estaba compilado.
   *
   * ESTE TEST YA MIDIO MAL UNA VEZ. Su primera version buscaba en las
   * migraciones el NOMBRE del componente y se daba por satisfecha al
   * encontrarlo. Con eso, un bloque `{"component":"unit-chain","props":{
   * "quantity":"peso"}}` pasaba en verde: el nombre esta, y sin embargo
   * `parseLessonFigure` devuelve null y la figura no se pinta jamas. Es la
   * familia de fallos de este repositorio en su forma mas pura —la
   * comprobacion existe, parece cubrir el caso, y mide otra cosa— cometida
   * dentro del fichero que existe para cazarla.
   *
   * Ahora no se busca el nombre: se EXTRAE el `props` real de la migracion y se
   * pasa por el parser de verdad. Un bloque que el parser rechaza es un bloque
   * que el alumno no vera, y eso es lo que hay que impedir.
   *
   * QUE PRUEBA Y QUE NO. Prueba que en el repositorio hay contenido que pide
   * cada figura y que ese contenido es RENDERIZABLE. NO prueba que la migracion
   * este aplicada: eso es una consulta, no un test, y se hace asi:
   *
   *   select content->>'component', count(*) from lesson_blocks
   *    where kind = 'interactive' group by 1;
   */
  describe("el contenido que pide figuras", () => {
    /** Cada `'{"component":…}'::jsonb` que insertan las migraciones. */
    const bloques = (() => {
      const dir = join(process.cwd(), "..", "..", "supabase", "migrations");
      const ficheros = readdirSync(dir).filter((f) => f.endsWith(".sql"));
      const out: Array<{ fichero: string; crudo: string }> = [];
      for (const fichero of ficheros) {
        // Se quitan los comentarios de linea ANTES de escanear. Un comentario
        // nunca es dato, y este test se cazo a si mismo el primer dia: la
        // cabecera de `0026` explica el formato citandolo —`'{"component":…}'
        // ::jsonb`— y el escaner intento parsear la cita, con sus puntos
        // suspensivos dentro. Un escaner que lee la documentacion de lo que
        // escanea denuncia fallos que no existen, y a la tercera nadie lo cree.
        const sql = readFileSync(join(dir, fichero), "utf8")
          .split(String.fromCharCode(10))
          .filter((linea) => !linea.trimStart().startsWith("--"))
          .join(String.fromCharCode(10));
        const re = /'(\{"component":.*?\})'::jsonb/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(sql)) !== null) out.push({ fichero, crudo: m[1] as string });
      }
      return out;
    })();

    it("el escaner encuentra bloques de figura (si no, pasaria en vacio)", () => {
      expect(bloques.length, "ninguna migracion inserta figuras").toBeGreaterThanOrEqual(
        LESSON_FIGURE_COMPONENTS.length,
      );
    });

    it("todo bloque insertado se PINTA: el parser no devuelve null para ninguno", () => {
      const muertos: string[] = [];
      for (const { fichero, crudo } of bloques) {
        let bloque: { component?: unknown; props?: unknown };
        try {
          bloque = JSON.parse(crudo) as { component?: unknown; props?: unknown };
        } catch {
          muertos.push(`${fichero}: JSON invalido -> ${crudo}`);
          continue;
        }
        const componente = typeof bloque.component === "string" ? bloque.component : "";
        const figura = parseLessonFigure(componente, bloque.props);
        if (figura === null) {
          muertos.push(`${fichero}: parseLessonFigure devuelve null -> ${crudo}`);
        } else if (figura.component !== componente) {
          muertos.push(`${fichero}: parsea como ${figura.component} -> ${crudo}`);
        }
      }
      expect(
        muertos,
        "Estos bloques se insertarian en la base y NO se pintarian nunca. " +
          "La leccion quedaria con un hueco mudo donde deberia estar la figura:\n  " +
          muertos.join("\n  "),
      ).toEqual([]);
    });

    it("todo bloque insertado dice algo cuando se oye", () => {
      // Un `props` valido pero vacio de contenido daria una figura que se pinta
      // y no explica nada. La voz es la medida de si explica algo.
      const mudos = bloques
        .map(({ fichero, crudo }) => {
          const bloque = JSON.parse(crudo) as { component: string; props: unknown };
          const figura = parseLessonFigure(bloque.component, bloque.props);
          return figura === null ? null : { fichero, crudo, voz: figureAltText(figura, "es") };
        })
        .filter((x): x is { fichero: string; crudo: string; voz: string } => x !== null)
        .filter((x) => x.voz.trim().length < 40)
        .map((x) => `${x.fichero}: "${x.voz}" <- ${x.crudo}`);
      expect(mudos, mudos.join("\n  ")).toEqual([]);
    });

    it("toda figura del registro la pide alguna leccion", () => {
      const pedidas = new Set(
        bloques
          .map(({ crudo }) => (JSON.parse(crudo) as { component: string }).component),
      );
      const huerfanas = LESSON_FIGURE_COMPONENTS.filter((c) => !pedidas.has(c));
      expect(
        huerfanas,
        "Estas figuras se dibujan pero ninguna leccion las pide, asi que ningun " +
          "nino las va a ver nunca. Anade el bloque a una migracion de contenido: " +
          huerfanas.join(", "),
      ).toEqual([]);
    });
  });

  describe.each(LESSON_FIGURE_COMPONENTS.map((component) => ({ component })))(
    "$component",
    ({ component }) => {
      const muestra = MUESTRAS[component] as Muestra;

      it("dibuja algo de verdad (si no dibuja, no es una figura)", () => {
        const contenedor = pintar(component, muestra.a);
        const formas = contenedor.querySelectorAll("rect,path,circle,line,polygon,polyline,text");
        expect(formas.length).toBeGreaterThan(0);
      });

      it("se anuncia una sola vez y con la figura entera dicha", () => {
        const contenedor = pintar(component, muestra.a);
        const figura = parseLessonFigure(component, muestra.a)!;
        // Lo que se oye es EXACTAMENTE el texto alternativo: ni los digitos
        // sueltos del dibujo por debajo, ni la etiqueta repetida por encima.
        expect(textoExpuesto(contenedor)).toBe(figureAltText(figura, "es"));
      });

      it("la voz dice los hechos que el dibujo ensena", () => {
        const contenedor = pintar(component, muestra.a);
        const dicho = textoExpuesto(contenedor);
        for (const hecho of muestra.debeDecir) expect(dicho).toContain(hecho);
      });

      it("la voz dice los numeros de esta figura y no los de otra", () => {
        // Un `aria-label` escrito a mano se desincroniza del dibujo en cuanto
        // cambian los props. Aqui se exige que cada numero de los props se oiga.
        const contenedor = pintar(component, muestra.a);
        const dicho = textoExpuesto(contenedor);
        const numeros = JSON.stringify(muestra.a).match(/\d+/g) ?? [];
        for (const numero of numeros) expect(dicho).toContain(numero);
      });

      it("dos figuras con distinto significado NO suenan igual", () => {
        const vozA = textoExpuesto(pintar(component, muestra.a));
        const vozB = textoExpuesto(pintar(component, muestra.b));
        expect(vozA, muestra.difieren).not.toBe(vozB);
      });

      it("dos figuras con distinto significado cambian de FORMA", () => {
        // Sin leer una sola letra y sin ver un solo color: el dibujo tiene que
        // ser otro. Es el canal del nino con deuteranopia que aun no lee bien.
        expect(
          firmaDeForma(pintar(component, muestra.a)),
          `${muestra.difieren}
Quitados fill/stroke/class y sin leer el texto, las dos figuras son el mismo dibujo.`,
        ).not.toBe(firmaDeForma(pintar(component, muestra.b)));
      });

      it("dos figuras con distinto significado cambian lo ESCRITO en el dibujo", () => {
        // El segundo canal, independiente del primero. Que existan LOS DOS es
        // lo que deja perder uno en una refactorizacion sin perder la figura.
        expect(
          firmaDeTexto(pintar(component, muestra.a)),
          `${muestra.difieren}
Las dos figuras escriben exactamente lo mismo.`,
        ).not.toBe(firmaDeTexto(pintar(component, muestra.b)));
      });
    },
  );
});
