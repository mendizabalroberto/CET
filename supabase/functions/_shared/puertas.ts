/**
 * _shared/puertas.ts — las piezas PURAS de `auth-pin` y `student-pin`
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE FICHERO EXISTE, Y POR QUÉ SOLO IMPORTA ZOD
 * ─────────────────────────────────────────────────────────────────────────────
 * `supabase/functions/vitest.config.mjs` alias `https://esm.sh/zod@3.23.8` a la
 * librería del workspace, y SOLO esa. `hash-wasm` y `@supabase/supabase-js` no
 * tienen alias a propósito: pertenecen al camino con efectos —hashear con
 * Argon2id, hablar con la base—, que no se prueba con un test unitario sino con
 * el pgTAP y el e2e.
 *
 * Consecuencia directa: cualquier módulo que importe uno de esos dos paquetes es
 * imposible de importar desde una prueba, y muere en el primer `import`. Así que
 * todo lo que quiera probarse —esquemas de frontera, derivaciones, hashes de
 * token, la lista de PIN débiles— vive AQUÍ, y los dos `index.ts` lo importan.
 *
 * Regla que no se puede relajar: este fichero importa zod y nada más. Ni
 * hash-wasm, ni supabase-js, ni `Deno.env`. Solo Web Crypto, que existe igual en
 * Deno y en Node ≥ 18.
 */

import { z } from "https://esm.sh/zod@3.23.8";

/* -------------------------------------------------------------------------- */
/* Hash de token                                                              */
/* -------------------------------------------------------------------------- */

const enc = new TextEncoder();

/**
 * SHA-256 en hexadecimal MINÚSCULAS. Es la forma en la que la base guarda todos
 * los tokens de este producto (`student_devices.device_hash`,
 * `guardian_invites.token_hash`): el secreto en claro solo vive en la cookie o
 * en la URL, nunca en reposo.
 *
 * Minúsculas no es una preferencia estética: las comparaciones se hacen con
 * `= device_hash` en Postgres y `check (... ~ '^[0-9a-f]{64}$')` rechaza el
 * hexadecimal en mayúsculas. Un `toUpperCase()` aquí rompería el lookup entero
 * sin dar un error visible: simplemente no encontraría nunca una fila.
 */
export async function sha256hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(texto));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------- */
/* La frontera de `auth-pin`: dos puertas                                     */
/* -------------------------------------------------------------------------- */

/** El PIN, acotado igual en las dos funciones. */
export const pinShape = z.string().regex(/^[0-9]{4,8}$/);

/**
 * La puerta vieja, intacta. El colegio se identifica por su UUID y no por su
 * slug: `schools.id` es la clave de tenant en TODO el modelo de datos.
 */
export const puertaDeColegio = z
  .object({
    schoolId: z.string().uuid(),
    studentCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9._-]+$/),
    pin: pinShape,
  })
  .strict();

/**
 * La puerta del dispositivo. 32 bytes en base64url son EXACTAMENTE 43
 * caracteres: ni 42 ni 44, y sin `+` ni `/`, que son del base64 clásico.
 *
 * Acotarlo aquí, antes de tocar la base de datos, es el mismo motivo por el que
 * el PIN se acota a 4–8 dígitos: sin límite, una entrada de 10 MB llega hasta
 * Argon2id, que reserva 19 MiB por verificación, y eso es una denegación de
 * servicio gratuita.
 */
export const puertaDeDispositivo = z
  .object({
    deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    pin: pinShape,
  })
  .strict();

/**
 * Las dos formas de entrar. `.strict()` en ambas ramas es lo que impide que
 * alguien mande LAS DOS PUERTAS A LA VEZ: un cuerpo con `deviceToken` y
 * `studentCode` no encaja en ninguna de las dos y se rechaza en la frontera, sin
 * que el resto del código tenga que preguntarse cuál de las dos manda.
 */
export const entradaDeAuthPin = z.union([puertaDeColegio, puertaDeDispositivo]);

export type EntradaDeAuthPin = z.infer<typeof entradaDeAuthPin>;
export type PuertaDeDispositivo = z.infer<typeof puertaDeDispositivo>;

/** Discrimina la puerta sin repetir la comprobación de la forma en cada sitio. */
export function esPuertaDeDispositivo(entrada: EntradaDeAuthPin): entrada is PuertaDeDispositivo {
  return "deviceToken" in entrada;
}

/* -------------------------------------------------------------------------- */
/* La clave por la que se cuentan los intentos                                */
/* -------------------------------------------------------------------------- */

/** La fila de `auth_attempts` contra la que se cuenta. `schoolId` nulo es legal. */
export type ClaveDeIntento = { schoolId: string | null; studentCode: string };

/**
 * Decide POR QUÉ CLAVE se cuentan los intentos fallidos, y es el invariante que
 * sostiene el lockout entero:
 *
 *   > se cuenta por ALUMNO, nunca por la puerta por la que se llamó.
 *
 * Si se contara por puerta, alternar entre `{schoolId, studentCode}` y
 * `{deviceToken}` daría dos ventanas independientes contra el MISMO PIN, o sea
 * intentos infinitos, que es exactamente lo que el lockout existe para impedir.
 * Por eso esta función recibe la entrada y NO la usa cuando hay alumno resuelto:
 * la clave sale de la fila de `students`, que es la misma se entre por donde se
 * entre.
 *
 * Los dos casos de borde:
 *  - Alumno NO resuelto en la puerta del colegio: se cuenta por el código
 *    TECLEADO, aunque no exista. Contar los intentos contra códigos inexistentes
 *    es precisamente cómo se detecta una enumeración (`auth_attempts` existe
 *    para eso).
 *  - Alumno no resuelto en la puerta del dispositivo: no hay nada que contar y
 *    devuelve `null`. Un `deviceToken` desconocido no es un código que alguien
 *    haya tecleado, y colgarle una fila permitiría llenar la tabla desde fuera.
 *    Ese camino ya sale por el señuelo y el suelo de tiempo.
 */
