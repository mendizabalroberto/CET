/**
 * Conexión a Postgres para las herramientas de corpus.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * DOS VÍAS, y se prueban en ese orden:
 *
 *   1. Directa   db.<ref>.supabase.co:5432, usuario `postgres`.
 *   2. Pooler    aws-0-us-east-1.pooler.supabase.com:5432 (modo SESIÓN),
 *                usuario `postgres.<ref>`.
 *
 * La directa es la de `db-apply.mjs` y la que documenta Supabase, pero desde
 * agosto de 2026 **solo resuelve a IPv6**: en una red sin IPv6 no da un error
 * de autenticación, da un `ETIMEDOUT` a los 30 segundos que parece un problema
 * de credenciales y no lo es. Esta máquina es una de esas redes.
 *
 * El pooler en modo SESIÓN (puerto 5432, no 6543) admite DDL y transacciones
 * largas, así que sirve para todo lo que hacen estas herramientas. El de modo
 * transacción (6543) NO: ahí no se puede aplicar una migración.
 *
 * ATENCIÓN: se conecta como dueño de las tablas y por tanto **salta la RLS**.
 * Es correcto para una herramienta de mantenimiento —sembrar contenido global
 * no lo hace ningún usuario— pero significa que nada de lo que pase por aquí
 * está probando las políticas. Eso se prueba en `supabase/tests/`, con pgTAP y
 * cambiando de rol.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export const PROJECT_REF = "clcutoqjdgeggvgyreud";
export const POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";

function readPassword(repoRoot: string): string {
  // La regla `no-restricted-properties` sobre `process.env` protege al servidor
  // web, que debe leer su configuracion validada por Zod al arrancar. Esto es
  // una herramienta de linea de comandos que ni se despliega ni se importa
  // desde la app: PGPASSWORD es su via estandar, la misma que usa db-apply.mjs.
  /* eslint-disable-next-line no-restricted-properties */
  const fromEnv = process.env["PGPASSWORD"];
  if (fromEnv) return fromEnv;
  const raw = readFileSync(join(repoRoot, "secrets", "database.env"), "utf8");
  const match = /SUPABASE_DB_PASSWORD\s*=\s*(\S+)/.exec(raw);
  if (!match?.[1]) {
    throw new Error(
      "No se encontró SUPABASE_DB_PASSWORD en secrets/database.env (ni PGPASSWORD en el entorno)",
    );
  }
  return match[1];
}

interface Route {
  label: string;
  host: string;
  user: string;
}

const ROUTES: Route[] = [
  { label: "directa", host: `db.${PROJECT_REF}.supabase.co`, user: "postgres" },
  { label: "pooler", host: POOLER_HOST, user: `postgres.${PROJECT_REF}` },
];

export async function connect(repoRoot: string, quiet = false): Promise<pg.Client> {
  const password = readPassword(repoRoot);
  const problems: string[] = [];

  for (const route of ROUTES) {
    const client = new pg.Client({
      host: route.host,
      port: 5432,
      database: "postgres",
      user: route.user,
      password,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 120_000,
      // 8 s: lo justo para descartar una via muerta sin castigar a quien la
      // tiene viva. El fallo por defecto tarda 30 s y parece que se ha colgado.
      connectionTimeoutMillis: 8_000,
    });
    try {
      await client.connect();
      if (!quiet && route.label !== "directa") console.log(`  (conexion via ${route.label})`);
      return client;
    } catch (error) {
      problems.push(`${route.label}: ${error instanceof Error ? error.message : String(error)}`);
      await client.end().catch(() => undefined);
    }
  }
  throw new Error(`No se pudo conectar por ninguna via.\n  ${problems.join("\n  ")}`);
}

/** ¿Está aplicada la migración del corpus? Preguntarlo antes evita un error críptico. */
export async function corpusTablesExist(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query<{ n: string }>(
    `select count(*)::text as n from information_schema.tables
      where table_schema = 'public'
        and table_name in ('source_documents','source_spans','content_candidates','content_candidate_citations')`,
  );
  return rows[0]?.n === "4";
}
