/**
 * GUARDIÁN DE LA ORTOGRAFÍA DEL TEXTO EN ESPAÑOL QUE LEE EL ALUMNO.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * La versión inglesa del material estaba impecable y la española se escribió
 * SIN TILDES. Una captura de `/practice/math.compare` lo destapó: la solución
 * decía «Denominador comun 12», y con ella viajaban «fraccion», «numero»,
 * «division», «area», «despues», «cesped», «ensena», «¿Cuanto…?». No es
 * cosmético: es material didáctico para niños de 11 años que están aprendiendo
 * a escribir, y el alumno hispanohablante recibía peor producto que el anglófono.
 *
 * Nada lo cazaba. El typecheck no lee prosa, el lint tampoco, y los tests
 * comparaban las cadenas mal escritas consigo mismas, así que pasaban.
 *
 * ===========================================================================
 * LA REGLA
 * ===========================================================================
 * Ninguna cadena en español de cara al usuario puede contener una palabra de la
 * lista de erratas frecuentes escrita sin su tilde o sin su `ñ`, ni cerrar una
 * pregunta con `?` sin haberla abierto con `¿`.
 *
 * No es una regla sobre `compare.ts`: es sobre la familia entera —«el texto en
 * español se escribió sin acentos»—. El generador que alguien añada mañana, el
 * `rationale` nuevo de un corrector y la entrada nueva de `UI_STRINGS` quedan
 * cubiertos el día que se escriben, sin que nadie se acuerde de este fallo.
 *
 * ===========================================================================
 * CÓMO DECIDE QUÉ CADENA ES ESPAÑOLA
 * ===========================================================================
 * Tres caminos, porque el texto español vive de tres maneras distintas:
 *
 *   1. Diccionario: todo literal de `es.ts` y de `*.es.ts`.
 *   2. Clave `es:` de un `I18nText` o de `pickLocale({ en, es })`. Se sigue el
 *      valor de la clave con un contador de anidamiento, así que también entra
 *      `es: { 7: ["séptimo", "séptimos"] }` de `fraction-words.ts`.
 *   3. Identificador que termina en `Es` (`const wantEs = …`, `function
 *      familyEs()`), que es como los generadores guardan el trozo español que
 *      luego interpolan.
 *   4. Prosa suelta: una cadena monolingüe con suficientes palabras funcionales
 *      del español. Es la que caza los `rationale` de `packages/engine/grading`,
 *      que no llevan ninguna marca de idioma y sin embargo se le pintan al
 *      alumno en la pantalla de resultados.
 *
 * FALSOS POSITIVOS. La lista se parte en dos: el NÚCLEO son formas que no
 * existen en inglés (`comun`, `fraccion`, `despues`, `cesped`), y se aplica en
 * todos los caminos; `MARCADAS` añade palabras que SÍ son inglesas (`area`,
 * `version`, `item`, `formula`) y solo se aplica cuando el idioma está marcado
 * explícitamente. Los plurales de `-ción` (`lecciones`, `fracciones`,
 * `opciones`) van sin tilde y NO están en la lista. La locución «en cuanto»
 * tampoco lleva tilde y se retira antes de comparar. Los ficheros de prueba
 * quedan fuera: el nombre de un `it()` no lo lee ningún alumno.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Raíz del monorepo: `apps/web/src/lib` → cuatro niveles arriba. */
const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));

const BARRA = String.fromCharCode(92); // `\`, escrito así para no pelearse con los escapes

// ---------------------------------------------------------------------------
// 1 · Lista de erratas
// ---------------------------------------------------------------------------

/**
 * NÚCLEO: formas que solo pueden ser español mal escrito. Ninguna es una
 * palabra inglesa, así que se puede buscar incluso en cadenas sin marcar.
 */
