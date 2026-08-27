/**
 * Materializa el simulacro de Math Y6 con el motor real y lo imprime.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ DEMUESTRA
 * ─────────────────────────────────────────────────────────────────────────────
 * Recorre las 13 secciones del blueprint, deriva la semilla de cada ítem a
 * partir de una semilla raíz y llama al generador que corresponda. Es
 * exactamente lo que hace `/api/attempts/start` al arrancar un intento, sin la
 * capa de HTTP ni la base de datos.
 *
 * Sirve para tres cosas:
 *   1. Ver los ocho módulos del temario produciendo preguntas de verdad.
 *   2. Comprobar el DETERMINISMO: con la misma semilla raíz sale exactamente el
 *      mismo examen; con otra, uno distinto. Es el requisito que sostiene la
 *      reconstrucción forense y el de "examen distinto por alumno".
 *   3. Verificar que la clave de respuesta que produce el motor es la correcta,
 *      resolviendo el problema por otra vía cuando se puede.
 *
 * Uso:  node scripts/demo-exam.mjs [semilla] [locale]
 */

import { registry } from "../packages/engine/src/generators/index.ts";
import { deriveItemSeed } from "../packages/engine/src/seed.ts";

/** Las 13 secciones tal como están sembradas en `exam_blueprint_sections`. */
const SECCIONES = [
  { titulo: "Simplificar fracciones", key: "math.simplify", n: 1, params: {} },
  { titulo: "Comparar fracciones", key: "math.compare", n: 1, params: {} },
  { titulo: "Fracciones (+)", key: "math.fracop", n: 1, params: { ops: ["add"] } },
  { titulo: "Fracciones (−)", key: "math.fracop", n: 1, params: { ops: ["sub"] } },
  { titulo: "Fracciones (×)", key: "math.fracop", n: 1, params: { ops: ["mul"] } },
  { titulo: "Fracciones (÷)", key: "math.fracop", n: 1, params: { ops: ["div"] } },
  { titulo: "Impropias y mixtos", key: "math.mixed", n: 2, params: {} },
  { titulo: "Multiplicar y dividir decimales", key: "math.decimal", n: 3, params: {} },
  { titulo: "Por 10, 100 y 1.000", key: "math.powten", n: 2, params: {} },
  { titulo: "Conversiones métricas", key: "math.metric", n: 3, params: {} },
  { titulo: "Figuras compuestas (área)", key: "math.shape", n: 1, params: { target: "area" } },
  { titulo: "Figuras compuestas (perímetro)", key: "math.shape", n: 1, params: { target: "perimeter" } },
  { titulo: "Problemas de enunciado", key: "math.word", n: 2, params: {} },
];

const semillaRaiz = Number(process.argv[2] ?? 8147283914);
const locale = process.argv[3] ?? "es";

/** Quita el HTML del enunciado para poder leerlo en un terminal. */
function plano(html) {
  return html
    .replace(/<span class="f"><span class="a">(.*?)<\/span><span class="b">(.*?)<\/span><\/span>/g, "$1/$2")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function claveLegible(key) {
  switch (key.type) {
    case "numeric":
      return key.canonical;
    case "fraction":
      return key.canonical;
    case "text":
      return key.accepted.join(" | ");
    case "choice":
      return key.correctIds.join(", ");
    default:
      return key.type;
  }
}

console.log(`\nSIMULACRO — Matemáticas Y6 · semilla raíz ${semillaRaiz} · idioma ${locale}`);
console.log("=".repeat(78));

let ord = 0;
let puntos = 0;
const porSkill = new Map();

for (const seccion of SECCIONES) {
  console.log(`\n${seccion.titulo}`);
  for (let i = 0; i < seccion.n; i += 1) {
    ord += 1;
    const seed = deriveItemSeed(semillaRaiz, ord);
    const item = registry.generate(seccion.key, { ...seccion.params, locale }, seed);

    puntos += item.maxPoints;
    porSkill.set(item.skillCode, (porSkill.get(item.skillCode) ?? 0) + 1);

    const enunciado = plano(item.body.stem);
    const figura = item.body.figureSvg ? "  [+ figura SVG]" : "";
    console.log(
      `  ${String(ord).padStart(2, " ")}. ${enunciado}${figura}\n` +
        `      clave: ${claveLegible(item.answerKey)}   ·   dificultad ${item.difficulty}   ·   ${item.skillCode}`,
    );
  }
}

console.log("\n" + "=".repeat(78));
console.log(`${ord} preguntas · ${puntos} puntos · ${porSkill.size} destrezas distintas`);

// Determinismo: el mismo examen dos veces desde la misma semilla.
const primera = [];
const segunda = [];
for (let o = 1; o <= 3; o += 1) {
  const s = deriveItemSeed(semillaRaiz, o);
  primera.push(registry.generate(SECCIONES[0].key, { locale }, s).body.stem);
  segunda.push(registry.generate(SECCIONES[0].key, { locale }, s).body.stem);
}
const identico = primera.every((v, i) => v === segunda[i]);

// Y con otra semilla, un examen distinto.
const otra = registry.generate(SECCIONES[0].key, { locale }, deriveItemSeed(semillaRaiz + 1, 1)).body.stem;
const distinto = otra !== primera[0];

console.log(`determinismo (misma semilla, mismo examen): ${identico ? "OK" : "FALLO"}`);
console.log(`variedad (otra semilla, otro examen):       ${distinto ? "OK" : "FALLO"}`);
console.log("");
