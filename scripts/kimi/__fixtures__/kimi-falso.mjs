#!/usr/bin/env node
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
// Un `kimi` de mentira para probar el motor sin gastar cuota ni red.
//
// Habla el mismo protocolo que el de verdad -JSONL por stdout, con una linea
// `session.resume_hint`- y hace lo que le diga el guion de KIMI_FALSO_GUION,
// una accion por ronda. Asi se puede provocar a voluntad lo unico que importa
// del motor: que rechace lo que tiene que rechazar.
//
// Acciones del guion (array JSON, una entrada por llamada):
//   { "escribir": { "ruta": "contenido" }, "borrar": ["ruta"],
//     "commit": true, "texto": "lo que responde" }

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const guion = JSON.parse(readFileSync(process.env.KIMI_FALSO_GUION, 'utf8'));
const contador = process.env.KIMI_FALSO_CONTADOR;
const n = existsSync(contador) ? Number(readFileSync(contador, 'utf8')) : 0;
writeFileSync(contador, String(n + 1));

const paso = guion[Math.min(n, guion.length - 1)] || {};

for (const [ruta, contenido] of Object.entries(paso.escribir || {})) {
  mkdirSync(dirname(join(process.cwd(), ruta)), { recursive: true });
  writeFileSync(join(process.cwd(), ruta), contenido);
}
for (const ruta of paso.borrar || []) {
  rmSync(join(process.cwd(), ruta), { force: true, recursive: true });
}
if (paso.commit) {
  spawnSync('git', ['add', '-A'], { cwd: process.cwd() });
  spawnSync('git', ['commit', '-q', '-m', 'el agente commiteo por su cuenta'], { cwd: process.cwd() });
}

const linea = (o) => process.stdout.write(JSON.stringify(o) + '\n');
linea({ role: 'meta', type: 'system.version', version: '0.0.0-falso' });
linea({ role: 'assistant', content: paso.texto || `ronda ${n + 1} hecha` });
linea({
  role: 'meta',
  type: 'session.resume_hint',
  session_id: 'session_falsa',
  command: 'kimi -r session_falsa',
});
