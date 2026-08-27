#!/usr/bin/env node
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
// Motor de contratos DeepSeek. Ver HANDOFF-DEEPSEEK.md §3.
// Node 20+, fetch nativo, cero dependencias.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.deepseek.com/chat/completions';
const WORKTREES = resolve(REPO, '..', '.cet-worktrees');

// Precio por millon de tokens, USD. Estimacion impresa, no factura.
const PRICE = {
  'deepseek-chat': { in: 0.27, cachedIn: 0.07, out: 1.1 },
  'deepseek-reasoner': { in: 0.55, cachedIn: 0.14, out: 2.19 },
};

function fatal(msg) {
  console.error(`\n  x ${msg}\n`);
  process.exit(2);
}

// -- 0.1 - la clave se llama DEEP_SEEK_API, y el fallo debe ser claro --------
function apiKey() {
  if (process.env.DEEP_SEEK_API) return process.env.DEEP_SEEK_API.trim();
  const envFile = join(REPO, 'secrets', 'accounts.env');
  if (!existsSync(envFile)) {
    fatal('No hay clave: falta secrets/accounts.env y DEEP_SEEK_API no esta en el entorno.');
  }
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*DEEP_SEEK_API\s*=/.test(l));
  if (!line) fatal('secrets/accounts.env no define DEEP_SEEK_API (con guion bajo, no DEEPSEEK_API_KEY).');
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  if (!value) fatal('DEEP_SEEK_API esta definida pero vacia.');
  return value;
}

// -- el contrato -------------------------------------------------------------
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
  const c = {
    id: meta.id,
    model: meta.model === 'reasoner' ? 'deepseek-reasoner' : 'deepseek-chat',
    territory: list(meta.territory),
    forbidden: list(meta.forbidden),
    context: list(meta.context),
    verify: meta.verify || '',
    // Un worktree recien creado no tiene node_modules: sin esto, toda
    // verificacion sale roja por el motivo equivocado (regla 3).
    setup: meta.setup || 'pnpm install --prefer-offline --frozen-lockfile',
    rounds: Number(meta.rounds || 3),
    deadline: meta.deadline || '',
    body: m[2].trim(),
    path,
  };
  // El invariante «peticion sin plazo» del repositorio, aplicado tambien aqui.
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

// -- ficheros de contexto, recortados y numerados -----------------------------
const MAX_CONTEXT_LINES = 700;
function packContext(globs, root) {
  const out = [];
  const files = new Set();
  for (const g of globs) {
    if (/[*?]/.test(g)) {
      let listed = '';
      try {
        listed = execFileSync('git', ['ls-files', '--', g], { cwd: root, encoding: 'utf8' });
      } catch {
        /* sin coincidencias */
      }
      listed
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((f) => files.add(f));
    } else if (existsSync(join(root, g))) {
      files.add(g);
    } else {
      console.warn(`  ! contexto inexistente, se ignora: ${g}`);
    }
  }
  for (const f of files) {
    const lines = readFileSync(join(root, f), 'utf8').split(/\r?\n/);
    const shown = lines.slice(0, MAX_CONTEXT_LINES);
    const body = shown.map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join('\n');
    const trunc =
      lines.length > MAX_CONTEXT_LINES
        ? `\n  ... (${lines.length - MAX_CONTEXT_LINES} lineas mas, recortadas)`
        : '';
    out.push(`### ${f}\n~~~\n${body}${trunc}\n~~~`);
  }
  return out.join('\n\n');
}

// -- §6 - el prompt de sistema: las reglas del proyecto, textuales ------------
const RULES = `REGLAS DEL PROYECTO - no genericas, se aprendieron fallando:

1. Verifica ejecutando. Salida literal. Nunca "deberia funcionar".
2. Un dato plausible no es un dato correcto.
3. Un test verde puede estar pasando por el motivo equivocado. Ocurrio siete
   veces en un solo dia: un data-testid inexistente, un if que nunca se cumple,
   una asercion que compara un valor consigo mismo.
4. Nunca debilites una defensa para que un test pase. Un test rojo se arregla
   arreglando el codigo; si vas a tocar el test, demuestra primero que el
   requisito se conserva.
5. Muta lo minimo. La mutacion que elijas decide lo que demuestras: borrar dos
   canales a la vez pone rojo un test que no protege ninguno por separado.

Hay 17 invariantes en el repositorio que cazan familias de fallos. Uno cazo una
violacion nueva de otro agente cinco horas despues de escribirse. No estan para
sortearlos.`;

