/**
 * `DOMMatrix` mínimo para que pdfjs cargue en Node sin `@napi-rs/canvas`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `pdfjs-dist/legacy/build/pdf.mjs` evalúa `new DOMMatrix()` A NIVEL DE
 * MÓDULO (`const SCALE_MATRIX = new DOMMatrix()`, en el pintor de canvas), así
 * que si el global no existe, el `import()` entero revienta con «DOMMatrix is
 * not defined» antes de poder leer una sola página. En Node, pdfjs intenta
 * tomarlo de `@napi-rs/canvas`, dependencia OPCIONAL con binario nativo por
 * plataforma que la función de Vercel no lleva: es exactamente lo que se vio
 * en los logs de producción el 2026-09-02 («Cannot load "@napi-rs/canvas"…
 * Cannot polyfill `DOMMatrix`… DOMMatrix is not defined») y lo que dejaba la
 * subida del boletín en nada.
 *
 * Extraer texto (`getTextContent`) no dibuja: DOMMatrix solo se usa en el
 * pintor y en los patrones, que aquí nunca se ejecutan. Por eso basta una
 * clase con la forma de la matriz 2D y las operaciones que un uso accidental
 * podría pedirle, no una implementación completa del estándar. Si algún día
 * hiciera falta renderizar, la respuesta es `@napi-rs/canvas` como dependencia
 * real, no ampliar esto.
 *
 * Se instala SOLO si el global no existe: en un navegador, en `@napi-rs/canvas`
 * ya cargado, o en un Node que lo traiga de serie, no se toca nada.
 */

type Seis = readonly [number, number, number, number, number, number];

const IDENTIDAD: Seis = [1, 0, 0, 1, 0, 0];

function leerInicial(inicial: unknown): Seis {
  const init = ArrayBuffer.isView(inicial) ? Array.from(inicial as unknown as ArrayLike<number>) : inicial;
  if (Array.isArray(init) && init.length === 6 && init.every((n) => typeof n === "number")) {
    return init as unknown as Seis;
  }
  if (Array.isArray(init) && init.length === 16 && init.every((n) => typeof n === "number")) {
    const m: number[] = init;
    return [m[0]!, m[1]!, m[4]!, m[5]!, m[12]!, m[13]!];
  }
  if (typeof init === "object" && init !== null) {
    const o = init as Partial<Record<"a" | "b" | "c" | "d" | "e" | "f", unknown>>;
    const n = (v: unknown, porDefecto: number): number => (typeof v === "number" ? v : porDefecto);
    return [n(o.a, 1), n(o.b, 0), n(o.c, 0), n(o.d, 1), n(o.e, 0), n(o.f, 0)];
  }
  return IDENTIDAD;
}

export class DomMatrixMinima {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;

  constructor(init?: unknown) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = leerInicial(init);
  }

  get is2D(): boolean {
    return true;
  }

  get isIdentity(): boolean {
    return (
      this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
    );
  }

  /** `this × otra`, en el orden del estándar (`multiply`). */
  multiply(otra: DomMatrixMinima): DomMatrixMinima {
    return new DomMatrixMinima([
      this.a * otra.a + this.c * otra.b,
      this.b * otra.a + this.d * otra.b,
      this.a * otra.c + this.c * otra.d,
      this.b * otra.c + this.d * otra.d,
      this.a * otra.e + this.c * otra.f + this.e,
      this.b * otra.e + this.d * otra.f + this.f,
    ]);
  }

  multiplySelf(otra: DomMatrixMinima): this {
    const r = this.multiply(otra);
    [this.a, this.b, this.c, this.d, this.e, this.f] = [r.a, r.b, r.c, r.d, r.e, r.f];
    return this;
  }

  preMultiplySelf(otra: DomMatrixMinima): this {
    const r = otra.multiply(this);
    [this.a, this.b, this.c, this.d, this.e, this.f] = [r.a, r.b, r.c, r.d, r.e, r.f];
    return this;
  }

  translate(tx = 0, ty = 0): DomMatrixMinima {
    return this.multiply(new DomMatrixMinima([1, 0, 0, 1, tx, ty]));
  }

  scale(sx = 1, sy = sx): DomMatrixMinima {
    return this.multiply(new DomMatrixMinima([sx, 0, 0, sy, 0, 0]));
  }

  inverse(): DomMatrixMinima {
    return new DomMatrixMinima(this.toFloat64Array()).invertSelf();
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      this.a = this.b = this.c = this.d = this.e = this.f = Number.NaN;
      return this;
    }
    const { a, b, c, d, e, f } = this;
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = (c * f - d * e) / det;
    this.f = (b * e - a * f) / det;
    return this;
  }

  toFloat64Array(): Float64Array {
    return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]);
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/**
 * Deja `globalThis.DOMMatrix` definido. Devuelve `true` si ha tenido que
 * instalar el mínimo, `false` si ya había uno (navegador, canvas nativo).
 */
export function asegurarDomMatrix(): boolean {
  const g = globalThis as { DOMMatrix?: unknown };
  if (typeof g.DOMMatrix === "function") return false;
  g.DOMMatrix = DomMatrixMinima;
  return true;
}