const NUCLEO: Readonly<Record<string, string>> = {
  comun: "común",
  fraccion: "fracción",
  division: "división",
  divisor: "divisor", // (correcto: centinela de que la lista no es un `includes` tonto)
  numero: "número",
  numeros: "números",
  metrico: "métrico",
  metrica: "métrica",
  cuanto: "cuánto",
  cuanta: "cuánta",
  cuantos: "cuántos",
  cuantas: "cuántas",
  segun: "según",
  linea: "línea",
  lineas: "líneas",
  simetria: "simetría",
  simetrias: "simetrías",
  geometrico: "geométrico",
  geometrica: "geométrica",
  geometria: "geometría",
  matematicas: "matemáticas",
  aritmetica: "aritmética",
  estadistica: "estadística",
  asi: "así",
  despues: "después",
  ultimo: "último",
  ultima: "última",
  ultimos: "últimos",
  ultimas: "últimas",
  aqui: "aquí",
  todavia: "todavía",
  aun: "aún",
  ademas: "además",
  tambien: "también",
  quiza: "quizá",
  jamas: "jamás",
  atras: "atrás",
  escalon: "escalón",
  rectangulo: "rectángulo",
  rectangulos: "rectángulos",
  triangulo: "triángulo",
  triangulos: "triángulos",
  poligono: "polígono",
  poligonos: "polígonos",
  circulo: "círculo",
  piramide: "pirámide",
  perimetro: "perímetro",
  perimetros: "perímetros",
  diametro: "diámetro",
  angulo: "ángulo",
  angulos: "ángulos",
  centimetro: "centímetro",
  centimetros: "centímetros",
  kilometro: "kilómetro",
  kilometros: "kilómetros",
  milimetro: "milímetro",
  milimetros: "milímetros",
  decimetro: "decímetro",
  decimetros: "decímetros",
  cesped: "césped",
  cafeteria: "cafetería",
  interrogacion: "interrogación",
  comprobacion: "comprobación",
  correccion: "corrección",
  seleccion: "selección",
  ordenacion: "ordenación",
  asignacion: "asignación",
  puntuacion: "puntuación",
  calificacion: "calificación",
  simplificacion: "simplificación",
  aproximacion: "aproximación",
  conexion: "conexión",
  opcion: "opción",
  posicion: "posición",
  leccion: "lección",
  seccion: "sección",
  evaluacion: "evaluación",
  descripcion: "descripción",
  instruccion: "instrucción",
  atencion: "atención",
  sesion: "sesión",
  direccion: "dirección",
  duracion: "duración",
  codigo: "código",
  codigos: "códigos",
  parametro: "parámetro",
  parametros: "parámetros",
  simbolo: "símbolo",
  simbolos: "símbolos",
  titulo: "título",
  titulos: "títulos",
  rubrica: "rúbrica",
  facil: "fácil",
  dificil: "difícil",
  rapido: "rápido",
  proximo: "próximo",
  proxima: "próxima",
  unico: "único",
  unica: "única",
  unicos: "únicos",
  unicas: "únicas",
  minimo: "mínimo",
  maximo: "máximo",
  numerico: "numérico",
  numerica: "numérica",
  grafico: "gráfico",
  graficos: "gráficos",
  practico: "práctico",
  teorico: "teórico",
  logico: "lógico",
  automatico: "automático",
  categoria: "categoría",
  categorias: "categorías",
  aparecera: "aparecerá",
  podras: "podrás",
  podra: "podrá",
  podran: "podrán",
  estara: "estará",
  estaran: "estarán",
  sera: "será",
  seran: "serán",
  acabo: "acabó",
  leyo: "leyó",
  llego: "llegó",
  corrio: "corrió",
  empezo: "empezó",
  volvio: "volvió",
  respondio: "respondió",
  pregunto: "preguntó",
  contesto: "contestó",
  evalua: "evalúa",
  evaluan: "evalúan",
  puntua: "puntúa",
  puntuan: "puntúan",
  dieciseis: "dieciséis",
  septimo: "séptimo",
  septimos: "séptimos",
  decimo: "décimo",
  decimos: "décimos",
  centesimo: "centésimo",
  centesimos: "centésimos",
  milesimo: "milésimo",
  milesimos: "milésimos",
  // `ñ` — el clásico «ano» por «año» y toda su familia.
  ano: "año",
  anos: "años",
  nino: "niño",
  ninos: "niños",
  nina: "niña",
  ninas: "niñas",
  ensena: "enseña",
  ensenar: "enseñar",
  ensenanza: "enseñanza",
  manana: "mañana",
  pequeno: "pequeño",
  pequena: "pequeña",
  senor: "señor",
  senora: "señora",
  senal: "señal",
  diseno: "diseño",
  tamano: "tamaño",
  cumpleanos: "cumpleaños",
  companero: "compañero",
  companeros: "compañeros",
  sueno: "sueño",
  bano: "baño",
  ingles: "inglés",
  espanol: "español",
};

/**
 * MARCADAS: erratas que en inglés son palabras legítimas. Solo se buscan cuando
 * la cadena está marcada como española de forma explícita (diccionario, clave
 * `es:` o identificador `…Es`), nunca por el detector de prosa.
 */
