/**
 * @cet/ui — la tarjeta y la rejilla de temas de practica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este fichero no comprueba que la tarjeta "se pinte". Comprueba los fallos
 * concretos que esta pantalla tiene si nadie los vigila:
 *
 *   1. que el enlace sea el renglon del titulo y no la tarjeta entera — 18 px
 *      de objetivo tactil donde la casa exige 44, y en la tableta de un nino de
 *      once anos eso se reporta como "no va bien", nunca como un bug;
 *   2. que la caja se vuelva a escribir a mano en vez de importarse, que es
 *      exactamente como `/learn` y `/practice` divergieron la vez anterior;
 *   3. que un alumno sin evidencia se encuentre cuatro peldanos vacios, que le
 *      dicen que va mal cuando lo que pasa es que no ha empezado;
 *   4. que un rotulo que la aplicacion no pasa deje un renglon vacio o, peor,
 *      un literal en castellano dentro del design system (AD-7);
 *   5. que la tarjeta acumule indicadores hasta que ninguno se lea;
 *   6. que el identificador de telemetria se caiga del enlace o cambie de
 *      valor, que no rompe ninguna pantalla y parte la serie historica.
 *
 * NO afirma NADA sobre la geometria de `TopicIcon`: hoy es andamio y las once
 * siluetas comparten trazo. Ese dibujo, y su prueba, son del contrato `prac-a`.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../src/lib/i18n.js";
import { CARD_CHROME } from "../src/navigation/card-chrome.js";
import { TopicCard, type TopicCardProps } from "../src/navigation/TopicCard.js";
import { TopicGrid } from "../src/navigation/TopicGrid.js";
import { subjectIdentity } from "../src/navigation/subject-identity.js";

/** Los rotulos que la aplicacion pasa: el paquete no los tiene (AD-7). */
const TEXTOS = {
  groupLabel: { es: "Comparar", en: "Compare" },
  evidenceText: { es: "10 preguntas respondidas", en: "10 questions answered" },
  nextStepText: { es: "2 aciertos y subes de nivel", en: "2 more correct to level up" },
} as const;

function card(overrides: Partial<TopicCardProps> = {}): TopicCardProps {
  return {
    topic: "compare",
    subjectCode: "math",
    name: "Comparar",
    hint: "mayor, menor o igual",
    href: "/practice/math.compare",
    level: "learning",
    trackedValue: "math.compare",
    ...TEXTOS,
    ...overrides,
  };
}

