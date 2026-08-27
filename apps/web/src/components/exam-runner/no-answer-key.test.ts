/**
 * GUARDIÁN DE AD-5: la clave de respuesta no vive en el código del alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este test no comprueba comportamiento: comprueba el CÓDIGO FUENTE del runner.
 * Existe porque la fuga que más daño hace es la más fácil de introducir sin
 * querer — alguien añade `answerKey` al tipo del ítem "para la revisión", y a
 * partir de ese día cualquier alumno con el inspector abierto tiene el examen
 * resuelto. Una revisión de código puede dejarlo pasar; esto no.
 *
 * Lo que se permite y por qué:
 *  - `ResultView.tsx` y `feedback.ts` pueden nombrar `correctAnswer`: es la
 *    revisión POSTERIOR a la corrección, y pasa por `shouldShowReview()`.
 *  - los tests pueden nombrar cualquier cosa: precisamente comprueban que no
 *    se cuela.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL(".", import.meta.url));

/** Nada de esto puede aparecer en el código del examen en curso. */
const FORBIDDEN = ["answerKey", "answer_key", "itemSeed", "item_seed", "correctIds", "answerSpec", "answer_spec"];

/** La revisión posterior a la corrección sí puede leer la respuesta canónica. */
const REVIEW_ALLOWED = new Set(["ResultView.tsx", "feedback.ts", "types.ts", "normalize.ts"]);

function sourceFiles(): readonly string[] {
  return readdirSync(DIR).filter(
    (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx"),
  );
}

describe("la clave de respuesta no cruza al cliente", () => {
  it("ningún fichero del runner nombra answerKey, item_seed ni equivalentes", () => {
    const offenders: string[] = [];

    for (const name of sourceFiles()) {
      const source = readFileSync(join(DIR, name), "utf8");
      for (const token of FORBIDDEN) {
        if (!source.includes(token)) continue;
        // `normalize.test.ts` demuestra que se descartan; el propio código puede
        // mencionarlos solo dentro de un comentario que explique por qué no
        // están. Se exige que la mención NO sea código: ni acceso a propiedad
        // ni declaración.
        const asCode = new RegExp(`(?<![\\w"'\`])${token}\\s*[:.=\\[]`).test(source);
        if (asCode) offenders.push(`${name}: ${token}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("solo la pantalla de revisión puede leer `correctAnswer`", () => {
    const offenders = sourceFiles().filter((name) => {
      if (REVIEW_ALLOWED.has(name)) return false;
      return readFileSync(join(DIR, name), "utf8").includes("correctAnswer");
    });

    expect(offenders).toEqual([]);
  });

  it("el runner del examen en curso no menciona `correctAnswer` en absoluto", () => {
    // La pantalla del examen no tiene ninguna razón para conocer la solución.
    const runner = readFileSync(join(DIR, "ExamRunner.tsx"), "utf8");
    expect(runner).not.toContain("correctAnswer");
    expect(runner).not.toContain("isCorrect");
  });
});