const SYSTEM_PATCH = `Eres un agente de ingenieria dentro de un monorepo pnpm/turbo
(Next.js + TypeScript + vitest). Comentarios y mensajes en espanol; el codigo
sigue el estilo del fichero que tocas.

${RULES}

FORMATO DE RESPUESTA - obligatorio:
Responde UNICAMENTE con un diff unificado aplicable por \`git apply\`, dentro de
un unico bloque cercado con tres tildes invertidas y la etiqueta diff. Nada de
prosa fuera del bloque. Nada de fragmentos sueltos.
Rutas relativas a la raiz del repositorio, con los prefijos a/ y b/.
Para un fichero nuevo: linea "diff --git a/RUTA b/RUTA", luego
"new file mode 100644", luego "--- /dev/null" y "+++ b/RUTA".
Cuenta bien las lineas de cada cabecera @@.
NO modifiques ningun fichero que no se te haya mostrado entero mas abajo: si lo
necesitas, dilo en un comentario del codigo y resuelvelo dentro de los que si
tienes. Un hunk contra un fichero que no has visto no aplica nunca.`;

const SYSTEM_REPORT = `Eres un agente de diagnostico sobre un monorepo pnpm/turbo
(Next.js + TypeScript + vitest). Escribes en espanol.

${RULES}

Este encargo NO lleva parche: solo informe. No propongas un diff. Entrega:
hipotesis ordenadas por probabilidad, la evidencia que sostiene cada una, el
experimento concreto que la confirmaria o la descartaria, y que quedaria sin
explicar si la hipotesis principal fuese falsa.`;

// -- la llamada --------------------------------------------------------------
let TOTAL_USD = 0;
// `reasoner` puede gastar el tope entero razonando y devolver contenido VACIO.
// Cuando pasa, `ask` devuelve su cadena de razonamiento y levanta esta bandera:
// el pensamiento ya esta pagado, lo que falta es redactarlo.
let ULTIMA_FUE_RAZONAMIENTO = false;
async function ask(key, model, messages, temp = 0) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    // `reasoner` gasta el tope en su cadena de razonamiento antes de escribir
    // nada: con 8000 devolvio un informe VACIO, no un informe corto. Necesita
    // sitio para pensar y para responder.
    body: JSON.stringify({
      model,
      messages,
      temperature: temp,
      max_tokens: model === 'deepseek-reasoner' ? 32000 : 8000,
    }),
  });
  if (!res.ok) fatal(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const u = json.usage || {};
  const p = PRICE[model] || PRICE['deepseek-chat'];
  const hit = u.prompt_cache_hit_tokens ?? 0;
  const miss = u.prompt_cache_miss_tokens ?? (u.prompt_tokens ?? 0) - hit;
  const usd = (miss / 1e6) * p.in + (hit / 1e6) * p.cachedIn + ((u.completion_tokens ?? 0) / 1e6) * p.out;
  TOTAL_USD += usd;
  console.log(
    `    ${model}  entrada ${u.prompt_tokens ?? '?'} (cache ${hit})  salida ${u.completion_tokens ?? '?'}  ~ $${usd.toFixed(4)}  acumulado $${TOTAL_USD.toFixed(4)}`,
  );
  ULTIMA_FUE_RAZONAMIENTO = false;
  const msg = json.choices?.[0]?.message ?? {};
  const content = (msg.content ?? '').trim();
  if (!content) {
    const razon = json.choices?.[0]?.finish_reason ?? 'sin motivo';
    console.log(`    ! respuesta vacia (finish_reason=${razon})`);
    // Mejor la cadena de razonamiento que nada: deja ver que penso antes de
    // quedarse sin sitio, en vez de escribir un fichero en blanco.
    ULTIMA_FUE_RAZONAMIENTO = true;
    return (msg.reasoning_content ?? '').trim();
  }
  return content;
}

function extractDiff(text) {
  const fenced = text.match(/```(?:diff|patch)?\r?\n([\s\S]*?)```/);
  let d = (fenced ? fenced[1] : text).replace(/\r\n/g, '\n');
  const start = d.search(/^(diff --git |--- )/m);
  if (start > 0) d = d.slice(start);
  return d.endsWith('\n') ? d : d + '\n';
}

