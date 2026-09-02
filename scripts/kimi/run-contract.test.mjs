// © 2026 Roberto Mendizabal. Todos los derechos reservados.
// Pruebas del motor de contratos Kimi.
//
// Lo que se prueba no es que el motor sepa arreglar codigo -eso lo hace el
// modelo-, sino que sepa RECHAZAR: territorio invadido, falso verde, commit
// por su cuenta, arbol sin cambios. Con un `kimi` de mentira (__fixtures__)
// no hace falta ni red ni cuota, y cada rechazo se puede provocar a voluntad.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MOTOR = join(AQUI, 'run-contract.mjs');
const FALSO = join(AQUI, '__fixtures__', 'kimi-falso.mjs');

const SUMA_ROTA = 'export function suma(a, b) {\n  return a - b;\n}\n';
const SUMA_SANA = 'export function suma(a, b) {\n  return a + b;\n}\n';
// Prueba honesta: falla contra `a - b`, pasa contra `a + b`.
const TEST_HONESTO = `import { test } from 'node:test';
import assert from 'node:assert';
import { suma } from './suma.mjs';
test('suma', () => { assert.equal(suma(2, 3), 5); });
`;
// Prueba tramposa: pasa igual con el codigo roto. Es el falso verde.
const TEST_TRAMPOSO = `import { test } from 'node:test';
import assert from 'node:assert';
import { suma } from './suma.mjs';
test('suma existe', () => { assert.equal(typeof suma, 'function'); });
`;

const temporales = [];

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return `${r.stdout || ''}${r.stderr || ''}`;
}

/** Un repositorio de mentira con el bug dentro y un commit inicial. */
function repoFalso() {
  const dir = mkdtempSync(join(tmpdir(), 'kimi-motor-'));
  temporales.push(dir);
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'contracts'), { recursive: true });
  writeFileSync(join(repo, 'suma.mjs'), SUMA_ROTA);
  git(['init', '-q', '-b', 'main', '.'], repo);
  git(['config', 'user.email', 'motor@prueba'], repo);
  git(['config', 'user.name', 'Motor'], repo);
  git(['add', '-A'], repo);
  git(['commit', '-qm', 'base'], repo);
  return repo;
}

function escribirContrato(repo, { id, territory, forbidden = [], rounds = 1, extra = '' }) {
  const ruta = join(repo, 'contracts', `${id}.md`);
  writeFileSync(
    ruta,
    `---\nid: ${id}\nterritory: [${territory.join(', ')}]\n` +
      (forbidden.length ? `forbidden: [${forbidden.join(', ')}]\n` : '') +
      `verify: node --test\nsetup: ninguno\nrounds: ${rounds}\ntimeout: 60\n` +
      `deadline: 2026-12-31\n${extra}---\n\nArregla la suma.\n`,
  );
  return ruta;
}

