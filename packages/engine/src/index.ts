/**
 * @cet/engine — el motor determinista de Cambridge Exam Trainer.
 *
 * Una sola implementacion, dos contextos (AD-5/AD-6):
 *   - practica  -> navegador, feedback inmediato
 *   - examen    -> Edge Function, la clave nunca sale de la DB
 *
 * INVARIANTE: generate(engineKey, params, seed) devuelve SIEMPRE lo mismo.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

export * from "./errors.js";
export * from "./rng.js";
export * from "./seed.js";
export * from "./fraction.js";
export * from "./format.js";
export * from "./sanitize.js";
export * from "./registry.js";
export * from "./generators/index.js";
export * from "./blueprint.js";
export * from "./grading/index.js";

import { registry } from "./generators/index.js";
import type { GeneratedItem, Seed } from "@cet/shared";

/**
 * Atajo de la API publica: genera un item con el registro por defecto.
 * Valida engineKey, parametros y semilla antes de tocar nada.
 */
export function generate(engineKey: string, params: unknown, seedValue: Seed): GeneratedItem {
  return registry.generate(engineKey, params, seedValue);
}

/** Claves registradas, ordenadas. Util para el panel de autoria (M07). */
export function listEngineKeys(): string[] {
  return registry.keys();
}

export * from "./plan/tipos.js";
export * from "./plan/repartir.js";
