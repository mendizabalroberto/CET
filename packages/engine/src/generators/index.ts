/**
 * Registro poblado: todos los generadores que el motor conoce.
 * Anadir un generador aqui lo mete automaticamente en el test de determinismo,
 * en el de variedad y en el de correccion matematica. Es deliberado.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { GeneratorRegistry } from "../registry.js";
import { simplifyGenerator } from "./math/simplify.js";
import { compareGenerator } from "./math/compare.js";
import { fracopGenerator } from "./math/fracop.js";
import { mixedGenerator } from "./math/mixed.js";
import { decimalGenerator } from "./math/decimal.js";
import { powtenGenerator } from "./math/powten.js";
import { metricGenerator } from "./math/metric.js";
import { shapeGenerator } from "./math/shape.js";
import { wordGenerator } from "./math/word.js";

export const registry = new GeneratorRegistry()
  .register(simplifyGenerator)
  .register(compareGenerator)
  .register(fracopGenerator)
  .register(mixedGenerator)
  .register(decimalGenerator)
  .register(powtenGenerator)
  .register(metricGenerator)
  .register(shapeGenerator)
  .register(wordGenerator);

export * from "./math/simplify.js";
export * from "./math/compare.js";
export * from "./math/fracop.js";
export * from "./math/mixed.js";
export * from "./math/decimal.js";
export * from "./math/powten.js";
export * from "./math/metric.js";
export * from "./math/shape.js";
export * from "./math/word.js";
export * from "./common.js";
