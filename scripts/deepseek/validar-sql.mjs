#!/usr/bin/env node
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
//
// Verifica una migracion SQL de analitica y su fichero de pruebas pgTAP.
//
// POR QUE EXISTE, Y QUE NO ES
// ---------------------------------------------------------------------------
// El motor de contratos solo acepta un criterio EJECUTABLE, por codigo de
// salida (HANDOFF-DEEPSEEK §2). Hasta hoy todos los verify del repositorio eran
// de vitest o del validador de traducciones: no habia forma de cerrarle el
// contrato a un agente que escribe SQL, y sin criterio no se delega.
//
// Lo que este validador comprueba es la FORMA: que la migracion declara las
// funciones que el contrato le encargo, que ninguna se queda sin las defensas
// que el proyecto exige a toda funcion `security definer`, que no abre la
// puerta a `anon`, y que el fichero de pruebas ejerce de verdad cada funcion.
//
// Lo que NO comprueba, y hay que decirlo sin adornos: que el SQL CORRA. Eso
// solo lo demuestra aplicarlo contra Postgres, y eso lo hace el supervisor en
// serie, no cuatro agentes en paralelo contra la misma base de produccion.
//
// El reparto es deliberado. Esta puerta descarta barato lo que esta mal
// formado; la base de datos decide lo que esta bien.
//
// LO ESCRIBE EL SUPERVISOR, NO EL AGENTE. Un agente que redacta su propio
// criterio de aceptacion lo redacta indulgente.
//
// Uso:
//   node scripts/deepseek/validar-sql.mjs <migracion.sql> <pruebas.sql> fn1,fn2,...
//
// Sale 0 solo si TODO pasa.

import { readFileSync, existsSync } from 'node:fs';

const [, , rutaSql, rutaTest, listaFunciones] = process.argv;
if (!rutaSql || !rutaTest || !listaFunciones) {
  console.error('Uso: validar-sql.mjs <migracion.sql> <pruebas.sql> <fn1,fn2,...>');
  process.exit(2);
}

const fallos = [];
const fallo = (msg) => fallos.push(msg);

for (const ruta of [rutaSql, rutaTest]) {
  if (!existsSync(ruta)) {
    console.error(`\n  x No existe el fichero: ${ruta}\n`);
    process.exit(1);
  }
}

const sql = readFileSync(rutaSql, 'utf8');
const test = readFileSync(rutaTest, 'utf8');
const funciones = listaFunciones.split(',').map((f) => f.trim()).filter(Boolean);

// Quita comentarios antes de buscar sentencias: si no, un `-- drop table` de un
// comentario explicativo dispararia media docena de fallos falsos, y un
// validador que grita por comentarios se acaba desactivando.
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

const codigo = sinComentarios(sql);
const codigoTest = sinComentarios(test);

// -- 1. Las funciones encargadas existen, con el esquema que se pidio ---------
// Se busca el nombre CUALIFICADO. `create function informe_alumno_resumen`, sin
// esquema, aterriza donde diga el search_path del que migra: en `public` una vez
// y en `app` la siguiente, y esa es la clase de fallo que solo aparece en el
// despliegue de otro.
for (const fn of funciones) {
  const re = new RegExp(
    `create\\s+(or\\s+replace\\s+)?function\\s+${fn.replace('.', '\\.')}\\s*\\(`,
    'i',
  );
  if (!re.test(codigo)) fallo(`La migracion no declara \`create function ${fn}(\`.`);
}

// -- 2. Toda security definer, con search_path fijado ------------------------
// Es un invariante del proyecto y `supabase/tests/constraints.sql` lo cuenta a
// nivel de base entera (DATA_MODEL §9). Sin `set search_path`, una funcion
// definer ejecuta con los privilegios del owner y resuelve los nombres con el
// camino del LLAMANTE: un alumno que cree su propia tabla `skills` en un esquema
// suyo y lo ponga primero cambia lo que la funcion lee.
const definers = [...codigo.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([\s\S]*?)\bas\s+\$/gi)];
if (definers.length === 0) fallo('No se ha encontrado ninguna definicion de funcion completa.');
for (const [, nombre, cuerpo] of definers) {
  if (!/security\s+definer/i.test(cuerpo)) continue;
  if (!/set\s+search_path\s*=/i.test(cuerpo)) {
    fallo(`\`${nombre}\` es security definer y NO fija search_path.`);
  }
  if (!/revoke\s+all\s+on\s+function\s+[\s\S]{0,200}?from\s+public/i.test(codigo)) {
    fallo(
      `\`${nombre}\` es security definer y la migracion no retira su EXECUTE a public. ` +
        'Toda funcion definer nace ejecutable por cualquiera.',
    );
  }
}

