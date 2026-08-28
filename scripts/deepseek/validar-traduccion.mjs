#!/usr/bin/env node
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
//
// Verifica una migracion de traduccion contra su fichero de fuente.
// LO ESCRIBE EL SUPERVISOR, NO EL AGENTE, y a proposito: un agente que redacta
// su propio criterio de aceptacion lo redacta indulgente. Ayer siete tests
// verdes pasaban por el motivo equivocado en un solo dia.
//
// Uso:
//   node scripts/deepseek/validar-traduccion.mjs <fuente.json> <migracion.sql>
//
// Sale 0 solo si TODO pasa. Cualquier fallo imprime el detalle y sale 1.

import { readFileSync, existsSync } from 'node:fs';

const [, , rutaFuente, rutaSql] = process.argv;
if (!rutaFuente || !rutaSql) {
  console.error('Uso: validar-traduccion.mjs <fuente.json> <migracion.sql>');
  process.exit(2);
}

const fallos = [];
const fallo = (msg) => fallos.push(msg);

if (!existsSync(rutaSql)) {
  console.error(`\n  x No existe la migracion: ${rutaSql}\n`);
  process.exit(1);
}

const fuente = JSON.parse(readFileSync(rutaFuente, 'utf8'));
const sql = readFileSync(rutaSql, 'utf8');

// -- 1. Nada destructivo, nada inventado --------------------------------------
const uuids = sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
if (uuids.length) fallo(`Hay ${uuids.length} UUID literal(es). Se localiza por clave natural: ${uuids[0]}`);

const destructivas = sql.match(/^\s*(delete|drop|truncate|alter\s+table)\b/gim) ?? [];
if (destructivas.length) fallo(`Hay ${destructivas.length} sentencia(s) destructiva(s): ${destructivas.join(', ')}`);

// -- 2. Toda escritura es ADITIVA ---------------------------------------------
// `set content = ...` / `set title = ...` solo vale si el lado derecho conserva
// lo que habia: `||` sobre el objeto existente, o `jsonb_set` de una rama.
const asignaciones = [...sql.matchAll(/\bset\s+(content|title)\s*=\s*([\s\S]{0,220})/gi)];
if (asignaciones.length === 0) fallo('No hay ninguna escritura sobre content o title.');
for (const [, campo, cola] of asignaciones) {
  // No basta con que aparezca un `||` por ahi: el lado derecho tiene que PARTIR
  // del valor que ya estaba en la columna. Un `jsonb_build_object` a secas la
  // reemplaza entera y se lleva el ingles por delante, aunque lleve un `||`
  // suelto mas adelante. Esta comprobacion se escribio porque la version
  // anterior daba por buena exactamente ese caso.
  const usaConstructor = /\|\||jsonb_set/.test(cola);
  const partedelValorActual = new RegExp(`\\b(?:[a-z]\\.)?${campo}\\b`, 'i').test(cola);
  if (!usaConstructor || !partedelValorActual) {
    fallo(
      `Una escritura sobre '${campo}' no parte del valor existente: reemplaza el objeto ` +
        `entero y perderia el ingles. Tiene que ser \`${campo} || …\` o \`jsonb_set(${campo}, …)\`.`,
    );
  }
}

// -- 3. Guarda de idempotencia por cada UPDATE --------------------------------
const updates = (sql.match(/^\s*update\s+public\./gim) ?? []).length;
const guardas = (sql.match(/not\s*\([^)]*\?\s*'es'\s*\)/gi) ?? []).length;
if (updates === 0) fallo('No hay ninguna sentencia UPDATE.');
if (guardas < updates) fallo(`${updates} UPDATE pero solo ${guardas} guarda(s) \`not (... ? 'es')\`. Sin guarda no es idempotente.`);

// -- 4. Extraer las traducciones de los VALUES --------------------------------
// Forma de la casa: (leccion_ord, bloque_ord, 'texto en espanol')
// Las comillas simples dentro del texto van dobladas ('') como manda SQL.
const traducciones = new Map(); // "leccion:bloque" -> texto
const tupla = /\(\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^']|'')*)'\s*\)/g;
let m;
while ((m = tupla.exec(sql)) !== null) {
  const clave = `${m[1]}:${m[2]}`;
  const texto = m[3].replace(/''/g, "'");
  if (traducciones.has(clave)) fallo(`El bloque ${clave} aparece dos veces en los VALUES.`);
  traducciones.set(clave, texto);
}

// Cuando el lote es de UNA SOLA leccion, escribir la leccion en cada tupla es
// redundante y el SQL natural es `(bloque_ord, 'texto')` con la leccion fijada
// en el WHERE. Eso es legitimo y hay que leerlo: la version anterior daba
// «0 traducidos encontrados» sobre una migracion perfectamente correcta.
// Solo se admite con una leccion: con dos o mas, la tupla corta seria ambigua.
const ordsDeLaFuente = [...new Set(fuente.lecciones.map((l) => l.leccion_ord))];
if (traducciones.size === 0 && ordsDeLaFuente.length === 1) {
  const unica = ordsDeLaFuente[0];
  const corta = /\(\s*(\d+)\s*,\s*'((?:[^']|'')*)'\s*\)/g;
  while ((m = corta.exec(sql)) !== null) {
    const clave = `${unica}:${m[1]}`;
    const texto = m[2].replace(/''/g, "'");
    if (traducciones.has(clave)) fallo(`El bloque ${clave} aparece dos veces en los VALUES.`);
    traducciones.set(clave, texto);
  }
}