// -- §3.5 - la guarda de territorio: vive en el motor, no en el prompt --------
function guardTerritory(diff, c) {
  const paths = [];
  for (const line of diff.split('\n')) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      paths.push(m[1], m[2]);
      continue;
    }
    const m2 = line.match(/^(?:---|\+\+\+) [ab]\/(.+?)(?:\t.*)?$/);
    if (m2) paths.push(m2[1]);
  }
  const touched = [...new Set(paths.filter((p) => p !== 'dev/null'))];
  if (!touched.length) return { ok: false, reason: 'el parche no nombra ningun fichero' };
  const outside = touched.filter((p) => !matchesAny(p, c.territory));
  const banned = touched.filter((p) => matchesAny(p, c.forbidden));
  if (outside.length || banned.length) {
    return {
      ok: false,
      reason:
        'parche rechazado entero. ' +
        (outside.length ? `Fuera del territorio: ${outside.join(', ')}. ` : '') +
        (banned.length ? `Prohibidos: ${banned.join(', ')}. ` : '') +
        `El territorio es: ${c.territory.join(', ')}.`,
    };
  }
  return { ok: true, touched };
}

// -- el arbol aislado --------------------------------------------------------
function makeWorktree(id) {
  mkdirSync(WORKTREES, { recursive: true });
  const path = join(WORKTREES, id.replace(/[^\w.-]/g, '_'));
  const branch = `deepseek/${id}`;
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

function run(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// -- un contrato -------------------------------------------------------------
async function execute(c, key) {
  const t0 = Date.now();
  console.log(`\n> ${c.id}  [${c.model}]  rondas=${c.rounds}  plazo=${c.deadline}`);

  // Solo informe: sin worktree, sin parche.
  if (!c.territory.length) {
    const ctx = packContext(c.context, REPO);
    let answer = await ask(key, c.model, [
      { role: 'system', content: SYSTEM_REPORT },
      { role: 'user', content: `${c.body}\n\n## Ficheros de contexto\n\n${ctx}` },
    ]);
    let rondas = 1;

    // Si solo tenemos su cadena de razonamiento, el analisis esta hecho y
    // pagado: lo que falta es redactarlo. Una segunda pasada barata con `chat`
    // en vez de volver a pensarlo todo con `reasoner`.
    if (ULTIMA_FUE_RAZONAMIENTO && answer) {
      console.log('    redactando el informe a partir del razonamiento ya pagado');
      answer = await ask(
        key,
        'deepseek-chat',
        [
          { role: 'system', content: SYSTEM_REPORT },
          {
            role: 'user',
            content:
              `${c.body}\n\n## Ficheros de contexto\n\n${ctx}\n\n` +
              `## Razonamiento previo, sin terminar\n\nOtro agente analizo esto y se quedo sin ` +
              `espacio antes de redactar. Su cadena de razonamiento va abajo. Redacta TU el ` +
              `informe final con la forma que pide el apartado 3 del encargo, apoyandote en ese ` +
              `analisis pero sin dar por bueno nada que no sostenga la evidencia. Si el ` +
              `razonamiento deja algo a medias, dilo en vez de rellenarlo.\n\n${answer}`,
          },
        ],
        0.2,
      );
      rondas = 2;
    }

    writeResult(c, { kind: 'informe', rounds: rondas, body: answer, ms: Date.now() - t0 });
    console.log(`  ok informe escrito en contracts/${c.id}.result.md`);
    return { id: c.id, ok: true, kind: 'informe' };
  }

  const { path: wt, branch } = makeWorktree(c.id);

  // La verificacion tiene que poder salir verde por el motivo correcto: si el
  // arbol no esta instalado, el rojo no dice nada del parche.
  if (c.setup && c.setup !== 'ninguno') {
    console.log(`  preparando el arbol: ${c.setup}`);
    const s = run(c.setup, wt);
    if (s.code !== 0) fatal(`${c.id}: el setup fallo (codigo ${s.code}):\n${s.out.slice(-2000)}`);
  }

  const ctx = packContext(c.context, wt);
  const messages = [
    { role: 'system', content: SYSTEM_PATCH },
    {
      role: 'user',
      content:
        `${c.body}\n\n` +
        `## Territorio\nSolo puedes tocar: ${c.territory.join(', ')}\n` +
        (c.forbidden.length ? `Prohibido tocar: ${c.forbidden.join(', ')}\n` : '') +
        'Un parche que toque cualquier otra cosa se rechaza entero y pierdes la ronda.\n\n' +
        `## Se verifica con\n\`${c.verify}\`  - vale el codigo de salida, no lo que imprima.\n\n` +
        `## Ficheros (numerados por linea; los numeros NO van en el diff)\n\n${ctx}`,
    },
  ];

  let lastOut = '';
  for (let round = 1; round <= c.rounds; round++) {
    console.log(`  ronda ${round}/${c.rounds}`);
    const answer = await ask(key, c.model, messages, Math.min((round - 1) * 0.3, 0.9));
    messages.push({ role: 'assistant', content: answer });
    const diff = extractDiff(answer);
    writeFileSync(join(wt, '.deepseek.patch'), diff);

    const guard = guardTerritory(diff, c);
    if (!guard.ok) {
      console.log(`    x territorio: ${guard.reason}`);
      messages.push({
        role: 'user',
        content: `Tu parche fue RECHAZADO sin aplicarse: ${guard.reason}\nVuelve a enviarlo tocando solo el territorio permitido.`,
      });
      continue;
    }

    // El modelo cuenta mal las lineas de las cabeceras @@ casi siempre: en el
    // primer lote, 9 de 9 rondas murieron ahi. `--recount` las recalcula del
    // cuerpo del hunk, que es lo unico que el modelo escribe bien. La ultima
    // estrategia afloja el contexto, no la verificacion: quien decide sigue
    // siendo el codigo de salida de `verify`.
    const strategies = [
      ['exacta', 'git apply --check --whitespace=nowarn ".deepseek.patch"'],
      ['recuento', 'git apply --check --recount --whitespace=nowarn ".deepseek.patch"'],
      ['recuento y contexto flojo', 'git apply --check --recount -C1 --whitespace=nowarn ".deepseek.patch"'],
    ];
    let applied = null;
    let lastCheck = { out: '' };
    for (const [nombre, cmd] of strategies) {
      const r = run(cmd, wt);
      if (r.code === 0) {
        applied = [nombre, cmd.replace(' --check', '')];
        break;
      }
      lastCheck = r;
    }
    if (!applied) {
      console.log('    x el parche no aplica ni con --recount');
      messages.push({
        role: 'user',
        content: `El parche no aplica. Salida literal de \`git apply --check\`:\n\n${lastCheck.out.slice(0, 3000)}\n\nEl contexto que citas no coincide con el fichero. Copia las lineas de contexto TAL CUAL aparecen en los ficheros que te di, y reenvia el diff completo.`,
      });
      continue;
    }
    run(applied[1], wt);
    console.log(`    parche aplicado (${applied[0]}): ${guard.touched.join(', ')}`);

    // §3.6 - verificacion por codigo de salida, nunca por grep sobre la salida
    const v = run(c.verify, wt);
    lastOut = v.out;
    if (v.code === 0) {
      const patch = run('git diff', wt).out;

      // CONTRAPRUEBA POR MUTACION - «verifica el verificador».
      // Un verde no vale por ser verde. Se revierte lo que NO es test y se
      // vuelve a verificar: si sigue verde, los tests del parche no protegen
      // nada. Asi se cazo el primer falso verde de 3.3, que cambiaba la firma
      // de `flush` para devolver un booleano que ningun llamante leia.
      const esTest = (f) => /(^|\/)__tests__\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
      const codigo = guard.touched.filter((f) => !esTest(f));
      writeFileSync(join(wt, '.deepseek.verde.patch'), patch);
      for (const f of codigo) run(`git checkout HEAD -- "${f}"`, wt);
      const mut = run(c.verify, wt);
      run('git reset --hard HEAD', wt);
      run('git apply --whitespace=nowarn ".deepseek.verde.patch"', wt);
      if (mut.code === 0) {
        console.log('    x FALSO VERDE: revertido el codigo, la verificacion sigue verde');
        run('git reset --hard HEAD', wt);
        messages.push({
          role: 'user',
          content:
            `Tu parche puso la verificacion en verde, pero es un FALSO VERDE y se ha rechazado.\n\n` +
            `Contraprueba: se revirtieron los ficheros que NO son de test ` +
            `(${codigo.join(', ') || 'ninguno: no tocaste codigo'}) dejando solo tus tests, y la ` +
            `verificacion SIGUIO EN VERDE. Es decir: tus tests pasan igual sin tu arreglo, ` +
            `luego no protegen el requisito del encargo.\n\n` +
            `Escribe un test que FALLE contra el codigo original y solo pase con tu arreglo, ` +
            `y comprueba que el arreglo cambia de verdad el comportamiento observable, no solo ` +
            `una firma o un valor de retorno que nadie lee. Reenvia el diff completo.`,
        });
        continue;
      }
      console.log(`    contraprueba: revertido el codigo, la verificacion cae en rojo (${mut.code}). El verde vale.`);
      rmSync(join(wt, '.deepseek.verde.patch'), { force: true });
      // El fichero de trabajo del motor no es parte del encargo.
      rmSync(join(wt, '.deepseek.patch'), { force: true });
      run('git add -A', wt);
      run(`git commit -q -m "deepseek(${c.id}): parche verificado en verde"`, wt);
      writeResult(c, {
        kind: 'verde',
        rounds: round,
        branch,
        diff: patch,
        verifyOut: v.out,
        ms: Date.now() - t0,
      });
      console.log(`  ok verde en la ronda ${round}. Rama ${branch}. contracts/${c.id}.result.md`);
      return { id: c.id, ok: true, kind: 'verde', branch };
    }
    console.log(`    x verificacion roja (codigo ${v.code})`);
    run('git checkout -- .', wt);
    run('git clean -fd -e .deepseek.patch', wt);
    messages.push({
      role: 'user',
      content: `La verificacion salio ROJA (codigo de salida ${v.code}). Salida literal:\n\n${v.out.slice(-6000)}\n\nEl parche anterior se revirtio. Envia un diff nuevo y completo contra el arbol original.`,
    });
  }

  writeResult(c, { kind: 'rojo', rounds: c.rounds, branch, verifyOut: lastOut, ms: Date.now() - t0 });
  console.log(`  x agotadas las ${c.rounds} rondas en rojo. Rama ${branch} queda para revisar.`);
  return { id: c.id, ok: false, kind: 'rojo', branch };
}

function writeResult(c, r) {
  const lines = [
    `# Resultado - ${c.id}`,
    '',
    `- Contrato: \`${relative(REPO, c.path).replace(/\\/g, '/')}\``,
    `- Modelo: ${c.model}`,
    `- Desenlace: **${r.kind}**`,
    `- Rondas consumidas: ${r.rounds} de ${c.rounds}`,
    r.branch ? `- Rama: \`${r.branch}\`` : '',
    `- Duracion: ${(r.ms / 1000).toFixed(1)} s`,
    '',
  ].filter(Boolean);
  if (r.body) lines.push(r.body);
  if (r.diff) lines.push(`## Diff\n\n~~~diff\n${r.diff}\n~~~\n`);
  if (r.verifyOut) lines.push(`## Salida final de \`${c.verify}\`\n\n~~~\n${r.verifyOut.slice(-8000)}\n~~~\n`);
  lines.push('\n> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.');
  writeFileSync(join(REPO, 'contracts', `${c.id}.result.md`), lines.join('\n'));
}

// -- §4 - el lote ------------------------------------------------------------
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
if (!args.length) fatal('Uso: node scripts/deepseek/run-contract.mjs <contrato.md> | --batch c1.md c2.md ...');
const batch = args[0] === '--batch';
const files = (batch ? args.slice(1) : args).map((f) => resolve(REPO, f));
if (!files.length) fatal('--batch sin contratos.');
const contracts = files.map(parseContract);
if (batch) {
  assertDisjoint(contracts);
  console.log(`Lote de ${contracts.length}: territorios disjuntos, se lanza.`);
}

const key = apiKey();
let results;
if (batch) {
  results = await Promise.all(contracts.map((c) => execute(c, key)));
} else {
  results = [];
  for (const c of contracts) results.push(await execute(c, key));
}

console.log('\n-- resumen --');
for (const r of results) console.log(`  ${r.ok ? 'ok' : 'x '} ${r.id}  ${r.kind}${r.branch ? `  ${r.branch}` : ''}`);
console.log(`  coste estimado total: $${TOTAL_USD.toFixed(4)}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