export function claveDeIntento(
  entrada: EntradaDeAuthPin,
  alumno: { school_id: string | null; student_code: string } | null,
): ClaveDeIntento | null {
  if (alumno) return { schoolId: alumno.school_id, studentCode: alumno.student_code };
  if (esPuertaDeDispositivo(entrada)) return null;
  return { schoolId: entrada.schoolId, studentCode: entrada.studentCode };
}

/* -------------------------------------------------------------------------- */
/* La frontera de `student-pin`                                               */
/* -------------------------------------------------------------------------- */

/**
 * `set-from-link` NO exige el PIN anterior porque no existe: quien la invoca ya
 * presentó un enlace de un solo uso. Por eso mismo solo la puede invocar
 * `service_role` — un JWT de usuario aquí sería un cambio de PIN sin credencial.
 */
export const entradaDeStudentPin = z.discriminatedUnion("op", [
  z.object({ op: z.literal("change"), currentPin: pinShape, newPin: pinShape }),
  z.object({ op: z.literal("reset"), studentProfileId: z.string().uuid() }),
  z.object({ op: z.literal("provision"), studentProfileId: z.string().uuid() }),
  z.object({
    op: z.literal("set-from-link"),
    studentProfileId: z.string().uuid(),
    newPin: pinShape,
  }),
]);

export type EntradaDeStudentPin = z.infer<typeof entradaDeStudentPin>;

/* -------------------------------------------------------------------------- */
/* PIN débiles                                                                */
/* -------------------------------------------------------------------------- */
/**
 * Se comprueba EN EL SERVIDOR aunque la app ya lo valide: la validación de
 * cliente es una cortesía para el usuario, nunca un control de seguridad. Un
 * `curl` se la salta entera. Y un enlace de un solo uso no convierte `1234` en
 * un buen PIN, así que `set-from-link` aplica exactamente esta misma lista.
 *
 * La lista es corta a propósito. Bloquear demasiado obliga a un niño de 10 años
 * a inventar un PIN que no recordará, y un PIN olvidado acaba escrito en la
 * tapa del estuche — que es mucho peor que "1357".
 */
export function esPinDebil(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111, 999999

  const ascendente = "0123456789012345";
  const descendente = "9876543210987654";
  if (ascendente.includes(pin) || descendente.includes(pin)) return true; // 1234, 4321

  const bloqueados = new Set(["1010", "2020", "1212", "2121", "6969", "112233", "123123"]);
  return bloqueados.has(pin);
}

/* -------------------------------------------------------------------------- */
/* Identidad del llamante de `set-from-link`                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compara dos cadenas en tiempo independiente de dónde difieren. `a === b` sale
 * en el primer byte distinto, y con eso se adivina un secreto byte a byte.
 *
 * La longitud sí se filtra, y es inevitable en JavaScript sin acceso a memoria
 * de bajo nivel; la longitud de un JWT no es un secreto.
 */
function igualEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * ¿El llamante presentó la clave de `service_role`, y no un JWT de usuario?
 *
 * Se exige en la cabecera `Authorization` como `Bearer <clave>`. Un JWT de
 * alumno o de tutor NUNCA es igual a la clave de servicio, así que este único
 * predicado cierra la puerta a los dos. Deliberadamente NO se acepta la cabecera
 * `apikey` como prueba: un navegador la manda sola con la clave anónima, y
 * aceptarla convertiría un descuido de configuración en un cambio de PIN
 * gratuito.
 */
export function presentaClaveDeServicio(
  cabeceraAuthorization: string | null,
  claveDeServicio: string | undefined,
): boolean {
  if (!claveDeServicio) return false;
  if (!cabeceraAuthorization) return false;
  const [esquema, ...resto] = cabeceraAuthorization.trim().split(/\s+/);
  if (esquema?.toLowerCase() !== "bearer") return false;
  const token = resto.join(" ");
  return igualEnTiempoConstante(token, claveDeServicio);
}

/* -------------------------------------------------------------------------- */
/* Derivaciones del alumno                                                    */
/* -------------------------------------------------------------------------- */

/**
 * El correo sintético de la cuenta de auth del alumno. Dominio `.invalid`
 * (RFC 2606): nunca resuelve en DNS, luego no puede recibir correo.
 *
 * El hijo de un tutor nace SIN COLEGIO, así que no hay slug con el que componer
 * el subdominio; usa `familia`, y su `student_code` es único globalmente por el
 * índice parcial de la migración 0066.
 */
export function emailSinteticoDeAlumno(studentCode: string, schoolSlug: string | null): string {
  return schoolSlug
    ? `s.${studentCode}@${schoolSlug}.students.cet.invalid`
    : `s.${studentCode}@familia.cet.invalid`;
}

/** Longitud de PIN según la etapa (AD-4). Un alumno sin colegio usa el default. */
export function longitudDePinPorEtapa(
  stage: string,
  config: { pin_length_primary?: number | null; pin_length_secondary?: number | null } | null,
): number {
  const esSecundaria = stage === "secondary";
  const configurada = esSecundaria ? config?.pin_length_secondary : config?.pin_length_primary;
  return configurada ?? (esSecundaria ? 6 : 4);
}
