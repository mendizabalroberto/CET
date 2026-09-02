#!/usr/bin/env node
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
// Motor de contratos Kimi. Hermano de scripts/deepseek/run-contract.mjs:
// mismo formato de contrato, mismos invariantes, otro modo de trabajo.
//
// La diferencia: DeepSeek devuelve un diff que aquel motor aplica; Kimi es un
// agente de terminal que edita el arbol el mismo. Aqui no hay `git apply` ni
// cabeceras @@ mal contadas -el fallo que se comio 9 de 9 rondas del primer
// lote-, pero a cambio el territorio hay que guardarlo DESPUES, sobre lo que
// el agente dejo escrito, y revertirlo entero cuando se sale.
//
// Node 22+, cero dependencias.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
// KIMI_REPO existe para las pruebas: el motor tiene que poder correr contra un
// repositorio de mentira sin tocar este. En uso normal no se define.
const REPO = process.env.KIMI_REPO ? resolve(process.env.KIMI_REPO) : resolve(AQUI, '..', '..');
const WORKTREES = resolve(REPO, '..', '.cet-worktrees');
const AGENTE_PARCHE = join(AQUI, 'agente-contratos.md');
const AGENTE_INFORME = join(AQUI, 'agente-informe.md');

// Alias cortos -> el nombre que Kimi tiene en ~/.kimi-code/config.toml.
// `rapido` va 6x mas veloz y gasta 3x cuota: no es el modelo por defecto de
// nada, es el que se elige cuando el reloj manda.
const MODELOS = {
  codigo: 'kimi-code/kimi-for-coding',
  rapido: 'kimi-code/kimi-for-coding-highspeed',
  k3: 'kimi-code/k3-256k',
  'k3-1m': 'kimi-code/k3',
};

function fatal(msg) {
  console.error(`\n  x ${msg}\n`);
  process.exit(2);
}

// -- el binario --------------------------------------------------------------
// En Windows `kimi` es un .cmd, y Node se niega a lanzarlo sin shell desde la
// 18.20. Meter un encargo de varios parrafos por cmd.exe es pedir que una
// comilla lo rompa, asi que se llama al .mjs con el mismo node que corre esto.
function entradaKimi() {
  if (process.env.KIMI_ENTRY) return process.env.KIMI_ENTRY;
  const r = spawnSync('npm', ['root', '-g'], { shell: true, encoding: 'utf8' });
  const raiz = (r.stdout || '').trim().split(/\r?\n/).pop();
  if (raiz) {
    const p = join(raiz, '@moonshot-ai', 'kimi-code', 'dist', 'main.mjs');
    if (existsSync(p)) return p;
  }
  fatal(
    'No encuentro kimi-code. Instalalo con `npm install -g @moonshot-ai/kimi-code`\n' +
      '    o apunta KIMI_ENTRY al dist/main.mjs.',
  );
}

