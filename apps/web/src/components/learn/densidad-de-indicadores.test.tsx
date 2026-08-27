/**
 * INVARIANTE DE FAMILIA: la pantalla de progreso no acumula indicadores, y
 * ninguno repite lo que ya dice otro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA CAZA, Y POR QUÉ HACÍA FALTA
 * ===========================================================================
 * El riesgo de «hacer el progreso más visual» no es quedarse corto: es que cada
 * pasada añada un medidor más hasta que ninguno signifique nada. Un niño de once
 * años lee UNO de un vistazo; con cinco, no lee ninguno, y el coste no se ve en
 * ningún test —todos verdes, todo accesible, todo alimentado por datos reales—
 * porque cada indicador, por separado, es correcto.
 *
 * Ya hay una muestra medida de a dónde lleva esto sin freno: la cabecera de la
 * sesión de práctica llegó a montar SEIS indicadores con dos parejas midiendo el
 * mismo número. Este test no arregla aquella pantalla; cierra la puerta a que la
 * parrilla acabe igual.
 *
 * ===========================================================================
 * QUÉ CUENTA COMO INDICADOR, Y POR QUÉ YA NO SE CUENTAN LOS ROLES
 * ===========================================================================
 * La primera versión de este fichero contaba `[role=img|progressbar|meter]`, y
 * estaba mal en los dos sentidos:
 *
 *  - **Contaba de menos.** «10 preguntas respondidas» y «Dominado. Pásate de vez
 *    en cuando...» son indicadores con todas las letras, y son `<span>` de texto
 *    sin rol: el escáner veía DOS donde hay TRES. O sea que el tope de tres
 *    dejaba un hueco libre para colar un cuarto en silencio.
 *  - **Se le podía esquivar sin romper nada.** La cabecera afirmaba que un
 *    indicador sin rol «sería además inaccesible». Es falso: una frase de texto
 *    es perfectamente accesible. Y ya pasaba: con la ventana dominada el
 *    `EffortMeter` desaparece y lo sustituye una frase, así que la tarjeta del
 *    tema mejor medido era la que menos contaba.
 *
 * Lo que se cuenta ahora es CONDUCTUAL, no estructural: se pinta la misma
 * tarjeta con una batería de progresos distintos y se llama indicador a **toda
 * fila de la tarjeta cuya pinta CAMBIA con el progreso**. El título del tema y
 * la pista no cambian nunca, así que no cuentan; la escalera, el recuento y el
 * siguiente paso cambian, así que cuentan los tres — se dibujen en SVG o se
 * escriban en una frase. Un indicador que de verdad comunique progreso tiene que
 * variar con el progreso: por definición no puede esconderse de este conteo.
 *
 * La unidad es la FILA (hijo directo del enlace de la tarjeta) y no el elemento
 * suelto, porque la densidad que sufre el alumno se mide en líneas de tarjeta.
 * Dos indicadores metidos en la misma fila cuentan como uno; es deliberado:
 * comparten renglón, que es el recurso escaso.
 *
 * ===========================================================================
 * LAS DOS COSAS QUE COMPRUEBA
 * ===========================================================================
 * 1. **Densidad.** Cuántas filas de la tarjeta hablan de progreso, y cuánto
 *    monta la pantalla por encima de ellas. El tope es deliberadamente
 *    incómodo: superarlo tiene que obligar a QUITAR algo, no a subir la cifra.
 *
 * 2. **Que cada uno diga algo distinto**, y esto es lo que un tope no ve. De
 *    cada indicador se anota su firma en cada escenario, lo que da una
 *    PARTICIÓN de la batería: qué casos distingue y cuáles no. Si dos
 *    indicadores inducen la misma partición, el segundo no aporta ni un bit: se
 *    ve distinto exactamente cuando el otro ya se veía distinto.
 *
 * ===========================================================================
 * EL PARÁMETRO ESCONDIDO: LA BATERÍA, Y QUÉ DIMENSIONES MUEVE
 * ===========================================================================
 * Hay que decirlo en voz alta porque condiciona todos los veredictos de abajo.
 * `ESCENARIOS` mueve **dos** dimensiones: el acierto reciente y el VOLUMEN de
 * respuestas. Ni una más. Dos consecuencias, las dos reales:
 *
 *  - Un indicador legítimo alimentado por una dimensión que la batería NO mueve
 *    —racha, recencia, tiempo, progreso dentro de la sesión— sale CONSTANTE, y
 *    entonces este test no lo ve: ni gasta cupo del tope ni entra en el análisis
 *    de parejas. No lo condena (sería un falso positivo: constante en esta
 *    batería no es lo mismo que decorativo), pero tampoco lo protege. **Si
 *    añades un indicador alimentado por una dimensión nueva, amplía
 *    `ESCENARIOS` para que la mueva**, o lo estarás dejando fuera del control
 *    sin enterarte. Que una fila decorativa de verdad no se cuele lo cubre
 *    `progreso-viene-de-datos.test.tsx`, que sí exige que el dibujo cambie con
 *    sus propios datos.
 *  - Al revés: dos indicadores del mismo número con granularidad distinta
 *    («7 de 10» y «Lo llevas bien») dan particiones distintas y PASAN. Esto caza
 *    el duplicado exacto, no el parecido. No pretende más.
 *
 * ===========================================================================
 * NO PUEDE PASAR EN VACÍO
 * ===========================================================================
 * Se exige encontrar tarjetas, encontrar la vista de conjunto, encontrar alguna
 * tarjeta que cambie con el progreso, y llegar a dos indicadores —única
 * situación en la que el análisis de parejas tiene algo que decir—.
 *
 * Verificado por mutación: duplicando la escalera dentro de la tarjeta se pone
 * rojo el bloque de parejas; añadiendo una fila de progreso más —también si es
 * de TEXTO, que es lo que la versión anterior no veía— se pone rojo el tope.
 */
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { getLearnDictionary } from "./dictionary";
import { practiceTopics } from "./practice-topics";
import { PracticeTopicGrid } from "./PracticeTopicGrid";
import { UiLocaleProvider } from "./UiLocaleProvider";
import { summarisePracticeEvents, type AnsweredEvent } from "./practice-progress";