const MARCADAS: Readonly<Record<string, string>> = {
  area: "área",
  areas: "áreas",
  formula: "fórmula",
  formulas: "fórmulas",
  version: "versión",
  item: "ítem",
  items: "ítems",
  informacion: "información",
  revision: "revisión",
  valido: "válido",
  invalido: "inválido",
  publicacion: "publicación",
  analisis: "análisis",
  dia: "día",
  dias: "días",
};

/**
 * «más» adverbio. La conjunción `mas` (= pero) existe, pero es literaria y aquí
 * no aparece nunca; para no inventarse falsos positivos solo se marca cuando va
 * seguida de lo que sigue a un comparativo.
 */
const MAS_ADVERBIO =
  /(^|[^\p{L}])mas\s+(que|de|grande|grandes|pequen|pequeñ|alto|alta|bajo|baja|larg|cort|f[aá]cil|dif[ií]cil|r[aá]pid|lent|cerca|lejos|tarde|temprano|o menos|adelante|all[aá]|a[uú]n|bien|vale|d[ií]gitos|puntos|preguntas)/iu;

// ---------------------------------------------------------------------------
// 2 · Lector de literales
// ---------------------------------------------------------------------------

interface Literal {
  readonly raw: string;
  readonly inicio: number;
}

/**
 * Separa el fuente en literales de cadena y «código» (el resto, con comentarios,
 * cadenas y expresiones regulares sustituidos por espacios para que las
 * posiciones sigan cuadrando). Se escribe a mano y no con un parser porque
 * `@cet/web` no tiene ninguno instalado y este test no puede añadir dependencias.
 */
