/**
 * Alta de un alumno de pruebas como HIJO DE UN TUTOR, con PIN conocido.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE NO SE SIEMBRA A MANO CON UN INSERT
 * ===========================================================================
 * `students.pin_hash` es Argon2id, y el UNICO sitio del sistema que lo calcula
 * es la Edge Function `student-pin` (a proposito: dos implementaciones es como
 * divergen los parametros de coste, y entonces el tiempo de respuesta delata
 * que codigos de alumno existen). Un INSERT a mano solo puede poner el hash
 * senuelo, con el que NADIE entra.
 *
 * Ademas, `auth-pin` no abre sesion con el PIN: valida el PIN y despues entra
 * con `signInWithPassword` usando una contrasena derivada de
 * `CET_STUDENT_PASSWORD_SECRET`, que vive solo dentro de la Edge Function.
 * `crearHijo` crea la cuenta con una contrasena ALEATORIA justamente porque la
 * web no conoce ese secreto. Quien la corrige es `set-from-link`. Por eso este
 * script replica el alta y DELEGA el PIN: es el mismo recorrido que hace el
 * producto cuando el nino canjea su enlace, sin el enlace.
 *
 * ===========================================================================
 * USO
 * ===========================================================================
 *   node scripts/alumno-de-pruebas.mjs "Mario Perez" 1397 [curso]
 *
 * El curso por defecto es 6 (primaria -> PIN de 4 digitos). Un curso de
 * secundaria exige PIN de 6, y el script lo dice antes de tocar nada.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const REF = "clcutoqjdgeggvgyreud";
const URL_BASE = `https://${REF}.supabase.co`;
const TUTOR_ID = "640667fd-7903-4a6b-8e4e-06129092b73c"; // Roberto (guardian)

const root = process.cwd();
function secreto(fichero, clave) {
  // Se parte por lineas en vez de con una expresion regular: `\s` dentro de una
  // plantilla de JS es una secuencia de escape, no un metacaracter, asi que
  // `${clave}\s*=` compilaba a `CLAVEs*=` y no casaba nunca. Silencioso.
  const raw = readFileSync(join(root, "secrets", fichero), "utf8");
  // El .trim() de abajo se lleva el retorno de carro, asi que basta con
  // partir por el salto de linea.
  for (const linea of raw.split("\n")) {
    const limpia = linea.trim();
    if (limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte === -1) continue;
    if (limpia.slice(0, corte).trim() !== clave) continue;
    const valor = limpia.slice(corte + 1).trim();
    if (valor !== "") return valor;
  }
  throw new Error(`No se encontro ${clave} en secrets/${fichero}`);
}
const SERVICE_KEY = secreto("deploy.env", "SUPABASE_SERVICE_ROLE_KEY");

const cabeceras = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function pedir(ruta, opciones) {
  const r = await fetch(`${URL_BASE}${ruta}`, { ...opciones, headers: cabeceras });
  const texto = await r.text();
  let cuerpo = texto;
  try { cuerpo = JSON.parse(texto); } catch { /* texto plano */ }
  return { ok: r.ok, status: r.status, cuerpo };
}

/** Calcado de `etapaDeCurso` en apps/web/src/lib/tutor. */
const etapaDeCurso = (curso) => (curso >= 7 ? "secondary" : "primary");
/** `FAM-` y seis digitos, como `codigoDeFamilia`. */
const codigoDeFamilia = () =>
  `FAM-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0")}`;
/** Hash senuelo con el formato que exige `students_pin_hash_is_argon2id`. */
const hashInservible = () => {
  const b64 = (n) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64url");
  return `$argon2id$v=19$m=19456,t=2,p=1$${b64(16)}$${b64(32)}`;
};

const [nombre, pin, cursoTexto] = process.argv.slice(2);
if (!nombre || !pin) {
  console.error('Uso: node scripts/alumno-de-pruebas.mjs "Nombre Apellido" 1397 [curso]');
  process.exit(1);
}
const curso = Number(cursoTexto ?? 6);
const etapa = etapaDeCurso(curso);
const longitud = etapa === "secondary" ? 6 : 4;
if (pin.length !== longitud) {
  console.error(`Curso ${curso} es ${etapa}: el PIN debe tener ${longitud} digitos, y "${pin}" tiene ${pin.length}.`);
  process.exit(1);
}

const codigo = codigoDeFamilia();
const email = `s.${codigo.toLowerCase()}@familia.cet.invalid`;

console.log(`Alta de "${nombre}" · curso ${curso} (${etapa}) · codigo ${codigo}`);

// --- 1. auth.users, con contrasena aleatoria (la corrige `set-from-link`) ---
const usuario = await pedir("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({
    email,
    password: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
    email_confirm: true,
  }),
});
if (!usuario.ok) { console.error("auth.createUser fallo:", usuario.status, usuario.cuerpo); process.exit(1); }
const id = usuario.cuerpo.id;
console.log(`  auth.users        ${id}`);

