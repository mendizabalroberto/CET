#!/usr/bin/env node
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
// Extrae a fichero los textos que faltan por traducir, por materia y rango de
// lecciones. Existe para que un contrato lleve SOLO su territorio de texto y no
// el megabyte entero de los packs: el presupuesto de contexto es de 64K.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_REF = 'clcutoqjdgeggvgyreud';

function password() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const raw = readFileSync(join(root, 'secrets', 'database.env'), 'utf8');
  const m = /SUPABASE_DB_PASSWORD\s*=\s*(\S+)/.exec(raw);
  if (!m?.[1]) throw new Error('No se encontro SUPABASE_DB_PASSWORD en secrets/database.env');
  return m[1];
}

const LOTES = [
  { id: 'socials-a', materia: 'socials', desde: 1, hasta: 3 },
  { id: 'socials-b', materia: 'socials', desde: 4, hasta: 6 },
  // ict-a entero (52 bloques) trunca la respuesta en el techo de 8000 tokens de
  // salida: cinco rondas seguidas salieron con salida=8000 exacta. Va por
  // lecciones sueltas.
  { id: 'ict-a1', materia: 'ict', desde: 1, hasta: 1 },
  { id: 'ict-a2', materia: 'ict', desde: 2, hasta: 2 },
  { id: 'ict-a3', materia: 'ict', desde: 3, hasta: 3 },
  { id: 'ict-b', materia: 'ict', desde: 4, hasta: 6 },
  { id: 'science', materia: 'science', desde: 1, hasta: 5 },
];

const SQL = `
select l.ord as leccion_ord,
       l.title->>'en' as leccion_titulo_en,
       (l.title ? 'es') as leccion_ya_es,
       b.ord as bloque_ord,
       b.kind,
       b.content->'html'->>'en' as html_en
from public.subjects s
join public.courses c on c.subject_id = s.id and c.school_id is null and c.year_level = 6
join public.course_modules m on m.course_id = c.id
join public.lessons l on l.module_id = m.id
join public.lesson_blocks b on b.lesson_id = l.id
where s.code = $1 and s.school_id is null
  and l.ord between $2 and $3
  and b.content ? 'html'
  and not (b.content->'html' ? 'es')
order by l.ord, b.ord`;

const client = new pg.Client({
  host: `aws-0-us-east-1.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${PROJECT_REF}`,
  password: password(),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
mkdirSync(join(root, 'contracts', 'fuentes'), { recursive: true });

for (const lote of LOTES) {
  const { rows } = await client.query(SQL, [lote.materia, lote.desde, lote.hasta]);
  const lecciones = new Map();
  for (const r of rows) {
    if (!lecciones.has(r.leccion_ord)) {
      lecciones.set(r.leccion_ord, {
        leccion_ord: r.leccion_ord,
        titulo_en: r.leccion_titulo_en,
        titulo_ya_traducido: r.leccion_ya_es,
        bloques: [],
      });
    }
    lecciones.get(r.leccion_ord).bloques.push({
      bloque_ord: r.bloque_ord,
      kind: r.kind,
      html_en: r.html_en,
    });
  }
  const salida = {
    materia: lote.materia,
    lecciones_desde: lote.desde,
    lecciones_hasta: lote.hasta,
    total_bloques: rows.length,
    total_caracteres: rows.reduce((n, r) => n + (r.html_en?.length ?? 0), 0),
    lecciones: [...lecciones.values()],
  };
  const ruta = join(root, 'contracts', 'fuentes', `${lote.id}.json`);
  writeFileSync(ruta, JSON.stringify(salida, null, 2));
  console.log(
    `${lote.id.padEnd(10)} ${String(salida.total_bloques).padStart(3)} bloques  ` +
      `${String(salida.total_caracteres).padStart(6)} caracteres  -> contracts/fuentes/${lote.id}.json`,
  );
}

await client.end();
