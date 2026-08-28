/**
 * @cet/ui — los colores de materia, medidos por la maquina en los dos temas.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * HERMANO DE `contraste-tokens.test.ts`, y por la misma razon: la tabla de
 * ratios que hay en la spec y en la cabecera de `tokens.css` se calculo una vez.
 * Un token que cambie manana no la invalida, la deja MINTIENDO. Aqui el umbral
 * se comprueba sobre los hexadecimales que hay escritos en `tokens.css`, en los
 * TRES bloques (claro, oscuro de sistema, oscuro explicito), cada vez que corren
 * los tests.
 *
 * LOS TRES BLOQUES Y NO DOS: el tema oscuro esta declarado dos veces —bajo
 * `prefers-color-scheme` y bajo `[data-theme="dark"]`— porque la eleccion
 * explicita del usuario tiene que poder ganar sobre la del sistema. Son dos
 * listas que hay que mantener a mano y en paralelo, asi que aqui se comprueba
 * ademas que digan EXACTAMENTE lo mismo. Un tema oscuro que solo funciona
 * cuando el sistema esta en oscuro es medio tema oscuro.
 *
 * QUE SE MIDE, Y POR QUE ESE PAR Y NO OTRO
 *
 *   --cet-materia-*        RELLENA: rail, medallon y barra de avance. El unico
 *                          texto que se apoya encima es el blanco del medallon
 *                          en claro, y la tinta inversa en oscuro. Se mide ESE
 *                          par contra 4.5:1, el umbral de texto normal, y no
 *                          contra el 3:1 de grafico: si un dia alguien pone una
 *                          inicial o una cifra dentro del medallon, ya esta
 *                          medido.
 *   --cet-materia-*-suave  es el CUERPO de la tarjeta, con --cet-ink encima.
 *                          Se mide contra 10:1 —muy por encima del minimo—
 *                          porque un lavado de color no puede permitirse comer
 *                          contraste a la tinta de un nino de once anos. Y se
 *                          mide TAMBIEN que se distinga de la superficie: un
 *                          lavado invisible no es un lavado, es una tarjeta
 *                          blanca con un token de mas.
 *
 * LO QUE ESTE FICHERO NO PUEDE COMPROBAR, Y HAY QUE DECIRLO: que las seis
 * materias se distingan entre si. NO SE DISTINGUEN. En deuteranopia los ratios
 * entre pares son 1.02 a 1.34, y en escala de grises los seis rellenos caen
 * entre #666666 y #717171. Eso no es un defecto que arreglar subiendo la
 * saturacion: es el limite de seis colores en una paleta accesible. La materia
 * se reconoce por su icono y su nombre, y quien lo comprueba es
 * `banco-visual.test.tsx` sobre `subject-identity`, no este fichero.
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

/** Declaraciones `--x: y;` de un cuerpo, ignorando comentarios. */
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
  // Error y no `expect`: esto corre al importar el fichero, y un `expect` fuera
  // de un test se pierde sin decir por que.
  if (i === -1) throw new Error(`no se encuentra el bloque \`${ancla}\` en tokens.css`);
  return declaraciones(cuerpo(CSS, i));
}

const CLARO = bloque("\n:root {\n  color-scheme: light;");
const OSCURO_SISTEMA = bloque(':root:not([data-theme="light"]) {');
const OSCURO_EXPLICITO = bloque(':root[data-theme="dark"] {');

/* ------------------------------------------------------------------ *
 * Contraste WCAG 2.1
 * ------------------------------------------------------------------ */

function canales(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`no es un hex de 6 digitos: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function ratio(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ------------------------------------------------------------------ *
 * Las materias
 * ------------------------------------------------------------------ */

/**
 * Los seis codigos de `subjects.code` mas la identidad neutra.
 *
 * `otra` no es una materia: es lo que se pinta cuando un colegio da de alta un
 * `code` que este design system no conoce. Sin ella, `var(--cet-materia-xxx)`
 * seria transparente y la tarjeta saldria invisible. Por eso se mide igual que
 * las demas.
 */
const MATERIAS = ["math", "science", "english", "spanish", "socials", "ict", "otra"] as const;

/** Minimo declarado: un test que no encuentra tokens pasaria sin medir nada. */
const MINIMO_DE_PARES = MATERIAS.length * 2;

function leer(bloque_: Map<string, string>, nombre: string): string {
  const valor = bloque_.get(nombre);
  if (valor === undefined) throw new Error(`falta el token \`${nombre}\``);
  return valor;
}

