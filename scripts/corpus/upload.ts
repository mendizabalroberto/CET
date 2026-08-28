/**
 * Sube los ficheros originales de Y6A al bucket privado `source-material`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El corpus guarda lo que PONE en cada documento; esto guarda el documento. Se
 * necesita sobre todo en el carril de visión: allí un span no es una copia sino
 * la interpretación que alguien hizo de una imagen, y sin el original al lado la
 * cadena de auditoría termina en "confía en quien transcribió".
 *
 * Usa la CLAVE DE SERVICIO, que salta la RLS. Es correcto —subir material del
 * colegio no lo hace ningún usuario— y por eso este módulo no hace nada más:
 * sube, y escribe la ruta. No lee datos de alumnos, no borra, no firma URLs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

export const BUCKET = "source-material";

/**
 * La clave de servicio, de `secrets/deploy.env`. Nunca se imprime, ni entera ni
 * en trozos: un fragmento en un log es un fragmento menos que adivinar.
 */
export function serviceRoleKey(repoRoot: string): string {
  /* eslint-disable-next-line no-restricted-properties */
  const delEntorno = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (delEntorno) return delEntorno.trim();
  const raw = readFileSync(join(repoRoot, "secrets", "deploy.env"), "utf8");
  const m = /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(\S+)/.exec(raw);
  if (!m?.[1]) {
    throw new Error("No se encontró SUPABASE_SERVICE_ROLE_KEY en secrets/deploy.env");
  }
  return m[1];
}

/**
 * Convierte la ruta del repositorio en una clave de bucket.
 *
 * Los nombres de Y6A traen espacios, tildes y —en las 19 páginas de ICT—
 * mojibake real en el disco (`im├ígenes`, con los codepoints U+251C U+00ED
 * dentro del propio nombre de fichero). Meter eso tal cual en una URL de
 * Storage es pedir que algo se rompa en el punto menos visible, así que la
 * clave se restringe a caracteres seguros.
 *
 * La ruta ORIGINAL no se pierde: sigue en `source_documents.path`, que es la
 * que se cita. Esta es solo la direccion del fichero.
 */
export function claveDeBucket(path: string): string {
  return path
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\/-|-\//g, "/");
}

const MIME_POR_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export interface Subida {
  path: string;
  clave: string;
  bytes: number;
  yaEstaba: boolean;
}

/**
 * Sube un fichero al bucket. `x-upsert` para que reintentar no falle: subir dos
 * veces el mismo fichero tiene que ser inofensivo, o nadie se atreve a repetir
 * un lote que se cortó a la mitad.
 */
async function subir(
  projectRef: string,
  key: string,
  clave: string,
  bytes: Buffer,
  mime: string,
): Promise<void> {
  const url = `https://${projectRef}.supabase.co/storage/v1/object/${BUCKET}/${clave
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      // Las dos, y no es redundante. Con las claves nuevas de Supabase
      // (`sb_secret_...`, que no son JWT) Storage rechaza la peticion con
      // "Invalid Compact JWS" si solo se manda `Authorization`: espera tambien
      // `apikey`. Con las claves antiguas bastaba una, y por eso este fallo
      // parece un problema de permisos cuando es de cabeceras.
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    // El cuerpo del error de Storage es corto y dice el motivo real; la clave
    // no aparece en él.
    throw new Error(`Storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export async function subirOriginales(
  client: pg.Client,
  repoRoot: string,
  projectRef: string,
  opciones: { soloSinSubir: boolean },
): Promise<Subida[]> {
  const key = serviceRoleKey(repoRoot);

  const { rows } = await client.query<{ id: string; path: string; storage_path: string | null }>(
    opciones.soloSinSubir
      ? `select id, path, storage_path from public.source_documents
          where storage_path is null order by path`
      : `select id, path, storage_path from public.source_documents order by path`,
  );

  const hechas: Subida[] = [];
  for (const doc of rows) {
    const clave = claveDeBucket(doc.path);
    const ext = doc.path.slice(doc.path.lastIndexOf(".")).toLowerCase();
    const bytes = readFileSync(join(repoRoot, doc.path));

    await subir(projectRef, key, clave, bytes, MIME_POR_EXT[ext] ?? "application/octet-stream");
    await client.query(`update public.source_documents set storage_path = $2 where id = $1`, [
      doc.id,
      clave,
    ]);

    hechas.push({
      path: doc.path,
      clave,
      bytes: bytes.length,
      yaEstaba: doc.storage_path !== null,
    });
  }
  return hechas;
}
