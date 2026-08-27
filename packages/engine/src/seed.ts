/**
 * Derivacion de semillas.
 *
 * Un intento guarda UN bigint (exam_attempts.seed). Todo lo demas se deriva de
 * el: la semilla de cada item, la del barajado de secciones y la del barajado de
 * opciones. Con ese unico numero y el blueprint congelado se reconstruye el
 * examen entero (principio rector del MASTER_PLAN).
 *
 * Se usa SplitMix64 sobre BigInt: la mezcla es exacta (nada de doubles), el
 * resultado se recorta a 53 bits para caber en un entero seguro de JS y en un
 * bigint de Postgres.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { DeriveItemSeed, Seed } from "@cet/shared";
import { EngineError } from "./errors.js";

const MASK_64 = (1n << 64n) - 1n;
const MASK_53 = (1n << 53n) - 1n;
const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;

function splitmix64(input: bigint): bigint {
  let z = (input + GOLDEN_GAMMA) & MASK_64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
  return (z ^ (z >> 31n)) & MASK_64;
}

function assertSeed(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new EngineError(
      "invalid_seed",
      `${label} debe ser un entero seguro no negativo; se recibio ${String(value)}`,
    );
  }
}

function assertOrd(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new EngineError(
      "invalid_ord",
      `${label} debe ser un entero no negativo; se recibio ${String(value)}`,
    );
  }
}

/**
 * Etiquetas de flujo. Dos usos distintos de la misma semilla raiz NUNCA deben
 * compartir corriente: si la seleccion de preguntas y el barajado de opciones
 * consumieran el mismo flujo, cambiar el numero de opciones de una pregunta
 * cambiaria el examen entero.
 */
export const SEED_STREAM = {
  item: 1,
  sectionSelection: 2,
  sectionPresentation: 3,
  optionShuffle: 4,
} as const;

export type SeedStream = (typeof SEED_STREAM)[keyof typeof SEED_STREAM];

/**
 * Semilla de un item a partir de la raiz del intento y su posicion.
 * Firma congelada en @cet/shared (DeriveItemSeed).
 */
export const deriveItemSeed: DeriveItemSeed = (rootSeed: Seed, ord: number): Seed => {
  assertSeed(rootSeed, "rootSeed");
  assertOrd(ord, "ord");
  return deriveStreamSeed(rootSeed, SEED_STREAM.item, ord);
};

/**
 * Semilla de un flujo auxiliar. `stream` separa usos; `index` separa elementos
 * dentro del mismo uso (numero de seccion, ord del item...).
 */
export function deriveStreamSeed(rootSeed: Seed, stream: number, index: number): Seed {
  assertSeed(rootSeed, "rootSeed");
  assertOrd(index, "index");
  assertOrd(stream, "stream");
  const mixed = splitmix64(
    (BigInt(rootSeed) ^ ((BigInt(stream) + 1n) * GOLDEN_GAMMA) ^ ((BigInt(index) + 1n) * 0xff51afd7ed558ccdn)) &
      MASK_64,
  );
  return Number(mixed & MASK_53);
}
