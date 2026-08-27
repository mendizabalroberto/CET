/**
 * Registro de generadores.
 *
 * Un `engineKey` -> un generador. La busqueda es tipada por fuera y borrada por
 * dentro: el registro guarda un envoltorio que valida los parametros con el
 * esquema del propio generador antes de llamarlo. Nada de `any`.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { type z } from "zod";
import {
  engineKey as engineKeySchema,
  seed as seedSchema,
  type EngineKey,
  type GeneratedItem,
  type QuestionFormat,
  type QuestionGenerator,
  type Seed,
} from "@cet/shared";
import { EngineError, InvalidParamsError, UnknownEngineKeyError } from "./errors.js";

export interface RegisteredGenerator {
  readonly key: EngineKey;
  readonly skillCode: string;
  readonly format: QuestionFormat;
  /**
   * Se expone borrado (el alias de la propia zod) porque el registro guarda
   * generadores de parametros heterogeneos. La validacion NO pasa por aqui: la
   * hace `generate`, que tiene capturado el generador concreto y su tipo.
   */
  readonly paramsSchema: z.ZodTypeAny;
  /** Valida los parametros y genera. Es el unico camino de entrada al generador. */
  generate(rawParams: unknown, seedValue: Seed): GeneratedItem;
}

function erase<TParams>(generator: QuestionGenerator<TParams>): RegisteredGenerator {
  return {
    key: generator.key,
    skillCode: generator.skillCode,
    format: generator.format,
    paramsSchema: generator.paramsSchema,
    generate(rawParams: unknown, seedValue: Seed): GeneratedItem {
      const parsedParams = generator.paramsSchema.safeParse(rawParams ?? {});
      if (!parsedParams.success) {
        throw new InvalidParamsError(
          generator.key,
          parsedParams.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`),
        );
      }
      const parsedSeed = seedSchema.safeParse(seedValue);
      if (!parsedSeed.success) {
        throw new EngineError(
          "invalid_seed",
          `Semilla invalida para "${generator.key}": ${String(seedValue)}`,
        );
      }
      return generator.generate(parsedParams.data, parsedSeed.data);
    },
  };
}

export class GeneratorRegistry {
  private readonly generators = new Map<string, RegisteredGenerator>();

  register<TParams>(generator: QuestionGenerator<TParams>): this {
    const key = engineKeySchema.safeParse(generator.key);
    if (!key.success) {
      throw new EngineError(
        "invalid_engine_key",
        `engineKey invalido: "${String(generator.key)}" (formato esperado: materia.familia)`,
      );
    }
    if (this.generators.has(key.data)) {
      throw new EngineError(
        "duplicate_engine_key",
        `Ya hay un generador registrado con la clave "${key.data}". ` +
          `Dos generadores con la misma clave harian irreproducible cualquier examen que la use.`,
      );
    }
    this.generators.set(key.data, erase(generator));
    return this;
  }

  has(key: string): boolean {
    return this.generators.has(key);
  }

  get(key: string): RegisteredGenerator {
    const found = this.generators.get(key);
    if (found === undefined) {
      throw new UnknownEngineKeyError(key, this.keys());
    }
    return found;
  }

  keys(): string[] {
    return [...this.generators.keys()].sort();
  }

  all(): RegisteredGenerator[] {
    return this.keys().map((key) => this.get(key));
  }

  /** Genera un item. Punto de entrada unico para practica y examen. */
  generate(key: string, params: unknown, seedValue: Seed): GeneratedItem {
    return this.get(key).generate(params, seedValue);
  }
}