// -- el contrato -------------------------------------------------------------
// Mismo parser que el motor DeepSeek: un contrato vale para los dos motores.
function parseContract(path) {
  if (!existsSync(path)) fatal(`No existe el contrato ${path}`);
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) fatal(`${path}: falta la cabecera YAML delimitada por ---.`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    const t = v.trim();
    meta[k] = t.startsWith('[')
      ? t
          .slice(1, t.lastIndexOf(']'))
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      : t.replace(/^["']|["']$/g, '');
  }
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  if (!meta.id) fatal(`${path}: falta id.`);
  const alias = (meta.model || 'codigo').trim();
  const c = {
    id: meta.id,
    modelo: alias.includes('/') ? alias : MODELOS[alias] || MODELOS.codigo,
    alias: alias.includes('/') ? alias : MODELOS[alias] ? alias : 'codigo',
    territory: list(meta.territory),
    forbidden: list(meta.forbidden),
    context: list(meta.context),
    verify: meta.verify || '',
    setup: meta.setup || 'pnpm install --prefer-offline --frozen-lockfile',
    rounds: Number(meta.rounds || 3),
    // Un agente de terminal no tiene tope de tokens que lo corte: el tope es
    // el reloj. Sin esto una ronda perdida se queda colgada para siempre.
    timeout: Number(meta.timeout || 1200),
    deadline: meta.deadline || '',
    body: m[2].trim(),
    path,
  };
  if (!c.deadline) fatal(`${c.id}: contrato sin deadline. No se lanza.`);
  if (c.territory.length && !c.verify) fatal(`${c.id}: contrato con territorio pero sin verify.`);
  return c;
}

// -- globs -------------------------------------------------------------------
function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*') {
      if (g[i + 1] === '*') {
        i += 1;
        if (g[i + 1] === '/') {
          i += 1;
          re += '(?:[^/]+/)*'; // **/ - cero o mas directorios
        } else {
          re += '.*'; // ** - lo que sea, barras incluidas
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (/[.+^$(){}|[\]\\]/.test(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}
const matchesAny = (p, globs) => globs.some((g) => globToRe(g).test(p));

// -- ejecutar ----------------------------------------------------------------
function run(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// -- la llamada al agente ----------------------------------------------------
// stdout trae JSONL limpio; el pensamiento y el aviso de sesion van por stderr.
// Del JSONL solo interesan dos cosas: lo que dijo y el id con el que se vuelve.
let LLAMADAS = 0;
function pedir(entry, { prompt, cwd, modelo, sesion, agente, timeout }) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '-m', modelo];
  // --agent-file y --session son excluyentes: el perfil se fija al abrir la
  // sesion y las rondas siguientes ya lo llevan dentro.
  if (sesion) args.push('-S', sesion);
  else if (agente) args.push('--agent-file', agente);
  // Ojo: --plan y --yolo NO se combinan con -p (el CLI sale con error). En
  // modo prompt la unica correa es la del perfil de agente, y el guardia de
  // verdad -abajo- es del motor.

  LLAMADAS += 1;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [entry, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeout * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const segs = ((Date.now() - t0) / 1000).toFixed(0);

  if (r.error && r.error.code === 'ETIMEDOUT') {
    return { texto: '', sesion, expirado: true, segs };
  }
  const textos = [];
  let id = sesion || null;
  for (const linea of (r.stdout || '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    let j;
    try {
      j = JSON.parse(linea);
    } catch {
      continue;
    }
    if (j.role === 'assistant' && typeof j.content === 'string' && j.content.trim()) {
      textos.push(j.content.trim());
    }
    if (j.type === 'session.resume_hint' && j.session_id) id = j.session_id;
  }
  // Si el JSONL no trajo nada, el motivo esta en stderr y hay que verlo, no
  // adivinarlo: un contrato que muere en silencio es peor que uno en rojo.
  if (!textos.length) {
    const err = (r.stderr || '').trim().slice(-1500);
    console.log(`    ! el agente no devolvio respuesta. stderr:\n${err.replace(/^/gm, '      ')}`);
  }
  console.log(`    kimi ${modelo}  ${segs}s  llamadas=${LLAMADAS}`);
  return { texto: textos.join('\n\n'), sesion: id, expirado: false, segs };
}

// -- el arbol aislado --------------------------------------------------------
function makeWorktree(id) {
  mkdirSync(WORKTREES, { recursive: true });
  const path = join(WORKTREES, id.replace(/[^\w.-]/g, '_'));
  const branch = `kimi/${id}`;
  if (existsSync(path)) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', path], { cwd: REPO, stdio: 'ignore' });
    } catch {
      rmSync(path, { recursive: true, force: true });
    }
  }
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: REPO, stdio: 'ignore' });
  } catch {
    /* nada que podar */
  }
  try {
    execFileSync('git', ['branch', '-D', branch], { cwd: REPO, stdio: 'ignore' });
  } catch {
    /* la rama no existia */
  }
  execFileSync('git', ['worktree', 'add', '-b', branch, path, 'HEAD'], { cwd: REPO, stdio: 'inherit' });
  return { path, branch };
}