function wrap(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

/** Las filas de la tarjeta: los hijos directos del enlace, igual que en la app. */
function filas(link: Element): Element[] {
  return Array.from(link.children);
}

describe("TopicCard — la tarjeta entera es el enlace", () => {
  it("hay un solo enlace y su nombre accesible dice de que tema es", () => {
    wrap(<TopicCard {...card()} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(/Comparar/);
    expect(links[0]).toHaveAttribute("href", "/practice/math.compare");
  });

  it("el medallon, el nombre, la pista y los indicadores estan DENTRO del enlace", () => {
    const { container } = wrap(<TopicCard {...card()} />);
    const link = screen.getByRole("link");

    expect(within(link).getByText("Comparar")).toBeInTheDocument();
    expect(within(link).getByText("mayor, menor o igual")).toBeInTheDocument();
    expect(within(link).getByText("10 preguntas respondidas")).toBeInTheDocument();
    expect(link.querySelector("svg")).not.toBeNull();
    // Nada del contenido de la tarjeta queda fuera del objetivo pulsable.
    expect(container.firstElementChild).toBe(link);
  });

  it("no monta ningun boton ni control propio: la navegacion la hace el enlace", () => {
    wrap(<TopicCard {...card()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("TopicCard — la caja es la compartida, no una copia parecida", () => {
  it("lleva todas las clases de CARD_CHROME, leidas de la constante", () => {
    wrap(<TopicCard {...card()} />);
    const link = screen.getByRole("link");

    // Se leen de la constante importada a proposito: copiarlas aqui haria pasar
    // el test justo el dia que alguien dejara de importarla en el componente.
    for (const clase of CARD_CHROME.split(" ")) {
      expect(link.classList.contains(clase), `falta la clase de caja ${clase}`).toBe(true);
    }
  });

  it("el `className` de fuera se compone con la caja, no la sustituye", () => {
    wrap(<TopicCard {...card({ className: "w-full" })} />);
    const link = screen.getByRole("link");

    expect(link).toHaveClass("w-full");
    expect(link).toHaveClass("shadow-card");
  });
});

describe("TopicCard — la telemetria va en el propio enlace", () => {
  it("declara ella el `data-cet-id`, y lo lleva el `<a>` que se pulsa", () => {
    // El recolector resuelve el control con `closest("[data-cet-id]")`: si el
    // identificador colgara de un envoltorio, mediria tambien lo que caiga al
    // lado del enlace, y si no estuviera, el evento se perderia entero.
    wrap(<TopicCard {...card()} />);
    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("data-cet-id", "practica.elegir-tema");
    expect(link.closest("[data-cet-id]")).toBe(link);
  });

  it("el valor es exactamente el que pasa la app, y no la clave de la silueta", () => {
    // `topic` es la silueta y `trackedValue` es la clave del generador. Hoy se
    // parecen; el dia que dejen de hacerlo, fundirlas falsearia hacia atras una
    // serie que ya existe. Por eso aqui van a proposito distintas.
    wrap(
      <TopicCard {...card({ topic: "compare", trackedValue: "math.compare.avanzado" })} />,
    );
    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("data-cet-value", "math.compare.avanzado");
    expect(link).toHaveAttribute("data-topic", "compare");
  });

  it("sin valor no se escribe el atributo: mejor sin `value` que con uno inventado", () => {
    wrap(<TopicCard {...card({ trackedValue: undefined })} />);
    const link = screen.getByRole("link");

    expect(link.hasAttribute("data-cet-value")).toBe(false);
    // El evento se sigue queriendo medir: lo que falta es el valor, no el acto.
    expect(link).toHaveAttribute("data-cet-id", "practica.elegir-tema");
  });

  it("en la rejilla, cada tarjeta lleva su propio valor y ningun envoltorio lo lleva", () => {
    wrap(
      <TopicGrid
        topics={[
          card({ href: "/practice/math.simplify", trackedValue: "math.simplify" }),
          card({ href: "/practice/math.compare", trackedValue: "math.compare" }),
        ]}
      />,
    );

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("data-cet-value")),
    ).toEqual(["math.simplify", "math.compare"]);
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.hasAttribute("data-cet-id")).toBe(false);
    }
  });
});

describe("TopicCard — el color sale de la materia y ningun hexadecimal vive aqui", () => {
  it("el rail y el lavado son los tokens que devuelve subjectIdentity", () => {
    const { container } = wrap(<TopicCard {...card()} />);
    const identidad = subjectIdentity("math");

    expect(screen.getByRole("link")).toHaveAttribute("data-subject", "math");
    expect(container.innerHTML).toContain(identidad.fill);
    expect(container.innerHTML).toContain(identidad.soft);
  });

  it("no escribe ningun hexadecimal: la paleta vive en tokens.css", () => {
    const { container } = wrap(<TopicCard {...card()} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("sobre el lavado no va texto atenuado en NINGUNA fila, ni en el separador", () => {
    // `--cet-ink-muted` sobre `--cet-materia-*-suave` mide de 4.45:1 a 4.51:1 y
    // se queda por debajo del 4.5 de WCAG 1.4.3 en tres de los siete tonos.
    //
    // Se recorren TODAS las filas y todo lo que cuelga de ellas, no una lista
    // escrita a mano: la version anterior nombraba «pista» y «evidencia», asi
    // que el dia que las filas se reorganizaron —y nacio el separador `·`— la
    // comprobacion se quedo mirando una fila que ya no existia. Una defensa que
    // enumera lo que vigila deja de vigilar en cuanto alguien anade algo.
    const { container } = wrap(<TopicCard {...card()} />);
    const link = screen.getByRole("link");

    expect(filas(link).length, "la tarjeta no ha montado filas").toBeGreaterThan(0);

    for (const el of container.querySelectorAll("[data-cet-fila], [data-cet-fila] *")) {
      expect(
        el.getAttribute("class") ?? "",
        `tinta atenuada sobre el lavado: ${el.outerHTML.slice(0, 120)}`,
      ).not.toContain("ink-muted");
    }
  });

  it("un tema y una materia desconocidos no revientan: caen en las identidades neutras", () => {
    const { container } = wrap(
      <TopicCard
        {...card({
          topic: "angles",
          subjectCode: "music",
          name: "Ángulos",
          href: "/practice/music.angles",
        })}
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-topic", "otro");
    expect(link).toHaveAttribute("data-subject", "otra");
    expect(within(link).getByText("Ángulos")).toBeInTheDocument();
    expect(link.querySelector("svg")).not.toBeNull();
    expect(container.innerHTML).toContain("var(--cet-materia-otra)");
    expect(container.innerHTML).not.toContain("var(--cet-materia-music)");
  });
});

describe("TopicCard — `null` no es un nivel cero", () => {
  it("sin nivel no se pinta escalera, y la tarjeta sigue siendo navegable", () => {
    const { container } = wrap(<TopicCard {...card({ level: null })} />);
    const link = screen.getByRole("link");

    // La escalera es el unico `role="img"` con el nombre del grupo; sin nivel
    // no hay ninguno, y tampoco cuatro peldanos vacios dibujados de otro modo.
    expect(within(link).queryByRole("img", { name: /Comparar/ })).toBeNull();
    expect(container.querySelectorAll("rect")).toHaveLength(0);
    expect(link).toHaveAttribute("href", "/practice/math.compare");
  });

  it("con nivel, la escalera lleva el nombre del grupo en su texto accesible", () => {
    wrap(<TopicCard {...card({ level: "solid" })} />);
    const link = screen.getByRole("link");

    // El nombre del grupo delante, y detras cuantos peldanos de cuatro: sin el
    // grupo, diez escaleras iguales suenan igual en la lista del lector.
    const escalera = within(link).getByRole("img", { name: /^Comparar:/ });
    expect(escalera.tagName.toLowerCase()).toBe("svg");
    expect(escalera).toHaveAccessibleName(/\(3\/4\)$/);
  });
});

/**
 * EL NOMBRE NO COMPARTE FILA CON NADA. Esta es la defensa que nace de obs003.
 *
 * La escalera vivia en la cabecera, pegada al nombre con `ms-auto shrink-0`. En
 * produccion eso se leyo asi: «Comparar» y «Lo llevas bien» pintados uno encima
 * del otro; «Impropias mixtas» partido en dos con el indicador incrustado en
 * medio; «x / 10, 100, 1.000» ocupando tres lineas con «Dominado» flotando al
 * lado. No era un problema de anchura: era que el titulo tenia un vecino que no
 * cede sitio.
 *
 * Por eso el invariante NO dice «que la escalera este abajo» —eso lo cumpliria
 * cualquier recolocacion y volveria a romperse al siguiente indicador que a
 * alguien le parezca pequeno— sino: **la cabecera no cambia con el progreso**.
 * Un indicador es, por definicion, algo que cambia con el progreso; si la
 * cabecera no cambia nunca, no hay ninguno dentro. Es la misma tecnica de firmas
 * que ya protege a la pista.
 */
describe("TopicCard — el nombre no comparte fila con ningun indicador", () => {
  it("la cabecera es identica en todos los estados de progreso", () => {
    const porFila = firmasPorFila();
    const cabecera = indiceDeFila("cabecera");

    expect(
      new Set(porFila[cabecera] ?? []).size,
      "La cabecera cambia con el progreso, luego lleva un indicador dentro. " +
        "El nombre del tema no comparte fila con nada: lo que hable de progreso " +
        "va al bloque del pie.",
    ).toBe(1);
  });

  it("la cabecera no lleva ningun dibujo con rol de imagen junto al nombre", () => {
    // El medallon es `aria-hidden`; la escalera es `role="img"`. Si aparece un
    // `role="img"` aqui, alguien ha vuelto a colgar un indicador del titulo.
    wrap(<TopicCard {...card()} />);
    const cabecera = screen.getByRole("link").querySelector('[data-cet-fila="cabecera"]');

    expect(cabecera).not.toBeNull();
    expect(cabecera?.querySelectorAll('[role="img"]')).toHaveLength(0);
  });
});

/**
 * El `EffortMeter` se fue de esta tarjeta a proposito: sus circulos eran un
 * TERCER lenguaje visual —tras la escalera y las frases— para el mismo dato que
 * la frase de debajo ya decia con palabras («2 aciertos y subes a Dominado»).
 * El componente sigue vivo y con sus propias pruebas en su fichero; lo que se
 * retiro es su uso aqui. Este test existe para que no vuelva por descuido.
 */
describe("TopicCard — un solo lenguaje para el progreso", () => {
  it("ningun estado de progreso dibuja circulos", () => {
    for (const escenario of ESCENARIOS) {
      const { container } = wrap(<TopicCard {...card(escenario)} />);
      expect(
        container.querySelectorAll("circle"),
        `el escenario "${escenario.level ?? "sin nivel"}" dibuja circulos`,
      ).toHaveLength(0);
      cleanup();
    }
  });
});

describe("TopicCard — un rotulo que la app no pasa no deja hueco ni literal", () => {
  it("sin evidencia y sin siguiente paso, esas filas no se montan", () => {
    wrap(
      <TopicCard
        {...card({ evidenceText: undefined, nextStepText: undefined, level: null })}
      />,
    );
    const link = screen.getByRole("link");

    expect(filas(link)).toHaveLength(2); // cabecera y pista, nada mas
    expect(link.querySelector('[data-cet-fila="evidencia"]')).toBeNull();
    expect(link.querySelector('[data-cet-fila="siguiente"]')).toBeNull();
  });

  it("ninguna fila se queda escrita en blanco", () => {
    wrap(<TopicCard {...card({ evidenceText: undefined, nextStepText: undefined })} />);
    const link = screen.getByRole("link");

    for (const fila of filas(link)) {
      expect((fila.textContent ?? "").trim().length, `fila vacia: ${fila.outerHTML}`).toBeGreaterThan(0);
    }
  });

  it("sin nivel y sin evidencia, la fila del pie tampoco se monta", () => {
    // La escalera sola no sostiene una fila: si no hay nivel NI cifra, no hay
    // nada que contar y la fila sobra. Un renglon vacio al pie es peor que su
    // ausencia, que es la misma regla que rige la evidencia y el siguiente paso.
    wrap(<TopicCard {...card({ level: null, evidenceText: undefined })} />);
    const link = screen.getByRole("link");

    expect(link.querySelector('[data-cet-fila="nivel"]')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Densidad. El limite lo fija `apps/web/.../densidad-de-indicadores.test.tsx`,
 * que es de otro territorio pero su tope es ley para lo que se escribe aqui:
 * es indicador toda FILA cuya pinta cambia con el progreso, y el tope es tres.
 * Se comprueba con la misma tecnica —firmas por fila a lo largo de una bateria
 * de progresos— para que este paquete no pueda romper aquel fichero sin verlo.
 */
const MAX_FILAS_DE_PROGRESO = 3;

/** Los cuatro estados que la aplicacion produce para un tema con evidencia. */
const ESCENARIOS: readonly Partial<TopicCardProps>[] = [
  {
    level: "starting",
    evidenceText: { es: "5 preguntas respondidas", en: "5 questions answered" },
    nextStepText: { es: "4 aciertos y subes de nivel", en: "4 more correct" },
  },
  {
    level: "learning",
    evidenceText: { es: "12 preguntas respondidas", en: "12 questions answered" },
    nextStepText: { es: "3 aciertos y subes de nivel", en: "3 more correct" },
  },
  {
    level: "solid",
    evidenceText: { es: "20 preguntas respondidas", en: "20 questions answered" },
    nextStepText: { es: "1 acierto y subes de nivel", en: "1 more correct" },
  },
  {
    // Dominado: aqui el medidor se sustituye por la frase, y la fila SIGUE.
    level: "mastered",
    evidenceText: { es: "30 preguntas respondidas", en: "30 questions answered" },
    nextStepText: { es: "Dominado. Pásate de vez en cuando", en: "Mastered" },
  },
];

/**
 * Lo que percibe quien no distingue colores: etiqueta, texto y geometria. El
 * color queda fuera a proposito: una fila que solo cambiara de tono no informa
 * a quien no lo ve, asi que aqui es como si no cambiara.
 */
const ATRIBUTOS = ["x", "y", "cx", "cy", "r", "width", "height", "d", "points"] as const;

function firma(el: Element): string {
  const nodos = Array.from(el.querySelectorAll("*"))
    .map((n) => [n.tagName, ...ATRIBUTOS.map((a) => `${a}=${n.getAttribute(a) ?? ""}`)].join(","))
    .join("|");
  return `${el.tagName}##${(el.textContent ?? "").trim()}##${nodos}`;
}

/**
 * Firma de cada fila en cada escenario: `[fila][escenario]`.
 *
 * Falla si el numero de filas cambia entre escenarios: sin eso los indices no
 * serian comparables, y ademas seria el sintoma de que la tarjeta cambia de
 * alto segun el progreso del alumno.
 */
function firmasPorFila(): string[][] {
  const acumulado: string[][] = [];
  let esperadas: number | null = null;

  for (const escenario of ESCENARIOS) {
    wrap(<TopicCard {...card(escenario)} />);
    const filasDeLaTarjeta = filas(screen.getByRole("link"));
    if (esperadas === null) {
      esperadas = filasDeLaTarjeta.length;
    } else {
      expect(
        filasDeLaTarjeta.length,
        `El escenario "${escenario.level ?? "sin nivel"}" monta ${filasDeLaTarjeta.length} ` +
          `filas y los anteriores montaban ${esperadas}: la tarjeta baila de alto segun el ` +
          "progreso y las filas dejan de ser comparables.",
      ).toBe(esperadas);
    }
    filasDeLaTarjeta.forEach((fila, i) => {
      (acumulado[i] ??= []).push(firma(fila));
    });
    cleanup();
  }
  return acumulado;
}

/** En que indice va cada fila con nombre, para no dar por hecho el orden. */
function indiceDeFila(nombre: string): number {
  wrap(<TopicCard {...card(ESCENARIOS[0] ?? {})} />);
  const indice = filas(screen.getByRole("link")).findIndex(
    (fila) => fila.getAttribute("data-cet-fila") === nombre,
  );
  cleanup();
  expect(indice, `no existe la fila ${nombre}`).toBeGreaterThanOrEqual(0);
  return indice;
}

describe("TopicCard — densidad: tres filas de progreso y ni una mas", () => {
  it("no habla de progreso en mas filas de las que se leen de un vistazo", () => {
    const porFila = firmasPorFila();
    const indicadores = porFila.flatMap((fila, i) => (new Set(fila).size > 1 ? [i] : []));

    expect(
      indicadores.length,
      `La tarjeta habla de progreso en ${indicadores.length} filas. El tope es ` +
        `${MAX_FILAS_DE_PROGRESO}, y superarlo se arregla QUITANDO una, no subiendo el tope. ` +
        "Cuentan las filas de texto igual que las dibujadas.",
    ).toBeLessThanOrEqual(MAX_FILAS_DE_PROGRESO);

    expect(
      indicadores.length,
      "ninguna fila cambia con el progreso: este bloque estaria pasando en vacio",
    ).toBeGreaterThan(1);
  });

  it("la pista no cuenta como indicador: no cambia con el progreso", () => {
    const porFila = firmasPorFila();
    const pista = indiceDeFila("pista");
    expect(new Set(porFila[pista] ?? []).size).toBe(1);
  });

  it("el bloque de progreso va al pie, detras de la pista", () => {
    // El orden es la mitad del arreglo de obs003: arriba quien es el tema,
    // abajo como va. Ademas es lo que iguala el alto de las tarjetas de una
    // misma fila —el bloque se empuja al fondo con `mt-auto`— en vez de dejar
    // el hueco colgando debajo del texto, como se veia en «Unidades metricas».
    wrap(<TopicCard {...card()} />);
    const nombres = filas(screen.getByRole("link")).map((f) => f.getAttribute("data-cet-fila"));

    expect(nombres).toEqual(["cabecera", "pista", "nivel", "siguiente"]);
  });
});

/* -------------------------------------------------------------------------- */

const REJILLA: readonly TopicCardProps[] = [
  card({ topic: "simplify", name: "Simplificar", href: "/practice/math.simplify" }),
  card({ topic: "compare", name: "Comparar", href: "/practice/math.compare", level: null }),
  card({ topic: "angles", name: "Ángulos", href: "/practice/math.angles" }),
  card({
    topic: "mix",
    subjectCode: "mix",
    name: "Mezcla",
    href: "/practice/math.mix",
    level: null,
    nextStepText: undefined,
    evidenceText: undefined,
  }),
];

describe("TopicGrid", () => {
  it("respeta el orden de entrada: lo manda el registro de generadores", () => {
    wrap(<TopicGrid topics={REJILLA} />);

    const destinos = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(destinos).toEqual(REJILLA.map((topic) => topic.href));
  });

  it("es una lista, para que el lector pueda decir cuantos temas hay", () => {
    wrap(<TopicGrid topics={REJILLA} />);
    const lista = screen.getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(REJILLA.length);
  });

  it("no muta el array que le pasan", () => {
    const entrada = [...REJILLA];
    wrap(<TopicGrid topics={entrada} />);
    expect(entrada.map((topic) => topic.href)).toEqual(REJILLA.map((topic) => topic.href));
  });

  it("cero violaciones de accesibilidad en la rejilla completa", async () => {
    const { container } = wrap(<TopicGrid topics={REJILLA} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