/**
 * Topes. Son juicio de diseño, no una medida: por eso están aquí arriba con su
 * motivo y no escondidos en una aserción.
 *
 * Tres filas de progreso por tarjeta es EXACTAMENTE lo que hay hoy —nivel,
 * evidencia y siguiente paso—, medido con el conteo de abajo y no estimado a
 * ojo. No queda holgura a propósito: cualquier cuarta cosa, se dibuje o se
 * escriba, pone rojo este fichero. En un móvil de 360 px las tres ya llenan la
 * tarjeta (ver `tocheck/progreso-10-conjunto-movil-360-y-grises.jpg`).
 *
 * Uno por pantalla para lo que agrega: si algún día hacen falta dos vistas de
 * conjunto, es que ninguna estaba respondiendo la pregunta.
 */
const MAX_POR_TARJETA = 3;
const MAX_FUERA_DE_LAS_TARJETAS = 1;

const locale = "es" as const;
const dictionary = getLearnDictionary(locale);
const topics = practiceTopics(dictionary);

/** El tema sobre el que se hace el análisis de parejas. */
const TEMA = "math.compare";

/**
 * `[aciertos, fallos]`. Mueve DOS dimensiones —acierto y volumen— y por eso hay
 * escenarios con la ventana llena, con menos de una ventana, y con histórico por
 * encima de la ventana. Ver «el parámetro escondido» en la cabecera antes de
 * tocar esta lista.
 */
const ESCENARIOS: readonly (readonly [number, number])[] = [
  [2, 8], // empezando, ventana llena
  [4, 6], // aprendiendo
  [5, 5], // aprendiendo, otro reparto
  [7, 3], // lo llevas bien
  [9, 1], // dominado: aquí el medidor de esfuerzo se sustituye por una frase
  [4, 1], // lo llevas bien con MENOS de una ventana (5 respuestas)
  [12, 3], // dominado con histórico POR ENCIMA de la ventana (15 respuestas)
];

/**
 * El mismo progreso para TODOS los grupos, no solo para el analizado.
 *
 * Si solo se alimentara `TEMA`, nueve de las diez tarjetas saldrian sin datos y
 * el tope de densidad se estaria comprobando sobre una sola: una parrilla donde
 * casi nada se pinta no ejercita nada. Asi el recorrido de todas las tarjetas
 * mide de verdad.
 */