/** Si algo posterior falla, el alumno a medio crear no se queda en la base. */
async function deshacer(motivo) {
  console.error(`\n${motivo}\nDeshaciendo el alta...`);
  await pedir(`/rest/v1/guardian_students?student_id=eq.${id}`, { method: "DELETE" });
  await pedir(`/rest/v1/students?profile_id=eq.${id}`, { method: "DELETE" });
  await pedir(`/rest/v1/profiles?id=eq.${id}`, { method: "DELETE" });
  await pedir(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  process.exit(1);
}

// --- 2. profiles: sin colegio y sin correo (el contacto es el del tutor) ----
const perfil = await pedir("/rest/v1/profiles", {
  method: "POST",
  body: JSON.stringify({
    id, school_id: null, role: "student", full_name: nombre,
    email: null, locale: "es", status: "active",
  }),
});
if (!perfil.ok) await deshacer(`profiles.insert fallo: ${perfil.status} ${JSON.stringify(perfil.cuerpo)}`);
console.log("  profiles          ok");

// --- 3. students: nace SIN COLEGIO, con el hash senuelo ---------------------
const alumno = await pedir("/rest/v1/students", {
  method: "POST",
  body: JSON.stringify({
    profile_id: id, school_id: null, student_code: codigo,
    year_level: curso, stage: etapa,
    pin_hash: hashInservible(), pin_must_change: true,
  }),
});
if (!alumno.ok) await deshacer(`students.insert fallo: ${alumno.status} ${JSON.stringify(alumno.cuerpo)}`);
console.log("  students          ok");

// --- 4. El vinculo con su tutor --------------------------------------------
// Sin el, el hijo existe y su propio tutor NO puede verlo: una ficha de menor
// huerfana. Es la misma razon por la que `crearHijo` deshace el alta entera.
const vinculo = await pedir("/rest/v1/guardian_students", {
  method: "POST",
  body: JSON.stringify({
    guardian_id: TUTOR_ID, student_id: id, parentesco: "tutor", es_principal: true,
  }),
});
if (!vinculo.ok) await deshacer(`guardian_students.insert fallo: ${vinculo.status} ${JSON.stringify(vinculo.cuerpo)}`);
console.log("  guardian_students ok");

// --- 5. El PIN, por la unica puerta que lo calcula -------------------------
// `set-from-link` ademas fija la contrasena sintetica de `auth.users`, sin la
// cual el nino elegiria un PIN correcto y aun asi no entraria (el fallo que
// arreglo el commit `fix(alta): el nino elegia su PIN y no podia entrar con el`).
const pinPuesto = await pedir("/functions/v1/student-pin", {
  method: "POST",
  body: JSON.stringify({ op: "set-from-link", studentProfileId: id, newPin: pin }),
});
if (!pinPuesto.ok) await deshacer(`student-pin fallo: ${pinPuesto.status} ${JSON.stringify(pinPuesto.cuerpo)}`);
console.log(`  student-pin       ok (PIN ${pin})`);

// --- 6. El enlace de acceso, sin el cual NO puede entrar -------------------
// `auth-pin` tiene DOS puertas y ninguna le sirve todavia:
//
//   puertaDeColegio      { schoolId, studentCode, pin }  -> `schoolId` es
//                        obligatorio y la busqueda filtra por `school_id`. Un
//                        hijo de tutor lo tiene NULL: no aparece nunca.
//   puertaDeDispositivo  { deviceToken, pin }            -> la unica suya.
//
// Es decir: el hijo de un tutor NO entra con codigo + PIN por ningun sitio. Su
// credencial es la cookie de dispositivo, y esa la crea el canje del enlace.
// Sin este paso el alumno existe, tiene un PIN valido y no puede iniciar sesion.
const token = randomBytes(32).toString("base64url");

// UN SOLO ENLACE VIVO POR ALUMNO: dos enlaces vivos son dos credenciales vivas
// sobre la cuenta de un menor, y la que el tutor cree sustituida sigue abriendo.
await pedir(`/rest/v1/student_access_links?student_id=eq.${id}&revoked_at=is.null`, {
  method: "PATCH",
  body: JSON.stringify({ revoked_at: new Date().toISOString() }),
});

const enlace = await pedir("/rest/v1/student_access_links", {
  method: "POST",
  body: JSON.stringify({
    token_hash: createHash("sha256").update(token).digest("hex"),
    student_id: id,
    created_by: TUTOR_ID,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});
if (!enlace.ok) await deshacer(`student_access_links.insert fallo: ${enlace.status} ${JSON.stringify(enlace.cuerpo)}`);
console.log("  enlace de acceso  ok (caduca en 7 dias)");

const origen = process.env.CET_ORIGEN ?? "http://localhost:3000";
console.log(`
Listo.

  Alumno   ${nombre}
  Codigo   ${codigo}
  PIN      ${pin}
  Enlace   ${origen}/e/${token}

El enlace es de UN SOLO USO y hay que abrirlo en el navegador donde vaya a
practicar: el canje deja la cookie de dispositivo, que es la unica credencial
con la que puede entrar (la puerta de codigo + PIN solo existe para alumnos CON
colegio). Al canjearlo se vuelve a pedir el PIN: pon ${pin} otra vez.

Si el sitio no esta en localhost, relanza con CET_ORIGEN=https://tu-dominio.`);
