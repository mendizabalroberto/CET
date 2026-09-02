/**
 * PDF con capa de texto -> spans.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se apoya en `pdfjs-dist`, y esa es una decisión deliberada en un repositorio
 * que presume de no añadir dependencias. La alternativa era escribir un parser
 * de PDF: tabla xref con flujos de objetos comprimidos, streams Flate,
 * operadores `Tj`/`TJ`, y codificaciones de fuente (WinAnsi, Identity-H con
 * CID). Un parser propio a medio hacer no falla: devuelve texto **casi**
 * correcto, con las tildes cambiadas y las ligaduras perdidas. Es exactamente
 * el modo de fallo que este sistema entero existe para impedir.
 *
 * Un PDF no tiene párrafos: tiene trozos de texto con coordenadas. Las líneas
 * se reconstruyen agrupando por la Y, y eso es una interpretación —modesta y
 * documentada, pero interpretación. Por eso los spans de PDF salen marcados
 * `text_layer` y no se confunden con los de un .docx, donde el párrafo lo
 * declara el propio formato.
 */

import { asegurarDomMatrix } from "./dom-matrix.ts";
import { makeSpan, type SourceSpan } from "./spans.ts";

/** Diferencia máxima en Y (puntos PDF) para considerar dos trozos la misma línea. */
const MISMA_LINEA = 2.5;

/**
 * Hueco horizontal, en puntos, a partir del cual se mete un espacio entre dos
 * trozos contiguos. Un PDF suele emitir "Class" y "work" como dos trozos sin
 * espacio entre medias; pegarlos siempre juntaría palabras separadas, y
 * separarlos siempre partiría palabras.
 */
const HUECO = 1.2;

interface Trozo {
  text: string;
  x: number;
  y: number;
  ancho: number;
  /** Altura de la fuente, en puntos. Es la unidad con la que se mide lo vertical. */
  alto: number;
}

/**
 * Una fracción apilada no es texto: son dos números y una raya dibujada. El
 * numerador y el denominador salen del PDF como dos trozos a distinta Y, así
 * que agrupar por Y los reparte en dos líneas sueltas y la respuesta del examen
 * se queda sin su fracción. Estos límites dicen cuándo dos números apilados son
 * una fracción, medidos sobre los tres exámenes de Math de Y6A: el salto real
 * entre numerador y denominador es 11.2–11.3 puntos con fuentes de 10 y 10.5,
 * o sea entre 1.07 y 1.13 alturas. El interlineado normal del mismo documento
 * es de 2 alturas largas, así que el hueco entre un caso y otro es amplio.
 */
const FRACCION_SALTO_MIN = 0.7;
const FRACCION_SALTO_MAX = 1.6;

/** Sólo números enteros. Un "3" sobre un "4" es 3/4; "el" sobre "la" no es nada. */
function esNumeroSuelto(s: string): boolean {
  return /^\d+$/.test(s);
}

/**
 * Une numerador y denominador en un solo trozo "n/d" situado a la altura de la
 * raya, que es donde el procesador de textos puso la línea base del renglón.
 *
 * Las tres condiciones (salto vertical corto, mismo centro horizontal, misma
 * altura de fuente) todavía las cumpliría una tabla de dos filas numéricas muy
 * apretada. La cuarta las separa: se exige que a la altura de la raya haya OTRO
 * trozo de texto, porque una fracción apilada vive dentro de un renglón —"1 b)
 * 3/4"—, mientras que entre dos filas de una tabla no hay nada. Si esa prueba
 * no pasa, no se une: dos números sueltos son un dato incompleto, pero un "3/4"
 * inventado donde había una tabla es un dato falso.
 */
function unirFracciones(trozos: Trozo[]): Trozo[] {
  const candidatos = trozos.filter((t) => esNumeroSuelto(t.text) && t.alto > 0);
  if (candidatos.length < 2) return trozos;

  const centro = (t: Trozo): number => t.x + t.ancho / 2;
  const parejas: { num: Trozo; den: Trozo; error: number }[] = [];

  for (const num of candidatos) {
    for (const den of candidatos) {
      if (den === num) continue;
      const alto = Math.max(num.alto, den.alto);
      const salto = num.y - den.y;
      if (salto < alto * FRACCION_SALTO_MIN || salto > alto * FRACCION_SALTO_MAX) continue;
      if (Math.abs(num.alto - den.alto) > 0.5) continue;
      const desvio = Math.abs(centro(num) - centro(den));
      if (desvio > Math.max(1.5, 0.35 * Math.max(num.ancho, den.ancho))) continue;
      const yRaya = (num.y + den.y) / 2;
      const hayRenglon = trozos.some(
        (t) => t !== num && t !== den && t.text.trim() !== "" && Math.abs(t.y - yRaya) <= MISMA_LINEA,
      );
      if (!hayRenglon) continue;
      parejas.push({ num, den, error: desvio + Math.abs(salto / alto - 1.1) });
    }
  }

  // De mejor a peor, y cada trozo se usa una sola vez: si un número encaja como
  // denominador de dos numeradores distintos, gana el que mejor se alinea.
  parejas.sort((a, b) => a.error - b.error);
  const usados = new Set<Trozo>();
  const fracciones: Trozo[] = [];
  for (const { num, den } of parejas) {
    if (usados.has(num) || usados.has(den)) continue;
    usados.add(num);
    usados.add(den);
    const x = Math.min(num.x, den.x);
    fracciones.push({
      text: `${num.text}/${den.text}`,
      x,
      y: (num.y + den.y) / 2,
      ancho: Math.max(num.x + num.ancho, den.x + den.ancho) - x,
      alto: Math.max(num.alto, den.alto),
    });
  }
  if (fracciones.length === 0) return trozos;
  return [...trozos.filter((t) => !usados.has(t)), ...fracciones];
}

