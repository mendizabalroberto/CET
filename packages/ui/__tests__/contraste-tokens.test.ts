/**
 * @cet/ui — el contraste de la paleta, medido por la maquina.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUE EXISTE ESTE FICHERO
 *
 * Los ratios de `packages/ui/REVIEW.md` se calcularon a mano, una vez, en una
 * tarde. Un token que cambie manana no los invalida: los deja MINTIENDO, que es
 * peor, porque la tabla sigue ahi diciendo "AA" con un numero que ya no
 * corresponde a ningun color del producto. Y la propia REVIEW.md avisa de que su
 * medicion anterior describia una hoja que el navegador ni siquiera cargaba.
 *
 * Aqui el umbral se comprueba sobre los HEXADECIMALES QUE HAY EN `tokens.css`,
 * en los dos temas, cada vez que corren los tests. Si alguien oscurece un fondo
 * o aclara una tinta y cruza el umbral, esto se pone rojo con el par y el numero.
 *
 * QUE NO HACE. No mide todos los pares posibles —eso serian miles y la mayoria
 * no se pintan nunca juntos—. Mide los pares que el producto DIBUJA de verdad, y
 * la lista tiene un minimo declarado para que no pueda quedarse vacia por un
 * cambio de formato en el CSS: un test de contraste que no encuentra tokens
 * pasaria en verde sin medir nada.
 *
 * PAR QUE FALTA A PROPOSITO: `--cet-hint-accent` / `--cet-hint-bg` da 1.92:1 en
 * tema claro. Es un defecto ABIERTO y documentado en REVIEW.md ("El fallo del
 * ambar sigue abierto y es de paleta, no de componente"); arreglarlo es cambiar
 * el ambar del sistema y no entra en este encargo. No se anade aqui para no
 * dejar la suite roja, y se deja escrito para que nadie crea que se ha medido.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** `vitest.config.ts` vive en la raiz del paquete: cwd es `packages/ui`. */
const TOKENS = join(process.cwd(), "src", "tokens.css");
/** Normalizado a LF: en Windows el fichero llega con CRLF y las anclas no casan. */
const CSS = readFileSync(TOKENS, "utf8").replace(/\r\n/g, "\n");

/* ------------------------------------------------------------------ *
 * Leer los tokens tal y como estan escritos
 * ------------------------------------------------------------------ */

/** Cuerpo `{...}` cuya llave de apertura es la primera tras `desde`. */
function cuerpo(texto: string, desde: number): string {
  const inicio = texto.indexOf("{", desde);
  if (inicio === -1) throw new Error("bloque sin abrir");
  let nivel = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === "{") nivel += 1;
    else if (texto[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return texto.slice(inicio + 1, i);
    }
  }
  throw new Error("bloque sin cerrar");
}

/** Declaraciones `--x: y;` de un cuerpo, ignorando comentarios y anidados. */
function declaraciones(texto: string): Map<string, string> {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, string>();
  for (const m of sinComentarios.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    out.set(m[1] as string, (m[2] as string).trim());
  }
  return out;
}

/** Bloque cuyo selector empieza en la primera aparicion literal de `ancla`. */
function bloque(ancla: string): Map<string, string> {
  const i = CSS.indexOf(ancla);
  // Falla como error, no como `expect`: esto corre al importar el fichero y un
  // `expect` fuera de un test se pierde sin decir por que.
  if (i === -1) throw new Error(`no se encuentra el bloque \`${ancla}\` en tokens.css`);
  return declaraciones(cuerpo(CSS, i));
}

const CLARO = bloque("\n:root {\n  color-scheme: light;");
const OSCURO_SISTEMA = bloque(':root:not([data-theme="light"]) {');
const OSCURO_EXPLICITO = bloque(':root[data-theme="dark"] {');

/** El tema oscuro es el claro con sus sustituciones encima, igual que en la cascada. */
const OSCURO = new Map([...CLARO, ...OSCURO_EXPLICITO]);

const TEMAS: ReadonlyArray<readonly [string, Map<string, string>]> = [
  ["claro", CLARO],
  ["oscuro", OSCURO],
];

/* ------------------------------------------------------------------ *
 * WCAG 2.1: luminancia relativa y ratio de contraste
 * ------------------------------------------------------------------ */

