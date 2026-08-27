/**
 * PRNG determinista del motor.
 *
 * Los trainers Y6A usan Math.random() en ri()/pick(). Aqui esa aleatoriedad se
 * convierte en un flujo sembrado: xoshiro128** con estado inicializado por
 * SplitMix32 a partir de la semilla de 53 bits del contrato.
 *
 * REGLA DURA: ningun fichero de src/ (fuera de __tests__) puede usar
 * Math.random() ni Date.now(). Hay un test que lo verifica leyendo el codigo.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { EngineError } from "./errors.js";

const TWO_POW_32 = 4294967296;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** SplitMix32: sirve para expandir una semilla corta en el estado de xoshiro. */
function splitmix32(seedWord: number): () => number {
  let a = seedWord >>> 0;
  return (): number => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export interface Rng {
  /** Entero sin signo de 32 bits. */
  nextUint32(): number;
  /** Real en [0, 1). */
  nextFloat(): number;
  /** Entero en [min, max], AMBOS inclusive. Equivalente sembrado de ri() en Y6A. */
  int(min: number, max: number): number;
  /** Elige un elemento. Equivalente sembrado de pick() en Y6A. Lanza si el array esta vacio. */
  pick<T>(items: readonly T[]): T;
  /** Elige con pesos enteros o reales positivos. */
  weighted<T>(items: readonly { readonly value: T; readonly weight: number }[]): T;
  /** Copia barajada (Fisher-Yates). No muta la entrada. */
  shuffle<T>(items: readonly T[]): T[];
  /** Permutacion de indices [0..n-1]. Es lo que se persiste en attempt_items.option_order. */
  permutation(n: number): number[];
  /** k elementos distintos, en orden aleatorio. Lanza si k > items.length. */
  sample<T>(items: readonly T[], k: number): T[];
  /** true con probabilidad p (0..1). */
  chance(p: number): boolean;
}

class Xoshiro128ss implements Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seedValue: number) {
    if (!Number.isSafeInteger(seedValue) || seedValue < 0) {
      throw new EngineError(
        "invalid_seed",
        `La semilla debe ser un entero seguro no negativo; se recibio ${String(seedValue)}`,
      );
    }
    // 53 bits -> dos palabras de 32 bits -> SplitMix32 -> 4 palabras de estado.
    const hi = Math.floor(seedValue / TWO_POW_32) >>> 0;
    const lo = (seedValue % TWO_POW_32) >>> 0;
    const mix = splitmix32((hi ^ 0x9e3779b9) >>> 0);
    const mix2 = splitmix32(lo);
    this.s0 = mix2();
    this.s1 = mix();
    this.s2 = mix2();
    this.s3 = mix();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      // El estado todo-ceros es un punto fijo de xoshiro. Imposible en la practica,
      // pero un punto fijo silencioso es exactamente el tipo de bug que arruina un examen.
      this.s3 = 0x9e3779b9;
    }
    // Descartamos las primeras salidas para dispersar semillas consecutivas
    // (attempt.seed y attempt.seed+1 no deben producir examenes parecidos).
    for (let i = 0; i < 8; i += 1) this.nextUint32();
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  nextFloat(): number {
    // 53 bits de mantisa a partir de dos palabras: sin sesgo perceptible.
    const hi = this.nextUint32() >>> 5;
    const lo = this.nextUint32() >>> 6;
    return (hi * 67108864 + lo) / 9007199254740992;
  }

  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new EngineError("invalid_range", `int() exige enteros; se recibio (${min}, ${max})`);
    }
    if (max < min) {
      throw new EngineError("invalid_range", `int() exige max >= min; se recibio (${min}, ${max})`);
    }
    const range = max - min + 1;
    if (range > TWO_POW_32) {
      throw new EngineError("invalid_range", `int() soporta rangos de hasta 2^32; se pidio ${range}`);
    }
    if (range === 1) return min;
    // Rechazo para eliminar el sesgo de modulo. El bucle esta ACOTADO: tras 64
    // intentos cae al modulo sesgado. Probabilidad de llegar ahi < 2^-64.
    const limit = TWO_POW_32 - (TWO_POW_32 % range);
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const x = this.nextUint32();
      if (x < limit) return min + (x % range);
    }
    return min + (this.nextUint32() % range);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new EngineError("empty_pick", "pick() sobre un array vacio");
    }
    const value = items[this.int(0, items.length - 1)];
    if (value === undefined) {
      throw new EngineError("empty_pick", "pick() obtuvo undefined: el array tiene huecos");
    }
    return value;
  }

  weighted<T>(items: readonly { readonly value: T; readonly weight: number }[]): T {
    if (items.length === 0) {
      throw new EngineError("empty_pick", "weighted() sobre un array vacio");
    }
    let total = 0;
    for (const item of items) {
      if (!Number.isFinite(item.weight) || item.weight < 0) {
        throw new EngineError("invalid_weight", `Peso invalido: ${String(item.weight)}`);
      }
      total += item.weight;
    }
    if (total <= 0) {
      throw new EngineError("invalid_weight", "weighted() con peso total 0");
    }
    let target = this.nextFloat() * total;
    for (const item of items) {
      target -= item.weight;
      if (target < 0) return item.value;
    }
    // Solo alcanzable por error de redondeo en el ultimo elemento.
    const last = items[items.length - 1];
    if (last === undefined) {
      throw new EngineError("empty_pick", "weighted() perdio el ultimo elemento");
    }
    return last.value;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  permutation(n: number): number[] {
    if (!Number.isInteger(n) || n < 0) {
      throw new EngineError("invalid_range", `permutation() exige n >= 0; se recibio ${String(n)}`);
    }
    const indices: number[] = [];
    for (let i = 0; i < n; i += 1) indices.push(i);
    return this.shuffle(indices);
  }

  sample<T>(items: readonly T[], k: number): T[] {
    if (!Number.isInteger(k) || k < 0) {
      throw new EngineError("invalid_range", `sample() exige k >= 0; se recibio ${String(k)}`);
    }
    if (k > items.length) {
      throw new EngineError(
        "invalid_range",
        `sample() pidio ${k} elementos de un array de ${items.length}`,
      );
    }
    return this.shuffle(items).slice(0, k);
  }

  chance(p: number): boolean {
    if (!Number.isFinite(p)) {
      throw new EngineError("invalid_range", `chance() exige un numero finito; se recibio ${String(p)}`);
    }
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.nextFloat() < p;
  }
}

/** Crea un flujo determinista a partir de una semilla de 53 bits. */
export function createRng(seedValue: number): Rng {
  return new Xoshiro128ss(seedValue);
}
