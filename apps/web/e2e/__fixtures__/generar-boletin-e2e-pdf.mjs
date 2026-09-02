#!/usr/bin/env node
/**
 * Genera `boletin-e2e.pdf`: un boletín mínimo, escrito objeto a objeto, sin
 * dependencias nuevas (ni `pdf-lib` ni similares — el repo ya evita añadirlas,
 * ver `packages/content/src/corpus/pdf.ts`).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El texto de cada línea importa carácter a carácter: `validarExtraccion`
 * (apps/web/src/lib/plan/boletin.ts) exige que la `materia` que devuelve el
 * modelo aparezca LITERAL en el texto extraído del PDF, una vez colapsados
 * los espacios. El mock de DeepSeek del e2e (`apps/web/e2e/mock-deepseek.mjs`)
 * devuelve exactamente estos seis nombres de materia, así que este fichero es
 * la fuente de verdad de ambos lados.
 *
 * Uso: `node apps/web/e2e/__fixtures__/generar-boletin-e2e-pdf.mjs`
 * (para regenerar el fixture; el .pdf resultante SÍ se versiona, como
 * `Y6A/**` no se versiona por ser material de terceros — este es nuestro).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Las seis materias con contenido en la plataforma, con el nombre EXACTO que
 * el mock de extracción va a devolver como `materia`. */
export const LINEAS = [
  "E2E Boletin de Pruebas",
  "Grade: Y6A - 2026",
  "Subject T1 T2 T3 AVG",
  "English 82",
  "Math 74",
  "Science 88",
  "Spanish 79",
  "Social Studies 91",
  "Information & Communication Technology 85",
  "Art 77",
  "Music 96",
  "Physical Education 88",
  "Religion and Values 90",
  "AVERAGES 83",
];

/** Escapa paréntesis y barras invertidas, los tres caracteres especiales
 * dentro de una cadena literal `(...)` de PostScript/PDF. */
function escaparPdf(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function construirContenido(lineas) {
  const partes = ["BT", "/F1 12 Tf"];
  let y = 760;
  for (const linea of lineas) {
    partes.push(`1 0 0 1 72 ${y} Tm`);
    partes.push(`(${escaparPdf(linea)}) Tj`);
    y -= 20;
  }
  partes.push("ET");
  return partes.join("\n");
}

/** Construye el PDF completo: cabecera, objetos, xref y trailer, con los
 * offsets calculados en vez de contados a mano. */
export function construirPdf(lineas) {
  const contenido = construirContenido(lineas);
  const contenidoBytes = Buffer.from(contenido, "latin1");

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    null, // objeto 5: stream, se arma aparte porque lleva /Length binario
  ];

  const header = "%PDF-1.4\n";
  let out = header;
  const offsets = [0]; // el objeto 0 no existe; offsets[i] = offset del objeto i

  for (let i = 0; i < objetos.length; i += 1) {
    offsets.push(Buffer.byteLength(out, "latin1"));
    const n = i + 1;
    if (n === 5) {
      out += `${n} 0 obj\n<< /Length ${contenidoBytes.length} >>\nstream\n`;
      out += contenido;
      out += "\nendstream\nendobj\n";
    } else {
      out += `${n} 0 obj\n${objetos[i]}\nendobj\n`;
    }
  }

  const xrefOffset = Buffer.byteLength(out, "latin1");
  const totalObjetos = objetos.length + 1; // +1 por el objeto 0 libre
  let xref = `xref\n0 ${totalObjetos}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalObjetos; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += xref;
  out += `trailer\n<< /Size ${totalObjetos} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(out, "latin1");
}

const esEjecucionDirecta = process.argv[1] === fileURLToPath(import.meta.url);
if (esEjecucionDirecta) {
  const destino = join(dirname(fileURLToPath(import.meta.url)), "boletin-e2e.pdf");
  writeFileSync(destino, construirPdf(LINEAS));
  process.stdout.write(`Escrito ${destino}\n`);
}
