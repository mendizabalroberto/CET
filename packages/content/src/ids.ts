/**
 * Identificadores deterministas.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * REQUISITO DURO — IDEMPOTENCIA
 *   Ejecutar el pipeline dos veces debe producir packs byte-idénticos. Por eso
 *   aquí no hay `crypto.randomUUID()`, ni `Date.now()`, ni contadores globales:
 *   todo id es un UUIDv5 (RFC 4122) derivado del namespace CET y de una clave
 *   textual estable construida con el fichero fuente y la posición del elemento.
 *
 *   Consecuencia deseada: si mañana se reordena una lección, su id cambia — y
 *   eso es correcto, porque la clave describe *qué* es el elemento. Si en cambio
 *   solo se corrige una errata en el HTML, el id NO cambia, porque el contenido
 *   no entra en la clave. Esto permite re-ejecutar el pipeline sobre una base de
 *   datos ya sembrada sin duplicar filas.
 */

import { createHash } from "node:crypto";

/**
 * Namespace UUID propio de CET (generado una vez, congelado para siempre).
 * Cambiarlo invalida TODOS los ids ya sembrados en la base de datos.
 */
export const CET_NAMESPACE = "1f0b3d6e-2c47-5a8b-9e31-7d4a6c25b0f2";

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`UUID de namespace inválido: ${uuid}`);
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const NS_BYTES = uuidToBytes(CET_NAMESPACE);

/**
 * UUID v5 (SHA-1, RFC 4122 §4.3). Determinista dado (namespace, name).
 * SHA-1 se usa aquí como función de derivación de nombres, NO como primitiva de
 * seguridad: no hay ningún secreto ni firma implicados.
 */
export function uuidv5(name: string): string {
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1")
    .update(Buffer.concat([Buffer.from(NS_BYTES), nameBytes]))
    .digest();

  const b = Uint8Array.prototype.slice.call(hash, 0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // versión 5
  b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Construye un id determinista a partir de partes. Las partes se unen con ``
 * (unit separator), un carácter que no puede aparecer en un código de materia ni
 * en un nombre de símbolo JS, de modo que ["a|b"] y ["a","b"] nunca colisionan.
 */
export function stableId(...parts: readonly (string | number)[]): string {
  return uuidv5(parts.map(String).join(""));
}

/** Hash de contenido, para detectar cambios reales entre ejecuciones. */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

/**
 * JSON con claves ordenadas. `JSON.stringify` respeta el orden de inserción, que
 * depende del orden en que el extractor rellenó los objetos; ordenar las claves
 * elimina esa fuente de no-determinismo.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    const v = src[key];
    if (v === undefined) continue; // undefined desaparece en JSON: normalízalo aquí
    out[key] = sortKeys(v);
  }
  return out;
}