/**
 * Hueco horizontal, en puntos, que separa dos columnas en vez de dos palabras.
 *
 * En los exámenes de Math la columna de respuestas empieza 38 puntos después de
 * donde acaba el número de pregunta; el espacio entre palabras del mismo
 * documento mide 4.5. Veinte puntos caen en medio de ese abismo.
 */
const HUECO_COLUMNA = 20;

/** Tolerancia, en puntos, para dar por alineados los inicios de dos celdas. */
const COLUMNA_ALINEADA = 3;

/**
 * Filas consecutivas que hacen falta para creerse que hay una columna.
 *
 * Con dos bastaría para convertir en tabla cualquier título con su "8 marks"
 * alineado a la derecha. Se exige además que sean CONSECUTIVAS: una tabla son
 * renglones seguidos, mientras que los títulos de sección están repartidos por
 * la página con texto normal en medio.
 */
const FILAS_MINIMAS = 3;

interface Linea {
  trozos: Trozo[];
  /** Coordenadas X donde arranca una columna. Vacío si la línea no es una fila. */
  cortes: number[];
}

/** Agrupa los trozos de una página en renglones, por su Y. */
function agruparEnLineas(trozos: Trozo[]): Trozo[][] {
  const ordenados = [...trozos].sort((a, b) => (Math.abs(a.y - b.y) <= MISMA_LINEA ? a.x - b.x : b.y - a.y));
  const lineas: Trozo[][] = [];
  let actual: Trozo[] = [];
  let yActual: number | null = null;
  for (const t of ordenados) {
    if (yActual === null || Math.abs(t.y - yActual) <= MISMA_LINEA) {
      actual.push(t);
      yActual = yActual ?? t.y;
    } else {
      if (actual.length > 0) lineas.push(actual);
      actual = [t];
      yActual = t.y;
    }
  }
  if (actual.length > 0) lineas.push(actual);
  return lineas;
}

