/**
 * Proceso hijo de `corpus-pdf-sin-canvas.test.ts`: lee el fixture del e2e con
 * `pdfToSpans` y escribe en stdout una línea JSON con lo que vio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DomMatrixMinima } from "../../src/corpus/dom-matrix.ts";
import { pdfToSpans } from "../../src/corpus/pdf.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const fixture = join(repoRoot, "apps", "web", "e2e", "__fixtures__", "boletin-e2e.pdf");

const { spans } = await pdfToSpans(readFileSync(fixture));
const resultado = {
  textos: spans.map((s) => s.text),
  polyfillInstalado: (globalThis as { DOMMatrix?: unknown }).DOMMatrix === DomMatrixMinima,
};
process.stdout.write(`${JSON.stringify(resultado)}\n`);
