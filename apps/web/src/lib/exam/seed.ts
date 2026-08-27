/**
 * La semilla raíz del intento.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Un intento guarda UN `bigint` (`exam_attempts.seed`) y de él se deriva toda la
 * aleatoriedad: qué preguntas caen, en qué orden y cómo se barajan las opciones
 * (`deriveItemSeed` / `deriveStreamSeed` en @cet/engine). Con esa semilla más el
 * `blueprint_snapshot` se regenera el examen entero tres años después.
 *
 * TRES REQUISITOS, TODOS DUROS
 * ---------------------------------------------------------------------------
 * 1. CRIPTOGRÁFICA. Con `Math.random()` un alumno que arranca dos intentos
 *    seguidos podría, en principio, inferir el estado del generador y predecir
 *    qué preguntas le van a tocar en el examen de mañana. `crypto` corta eso.
 * 2. ≤ 2^53-1. Es el tope de `@cet/shared.seed` y el del CHECK
 *    `exam_attempts_seed_js_safe`. Un bigint mayor viajaría redondeado en JSON
 *    y el examen dejaría de ser reproducible — el fallo más difícil de
 *    diagnosticar que este módulo podría tener.
 * 3. UNIFORME. Nada de `% 2^53` sobre un valor que no es múltiplo: sesgaría los
 *    valores bajos. Aquí se toman 53 bits crudos, que es exactamente el rango.
 */
import { ExamError } from "./errors";

/** 2^53 - 1. El mismo tope que declara `seed` en `@cet/shared` y el CHECK de la tabla. */
export const MAX_SEED = Number.MAX_SAFE_INTEGER;

/**
 * Fuente de aleatoriedad, inyectable para poder testear el determinismo aguas
 * abajo sin parchear globales.
 */
export type RandomBytes = (bytes: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (bytes) => {
  const out = new Uint8Array(bytes);
  // `globalThis.crypto` existe en Node ≥ 19 y en el runtime Edge. Si faltara, es
  // mejor romper el arranque del examen que sembrarlo con algo predecible.
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
    throw new ExamError(
      "internal",
      "[exam] No hay CSPRNG disponible: un examen no se siembra con Math.random()",
    );
  }
  webCrypto.getRandomValues(out);
  return out;
};

/**
 * Semilla raíz en `[0, 2^53-1]`.
 *
 * Se leen 7 bytes (56 bits) y se descartan los 3 más altos con una máscara de
 * 53 bits. Descartar bits es imparcial; un módulo no lo sería.
 */
export function generateRootSeed(randomBytes: RandomBytes = defaultRandomBytes): number {
  const bytes = randomBytes(7);
  if (bytes.length < 7) {
    throw new ExamError("internal", "[exam] La fuente de aleatoriedad devolvió menos bytes de los pedidos");
  }

  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  // 56 bits -> 53 bits.
  value &= (1n << 53n) - 1n;

  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new ExamError("internal", `[exam] Semilla fuera del rango seguro: ${String(seed)}`);
  }
  return seed;
}