/** Pega los trozos de una celda respetando los huecos que son espacios. */
function textoDe(trozos: Trozo[]): string {
  let texto = "";
  let finAnterior: number | null = null;
  for (const t of trozos) {
    if (finAnterior !== null && t.x - finAnterior > HUECO && !texto.endsWith(" ")) texto += " ";
    texto += t.text;
    finAnterior = t.x + t.ancho;
  }
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Dónde empezaría una columna en esta línea: la X del primer trozo visible que
 * viene detrás de un hueco ancho. Los trozos en blanco no cuentan, porque un
 * PDF rellena las columnas con espacios de anchura arbitraria y taparían
 * justo el hueco que se busca.
 */
function inicios(trozos: Trozo[]): number[] {
  const visibles = trozos.filter((t) => t.text.trim() !== "");
  const res: number[] = [];
  for (let i = 1; i < visibles.length; i++) {
    const previo = visibles[i - 1]!;
    const actual = visibles[i]!;
    if (actual.x - (previo.x + previo.ancho) >= HUECO_COLUMNA) res.push(actual.x);
  }
  return res;
}

/**
 * Marca como cortes de columna los inicios que se repiten en al menos
 * `FILAS_MINIMAS` líneas seguidas.
 */
function detectarColumnas(lineas: Trozo[][]): Linea[] {
  const porLinea = lineas.map(inicios);
  const cortes: number[][] = lineas.map(() => []);

  const todos = [...new Set(porLinea.flat())];
  for (const x of todos) {
    const tiene = porLinea.map((xs) => xs.some((c) => Math.abs(c - x) <= COLUMNA_ALINEADA));
    let i = 0;
    while (i < tiene.length) {
      if (!tiene[i]) {
        i++;
        continue;
      }
      let fin = i;
      while (fin + 1 < tiene.length && tiene[fin + 1]) fin++;
      if (fin - i + 1 >= FILAS_MINIMAS) {
        for (let k = i; k <= fin; k++) if (!cortes[k]!.some((c) => Math.abs(c - x) <= COLUMNA_ALINEADA)) cortes[k]!.push(x);
      }
      i = fin + 1;
    }
  }

  return lineas.map((trozos, i) => ({ trozos, cortes: cortes[i]!.sort((a, b) => a - b) }));
}

interface LineaRenderizada {
  text: string;
  esFila: boolean;
}

/**
 * Reconstruye líneas a partir de trozos con coordenadas.
 *
 * Las celdas de una fila se unen con " | ", que es la convención que ya usa el
 * extractor de .docx: quien lea un span no tiene por qué saber de qué formato
 * salió.
 */
function lineasDe(trozos: Trozo[]): LineaRenderizada[] {
  const lineas = detectarColumnas(agruparEnLineas(unirFracciones(trozos)));
  const res: LineaRenderizada[] = [];
  for (const { trozos: ts, cortes } of lineas) {
    const celdas: Trozo[][] = Array.from({ length: cortes.length + 1 }, () => []);
    for (const t of ts) {
      let i = 0;
      while (i < cortes.length && t.x >= cortes[i]! - COLUMNA_ALINEADA) i++;
      celdas[i]!.push(t);
    }
    const textos = celdas.map(textoDe).filter((s) => s !== "");
    if (textos.length === 0) continue;
    res.push({ text: textos.join(" | "), esFila: cortes.length > 0 && textos.length > 1 });
  }
  return res;
}

export interface PdfResult {
  spans: SourceSpan[];
  pages: number;
  /** Caracteres de texto por pagina. Es la medida de si el PDF es texto o dibujo. */
  densidad: number;
}

/**
 * Por debajo de esto, el PDF es una imagen con cuatro palabras encima.
 *
 * El numero sale de medir los 17 PDF de Y6A, no de la intuicion: hay un hueco
 * limpio entre 31 y 140 caracteres por pagina. Debajo estan `ENGLISH INDEFINITE
 * PRONOUNS` —que en siete paginas aporta la palabra "notebooks" cinco veces— y
 * `La tilde en los hiatos`, que solo tiene su titulo. Ingerir eso y darlo por
 * hecho seria lo peor de los dos mundos: un documento que figura como extraido
 * y del que no se puede citar nada.
 */
export const DENSIDAD_MINIMA = 100;

/**
 * Entre esto y `DENSIDAD_MINIMA` el documento es MIXTO: tiene texto de verdad y
 * ademas figuras que solo se leen mirando. Se ingiere, y se avisa.
 */
export const DENSIDAD_MIXTA = 250;

export class PdfSinTextoError extends Error {
  constructor(paginas: number) {
    super(`el PDF tiene ${paginas} páginas y ninguna con texto: es un escaneo, va al carril de visión`);
    this.name = "PdfSinTextoError";
  }
}

/**
 * Extrae los spans de un PDF con capa de texto.
 *
 * Lanza `PdfSinTextoError` si no encuentra texto en ninguna página. Un PDF
 * escaneado con una capa OCR vacía es indistinguible de uno normal hasta que se
 * abre; devolver cero spans en silencio dejaría un documento "ingerido" del que
 * nadie podría citar nada.
 */
export async function pdfToSpans(buf: Buffer): Promise<PdfResult> {
  // Import perezoso: quien solo ingiere .docx no debería pagar la carga de
  // pdfjs, que no es pequeña.
  //
  // Antes del import, y no después: pdfjs evalúa `new DOMMatrix()` al cargar
  // el módulo, y en un Node sin `@napi-rs/canvas` (la función de Vercel, por
  // ejemplo) ese global no existe. Ver `dom-matrix.ts`.
  asegurarDomMatrix();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const tarea = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // Sin worker: esto corre en Node, en un solo proceso, y el worker solo
    // añadiría una vía de fallo.
    useWorkerFetch: false,
    useSystemFonts: false,
  });
  const doc = await tarea.promise;

  const spans: SourceSpan[] = [];
  let ord = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const trozos: Trozo[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str === "") continue;
      trozos.push({
        text: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        ancho: item.width,
        alto: item.height > 0 ? item.height : Math.abs(item.transform[3] as number),
      });
    }
    for (const linea of lineasDe(trozos)) {
      spans.push(makeSpan(ord++, linea.esFila ? "table_row" : "paragraph", linea.text, p));
    }
    page.cleanup();
  }

  const paginas = doc.numPages;
  // `destroy()` vive en la tarea de carga, no en el documento: sin esto pdfjs
  // deja abierto su transporte y el proceso no termina solo.
  await tarea.destroy();

  if (spans.length === 0) throw new PdfSinTextoError(paginas);
  const caracteres = spans.reduce((a, s) => a + s.text.length, 0);
  return { spans, pages: paginas, densidad: caracteres / paginas };
}
