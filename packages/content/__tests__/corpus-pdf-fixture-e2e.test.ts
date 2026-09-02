/**
 * `pdfToSpans` sobre el fixture del e2e de planes de estudio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * A diferencia de `corpus-pdf.test.ts` (que corre contra los PDF reales de
 * Y6A, con .gitignore y todo), este fixture SÍ se versiona: es nuestro,
 * generado a mano por `apps/web/e2e/__fixtures__/generar-boletin-e2e-pdf.mjs`
 * para que `apps/web/e2e/plan.spec.ts` tenga un boletín que subir. Este test
 * es la red de esa generación: si el PDF alguna vez se regenera mal (una
 * codificación distinta, un salto de línea que junta dos materias), la
 * extracción del e2e falla mucho más lejos de la causa real. Aquí se ve al
 * primer intento.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pdfToSpans } from "../src/corpus/pdf.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE = join(repoRoot, "apps", "web", "e2e", "__fixtures__", "boletin-e2e.pdf");

describe("boletin-e2e.pdf (fixture del e2e de planes de estudio)", () => {
  it("pdfToSpans lo lee y cada materia aparece en su propio span", async () => {
    const { spans } = await pdfToSpans(readFileSync(FIXTURE));
    const textos = spans.map((s) => s.text);

    // Las seis materias que el mock de DeepSeek del e2e (mock-deepseek.mjs)
    // devuelve como extracción: `validarExtraccion` exige que cada una
    // aparezca LITERAL en el texto del PDF, así que este test es el que
    // detecta un desajuste entre el fixture y el mock antes que Playwright.
    expect(textos.some((t) => t.includes("English"))).toBe(true);
    expect(textos.some((t) => t.includes("Math"))).toBe(true);
    expect(textos.some((t) => t.includes("Science"))).toBe(true);
    expect(textos.some((t) => t.includes("Spanish"))).toBe(true);
    expect(textos.some((t) => t.includes("Social Studies"))).toBe(true);
    expect(
      textos.some((t) => t.includes("Information & Communication Technology")),
    ).toBe(true);
  });
});