function progresoDe(aciertos: number, fallos: number) {
  const eventos: AnsweredEvent[] = topics.flatMap((topic) => [
    ...Array.from({ length: aciertos }, () => ({ engineKey: topic.id, isCorrect: true })),
    ...Array.from({ length: fallos }, () => ({ engineKey: topic.id, isCorrect: false })),
  ]);
  return summarisePracticeEvents(eventos);
}

function pintar(aciertos: number, fallos: number): HTMLElement {
  const { container } = render(
    <UiLocaleProvider locale={locale}>
      <PracticeTopicGrid
        topics={topics}
        dictionary={dictionary}
        locale={locale}
        progress={progresoDe(aciertos, fallos)}
      />
    </UiLocaleProvider>,
  );
  return container;
}

/** Las filas de una tarjeta: los hijos directos de su enlace. */
function filas(tarjeta: Element): Element[] {
  const enlace = tarjeta.querySelector("a");
  return enlace === null ? [] : Array.from(enlace.children);
}

/**
 * Lo que percibe quien no distingue colores: etiqueta del elemento, texto
 * accesible y geometría. El color queda fuera a propósito, igual que en
 * `progreso-viene-de-datos`: un indicador que sólo cambiara de tono no informa a
 * quien no lo ve, así que aquí es como si no cambiara.
 */
const ATRIBUTOS = ["x", "y", "cx", "cy", "r", "width", "height", "d", "points", "style"] as const;

function firma(el: Element): string {
  const nodos = Array.from(el.querySelectorAll("*"))
    .map((n) => [n.tagName, ...ATRIBUTOS.map((a) => `${a}=${n.getAttribute(a) ?? ""}`)].join(","))
    .join("|");
  return `${el.tagName}##${(el.textContent ?? "").trim()}##${nodos}`;
}

/** La tarjeta de un tema concreto. */
function tarjetaDe(container: HTMLElement, engineKey: string): Element {
  const tarjeta = Array.from(container.querySelectorAll("li")).find((li) =>
    li.querySelector(`a[href="/practice/${engineKey}"]`),
  );
  if (tarjeta === undefined) throw new Error(`No se ha encontrado la tarjeta de ${engineKey}`);
  return tarjeta;
}

/**
 * Recorre la batería y devuelve, para la tarjeta de `engineKey`, la firma de
 * cada fila en cada escenario: `[fila][escenario]`.
 *
 * Falla si el número de filas cambia entre escenarios: sin eso los índices no
 * serían comparables y todo lo de abajo compararía peras con manzanas. La
 * versión anterior de este fichero *creía* comprobar esto y comparaba un valor
 * consigo mismo, así que no comprobaba nada.
 */
function firmasPorFila(engineKey: string): string[][] {
  const acumulado: string[][] = [];
  let esperadas: number | null = null;

  for (const [aciertos, fallos] of ESCENARIOS) {
    const container = pintar(aciertos, fallos);
    const filasDeLaTarjeta = filas(tarjetaDe(container, engineKey));
    esperadas ??= filasDeLaTarjeta.length;
    expect(
      filasDeLaTarjeta.length,
      `El escenario ${aciertos}/${aciertos + fallos} de ${engineKey} monta ` +
        `${filasDeLaTarjeta.length} filas y los anteriores montaban ${esperadas}: la batería ` +
        "tiene que ser comparable escenario a escenario.",
    ).toBe(esperadas);
    filasDeLaTarjeta.forEach((fila, i) => {
      (acumulado[i] ??= []).push(firma(fila));
    });
    cleanup();
  }
  return acumulado;
}

/** Índices de las filas que CAMBIAN con el progreso. Ésos son los indicadores. */
function indicesDeIndicador(porFila: readonly string[][]): number[] {
  return porFila.flatMap((fila, i) => (new Set(fila).size > 1 ? [i] : []));
}

/** Qué escenarios agrupa una fila. Dos indicadores redundantes dan lo mismo. */
function particion(fila: readonly string[]): string {
  const grupos = new Map<string, number[]>();
  fila.forEach((f, e) => grupos.set(f, [...(grupos.get(f) ?? []), e]));
  return JSON.stringify([...grupos.values()].map((g) => g.join(",")).sort());
}