// -- 5. Cobertura: ni uno menos ------------------------------------------------
const esperados = [];
for (const leccion of fuente.lecciones) {
  for (const bloque of leccion.bloques) {
    esperados.push({
      clave: `${leccion.leccion_ord}:${bloque.bloque_ord}`,
      en: bloque.html_en ?? '',
      kind: bloque.kind,
    });
  }
}
const faltan = esperados.filter((e) => !traducciones.has(e.clave));
if (faltan.length) {
  fallo(
    `Faltan ${faltan.length} de ${esperados.length} bloques por traducir. ` +
      `Primeros: ${faltan.slice(0, 8).map((f) => f.clave).join(', ')}`,
  );
}

// -- 6. El marcado se conserva -------------------------------------------------
// Un traductor que se come un <b> o inventa un <div> rompe la leccion.
const etiquetas = (s) => {
  const t = (s.match(/<\/?[a-zA-Z][a-zA-Z0-9]*/g) ?? []).map((x) => x.toLowerCase());
  return t.sort().join(',');
};
// -- 7. Los numeros se conservan -----------------------------------------------
// Un dato plausible no es un dato correcto: 4.7 no puede convertirse en 4.8.
const numeros = (s) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join(',');

// Un bloque puede quedar identico al ingles con toda la razon: «bit -> byte ->
// kilobyte» se escribe igual en los dos idiomas. Pero eso tiene que ser una
// DECISION DECLARADA, no un descuido que se cuela. El traductor lo declara con
// una linea de comentario por bloque:
//
//   -- IDENTICO 1:13 — unidades internacionales, iguales en ambos idiomas
//
// Y la declaracion no sirve para hacer trampa: declarar un bloque que SI se
// tradujo tambien es un fallo, porque significa que la lista no dice la verdad.
const declaradosIdenticos = new Set(
  [...sql.matchAll(/--\s*IDENTICO\s+(\d+):(\d+)/gi)].map((d) => `${d[1]}:${d[2]}`),
);

let sinCambio = 0;
const identicosNoDeclarados = [];
const declaradosQueSiCambiaron = [];
for (const e of esperados) {
  const es = traducciones.get(e.clave);
  if (es === undefined) continue;

  if (es.trim() === '') {
    fallo(`El bloque ${e.clave} tiene traduccion vacia.`);
    continue;
  }
  if (etiquetas(es) !== etiquetas(e.en)) {
    fallo(
      `El bloque ${e.clave} no conserva el marcado.\n` +
        `      ingles:  ${etiquetas(e.en) || '(sin etiquetas)'}\n` +
        `      espanol: ${etiquetas(es) || '(sin etiquetas)'}`,
    );
  }
  if (numeros(es) !== numeros(e.en)) {
    fallo(
      `El bloque ${e.clave} cambia los numeros.\n` +
        `      ingles:  ${numeros(e.en) || '(ninguno)'}\n` +
        `      espanol: ${numeros(es) || '(ninguno)'}`,
    );
  }
  // Un bloque que solo son cifras y simbolos puede quedar igual; uno con
  // palabras, no: seria ingles disfrazado de traduccion.
  const tieneLetras = /[a-zA-Z]{3,}/.test(e.en.replace(/<[^>]*>/g, ''));
  const identico = es === e.en;
  if (tieneLetras && identico && !declaradosIdenticos.has(e.clave)) {
    sinCambio += 1;
    identicosNoDeclarados.push(e.clave);
  }
  if (declaradosIdenticos.has(e.clave) && !identico) declaradosQueSiCambiaron.push(e.clave);
}
if (sinCambio > 0) {
  fallo(
    `${sinCambio} bloque(s) con palabras quedaron IDENTICOS al ingles sin declararlo: ` +
      `${identicosNoDeclarados.join(', ')}.\n` +
      `      Si de verdad se escriben igual en ambos idiomas, declaralo con una linea\n` +
      `      \`-- IDENTICO leccion:bloque — motivo\` y quedara aceptado. Si no, traducelo.`,
  );
}
if (declaradosQueSiCambiaron.length) {
  fallo(
    `Declarados como IDENTICO pero SI cambian: ${declaradosQueSiCambiaron.join(', ')}. ` +
      `La lista de declarados tiene que decir la verdad.`,
  );
}

// -- 8. La materia y el rango son los suyos ------------------------------------
if (!new RegExp(`'${fuente.materia}'`).test(sql)) {
  fallo(`La migracion no menciona la materia '${fuente.materia}'. Localiza por subjects.code.`);
}

// -- informe -------------------------------------------------------------------
console.log(
  `\nfuente:    ${rutaFuente}\n` +
    `migracion: ${rutaSql}\n` +
    `bloques esperados: ${esperados.length}   traducidos encontrados: ${traducciones.size}\n`,
);
if (fallos.length) {
  console.error(`  ${fallos.length} FALLO(S):\n`);
  for (const f of fallos) console.error(`   x ${f}`);
  console.error('');
  process.exit(1);
}
console.log('  OK — cobertura completa, marcado y numeros conservados, escrituras aditivas.\n');
process.exit(0);