// -- que toco ----------------------------------------------------------------
// `git status --porcelain -uall` con -z: sin -z, una ruta con espacios sale
// entrecomillada y con escapes, y el guardia de territorio la lee mal.
function tocados(wt) {
  const r = spawnSync('git', ['status', '--porcelain', '-uall', '-z'], {
    cwd: wt,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const campos = (r.stdout || '').split('\0');
  const out = new Set();
  for (let i = 0; i < campos.length; i++) {
    const e = campos[i];
    if (!e) continue;
    const estado = e.slice(0, 2);
    const ruta = e.slice(3);
    if (!ruta) continue;
    // Un renombrado gasta dos campos: el nuevo aqui, el viejo en el siguiente.
    if (estado.includes('R') || estado.includes('C')) {
      out.add(ruta);
      i += 1;
      if (campos[i]) out.add(campos[i]);
      continue;
    }
    out.add(ruta);
  }
  return [...out];
}

// El agente tiene Bash: nada le impide hacer commit aunque se le diga que no.
// Si lo hace, `git status` sale limpio y el trabajo se daria por vacio. Se
// deshace el commit dejando los cambios en el arbol, que es donde los medimos.
function deshacerCommits(wt, base) {
  const head = run('git rev-parse HEAD', wt).out.trim();
  if (head && head !== base) {
    console.log('    ! el agente hizo commit; se deshace dejando los cambios en el arbol');
    run(`git reset --mixed ${base}`, wt);
    return true;
  }
  return false;
}

function limpiar(wt, salvo = []) {
  run('git reset -q', wt);
  run('git checkout -- .', wt);
  const exc = salvo.map((f) => `-e "${f}"`).join(' ');
  run(`git clean -fdq ${exc}`, wt);
}

// -- el encargo, en palabras -------------------------------------------------
function promptParche(c) {
  const ctx = c.context.length
    ? `\n## Por donde empezar\nMira primero: ${c.context.join(', ')}. No es una lista cerrada: lee lo que necesites.\n`
    : '';
  return (
    `${c.body}\n\n` +
    `## Territorio\n` +
    `Solo puedes crear o modificar: ${c.territory.join(', ')}\n` +
    (c.forbidden.length ? `Prohibido tocar: ${c.forbidden.join(', ')}\n` : '') +
    `Cualquier otro fichero que toques invalida la ronda ENTERA, tambien la parte buena.\n` +
    ctx +
    `\n## Se verifica con\n\`${c.verify}\`\n` +
    `Decide el codigo de salida, no lo que imprima. Ejecutalo tu mismo antes de terminar.\n\n` +
    `## El arbol\nEstas en un worktree aislado en una rama propia. No hagas commit, ni push, ni ` +
    `cambies de rama: deja los cambios en el arbol de trabajo y no dejes ficheros temporales.\n`
  );
}

// -- un contrato -------------------------------------------------------------
function ejecutar(c, entry) {
  const t0 = Date.now();
  console.log(
    `\n> ${c.id}  [${c.alias} = ${c.modelo}]  rondas=${c.rounds}  tope=${c.timeout}s  plazo=${c.deadline}`,
  );

  // Solo informe: sin worktree, sin escritura, sobre el repo tal cual esta.
  if (!c.territory.length) {
    const ctx = c.context.length ? `\n\n## Por donde empezar\nMira primero: ${c.context.join(', ')}.` : '';
    // Un informe corre sobre el repositorio de verdad, que casi nunca esta
    // limpio. Se fotografia antes y despues: si el agente escribio algo, se
    // dice y se para, pero NO se revierte nada -aqui dentro hay trabajo del
    // humano y no es del motor decidir que sobra.
    const antes = JSON.stringify(tocados(REPO));
    const r = pedir(entry, {
      prompt: `${c.body}${ctx}`,
      cwd: REPO,
      modelo: c.modelo,
      agente: AGENTE_INFORME,
      timeout: c.timeout,
    });
    const despues = JSON.stringify(tocados(REPO));
    if (antes !== despues) {
      fatal(
        `${c.id}: un contrato de informe NO puede tocar el arbol, y lo toco.
` +
          `    Antes:   ${antes}
    Despues: ${despues}
` +
          `    No se revierte nada automaticamente: revisalo tu.`,
      );
    }
    if (r.expirado) fatal(`${c.id}: el informe agoto el tope de ${c.timeout}s.`);
    if (!r.texto.trim()) fatal(`${c.id}: el agente no devolvio informe.`);
    escribirResultado(c, { kind: 'informe', rounds: 1, body: r.texto, ms: Date.now() - t0 });
    console.log(`  ok informe escrito en contracts/${c.id}.result.md`);
    return { id: c.id, ok: true, kind: 'informe' };
  }

  const { path: wt, branch } = makeWorktree(c.id);
  const base = run('git rev-parse HEAD', wt).out.trim();

  // Sin node_modules toda verificacion sale roja por el motivo equivocado.
  if (c.setup && c.setup !== 'ninguno') {
    console.log(`  preparando el arbol: ${c.setup}`);
    const s = run(c.setup, wt);
    if (s.code !== 0) fatal(`${c.id}: el setup fallo (codigo ${s.code}):\n${s.out.slice(-2000)}`);
  }

  let sesion = null;
  let prompt = promptParche(c);
  let ultimaSalida = '';

  for (let ronda = 1; ronda <= c.rounds; ronda++) {
    console.log(`  ronda ${ronda}/${c.rounds}`);
    const r = pedir(entry, {
      prompt,
      cwd: wt,
      modelo: c.modelo,
      sesion,
      agente: sesion ? null : AGENTE_PARCHE,
      timeout: c.timeout,
    });
    sesion = r.sesion;
    if (r.expirado) {
      console.log(`    x la ronda agoto el tope de ${c.timeout}s; se revierte`);
      limpiar(wt);
      // Sin sesion no hay a quien darle la replica: se corta y queda la rama.
      if (!sesion) break;
      prompt = `Te quedaste sin tiempo (tope ${c.timeout}s) y se revirtio todo. Ve directo al cambio minimo que pone en verde \`${c.verify}\`, sin explorar de mas.`;
      continue;
    }

    deshacerCommits(wt, base);
    const files = tocados(wt).filter((f) => !f.startsWith('.kimi.'));

    if (!files.length) {
      console.log('    x el agente no dejo ningun cambio en el arbol');
      if (!sesion) break;
      prompt = `No dejaste ningun cambio en el arbol de trabajo. Si lo hiciste y luego lo revertiste, vuelve a dejarlo escrito en los ficheros. Territorio: ${c.territory.join(', ')}.`;
      continue;
    }

    // -- el guardia de territorio, DESPUES del hecho -------------------------
    const fuera = files.filter((f) => !matchesAny(f, c.territory));
    const vetados = files.filter((f) => matchesAny(f, c.forbidden));
    if (fuera.length || vetados.length) {
      const motivo =
        (fuera.length ? `Fuera del territorio: ${fuera.join(', ')}. ` : '') +
        (vetados.length ? `Prohibidos: ${vetados.join(', ')}. ` : '');
      console.log(`    x territorio: ${motivo}se revierte la ronda entera`);
      limpiar(wt);
      if (!sesion) break;
      prompt =
        `Tu trabajo fue RECHAZADO y REVERTIDO ENTERO, tambien la parte buena. ${motivo}` +
        `El territorio es: ${c.territory.join(', ')}. Rehazlo tocando solo eso.`;
      continue;
    }

    // -- verificacion por codigo de salida -----------------------------------
    const v = run(c.verify, wt);
    ultimaSalida = v.out;
    if (v.code !== 0) {
      console.log(`    x verificacion roja (codigo ${v.code})`);
      limpiar(wt);
      if (!sesion) break;
      prompt =
        `La verificacion salio ROJA (codigo de salida ${v.code}) y tu trabajo se revirtio; el arbol ` +
        `esta como al principio. Salida literal:\n\n${v.out.slice(-6000)}\n\nVuelve a hacerlo, entero.`;
      continue;
    }

    // -- contraprueba por mutacion: «verifica el verificador» -----------------
    // Un verde no vale por ser verde. Se revierte lo que NO es test y se vuelve
    // a verificar: si sigue verde, los tests no protegen nada.
    run('git add -A', wt);
    const patch = run('git diff --cached', wt).out;
    writeFileSync(join(wt, '.kimi.verde.patch'), patch);
    const esTest = (f) => /(^|\/)__tests__\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
    const codigo = files.filter((f) => !esTest(f));
    for (const f of codigo) {
      // `git checkout HEAD -- fichero-nuevo` falla en silencio: no existe en
      // HEAD. Sin este else, un entregable nuevo nunca se revierte y el falso
      // verde pasa.
      const existiaEnHead = run(`git cat-file -e HEAD:"${f}"`, wt).code === 0;
      if (existiaEnHead) run(`git checkout HEAD -- "${f}"`, wt);
      else rmSync(join(wt, f), { force: true });
    }
    const mut = run(c.verify, wt);
    run('git reset --hard HEAD', wt);
    run('git clean -fdq -e .kimi.verde.patch', wt);
    const restaurado = run('git apply --whitespace=nowarn ".kimi.verde.patch"', wt);
    if (restaurado.code !== 0) {
      fatal(
        `${c.id}: la contraprueba no se pudo deshacer (git apply salio ${restaurado.code}).\n` +
          `El arbol de ${wt} quedo sin el trabajo verde. No se consolida nada a medias.\n` +
          restaurado.out.slice(0, 2000),
      );
    }
    if (mut.code === 0) {
      console.log('    x FALSO VERDE: revertido el codigo, la verificacion sigue verde');
      rmSync(join(wt, '.kimi.verde.patch'), { force: true });
      limpiar(wt);
      if (!sesion) break;
      prompt =
        `Pusiste la verificacion en verde, pero es un FALSO VERDE y se ha rechazado.\n\n` +
        `Contraprueba: se revirtieron los ficheros que NO son de test ` +
        `(${codigo.join(', ') || 'ninguno: no tocaste codigo'}) dejando solo tus tests, y la ` +
        `verificacion SIGUIO EN VERDE. Tus tests pasan igual sin tu arreglo, luego no protegen ` +
        `el requisito del encargo.\n\nEscribe un test que FALLE contra el codigo original y solo ` +
        `pase con tu arreglo. Se ha revertido todo: rehazlo entero.`;
      continue;
    }
    console.log(
      `    contraprueba: revertido el codigo, la verificacion cae en rojo (${mut.code}). El verde vale.`,
    );
    rmSync(join(wt, '.kimi.verde.patch'), { force: true });
    run('git add -A', wt);
    run(`git commit -q -m "kimi(${c.id}): trabajo verificado en verde"`, wt);
    escribirResultado(c, {
      kind: 'verde',
      rounds: ronda,
      branch,
      diff: patch,
      verifyOut: v.out,
      resumen: r.texto,
      ms: Date.now() - t0,
    });
    console.log(`  ok verde en la ronda ${ronda}. Rama ${branch}. contracts/${c.id}.result.md`);
    return { id: c.id, ok: true, kind: 'verde', branch };
  }

  escribirResultado(c, { kind: 'rojo', rounds: c.rounds, branch, verifyOut: ultimaSalida, ms: Date.now() - t0 });
  console.log(`  x sin verde. Rama ${branch} queda para revisar.`);
  return { id: c.id, ok: false, kind: 'rojo', branch };
}

function escribirResultado(c, r) {
  const lines = [
    `# Resultado - ${c.id}`,
    '',
    `- Contrato: \`${relative(REPO, c.path).replace(/\\/g, '/')}\``,
    `- Motor: kimi-code CLI`,
    `- Modelo: ${c.modelo}`,
    `- Desenlace: **${r.kind}**`,
    `- Rondas consumidas: ${r.rounds} de ${c.rounds}`,
    r.branch ? `- Rama: \`${r.branch}\`` : '',
    `- Duracion: ${(r.ms / 1000).toFixed(1)} s`,
    '',
  ].filter(Boolean);
  if (r.body) lines.push(r.body);
  if (r.resumen) lines.push(`## Lo que dijo el agente\n\n${r.resumen}\n`);
  if (r.diff) lines.push(`## Diff\n\n~~~diff\n${r.diff}\n~~~\n`);
  if (r.verifyOut) lines.push(`## Salida final de \`${c.verify}\`\n\n~~~\n${r.verifyOut.slice(-8000)}\n~~~\n`);
  lines.push('\n> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.');
  mkdirSync(join(REPO, 'contracts'), { recursive: true });
  writeFileSync(join(REPO, 'contracts', `${c.id}.result.md`), lines.join('\n'));
}

// -- el lote -----------------------------------------------------------------
function assertDisjoint(cs) {
  const prefix = (g) => g.replace(/[*?].*$/, '');
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const [a, b] = [cs[i], cs[j]];
      const clash = [];
      for (const g of a.territory) {
        for (const h of b.territory) {
          const [pg, ph] = [prefix(g), prefix(h)];
          if (pg.startsWith(ph) || ph.startsWith(pg)) clash.push(`${g} <-> ${h}`);
        }
      }
      if (clash.length) fatal(`Lote rechazado entero: ${a.id} y ${b.id} se solapan en ${clash.join(', ')}.`);
    }
  }
}

