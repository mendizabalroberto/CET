/**
 * Parser de literales JavaScript RESTRINGIDO.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ NO `eval` NI `node:vm`
 *   Los trainers Y6A definen sus datos como literales JS dentro de un <script>:
 *
 *     var TOPICS=[{id:'acid', t:'Acid Rain', html:'<div>...'+'...'}];
 *
 *   La tentación es `vm.runInNewContext`. No se hace: eso ejecuta código
 *   arbitrario del fichero fuente en el proceso del build, y `vm` NO es un
 *   sandbox de seguridad (la propia documentación de Node lo dice). Un HTML de
 *   Y6A manipulado ejecutaría código con los permisos del pipeline.
 *
 *   En su lugar, este parser acepta EXACTAMENTE la gramática que los trainers
 *   usan y nada más:
 *     valor    := string | number | boolean | null | array | object | unario
 *     unario   := ('-' | '+') valor
 *     concat   := valor ('+' valor)*        (solo suma de strings/números)
 *     array    := '[' (concat (',' concat)*)? ','? ']'
 *     object   := '{' (clave ':' concat (',' ...)*)? ','? '}'
 *     clave    := identificador | string | número
 *
 *   Cualquier otra cosa — una llamada a función, un identificador suelto, un
 *   operador ternario, una plantilla con `${}` — lanza `JsLiteralError` con la
 *   posición exacta. FALLA RUIDOSAMENTE: nunca devuelve un valor parcial, que
 *   es la forma silenciosa de perder contenido.
 */

export class JsLiteralError extends Error {
  readonly index: number;
  readonly context: string;
  constructor(message: string, index: number, context: string) {
    super(`${message} (offset ${index}) cerca de: ${JSON.stringify(context)}`);
    this.name = "JsLiteralError";
    this.index = index;
    this.context = context;
  }
}

export type JsValue = string | number | boolean | null | JsValue[] | { [k: string]: JsValue };

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * Manejadores de llamadas PERMITIDAS.
 *
 * Algunos trainers construyen su HTML llamando a un ayudante:
 * Science escribe `'<td>'+sym('cell',120)+'</td>'`, donde `sym()` dibuja un
 * símbolo de circuito en SVG. Eso es código, y este parser no ejecuta código.
 *
 * En vez de rendirse (perder la lección entera) o de ejecutar (abrir la puerta
 * a cualquier cosa), el llamante declara explícitamente qué nombres acepta y
 * qué texto debe sustituirlos. Los argumentos ya son literales parseados, así
 * que el manejador recibe datos, nunca una expresión.
 */
export type CallHandlers = Readonly<Record<string, (args: readonly JsValue[]) => JsValue>>;

export interface ParseOptions {
  readonly calls?: CallHandlers;
}

class Parser {
  private i = 0;
  private readonly src: string;
  private readonly calls: CallHandlers;

  constructor(src: string, options: ParseOptions = {}) {
    this.src = src;
    this.calls = options.calls ?? {};
  }

  parseTopLevel(): JsValue {
    this.skipTrivia();
    const value = this.parseConcat();
    this.skipTrivia();
    // Un `;` final es habitual: `var X=[...];`
    if (this.src[this.i] === ";") this.i++;
    this.skipTrivia();
    if (this.i < this.src.length) {
      this.fail("contenido sobrante tras el literal");
    }
    return value;
  }

  private fail(msg: string): never {
    const from = Math.max(0, this.i - 30);
    throw new JsLiteralError(msg, this.i, this.src.slice(from, this.i + 30));
  }