describe("colores de materia · tema claro", () => {
  it("mide al menos los pares declarados", () => {
    const encontrados = MATERIAS.flatMap((m) => [
      CLARO.get(`--cet-materia-${m}`),
      CLARO.get(`--cet-materia-${m}-suave`),
    ]).filter((v) => v !== undefined);
    expect(encontrados).toHaveLength(MINIMO_DE_PARES);
  });

  it.each(MATERIAS)("el relleno de %s admite el blanco del medallon (>= 4.5:1)", (materia) => {
    const relleno = leer(CLARO, `--cet-materia-${materia}`);
    const blanco = leer(CLARO, "--cet-ink-inverse");
    expect(ratio(relleno, blanco)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MATERIAS)("el suave de %s deja leer la tinta (>= 10:1)", (materia) => {
    const suave = leer(CLARO, `--cet-materia-${materia}-suave`);
    const tinta = leer(CLARO, "--cet-ink");
    expect(ratio(suave, tinta)).toBeGreaterThanOrEqual(10);
  });

  it.each(MATERIAS)("el suave de %s se distingue de la superficie (>= 1.10:1)", (materia) => {
    const suave = leer(CLARO, `--cet-materia-${materia}-suave`);
    const superficie = leer(CLARO, "--cet-surface");
    expect(ratio(suave, superficie)).toBeGreaterThanOrEqual(1.1);
  });
});

describe("colores de materia · tema oscuro", () => {
  it.each(MATERIAS)("el relleno de %s admite la tinta inversa (>= 4.5:1)", (materia) => {
    const relleno = leer(OSCURO_SISTEMA, `--cet-materia-${materia}`);
    const tintaInversa = leer(OSCURO_SISTEMA, "--cet-ink-inverse");
    expect(ratio(relleno, tintaInversa)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MATERIAS)("el relleno de %s se ve sobre la superficie oscura (>= 3:1)", (materia) => {
    const relleno = leer(OSCURO_SISTEMA, `--cet-materia-${materia}`);
    const superficie = leer(OSCURO_SISTEMA, "--cet-surface");
    expect(ratio(relleno, superficie)).toBeGreaterThanOrEqual(3);
  });

  it.each(MATERIAS)("el suave de %s deja leer la tinta clara (>= 10:1)", (materia) => {
    const suave = leer(OSCURO_SISTEMA, `--cet-materia-${materia}-suave`);
    const tinta = leer(OSCURO_SISTEMA, "--cet-ink");
    expect(ratio(suave, tinta)).toBeGreaterThanOrEqual(10);
  });

  it.each(MATERIAS)("el suave de %s se distingue de la superficie (>= 1.10:1)", (materia) => {
    const suave = leer(OSCURO_SISTEMA, `--cet-materia-${materia}-suave`);
    const superficie = leer(OSCURO_SISTEMA, "--cet-surface");
    expect(ratio(suave, superficie)).toBeGreaterThanOrEqual(1.1);
  });
});

describe("los dos bloques oscuros dicen lo mismo", () => {
  it.each(MATERIAS)("%s coincide en `prefers-color-scheme` y en `[data-theme]`", (materia) => {
    expect(leer(OSCURO_EXPLICITO, `--cet-materia-${materia}`)).toBe(
      leer(OSCURO_SISTEMA, `--cet-materia-${materia}`),
    );
    expect(leer(OSCURO_EXPLICITO, `--cet-materia-${materia}-suave`)).toBe(
      leer(OSCURO_SISTEMA, `--cet-materia-${materia}-suave`),
    );
  });
});

describe("el tema oscuro no reutiliza los valores del claro", () => {
  // Un tema oscuro copiado del claro pasa todos los umbrales de arriba si nadie
  // mira: los pares que se miden son contra la tinta de SU tema. Esto lo caza.
  it.each(MATERIAS)("%s cambia de valor al cambiar de tema", (materia) => {
    expect(leer(OSCURO_SISTEMA, `--cet-materia-${materia}-suave`)).not.toBe(
      leer(CLARO, `--cet-materia-${materia}-suave`),
    );
  });
});