// -- main --------------------------------------------------------------------
const args = process.argv.slice(2);
if (!args.length) fatal('Uso: node scripts/kimi/run-contract.mjs <contrato.md> | --batch c1.md c2.md ...');
const batch = args[0] === '--batch';
const files = (batch ? args.slice(1) : args).map((f) => resolve(REPO, f));
if (!files.length) fatal('--batch sin contratos.');
const contracts = files.map(parseContract);
if (batch) {
  assertDisjoint(contracts);
  // El lote va EN SERIE: spawnSync bloquea. La cuota daria 30 peticiones
  // simultaneas, pero cada contrato son decenas de peticiones internas y el
  // limite util es el arbol, no la API. El tope de 4 es para el reloj.
  if (contracts.length > 4) fatal(`Lote de ${contracts.length}: son demasiados a la vez. Maximo 4.`);
  console.log(`Lote de ${contracts.length}: territorios disjuntos, se lanzan en serie.`);
}

const entry = entradaKimi();
const results = contracts.map((c) => ejecutar(c, entry));

console.log('\n-- resumen --');
for (const r of results) console.log(`  ${r.ok ? 'ok' : 'x '} ${r.id}  ${r.kind}${r.branch ? `  ${r.branch}` : ''}`);
console.log(`  llamadas al agente: ${LLAMADAS} (cuota de suscripcion, no factura por token)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