  private skipTrivia(): void {
    for (;;) {
      const c = this.src[this.i];
      if (c === undefined) return;
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === " " || c === "﻿") {
        this.i++;
        continue;
      }
      if (c === "/" && this.src[this.i + 1] === "/") {
        while (this.i < this.src.length && this.src[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "/" && this.src[this.i + 1] === "*") {
        const end = this.src.indexOf("*/", this.i + 2);
        if (end === -1) this.fail("comentario de bloque sin cerrar");
        this.i = end + 2;
        continue;
      }
      return;
    }
  }

  /** `a + b + c`. Solo concatenación/suma; ningún otro operador binario. */
  private parseConcat(): JsValue {
    let left = this.parseUnary();
    for (;;) {
      this.skipTrivia();
      if (this.src[this.i] !== "+") return left;
      // `++` no existe en un literal; si aparece es código, no dato.
      if (this.src[this.i + 1] === "+") this.fail("operador `++` no permitido");
      this.i++;
      this.skipTrivia();
      const right = this.parseUnary();
      if (typeof left === "string" || typeof right === "string") {
        if (
          (typeof left !== "string" && typeof left !== "number") ||
          (typeof right !== "string" && typeof right !== "number")
        ) {
          this.fail("solo se permite concatenar strings y números");
        }
        left = String(left) + String(right);
      } else if (typeof left === "number" && typeof right === "number") {
        left = left + right;
      } else {
        this.fail("solo se permite concatenar strings y números");
      }
    }
  }

  private parseUnary(): JsValue {
    this.skipTrivia();
    const c = this.src[this.i];
    if (c === "-" || c === "+") {
      this.i++;
      const v = this.parseUnary();
      if (typeof v !== "number") this.fail("unario aplicado a algo que no es un número");
      return c === "-" ? -v : v;
    }
    return this.parseValue();
  }

  private parseValue(): JsValue {
    this.skipTrivia();
    const c = this.src[this.i];
    if (c === undefined) this.fail("fin de entrada inesperado");
    if (c === "[") return this.parseArray();
    if (c === "{") return this.parseObject();
    if (c === '"' || c === "'" || c === "`") return this.parseString(c);
    if (c === "(") {
      this.i++;
      const v = this.parseConcat();
      this.skipTrivia();
      if (this.src[this.i] !== ")") this.fail("falta `)`");
      this.i++;
      return v;
    }
    if (/[0-9.]/.test(c)) return this.parseNumber();
    if (IDENT_START.test(c)) {
      const word = this.readIdent();
      if (word === "true") return true;
      if (word === "false") return false;
      if (word === "null") return null;

      // Llamada declarada por el llamante: `sym('cell', 120)`.
      this.skipTrivia();
      if (this.src[this.i] === "(") {
        const handler = this.calls[word];
        if (handler === undefined) {
          this.fail(`llamada a \`${word}(...)\` no declarada en las opciones del parser`);
        }
        const args = this.parseArgs();
        return handler(args);
      }

      // `undefined`, nombres de variables, cualquier otra cosa: es código, no
      // dato. Rechazar en vez de adivinar.
      this.fail(`identificador no permitido en un literal: \`${word}\``);
    }
    this.fail(`token inesperado \`${c}\``);
  }

  /** `( literal , literal )`. Los argumentos siguen siendo literales puros. */
  private parseArgs(): JsValue[] {
    this.i++; // (
    const args: JsValue[] = [];
    for (;;) {
      this.skipTrivia();
      if (this.src[this.i] === ")") {
        this.i++;
        return args;
      }
      args.push(this.parseConcat());
      this.skipTrivia();
      const c = this.src[this.i];
      if (c === ",") {
        this.i++;
        continue;
      }
      if (c === ")") {
        this.i++;
        return args;
      }
      this.fail("falta `,` o `)` en los argumentos");
    }
  }

  private readIdent(): string {
    const start = this.i;
    while (this.i < this.src.length && IDENT_PART.test(this.src[this.i]!)) this.i++;
    return this.src.slice(start, this.i);
  }

  private parseNumber(): number {
    const start = this.i;
    if (this.src[this.i] === "0" && /[xX]/.test(this.src[this.i + 1] ?? "")) {
      this.i += 2;
      while (this.i < this.src.length && /[0-9a-fA-F]/.test(this.src[this.i]!)) this.i++;
    } else {
      while (this.i < this.src.length && /[0-9._]/.test(this.src[this.i]!)) this.i++;
      if (/[eE]/.test(this.src[this.i] ?? "")) {
        this.i++;
        if (/[+-]/.test(this.src[this.i] ?? "")) this.i++;
        while (this.i < this.src.length && /[0-9]/.test(this.src[this.i]!)) this.i++;
      }
    }
    const raw = this.src.slice(start, this.i);
    const n = Number(raw.replace(/_/g, ""));
    if (!Number.isFinite(n)) this.fail(`número inválido \`${raw}\``);
    return n;
  }

  private parseString(quote: string): string {
    this.i++; // abre
    let out = "";
    for (;;) {
      const c = this.src[this.i];
      if (c === undefined) this.fail("string sin cerrar");
      if (c === quote) {
        this.i++;
        return out;
      }
      if (c === "\\") {
        out += this.readEscape();
        continue;
      }
      if (quote === "`" && c === "$" && this.src[this.i + 1] === "{") {
        // Las plantillas de Math (`...`) son literales puras; una interpolación
        // sería código y aquí no se ejecuta código.
        this.fail("interpolación `${...}` no permitida");
      }
      if (quote !== "`" && (c === "\n" || c === "\r")) {
        this.fail("salto de línea dentro de un string con comillas simples/dobles");
      }
      out += c;
      this.i++;
    }
  }

  private readEscape(): string {
    this.i++; // consume la barra
    const c = this.src[this.i];
    if (c === undefined) this.fail("escape sin completar");
    this.i++;
    switch (c) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      case "\n":
        return ""; // continuación de línea
      case "\r":
        if (this.src[this.i] === "\n") this.i++;
        return "";
      case "x": {
        const hex = this.src.slice(this.i, this.i + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail("escape \\x inválido");
        this.i += 2;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      case "u": {
        if (this.src[this.i] === "{") {
          const end = this.src.indexOf("}", this.i);
          if (end === -1) this.fail("escape \\u{...} sin cerrar");
          const hex = this.src.slice(this.i + 1, end);
          if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) this.fail("escape \\u{...} inválido");
          this.i = end + 1;
          return String.fromCodePoint(Number.parseInt(hex, 16));
        }
        const hex = this.src.slice(this.i, this.i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("escape \\u inválido");
        this.i += 4;
        // Se devuelve la unidad de código tal cual: si es la mitad alta de un
        // par suplente, la siguiente iteración añade la baja y el emoji queda
        // correctamente formado.
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      default:
        return c; // \' \" \` \\ \/ y cualquier otro: el carácter literal
    }
  }

  private parseArray(): JsValue[] {
    this.i++; // [
    const out: JsValue[] = [];
    for (;;) {
      this.skipTrivia();
      if (this.src[this.i] === "]") {
        this.i++;
        return out;
      }
      if (this.src[this.i] === ",") {
        // Un hueco (`[1,,2]`) es un array disperso: dato ambiguo, se rechaza.
        this.fail("elemento vacío en el array");
      }
      out.push(this.parseConcat());
      this.skipTrivia();
      const c = this.src[this.i];
      if (c === ",") {
        this.i++;
        continue;
      }
      if (c === "]") {
        this.i++;
        return out;
      }
      this.fail("falta `,` o `]` en el array");
    }
  }

  private parseObject(): Record<string, JsValue> {
    this.i++; // {
    const out: Record<string, JsValue> = {};
    for (;;) {
      this.skipTrivia();
      if (this.src[this.i] === "}") {
        this.i++;
        return out;
      }
      const key = this.parseKey();
      this.skipTrivia();
      if (this.src[this.i] !== ":") this.fail("falta `:` tras la clave del objeto");
      this.i++;
      const value = this.parseConcat();
      if (Object.hasOwn(out, key)) this.fail(`clave duplicada \`${key}\``);
      // Bloquea la contaminación de prototipo: un HTML con {"__proto__": {...}}
      // no debe poder tocar Object.prototype al construir el objeto resultado.
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        this.fail(`clave prohibida \`${key}\``);
      }
      Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
      this.skipTrivia();
      const c = this.src[this.i];
      if (c === ",") {
        this.i++;
        continue;
      }
      if (c === "}") {
        this.i++;
        return out;
      }
      this.fail("falta `,` o `}` en el objeto");
    }
  }

  private parseKey(): string {
    this.skipTrivia();
    const c = this.src[this.i];
    if (c === undefined) this.fail("fin de entrada al leer una clave");
    if (c === '"' || c === "'" || c === "`") return this.parseString(c);
    if (/[0-9]/.test(c)) return String(this.parseNumber());
    if (IDENT_START.test(c)) return this.readIdent();
    if (c === "[") this.fail("clave computada `[...]` no permitida");
    this.fail(`clave inesperada \`${c}\``);
  }
}

/** Parsea un literal JS restringido. Lanza `JsLiteralError` ante cualquier código. */
export function parseJsLiteral(source: string, options: ParseOptions = {}): JsValue {
  return new Parser(source, options).parseTopLevel();
}