function canales(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const largo = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(largo)) throw new Error(`no es un hexadecimal: "${hex}"`);
  return [0, 2, 4].map((i) => parseInt(largo.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function ratio(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Valor hexadecimal de un token en un tema. Falla fuerte si no existe. */
function valor(tema: Map<string, string>, token: string): string {
  const v = tema.get(`--cet-${token}`);
  if (v === undefined) throw new Error(`el token --cet-${token} no existe en tokens.css`);
  return v;
}

/* ------------------------------------------------------------------ *
 * Los pares que el producto dibuja de verdad
 * ------------------------------------------------------------------ */

interface Par {
  /** Token de delante (tinta, glifo, trazo). */
  readonly frente: string;
  /** Token de detras (relleno, superficie). */
  readonly fondo: string;
  /** 4.5 texto normal (1.4.3); 3 texto grande y componentes de UI (1.4.11). */
  readonly umbral: 4.5 | 3;
  readonly uso: string;
}

const PARES: readonly Par[] = [
  /* --- la capa de acento vivo: el motivo de este fichero --- */
  { frente: "on-vivid", fondo: "ok-vivid", umbral: 4.5, uso: "tinta sobre bloque de logro" },
  { frente: "on-vivid", fondo: "hint-vivid", umbral: 4.5, uso: "tinta sobre bloque de pista" },
  { frente: "on-vivid", fondo: "step-vivid", umbral: 4.5, uso: "tinta sobre bloque de paso" },
  { frente: "ok-vivid-text", fondo: "bg", umbral: 4.5, uso: "texto de logro en pagina" },
  { frente: "ok-vivid-text", fondo: "surface", umbral: 4.5, uso: "texto de logro en tarjeta" },
  { frente: "no-vivid-text", fondo: "bg", umbral: 4.5, uso: "texto a revisar en pagina" },
  { frente: "no-vivid-text", fondo: "surface", umbral: 4.5, uso: "texto a revisar en tarjeta" },
  { frente: "hint-vivid-text", fondo: "bg", umbral: 4.5, uso: "texto de pista en pagina" },
  { frente: "hint-vivid-text", fondo: "surface", umbral: 4.5, uso: "texto de pista en tarjeta" },
  { frente: "step-vivid-text", fondo: "bg", umbral: 4.5, uso: "texto de paso en pagina" },
  { frente: "step-vivid-text", fondo: "surface", umbral: 4.5, uso: "texto de paso en tarjeta" },
  // El rojo vivo NO rellena: 3.63:1 con la tinta encima. Solo es trazo, y como
  // objeto grafico su umbral es 3:1 contra lo que tiene al lado.
  { frente: "no-vivid", fondo: "bg", umbral: 3, uso: "barra de `.cet-acento--revisar` en pagina" },
  { frente: "no-vivid", fondo: "surface", umbral: 3, uso: "barra de `.cet-acento--revisar` en tarjeta" },

  /* --- lo que la unificacion de paletas puso en circulacion --- */
  { frente: "on-primary", fondo: "primary-bright", umbral: 4.5, uso: "texto del hero en su punto mas claro" },
  { frente: "on-primary", fondo: "primary", umbral: 4.5, uso: "boton primario" },
  { frente: "on-primary", fondo: "primary-hover", umbral: 4.5, uso: "boton primario en hover" },
  // `--teal` de la app apunta ya a la variante legible: se usa como texto.
  { frente: "teal-text", fondo: "surface", umbral: 4.5, uso: "enlaces de la app (`text-teal`)" },
  { frente: "teal-text", fondo: "bg", umbral: 4.5, uso: "enlaces sobre el fondo de pagina" },

  /* --- pares de siempre: si alguien mueve la base, esto lo caza --- */
  { frente: "ink", fondo: "bg", umbral: 4.5, uso: "texto de pagina" },
  { frente: "ink", fondo: "surface", umbral: 4.5, uso: "texto en tarjeta" },
  { frente: "ink-muted", fondo: "surface", umbral: 4.5, uso: "texto secundario" },
  { frente: "ink-muted", fondo: "surface-3", umbral: 4.5, uso: "cabecera de tabla" },
  { frente: "ok-text", fondo: "ok-bg", umbral: 4.5, uso: "feedback correcto" },
  { frente: "no-text", fondo: "no-bg", umbral: 4.5, uso: "feedback incorrecto" },
  { frente: "hint-text", fondo: "hint-bg", umbral: 4.5, uso: "pista" },
  { frente: "amber-text", fondo: "surface", umbral: 4.5, uso: "aviso del temporizador" },
  { frente: "border-strong", fondo: "surface", umbral: 3, uso: "borde de control" },
];

/** Suelo de la medicion: por debajo de esto el test no esta midiendo nada. */
const MINIMO_DE_PARES = 24;

describe("contraste de los tokens de color", () => {
  it("hay tokens que medir (si no, este fichero pasa en vacio)", () => {
    // Las tres condiciones fallan por separado: hoja vacia, tema oscuro perdido,
    // o lista de pares recortada.
    expect(CLARO.size).toBeGreaterThan(40);
    expect(OSCURO_EXPLICITO.size).toBeGreaterThan(20);
    expect(PARES.length).toBeGreaterThanOrEqual(MINIMO_DE_PARES);
  });

  it("los dos bloques de tema oscuro dicen exactamente lo mismo", () => {
    // Son la misma decision escrita dos veces (`prefers-color-scheme` y
    // `[data-theme]`). Cuando divergen, el tema del sistema y el elegido a mano
    // dejan de ser el mismo producto, y nadie lo ve hasta que un alumno lo usa.
    expect([...OSCURO_SISTEMA].sort()).toEqual([...OSCURO_EXPLICITO].sort());
  });

  describe.each(TEMAS)("tema %s", (_nombre, tema) => {
    it.each(PARES)("$frente sobre $fondo cumple $umbral:1 — $uso", (par) => {
      const frente = valor(tema, par.frente);
      const fondo = valor(tema, par.fondo);
      const r = ratio(frente, fondo);
      expect(
        r,
        `--cet-${par.frente} (${frente}) sobre --cet-${par.fondo} (${fondo}) da ${r.toFixed(2)}:1 ` +
          `y el minimo para "${par.uso}" es ${par.umbral}:1.`,
      ).toBeGreaterThanOrEqual(par.umbral);
    });
  });

  /*
   * El anillo de foco no es un par: es DOS anillos.
   *
   * El fallo que dio origen a todo esto (1.57:1) venia de un anillo simple, que
   * solo funciona si el elemento con foco esta sobre el fondo que el disenador
   * imagino. En cuanto cae sobre un relleno de marca o sobre un bloque vivo se
   * queda sin contraste. Con anillo + halo la garantia es otra y es la que se
   * comprueba aqui: contra CUALQUIER cosa que haya debajo, al menos uno de los
   * dos se recorta (3:1); y los dos se distinguen entre si.
   *
   * En claro `--cet-focus` es exactamente `--cet-primary`: sobre el boton
   * primario el anillo da 1.00:1 y es el halo blanco el que lo salva. Ese caso,
   * que es el que estaba roto, esta en la lista.
   */
  describe.each(TEMAS)("foco, tema %s", (_nombre, tema) => {
    const ADYACENTES = ["bg", "surface", "surface-3", "primary", "ok-vivid", "no-vivid", "hint-vivid", "step-vivid"];

    it("el anillo y su halo se distinguen entre si", () => {
      const r = ratio(valor(tema, "focus"), valor(tema, "focus-halo"));
      expect(r, `anillo y halo a ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    });

    it.each(ADYACENTES)("se ve sobre %s", (fondo) => {
      const debajo = valor(tema, fondo);
      const anillo = ratio(valor(tema, "focus"), debajo);
      const halo = ratio(valor(tema, "focus-halo"), debajo);
      expect(
        Math.max(anillo, halo),
        `sobre --cet-${fondo} (${debajo}) el anillo da ${anillo.toFixed(2)}:1 y el halo ${halo.toFixed(2)}:1. ` +
          `Al menos uno de los dos tiene que llegar a 3:1, o el foco desaparece encima de ese color.`,
      ).toBeGreaterThanOrEqual(3);
    });
  });
});

/*
 * El BORDE de un bloque vivo tampoco es un par suelto.
 *
 * En claro, lo que separa el bloque de la pagina es su contorno oscuro
 * (--cet-on-vivid contra --cet-bg, 15.35:1); el relleno amarillo por si solo
 * daria 1.38:1. En oscuro pasa lo contrario: el contorno oscuro se funde con la
 * pagina y es el relleno saturado el que se recorta (12.26:1). Exigir siempre lo
 * mismo obligaria a un color que no funciona en ningun tema. Lo que hay que
 * garantizar es que el bloque SE VEA como bloque: por el relleno o por el
 * contorno, uno de los dos.
 */
describe.each(TEMAS)("el bloque vivo se recorta sobre la pagina, tema %s", (_nombre, tema) => {
  const RELLENOS = ["ok-vivid", "hint-vivid", "step-vivid"];

  it.each(RELLENOS)("%s", (relleno) => {
    const pagina = valor(tema, "bg");
    const porRelleno = ratio(valor(tema, relleno), pagina);
    const porContorno = ratio(valor(tema, "on-vivid"), pagina);
    expect(
      Math.max(porRelleno, porContorno),
      `sobre --cet-bg (${pagina}) el relleno --cet-${relleno} da ${porRelleno.toFixed(2)}:1 y el ` +
        `contorno --cet-on-vivid ${porContorno.toFixed(2)}:1. Uno de los dos tiene que llegar a 3:1 ` +
        `o el bloque deja de leerse como un bloque.`,
    ).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------------------------------------------------ *
 * La segunda senal de los bloques de acento
 * ------------------------------------------------------------------ */

/**
 * En deuteranopia el rojo y el verde de esta paleta son el mismo color. Por eso
 * las clases `.cet-acento--*` no pueden diferenciarse solo por su relleno.
 *
 * Este test apaga el color —quita rellenos, tintas y trazos, y borra todo
 * literal de color de lo que queda— y exige que las cuatro sigan siendo cuatro.
 * Lo que sobrevive es trama y geometria: exactamente lo que ve un alumno que no
 * distingue el verde del rojo.
 */
describe("bloques de acento — se distinguen sin color", () => {
  const MODIFICADORES = ["paso", "logro", "pista", "revisar"] as const;

  /** Propiedades cuyo valor ES un color y por tanto no cuentan como senal. */
  const SOLO_COLOR = new Set(["--cet-acento-fondo", "--cet-acento-tinta", "--cet-acento-trazo"]);

  /** Quita de un valor todo lo que sea color: literales y referencias a tokens de color. */
  function sinColor(valorCss: string): string {
    return valorCss
      .replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (_todo, token: string) => {
        const resuelto = CLARO.get(token) ?? "";
        const esColor = /^#|^rgb|^hsl|^transparent$/.test(resuelto) || SOLO_COLOR.has(token);
        return esColor ? "" : resuelto;
      })
      .replace(/#[0-9a-fA-F]{3,8}\b/g, "")
      .replace(/(rgba?|hsla?)\([^)]*\)/g, "")
      .replace(/\btransparent\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firma(modificador: string): string {
    const decls = bloque(`.cet-acento--${modificador} {`);
    return [...decls]
      .filter(([prop]) => !SOLO_COLOR.has(prop))
      .map(([prop, v]) => `${prop}:${sinColor(v)}`)
      .sort()
      .join("|");
  }

  it("las cuatro clases existen (si no, no hay nada que comparar)", () => {
    for (const m of MODIFICADORES) {
      expect(CSS, `falta la clase .cet-acento--${m}`).toContain(`.cet-acento--${m} {`);
    }
    expect(MODIFICADORES.length).toBe(4);
  });

  it("cada clase declara alguna senal que no es color", () => {
    for (const m of MODIFICADORES) {
      expect(firma(m), `.cet-acento--${m} solo cambia el color: no la distingue nadie sin verlo`).not.toBe("");
    }
  });

  it("con el color apagado siguen siendo cuatro bloques distintos", () => {
    const firmas = new Map(MODIFICADORES.map((m) => [m, firma(m)]));
    expect(
      new Set(firmas.values()).size,
      `Firmas no cromaticas repetidas: ${JSON.stringify([...firmas], null, 2)}`,
    ).toBe(MODIFICADORES.length);
  });
});