// -- 3. Nada para `anon` -----------------------------------------------------
// `anon` es el visitante sin sesion. Un informe de conducta de un menor no se
// le concede ni por descuido ni "temporalmente para probar".
const paraAnon = codigo.match(/grant[\s\S]{0,200}?\bto\b[^;]*\banon\b/gi) ?? [];
if (paraAnon.length) {
  fallo(`Hay ${paraAnon.length} GRANT que alcanza a \`anon\`: ${paraAnon[0].trim().slice(0, 90)}`);
}

// -- 4. Nada destructivo ------------------------------------------------------
// Una migracion de analitica AGREGA. Si necesita borrar algo, es que esta
// arreglando otra cosa y ese es otro contrato.
const destructivas = codigo.match(/\b(drop\s+table|truncate|delete\s+from\s+public\.learning_events)\b/gi) ?? [];
if (destructivas.length) {
  fallo(`Sentencia destructiva sobre datos: ${[...new Set(destructivas)].join(', ')}`);
}

// -- 5. El fichero de pruebas EJERCE cada funcion -----------------------------
// El falso verde clasico de ayer: un test que declara `plan(3)` y comprueba que
// la funcion EXISTE. Que exista ya lo dice el punto 1. Aqui se exige que la
// prueba la LLAME.
for (const fn of funciones) {
  const llamada = new RegExp(`${fn.replace('.', '\\.')}\\s*\\(`, 'i');
  if (!llamada.test(codigoTest)) fallo(`Las pruebas no llaman nunca a \`${fn}(\`.`);
}

// -- 6. El plan de pgTAP cuadra con los asserts ---------------------------------
// `plan(12)` con 3 asserts pasa en pgTAP como "planned 12 but ran 3" y muchos
// corredores lo dan por bueno. Se comprueba aqui.
const plan = /select\s+plan\s*\(\s*(\d+)\s*\)/i.exec(codigoTest);
if (!plan) {
  fallo('Las pruebas no declaran `select plan(N)`.');
} else {
  const asserts = (codigoTest.match(/\bselect\s+(is|ok|isnt|throws_ok|lives_ok|results_eq|set_eq|has_function|is_empty|matches)\s*\(/gi) ?? []).length;
  if (asserts !== Number(plan[1])) {
    fallo(`Las pruebas declaran plan(${plan[1]}) pero tienen ${asserts} asserts.`);
  }
}

// -- 7. La prueba comprueba el aislamiento entre colegios ---------------------
// Toda consulta que devuelve datos de un alumno tiene que demostrar que un
// profesor de OTRO colegio no ve nada. Es el invariante de tenancy del proyecto
// y no se da por supuesto: `rls_tenant_isolation.sql` existe por algo.
// Se acepta cualquiera de las DOS formas de demostrarlo, porque significan
// cosas distintas y las dos son legitimas segun lo que proteja la funcion:
//   · `throws_ok` con `insufficient_privilege` — la funcion DENIEGA. Es lo que
//     corresponde a una `security definer` que trae su propia guarda.
//   · `is_empty` / cero filas — la funcion devuelve, y no hay nada que devolver.
//     Es lo que corresponde a una consulta que se apoya en la RLS.
//
// La primera version de esta comprobacion solo aceptaba la segunda forma y, de
// propina, exigia la cadena literal «otro colegio». Rechazo un fichero de
// pruebas que hacia exactamente lo que su contrato le pedia. Un criterio de
// aceptacion que no coincide con el encargo no filtra trabajo malo: filtra
// trabajo bueno, y ademas manda a depurar el sitio equivocado.
//   · un `is(count(*), 0)` ejecutado BAJO OTRA IDENTIDAD — la RLS filtra. Esta
//     forma solo cuenta si la prueba se ha puesto de verdad en la piel de otro
//     (`set role authenticated` mas los claims del JWT): un `count(*) = 0`
//     corriendo como propietario de las tablas no demuestra nada, porque el
//     propietario se salta la RLS y el cero vendria de que no hay datos.
const deniega = /throws_ok[\s\S]{0,600}?(insufficient_privilege|42501)/i.test(codigoTest);
const vacio = /\bis_empty\s*\(/i.test(codigoTest);
const suplanta =
  /set\s+role\s+authenticated/i.test(codigoTest) &&
  /request\.jwt\.claim/i.test(codigoTest) &&
  /\bis\s*\([\s\S]{0,300}?count\s*\([\s\S]{0,200}?,\s*0\s*,/i.test(codigoTest);
if (!deniega && !vacio && !suplanta) {
  fallo(
    'Las pruebas no demuestran el aislamiento entre colegios: hace falta un ' +
      '`throws_ok` con insufficient_privilege (la funcion deniega) o un `is_empty` ' +
      '(la funcion no encuentra nada).',
  );
}

// -- salida -------------------------------------------------------------------
if (fallos.length) {
  console.error(`\n  ${fallos.length} fallo(s):\n`);
  for (const f of fallos) console.error(`   x ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`\n  ok  ${rutaSql}: ${funciones.length} funcion(es), forma correcta.`);
console.log('      (la forma, no que corra: eso lo decide Postgres al aplicarla)\n');
process.exit(0);