/** Lanza el motor con el agente de mentira siguiendo `guion`. */
function lanzar(repo, contrato, guion) {
  const guionPath = join(repo, '..', 'guion.json');
  const contador = join(repo, '..', 'contador.txt');
  writeFileSync(guionPath, JSON.stringify(guion));
  rmSync(contador, { force: true });
  const r = spawnSync(process.execPath, [MOTOR, contrato], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      KIMI_REPO: repo,
      KIMI_ENTRY: FALSO,
      KIMI_FALSO_GUION: guionPath,
      KIMI_FALSO_CONTADOR: contador,
    },
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

const resultado = (repo, id) => readFileSync(join(repo, 'contracts', `${id}.result.md`), 'utf8');
const arbol = (repo, id) => resolve(repo, '..', '.cet-worktrees', id);

let repo;
beforeEach(() => {
  repo = repoFalso();
});
afterAll(() => {
  for (const d of temporales) rmSync(d, { recursive: true, force: true });
});

describe('el motor de contratos Kimi', () => {
  it('da por verde el trabajo que arregla el codigo y lo prueba de verdad', () => {
    const c = escribirContrato(repo, { id: 'verde', territory: ['suma.mjs', 'suma.test.mjs'] });
    const { code, out } = lanzar(repo, c, [
      { escribir: { 'suma.mjs': SUMA_SANA, 'suma.test.mjs': TEST_HONESTO }, texto: 'arreglado' },
    ]);
    expect(out).toContain('El verde vale');
    expect(code).toBe(0);
    const res = resultado(repo, 'verde');
    expect(res).toContain('Desenlace: **verde**');
    expect(res).toContain('suma.test.mjs');
    // El verde se consolida en su rama, nunca en la del usuario.
    expect(git(['log', '-1', '--pretty=%s'], arbol(repo, 'verde'))).toContain('kimi(verde)');
    expect(git(['log', '-1', '--pretty=%s'], repo).trim()).toBe('base');
  });

  it('caza el falso verde: si al revertir el codigo la prueba sigue pasando, no vale', () => {
    const c = escribirContrato(repo, { id: 'falso', territory: ['suma.mjs', 'suma.test.mjs'] });
    const { code, out } = lanzar(repo, c, [
      { escribir: { 'suma.mjs': SUMA_SANA, 'suma.test.mjs': TEST_TRAMPOSO }, texto: 'listo' },
    ]);
    expect(out).toContain('FALSO VERDE');
    expect(code).not.toBe(0);
    expect(resultado(repo, 'falso')).toContain('Desenlace: **rojo**');
  });

  it('revierte la ronda ENTERA cuando se toca un fichero fuera del territorio', () => {
    const c = escribirContrato(repo, { id: 'territorio', territory: ['suma.mjs', 'suma.test.mjs'] });
    const { code, out } = lanzar(repo, c, [
      {
        escribir: { 'suma.mjs': SUMA_SANA, 'suma.test.mjs': TEST_HONESTO, 'intruso.mjs': '// no toca\n' },
        texto: 'de paso he tocado otra cosa',
      },
    ]);
    expect(out).toContain('Fuera del territorio: intruso.mjs');
    expect(code).not.toBe(0);
    // La parte buena cae con la mala: el arbol queda como estaba.
    const wt = arbol(repo, 'territorio');
    expect(existsSync(join(wt, 'intruso.mjs'))).toBe(false);
    // En Windows el checkout devuelve el fichero con CRLF: lo que se comprueba
    // es que volvio el codigo roto, no el final de linea con el que git lo dejo.
    expect(readFileSync(join(wt, 'suma.mjs'), 'utf8').replace(/\r\n/g, '\n')).toBe(SUMA_ROTA);
    expect(git(['status', '--porcelain'], wt).trim()).toBe('');
  });

  it('rechaza tambien lo que cae en forbidden aunque el territorio lo permita', () => {
    const c = escribirContrato(repo, {
      id: 'vetado',
      territory: ['*.mjs'],
      forbidden: ['suma.test.mjs'],
    });
    const { out } = lanzar(repo, c, [
      { escribir: { 'suma.mjs': SUMA_SANA, 'suma.test.mjs': TEST_HONESTO }, texto: 'ya esta' },
    ]);
    expect(out).toContain('Prohibidos: suma.test.mjs');
  });

  it('deshace el commit que el agente haga por su cuenta y sigue midiendo el trabajo', () => {
    const c = escribirContrato(repo, { id: 'commit', territory: ['suma.mjs', 'suma.test.mjs'] });
    const { code, out } = lanzar(repo, c, [
      {
        escribir: { 'suma.mjs': SUMA_SANA, 'suma.test.mjs': TEST_HONESTO },
        commit: true,
        texto: 'commiteado, que me lo pedia el cuerpo',
      },
    ]);
    expect(out).toContain('el agente hizo commit');
    // Deshecho el commit, el trabajo se ve y llega a verde igual.
    expect(out).toContain('El verde vale');
    expect(code).toBe(0);
  });

  it('no da por bueno un arbol sin cambios', () => {
    const c = escribirContrato(repo, { id: 'vacio', territory: ['suma.mjs'] });
    const { code, out } = lanzar(repo, c, [{ texto: 'me lo he pensado y no he tocado nada' }]);
    expect(out).toContain('no dejo ningun cambio');
    expect(code).not.toBe(0);
  });

  it('usa las rondas: con la replica del rojo delante, el segundo intento cuenta', () => {
    const c = escribirContrato(repo, { id: 'rondas', territory: ['suma.mjs', 'suma.test.mjs'], rounds: 2 });
    const { code, out } = lanzar(repo, c, [
      // Ronda 1: prueba honesta pero sin arreglar el codigo -> rojo.
      { escribir: { 'suma.test.mjs': TEST_HONESTO }, texto: 'primero la prueba' },
      // Ronda 2: ya con el arreglo.
      { escribir: { 'suma.mjs': SUMA_SANA, 'suma.test.mjs': TEST_HONESTO }, texto: 'ahora si' },
    ]);
    expect(out).toContain('verificacion roja');
    expect(out).toContain('ok verde en la ronda 2');
    expect(code).toBe(0);
  });

  it('para el informe que escribe en el arbol, y no revierte nada por su cuenta', () => {
    // Sin territorio es contrato de informe: corre sobre el repositorio de
    // verdad, donde suele haber trabajo del humano sin guardar. Que se pare y
    // avise es la unica salida honesta.
    const ruta = join(repo, 'contracts', 'informe.md');
    writeFileSync(ruta, '---\nid: informe\ntimeout: 60\ndeadline: 2026-12-31\n---\n\nCuentame algo.\n');
    const { code, out } = lanzar(repo, ruta, [
      { escribir: { 'nota.md': 'me ha dado por escribir\n' }, texto: 'informe' },
    ]);
    expect(out).toContain('NO puede tocar el arbol');
    expect(code).toBe(2);
    expect(readFileSync(join(repo, 'nota.md'), 'utf8')).toContain('me ha dado por escribir');
  });

  // El CLI rechaza el fichero de agente entero si el YAML no cuela, y un
  // `description` con dos puntos sin comillas ya tumbo una vez el modo informe.
  it('tiene los ficheros de agente con la cabecera bien escrita', () => {
    for (const f of ['agente-contratos.md', 'agente-informe.md']) {
      const raw = readFileSync(join(AQUI, f), 'utf8');
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      expect(m, `${f}: sin cabecera`).toBeTruthy();
      for (const linea of m[1].split(/\r?\n/)) {
        const kv = linea.match(/^([a-zA-Z]+):\s+(\S.*)$/);
        if (!kv) continue; // lineas de lista o vacias
        const valor = kv[2];
        if (/^["']/.test(valor)) continue;
        expect(valor.includes(': '), `${f}: ${kv[1]} lleva dos puntos sin comillas`).toBe(false);
      }
    }
  });

  it('no lanza un contrato sin plazo', () => {
    const ruta = join(repo, 'contracts', 'sinplazo.md');
    writeFileSync(ruta, '---\nid: sinplazo\nterritory: [suma.mjs]\nverify: node --test\n---\n\nAlgo.\n');
    const { code, out } = lanzar(repo, ruta, [{}]);
    expect(out).toContain('sin deadline');
    expect(code).toBe(2);
  });

  it('rechaza el lote entero si dos contratos se pisan el territorio', () => {
    const a = escribirContrato(repo, { id: 'lote-a', territory: ['apps/web/**'] });
    const b = escribirContrato(repo, { id: 'lote-b', territory: ['apps/web/app/**'] });
    const guionPath = join(repo, '..', 'guion.json');
    writeFileSync(guionPath, JSON.stringify([{}]));
    const r = spawnSync(process.execPath, [MOTOR, '--batch', a, b], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        KIMI_REPO: repo,
        KIMI_ENTRY: FALSO,
        KIMI_FALSO_GUION: guionPath,
        KIMI_FALSO_CONTADOR: join(repo, '..', 'contador.txt'),
      },
    });
    expect(`${r.stdout}${r.stderr}`).toContain('Lote rechazado entero');
    expect(r.status).toBe(2);
  });
});
