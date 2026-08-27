/**
 * Errores del motor. Todos derivan de EngineError para que la frontera
 * (Edge Function / Server Action) pueda distinguir "fallo del motor" de
 * "fallo de infraestructura" sin inspeccionar mensajes.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

export class EngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}

/** Se pidio un engineKey que nadie registro. */
export class UnknownEngineKeyError extends EngineError {
  readonly requestedKey: string;
  readonly availableKeys: readonly string[];

  constructor(requestedKey: string, availableKeys: readonly string[]) {
    super(
      "unknown_engine_key",
      `No hay generador registrado para "${requestedKey}". Registrados: ${
        availableKeys.length > 0 ? availableKeys.join(", ") : "(ninguno)"
      }`,
    );
    this.name = "UnknownEngineKeyError";
    this.requestedKey = requestedKey;
    this.availableKeys = availableKeys;
  }
}

/** Los parametros no pasaron el esquema del generador. */
export class InvalidParamsError extends EngineError {
  readonly engineKey: string;
  readonly issues: readonly string[];

  constructor(engineKey: string, issues: readonly string[]) {
    super("invalid_params", `Parametros invalidos para "${engineKey}": ${issues.join("; ")}`);
    this.name = "InvalidParamsError";
    this.engineKey = engineKey;
    this.issues = issues;
  }
}

/** El generador produjo algo que no cumple el contrato. Bug del generador. */
export class InvalidGeneratedItemError extends EngineError {
  readonly engineKey: string;
  readonly issues: readonly string[];

  constructor(engineKey: string, issues: readonly string[]) {
    super(
      "invalid_generated_item",
      `El generador "${engineKey}" produjo un item que viola el contrato: ${issues.join("; ")}`,
    );
    this.name = "InvalidGeneratedItemError";
    this.engineKey = engineKey;
    this.issues = issues;
  }
}

/** El banco no tiene preguntas suficientes para materializar una seccion. */
export class InsufficientPoolError extends EngineError {
  readonly sectionOrd: number;
  readonly required: number;
  readonly available: number;
  readonly criteria: string;

  constructor(sectionOrd: number, required: number, available: number, criteria: string) {
    super(
      "insufficient_pool",
      `La seccion ${sectionOrd} necesita ${required} pregunta(s) y el banco solo ofrece ${available} ` +
        `tras aplicar los filtros {${criteria}}. El examen NO se materializa: ` +
        `un examen incompleto es peor que un examen que no arranca.`,
    );
    this.name = "InsufficientPoolError";
    this.sectionOrd = sectionOrd;
    this.required = required;
    this.available = available;
    this.criteria = criteria;
  }
}

/** Se intento renderizar HTML/SVG con marcado fuera de la allowlist. */
export class SanitizationError extends EngineError {
  constructor(message: string) {
    super("sanitization", message);
    this.name = "SanitizationError";
  }
}