/* -------------------------------------------------------------------------- */

describe("invariante — la parrilla de práctica no acumula indicadores", () => {
  it("ninguna tarjeta habla de progreso en más filas de las que se leen de un vistazo", () => {
    // Se recorren TODAS las tarjetas y no sólo la que se analiza después: una
    // parrilla donde nueve de diez no tienen datos dejaría el tope sin ejercitar.
    const conProgreso: string[] = [];

    for (const topic of topics) {
      const indicadores = indicesDeIndicador(firmasPorFila(topic.id));
      if (indicadores.length > 0) conProgreso.push(topic.id);
      expect(
        indicadores.length,
        `La tarjeta de ${topic.id} habla de progreso en ${indicadores.length} filas. El tope es ` +
          `${MAX_POR_TARJETA}, y superarlo se arregla QUITANDO una, no subiendo el tope: la que ` +
          "sobra no la mira nadie. Cuentan las filas de texto igual que las dibujadas.",
      ).toBeLessThanOrEqual(MAX_POR_TARJETA);
    }

    expect(
      conProgreso.length,
      "ninguna tarjeta cambia con el progreso: el test no está probando nada",
    ).toBeGreaterThan(0);
  });

  it("por encima de las tarjetas sólo hay la vista de conjunto", () => {
    // Aquí sí basta con contar por rol: lo único que se agrega es un dibujo, y
    // este bloque vigila que no aparezca un segundo agregado a su lado.
    const container = pintar(7, 3);
    const grafico = '[role="img"],[role="progressbar"],[role="meter"]';
    const dentro = new Set(
      Array.from(container.querySelectorAll("li")).flatMap((li) =>
        Array.from(li.querySelectorAll(grafico)),
      ),
    );
    const fuera = Array.from(container.querySelectorAll(grafico)).filter((el) => !dentro.has(el));
    expect(
      fuera.length,
      "La pantalla agrega más de una vez. Si hacen falta dos resúmenes, ninguno estaba " +
        "respondiendo «cómo voy».",
    ).toBeLessThanOrEqual(MAX_FUERA_DE_LAS_TARJETAS);
    expect(fuera.length, "no hay vista de conjunto: el tope de arriba pasa en vacío").toBe(1);
    cleanup();
  });

  it("dos indicadores de la misma tarjeta no pueden distinguir los mismos casos", () => {
    const porFila = firmasPorFila(TEMA);
    const indicadores = indicesDeIndicador(porFila);

    expect(
      indicadores.length,
      "la tarjeta no llega a dos indicadores: no hay parejas que comparar y este bloque " +
        "estaría pasando en vacío",
    ).toBeGreaterThanOrEqual(2);

    for (let a = 0; a < indicadores.length; a += 1) {
      for (let b = a + 1; b < indicadores.length; b += 1) {
        const [i, j] = [indicadores[a] as number, indicadores[b] as number];
        expect(
          particion(porFila[j] as string[]),
          `Las filas ${i} y ${j} de la tarjeta se ven distintas exactamente en los mismos casos: ` +
            "la segunda no aporta ni un bit sobre la primera. Quita una, o haz que mida otra cosa.",
        ).not.toBe(particion(porFila[i] as string[]));
      }
    }
  });

  it("la tarjeta con datos no puede quedarse hablando de progreso en una sola fila", () => {
    // El bloque de arriba compara parejas: con un solo indicador no compara
    // nada y pasaría en vacío. Esto es lo que impide que alguien funda el nivel,
    // el recuento y el siguiente paso en una frase y deje el test sin trabajo.
    //
    // Ojo al leer un fallo aquí: una fila que mida una dimensión que
    // `ESCENARIOS` no mueve sale constante y NO se cuenta como indicador, así
    // que puede hacer bajar este número sin que nada esté mal en la pantalla.
    // Ver «el parámetro escondido» en la cabecera: entonces lo que hay que
    // ampliar es la batería.
    const indicadores = indicesDeIndicador(firmasPorFila(TEMA));
    expect(
      indicadores.length,
      "la tarjeta ha dejado de hablar de progreso en más de una fila",
    ).toBeGreaterThan(1);
  });
});
