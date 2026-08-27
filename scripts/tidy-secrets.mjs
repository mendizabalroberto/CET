/**
 * Reorganiza `secrets/` por DESTINO, no por accidente histórico.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lee lo que haya y lo reparte en ficheros según a DÓNDE va cada credencial.
 * Nunca imprime un valor: solo nombres, longitudes y destino.
 *
 * El criterio de agrupación es «dónde se pega esto», no «de qué servicio es».
 * Un fichero que mezcla credenciales de cuatro destinos es un fichero que
 * garantiza que alguien pegue la equivocada en el sitio equivocado.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "secrets");

/** Lee todos los pares clave=valor de todos los ficheros de secrets/. */
function readAll() {
  const found = new Map();
  for (const file of readdirSync(dir)) {
    if (file === "README.md") continue;
    const text = readFileSync(join(dir, file), "utf8");
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const i = s.indexOf("=");
      const key = s.slice(0, i).trim();
      const value = s.slice(i + 1).trim();
      if (value.length > 0 && !found.has(key)) found.set(key, value);
    }
  }
  return found;
}

const values = readAll();

/** Destino de cada credencial. `null` = no va a ningún servicio. */
const PLAN = [
  {
    file: "supabase-edge.env",
    title: "PEGAR EN: Supabase → Project Settings → Edge Functions → Secrets",
    note:
      "Uno por uno, con el mismo nombre. Sin comillas y sin espacios.\n" +
      "# Sin estos dos, `auth-pin` responde 500 y NINGUN alumno puede entrar.",
    keys: [
      [
        "CET_STUDENT_PASSWORD_SECRET",
        "Deriva la contrasena sintetica de cada alumno.\n" +
          "#   SI CAMBIA: todos los alumnos pierden el acceso y hay que reaprovisionar.",
      ],
      [
        "CET_IP_HASH_SALT",
        "Anonimiza las IP en auth_attempts. Nunca se guarda una IP en claro.\n" +
          "#   SI CAMBIA: los hashes antiguos dejan de correlacionar. Nada mas.",
      ],
    ],
  },
  {
    file: "deploy.env",
    title: "USO: despliegue. No se pega en ningun panel; lo lee el CLI.",
    note: "El token de Vercel da control TOTAL de la cuenta. Caducidad corta y borrar al terminar.",
    keys: [
      ["VERCEL_TOKEN", "Autenticacion del CLI de Vercel."],
      [
        "SUPABASE_SERVICE_ROLE_KEY",
        "Salta la RLS por completo. Se configura como variable de entorno\n" +
          "#   de Vercel (solo Production). Nunca en el navegador.",
      ],
    ],
  },
  {
    file: "database.env",
    title: "USO: conexion directa a Postgres (psql, pg_dump, migraciones manuales).",
    note: "No hace falta para la aplicacion: la app usa las claves de API, no esta.",
    keys: [["SUPABASE_DB_PASSWORD", "Contrasena del usuario `postgres`."]],
  },
  {
    file: "accounts.env",
    title: "USO: NINGUNO tecnico. Es una nota para ti.",
    note:
      "Esta contrasena YA esta aplicada a la cuenta. Su sitio es un gestor de\n" +
      "# contrasenas; en cuanto la tengas alli, borra este fichero.",
    keys: [["ADMIN_PASSWORD", "Tu acceso como superadmin en /login/staff."]],
  },
];

// `SUPABASE_KEY` era el nombre que traian ENV.txt y Supabase_Key.env: es la
// contrasena de la base de datos, no una clave de API. Se renombra a algo que
// diga lo que es, porque `SUPABASE_KEY` invita a pegarla donde no va.
if (values.has("SUPABASE_KEY") && !values.has("SUPABASE_DB_PASSWORD")) {
  values.set("SUPABASE_DB_PASSWORD", values.get("SUPABASE_KEY"));
}

const escritos = [];
const ausentes = [];

for (const group of PLAN) {
  const lines = [
    "# " + "=".repeat(74),
    `# ${group.title}`,
    "# " + "=".repeat(74),
    `# ${group.note}`,
    "#",
    "# (c) 2026 Roberto Mendizabal. Fichero ignorado por git Y por Vercel.",
    "",
  ];

  let any = false;
  for (const [key, desc] of group.keys) {
    const value = values.get(key);
    if (value === undefined) {
      ausentes.push(`${key} (iria en ${group.file})`);
      continue;
    }
    lines.push(`# ${desc}`);
    lines.push(`${key}=${value}`);
    lines.push("");
    any = true;
  }

  if (any) {
    writeFileSync(join(dir, group.file), lines.join("\n"), "utf8");
    escritos.push(group.file);
  }
}

// Los antiguos, ya repartidos.
for (const viejo of ["edge-secrets.env", "ENV.txt", "Supabase_Key.env"]) {
  const p = join(dir, viejo);
  if (existsSync(p) && !escritos.includes(viejo)) {
    unlinkSync(p);
    console.log(`  eliminado (ya repartido): ${viejo}`);
  }
}

console.log("\nFicheros escritos:");
for (const f of escritos) {
  const text = readFileSync(join(dir, f), "utf8");
  const keys = text
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => `${l.split("=")[0]} <${l.slice(l.indexOf("=") + 1).length} car>`);
  console.log(`  ${f}: ${keys.join(", ")}`);
}
if (ausentes.length > 0) {
  console.log("\nNo encontrados (se omiten):");
  for (const a of ausentes) console.log(`  ${a}`);
}
