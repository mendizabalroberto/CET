/**
 * Calcula el hash bcrypt de ADMIN_PASSWORD sin imprimir la contraseña.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE HACE DIRECTAMENTE EN SQL
 * ─────────────────────────────────────────────────────────────────────────────
 * `update auth.users set encrypted_password = crypt('...', gen_salt('bf'))`
 * funciona, pero obliga a escribir la contraseña EN CLARO dentro de la sentencia
 * SQL. Esa sentencia queda en el historial del cliente, en los logs del servidor
 * y en cualquier transcripción de la sesión.
 *
 * Aquí solo sale el hash. La contraseña se lee del fichero de secretos —que está
 * en `.gitignore`— y no se imprime nunca.
 *
 * COSTE 10, que es el que usa GoTrue por defecto. `gen_salt('bf')` de pgcrypto
 * usa 6, que verifica igual pero es más barato de atacar: si un día se filtra un
 * volcado, esos cuatro duplicaciones de coste son la diferencia.
 *
 * Uso:  node scripts/admin-password-hash.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bcrypt } from "hash-wasm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const raw = readFileSync(join(root, "secrets", "edge-secrets.env"), "utf8");
const match = /^ADMIN_PASSWORD\s*=\s*(.+)$/m.exec(raw);

if (!match?.[1]) {
  console.error("Falta ADMIN_PASSWORD en secrets/edge-secrets.env");
  process.exit(1);
}

const password = match[1].trim();

if (password.length < 10) {
  console.error(
    `ADMIN_PASSWORD tiene ${password.length} caracteres. El mínimo para personal son 10:\n` +
      "un administrador ve datos de menores de todos los colegios.",
  );
  process.exit(1);
}

const salt = new Uint8Array(16);
crypto.getRandomValues(salt);

const hash = await bcrypt({ password, salt, costFactor: 10, outputType: "encoded" });

console.log(`longitud de la contraseña: ${password.length} caracteres`);
console.log(`hash bcrypt (coste 10):    ${hash}`);
