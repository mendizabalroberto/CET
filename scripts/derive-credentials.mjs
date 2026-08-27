/**
 * Deriva credenciales de alumno para sembrarlas por SQL.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE Y POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un alumno necesita DOS credenciales que no se pueden calcular en Postgres:
 *
 *   1. `students.pin_hash` — Argon2id del PIN. `pgcrypto` hace bcrypt, md5, sha
 *      y pgp, pero NO Argon2, y no hay extensión disponible en Supabase. La
 *      constraint `students_pin_hash_is_argon2id` exige ese formato.
 *
 *   2. `auth.users.encrypted_password` — la contraseña sintética que el alumno
 *      nunca ve ni teclea, derivada como
 *      `base64( HMAC-SHA256( CET_STUDENT_PASSWORD_SECRET, profile_id ) )`.
 *      Es lo que `auth-pin` usa para pedirle una sesión a GoTrue después de
 *      verificar el PIN.
 *
 * En producción las calcula la Edge Function `student-pin`. Este script existe
 * para el arranque: sembrar las cuentas de demostración ANTES de que los
 * secretos estén dados de alta en Supabase, usando el mismo secreto que ya está
 * generado en `secrets/supabase-edge.env`.
 *
 * IMPRIME HASHES, NUNCA EL SECRETO. El PIN en claro se imprime a propósito
 * —es un PIN de demostración que hay que poder entregar en mano— y por eso este
 * script no debe usarse con alumnos reales: para eso está `student-pin`, que
 * genera el PIN al azar y lo devuelve una sola vez.
 *
 * Uso:  node scripts/derive-credentials.mjs <profile_id> <pin>
 */

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argon2id } from "hash-wasm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * IDÉNTICOS a los de `auth-pin` y `student-pin`. Si divergieran, el hash que
 * escribe este script costaría distinto de verificar que el hash señuelo, y el
 * tiempo de respuesta del login volvería a revelar qué códigos existen.
 */
const ARGON = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 };

function readSecret() {
  const raw = readFileSync(join(root, "secrets", "supabase-edge.env"), "utf8");
  const match = /CET_STUDENT_PASSWORD_SECRET\s*=\s*(\S+)/.exec(raw);
  if (!match?.[1]) {
    throw new Error("Falta CET_STUDENT_PASSWORD_SECRET en secrets/supabase-edge.env");
  }
  return match[1];
}

const [profileId, pin] = process.argv.slice(2);

if (!profileId || !pin) {
  console.error("Uso: node scripts/derive-credentials.mjs <profile_id> <pin>");
  process.exit(1);
}
if (!/^[0-9]{4,8}$/.test(pin)) {
  console.error("El PIN debe tener entre 4 y 8 dígitos.");
  process.exit(1);
}

const salt = new Uint8Array(16);
crypto.getRandomValues(salt);

const pinHash = await argon2id({ password: pin, salt, ...ARGON, outputType: "encoded" });
const syntheticPassword = createHmac("sha256", readSecret()).update(profileId).digest("base64");

console.log(JSON.stringify({ profileId, pinHash, syntheticPassword }, null, 2));