function leerLiterales(src: string): { literales: Literal[]; codigo: string } {
  const literales: Literal[] = [];
  let codigo = "";
  let i = 0;
  const n = src.length;
  const huecos = (s: string): string => s.replace(/[^\n]/g, " ");
  /** Último carácter significativo emitido al código: decide `/` regex vs división. */
  const previo = (): string => {
    for (let k = codigo.length - 1; k >= 0; k -= 1) {
      const c = codigo[k];
      if (c !== undefined && c.trim() !== "") return c;
    }
    return "";
  };

  while (i < n) {
    const c = src[i];

    if (c === "/" && src[i + 1] === "/") {
      const fin = src.indexOf("\n", i);
      const j = fin === -1 ? n : fin;
      codigo += huecos(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const fin = src.indexOf("*/", i + 2);
      const j = fin === -1 ? n : fin + 2;
      codigo += huecos(src.slice(i, j));
      i = j;
      continue;
    }
    // Expresión regular: solo puede empezar donde no cabría un operando.
    if (c === "/" && "([{,;:=!&|?+-*%~^<>".includes(previo())) {
      let j = i + 1;
      let clase = false;
      let cerrada = false;
      while (j < n) {
        const d = src[j];
        if (d === BARRA) {
          j += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "[") clase = true;
        else if (d === "]") clase = false;
        else if (d === "/" && !clase) {
          cerrada = true;
          break;
        }
        j += 1;
      }
      if (cerrada) {
        codigo += huecos(src.slice(i, j + 1));
        i = j + 1;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === BARRA) {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        j += 1;
      }
      literales.push({ raw: src.slice(i + 1, j), inicio: i });
      codigo += huecos(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      let nivel = 0;
      let raw = "";
      while (j < n) {
        if (src[j] === BARRA) {
          raw += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (nivel === 0 && src[j] === "`") break;
        if (nivel === 0 && src[j] === "$" && src[j + 1] === "{") {
          nivel = 1;
          raw += "${";
          j += 2;
          continue;
        }
        if (nivel > 0) {
          if (src[j] === "{") nivel += 1;
          else if (src[j] === "}") {
            nivel -= 1;
            if (nivel === 0) {
              raw += "}";
              j += 1;
              continue;
            }
          }
          raw += src[j];
          j += 1;
          continue;
        }
        raw += src[j];
        j += 1;
      }
      literales.push({ raw, inicio: i });
      codigo += huecos(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    codigo += c;
    i += 1;
  }
  return { literales, codigo };
}

/** Última posición donde `clave:` aparece como clave de objeto, o -1. */
function ultimaClave(antes: string, clave: string): number {
  const re = new RegExp(`(^|[^A-Za-z0-9_$.])${clave}[ \t\n\r]*:`, "g");
  let ultima = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(antes)) !== null) ultima = m.index + m[0].length;
  return ultima;
}

/**
 * ¿Seguimos DENTRO del valor que arranca en `desde`? Se cuenta anidamiento: en
 * cuanto se cierra un paréntesis que no abrimos, o llega una coma o un punto y
 * coma al nivel cero, el valor terminó y el literal ya no es suyo.
 */
function dentroDelValor(entre: string): boolean {
  let nivel = 0;
  for (const ch of entre) {
    if (ch === "{" || ch === "[" || ch === "(") nivel += 1;
    else if (ch === "}" || ch === "]" || ch === ")") {
      nivel -= 1;
      if (nivel < 0) return false;
    } else if ((ch === "," || ch === ";") && nivel === 0) return false;
  }
  return true;
}

/**
 * Un literal que se COMPARA (`target === "area"`, `case "area"`) es un
 * discriminante del código, no prosa: `"area"` ahí es un identificador interno
 * y acentuarlo rompería la rama. Se descarta antes de mirar el idioma.
 */
function esDiscriminante(antes: string): boolean {
  const cola = antes.replace(/[\s]+$/, "");
  return /(===|!==|==|!=|case|includes\(|startsWith\(|endsWith\(|indexOf\(|\[)$/.test(cola);
}

/**
 * ¿El literal es el argumento de un error? `throw new EngineError(…)` y el
 * `super(…)` de una subclase de Error hablan con quien programa, no con el
 * alumno: nunca llegan a una pantalla. Se excluyen del detector de prosa para
 * no convertir este invariante en una reescritura de los mensajes internos.
 *
 * Se recorre hacia atrás cerrando paréntesis; cada vez que se sale de uno se
 * mira el identificador que lo abría.
 */
function dentroDeError(antes: string): boolean {
  let nivel = 0;
  for (let i = antes.length - 1; i >= 0; i -= 1) {
    const c = antes[i];
    if (c === ")" || c === "]" || c === "}") nivel += 1;
    else if (c === "(" || c === "[" || c === "{") {
      if (nivel > 0) {
        nivel -= 1;
        continue;
      }
      if (c !== "(") return false; // salimos a un objeto o array: ya no es una llamada
      const cabeza = antes.slice(Math.max(0, i - 80), i);
      if (/(^|[^\p{L}\d_$])(throw|super)\s*$/u.test(cabeza)) return true;
      if (/new\s+[A-Za-z0-9_$]*Error\s*$/.test(cabeza)) return true;
      if (/(^|[^\p{L}\d_$])(throw)\s+new\s+[A-Za-z0-9_$]+\s*$/u.test(cabeza)) return true;
    } else if (c === ";") {
      return false;
    }
  }
  return false;
}

type Marca = "marcada" | "prosa";

/** Palabras funcionales que delatan prosa española y no son inglesas. */
const FUNCIONALES =
  /(^|[^\p{L}])(el|la|los|las|un|una|del|de|que|se|con|para|por|su|lo|al|y|ni|es|en|son|era|fue|este|esta|estos|estas|como|pero|cuando|donde|hay|ya|tu|te|nos|les|muy|sin|sobre|entre|cada|todo|toda|todos|todas|desde|hasta|porque|tiene|tienes|puedes|hace|hacer|ser|estar|más|aún|así|qué|cómo)([^\p{L}]|$)/giu;

function esProsaEspanola(texto: string): boolean {
  if (texto.trim().split(/\s+/).length < 4) return false;
  const vistas = new Set<string>();
  FUNCIONALES.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNCIONALES.exec(texto)) !== null) {
    if (m[2] !== undefined) vistas.add(m[2].toLowerCase());
    FUNCIONALES.lastIndex -= 1; // los separadores se solapan entre coincidencias
  }
  return vistas.size >= 3;
}

/** Los literales españoles de un fichero, con cómo se supo que lo eran. */
function literalesEspanoles(fichero: string, src: string): (Literal & { marca: Marca })[] {
  const nombre = basename(fichero);
  const esDiccionario = nombre === "es.ts" || nombre.endsWith(".es.ts");
  const { literales, codigo } = leerLiterales(src);
  const salida: (Literal & { marca: Marca })[] = [];

  for (const lit of literales) {
    const antes = codigo.slice(0, lit.inicio);
    if (esDiccionario) {
      if (!esDiscriminante(antes)) salida.push({ ...lit, marca: "marcada" });
      continue;
    }
    if (esDiscriminante(antes)) continue;

    // (a) clave `es:` sin que un `en:` posterior se la haya quitado
    const posEs = ultimaClave(antes, "es");
    const posEn = ultimaClave(antes, "en");
    if (posEs !== -1 && posEs > posEn && dentroDelValor(antes.slice(posEs))) {
      salida.push({ ...lit, marca: "marcada" });
      continue;
    }

    // (b) identificador que termina en `Es`: `const wantEs = …`, `function familyEs()`
    const decl = /[A-Za-z0-9_$]*[a-z]Es\b[^\n]*$/.exec(antes.slice(Math.max(0, antes.length - 400)));
    if (decl !== null && /[A-Za-z0-9_$]*[a-z]Es\b\s*[=(]/.test(decl[0])) {
      const corte = antes.lastIndexOf("Es");
      if (corte !== -1 && dentroDelValor(antes.slice(corte + 2)) && !antes.slice(corte).includes("\n\n")) {
        salida.push({ ...lit, marca: "marcada" });
        continue;
      }
    }

    // (c) prosa suelta, sin ninguna marca de idioma — salvo la de los errores,
    //     que es para quien programa y no se le pinta nunca a un alumno.
    if (!dentroDeError(antes) && esProsaEspanola(limpiar(lit.raw))) {
      salida.push({ ...lit, marca: "prosa" });
    }
  }
  return salida;
}

/**
 * Deja solo la prosa: fuera interpolaciones `${…}`, marcadores `{name}` de los
 * diccionarios, entidades HTML y la locución «en cuanto», que va sin tilde.
 */
function limpiar(raw: string): string {
  return raw
    .replace(/\$\{[^]*?\}/g, " ")
    .replace(/\{[A-Za-z0-9_]+\}/g, " ")
    .replace(/&[a-zA-Z]+;|&#\d+;/g, " ")
    .replace(/\ben\s+cuanto\b/giu, " ");
}

interface Fallo {
  readonly ruta: string;
  readonly linea: number;
  readonly palabra: string;
  readonly correcta: string;
  readonly cadena: string;
}

function revisar(texto: string, marca: Marca): { palabra: string; correcta: string }[] {
  const listas = marca === "marcada" ? [NUCLEO, MARCADAS] : [NUCLEO];
  const fallos: { palabra: string; correcta: string }[] = [];
  for (const lista of listas) {
    for (const [mala, buena] of Object.entries(lista)) {
      if (mala === buena) continue; // centinela: `divisor` está bien escrito
      const re = new RegExp(`(^|[^\\p{L}])${mala}(?![\\p{L}])`, "iu");
      if (re.test(texto)) fallos.push({ palabra: mala, correcta: buena });
    }
  }
  if (MAS_ADVERBIO.test(texto)) fallos.push({ palabra: "mas", correcta: "más" });
  // Pregunta cerrada sin abrir: el `?` termina frase y en la cadena no hay `¿`.
  // Solo sobre texto marcado: una pregunta inglesa no lleva `¿` y no es un fallo.
  if (marca === "marcada" && !texto.includes("¿") && /\p{L}\s*\?(\s*$|\s+\p{Lu})/u.test(texto)) {
    fallos.push({ palabra: "?", correcta: "¿…?" });
  }
  return fallos;
}

// ---------------------------------------------------------------------------
// 3 · Recorrido del monorepo
// ---------------------------------------------------------------------------

function ficherosDeFuente(raiz: string): string[] {
  const out: string[] = [];
  const visitar = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
        // Los nombres de los `it()` no los lee ningún alumno.
        if (e.name === "__tests__" || e.name === "e2e") continue;
        visitar(p);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(p);
      }
    }
  };
  for (const grupo of ["packages", "apps"]) {
    const base = join(raiz, grupo);
    if (!existsSync(base)) continue;
    for (const nombre of readdirSync(base)) {
      const dir = join(base, nombre);
      if (!statSync(dir).isDirectory()) continue;
      visitar(join(dir, "src"));
    }
  }
  return out;
}

const FICHEROS = ficherosDeFuente(RAIZ);

const HALLAZGOS: { fallos: Fallo[]; total: number } = (() => {
  const fallos: Fallo[] = [];
  let total = 0;
  for (const f of FICHEROS) {
    const src = readFileSync(f, "utf8");
    for (const lit of literalesEspanoles(f, src)) {
      total += 1;
      const texto = limpiar(lit.raw);
      for (const { palabra, correcta } of revisar(texto, lit.marca)) {
        fallos.push({
          ruta: relative(RAIZ, f).replace(/\\/g, "/"),
          linea: src.slice(0, lit.inicio).split("\n").length,
          palabra,
          correcta,
          cadena: lit.raw,
        });
      }
    }
  }
  return { fallos, total };
})();

// ---------------------------------------------------------------------------
// 4 · Los tests
// ---------------------------------------------------------------------------

describe("invariante — el español que ve el alumno va acentuado", () => {
  it("el escáner encuentra texto español (si no, no está probando nada)", () => {
    expect(FICHEROS.length).toBeGreaterThan(100);
    expect(HALLAZGOS.total).toBeGreaterThan(500);
  });

  it("reconoce las tres formas en que vive el español en este repo", () => {
    const marcado = (ruta: string, aguja: string): boolean => {
      const f = join(RAIZ, ruta);
      const src = readFileSync(f, "utf8");
      return literalesEspanoles(f, src).some((l) => l.raw.includes(aguja));
    };
    // clave `es:` dentro de un objeto anidado
    expect(marcado("packages/ui/src/lib/fraction-words.ts", "séptimo")).toBe(true);
    // identificador `…Es` que se interpola después
    expect(marcado("packages/engine/src/generators/math/shape.ts", "el área")).toBe(true);
    // prosa suelta sin marca de idioma: los `rationale` de los correctores
    expect(marcado("packages/engine/src/grading/helpers.ts", "La respuesta llegó")).toBe(true);
    // diccionario entero
    expect(marcado("apps/web/src/lib/i18n/dictionaries/es.ts", "Mi cuenta")).toBe(true);
  });

  it("el detector distingue una errata de una palabra bien escrita", () => {
    expect(revisar("Denominador comun 12", "marcada").map((f) => f.palabra)).toEqual(["comun"]);
    expect(revisar("Denominador común 12", "marcada")).toEqual([]);
    // plurales de -ción: van SIN tilde y no se pueden marcar
    expect(revisar("Las lecciones y las fracciones tienen opciones", "marcada")).toEqual([]);
    // «en cuanto» es locución, no interrogativo
    expect(revisar(limpiar("Aparecerá aquí en cuanto lo haga."), "marcada")).toEqual([]);
    expect(revisar("¿Cuanto corrio en total?", "marcada").map((f) => f.palabra).sort()).toEqual([
      "corrio",
      "cuanto",
    ]);
    // inglés: ni una sola marca, ni con las palabras que se solapan
    expect(revisar("Find the area of this shape. The two sides marked ? are for you.", "prosa")).toEqual(
      [],
    );
    expect(revisar("Version 3 of this item has a formula for the area", "prosa")).toEqual([]);
    // ñ
    expect(revisar("ensena este codigo", "marcada").map((f) => f.palabra).sort()).toEqual([
      "codigo",
      "ensena",
    ]);
    expect(revisar("enseña este código", "marcada")).toEqual([]);
    // pregunta sin abrir
    expect(revisar("Cuánto mide cada trozo?", "marcada").map((f) => f.palabra)).toEqual(["?"]);
    expect(revisar("¿Cuánto mide cada trozo?", "marcada")).toEqual([]);
    // interrogación como etiqueta dentro de la frase, no como cierre
    expect(revisar("Los dos lados marcados con ? los tienes que deducir.", "marcada")).toEqual([]);
    // «más» adverbio
    expect(revisar("Puedes elegir mas de una", "marcada").map((f) => f.palabra)).toEqual(["mas"]);
  });

  it("no confunde el mensaje de un Error con texto para el alumno", () => {
    expect(dentroDeError('throw new EngineError("division_by_zero", ')).toBe(true);
    expect(dentroDeError('    super(\n      "insufficient_pool",\n      ')).toBe(true);
    expect(dentroDeError('  rationale: ')).toBe(false);
    expect(dentroDeError('return zeroResult(maxPoints, ')).toBe(false);
  });

  it("ninguna cadena española de cara al usuario ha perdido su tilde o su ñ", () => {
    const lista = HALLAZGOS.fallos.map(
      (f) => `${f.ruta}:${f.linea} — «${f.palabra}» debería ser «${f.correcta}»\n      ${f.cadena}`,
    );
    expect(
      lista,
      "Estas cadenas las lee un niño que está aprendiendo a escribir. Corrige la\n" +
        "ortografía SIN tocar el significado, la terminología ni las interpolaciones,\n" +
        "y no toques nunca un `accepted` ni un `canonical` de una clave de respuesta:\n  " +
        lista.join("\n  "),
    ).toEqual([]);
  });
});
