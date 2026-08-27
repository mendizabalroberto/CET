/**
 * Tests de extremo a extremo sobre los SEIS trainers reales.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los tests anteriores usan un fixture. Estos usan el material de verdad: si
 * alguien edita un HTML de Y6A de forma que el extractor deje de entenderlo,
 * es aquí donde se ve, en CI, y no al sembrar la base de datos.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { contentHash, stableId, stableStringify, uuidv5 } from "../src/ids.ts";
import { serializePack } from "../src/pack.ts";
import { checkPacksUpToDate, runAll, SUBJECTS, type SubjectResult } from "../src/pipeline.ts";
import { assertSafe } from "../src/sanitize.ts";
import { contentPack } from "../src/schema.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const packsDir = join(packageRoot, "packs");

let results: SubjectResult[];
beforeAll(() => {
  results = runAll(repoRoot);
});

describe("las seis materias se extraen", () => {
  for (const subject of SUBJECTS) {
    it(`${subject.code} extrae sin error`, () => {
      const r = results.find((x) => x.code === subject.code)!;
      if (r.error !== null) throw new Error(`${subject.code}: ${r.error}`);
      expect(r.pack).not.toBeNull();
    });
  }
});

describe("todo pack valida contra su esquema Zod", () => {
  for (const subject of SUBJECTS) {
    it(`${subject.code}`, () => {
      const pack = results.find((x) => x.code === subject.code)!.pack!;
      const parsed = contentPack.safeParse(pack);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      }
    });
  }
});

describe("idempotencia", () => {
  it("dos ejecuciones producen packs byte-idénticos", () => {
    // Se extrae DE NUEVO desde disco: comparar un objeto consigo mismo no
    // probaría nada. Esto sí detecta un `Date.now()` o un id aleatorio.
    const second = runAll(repoRoot);
    for (const a of results) {
      const b = second.find((x) => x.code === a.code)!;
      if (a.pack === null || b.pack === null) continue;
      expect(serializePack(b.pack), `${a.code} difiere entre ejecuciones`).toBe(
        serializePack(a.pack),
      );
    }
  });

  it("el hash de integridad no cambia entre ejecuciones", () => {
    const second = runAll(repoRoot);
    for (const a of results) {
      const b = second.find((x) => x.code === a.code)!;
      expect(b.pack?.integrity).toBe(a.pack?.integrity);
    }
  });

  it("packs/ en disco está al día (si falla: `pnpm --filter @cet/content extract`)", () => {
    expect(checkPacksUpToDate(packsDir, results)).toEqual([]);
  });

  it("el JSON escrito se reparsea al mismo objeto (sin pérdida por unicode)", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      const text = readFileSync(join(packsDir, `${r.code}.json`), "utf8");
      expect(JSON.parse(text)).toEqual(JSON.parse(stableStringify(r.pack)));
    }
  });
});

describe("ids deterministas", () => {
  it("stableId es estable e insensible al orden de llamada", () => {
    expect(stableId("a", "b")).toBe(stableId("a", "b"));
    expect(stableId("a", "b")).not.toBe(stableId("b", "a"));
  });

  it("las partes no se pueden confundir por concatenación", () => {
    // Si el separador fuera "", ["a","b"] y ["ab"] colisionarían.
    expect(stableId("a", "b")).not.toBe(stableId("ab"));
    expect(stableId("a|b")).not.toBe(stableId("a", "b"));
  });

  it("uuidv5 produce un UUID válido con versión y variante correctas", () => {
    const id = uuidv5("x");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("contentHash ignora el orden de las claves pero no los valores", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });

  it("stableStringify normaliza `undefined` para que no dependa del orden", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("no hay ni un id repetido en el conjunto de los seis packs", () => {
    // Los seis packs se siembran en la MISMA base de datos: una colisión entre
    // materias rompe el seed igual que una colisión dentro de una.
    const seen = new Map<string, string>();
    for (const r of results) {
      if (r.pack === null) continue;
      for (const id of allIds(r.pack)) {
        const prev = seen.get(id);
        expect(prev, `${id} aparece en ${prev} y en ${r.code}`).toBeUndefined();
        seen.set(id, r.code);
      }
    }
    expect(seen.size).toBeGreaterThan(1000);
  });
});

describe("seguridad del contenido emitido", () => {
  it("ningún fragmento HTML del pack contiene marcado ejecutable", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      for (const html of allHtml(r.pack)) {
        expect(() => assertSafe(html)).not.toThrow();
      }
    }
  });

  it("los ficheros escritos no contienen `<script`, `on*=` ni `javascript:` en marcado", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      const text = readFileSync(join(packsDir, `${r.code}.json`), "utf8");
      expect(text.toLowerCase()).not.toContain("<script");
      expect(text.toLowerCase()).not.toContain("<iframe");
      expect(text.toLowerCase()).not.toContain("<svg");
      expect(text).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
    }
  });
});

describe("integridad semántica de los packs", () => {
  it("Math emite generadores, no preguntas estáticas", () => {
    const math = results.find((r) => r.code === "math")!.pack!;
    expect(math.questions.length).toBeGreaterThan(0);
    expect(math.questions.every((q) => q.kind === "generated")).toBe(true);
  });

  it("los engine_key de Math son exactamente el contrato acordado con @cet/engine", () => {
    const math = results.find((r) => r.code === "math")!.pack!;
    const keys = math.questions
      .flatMap((q) => (q.kind === "generated" ? [q.body.engineKey] : []))
      .sort();
    expect(keys).toEqual([
      "math.compare",
      "math.decimal",
      "math.fracop",
      "math.metric",
      "math.mixed",
      "math.powten",
      "math.shape",
      "math.simplify",
      "math.word",
    ]);
  });

  it("el blueprint de Math suma exactamente los 20 ítems del examen original", () => {
    const math = results.find((r) => r.code === "math")!.pack!;
    const total = math.blueprints[0]!.sections.reduce((a, s) => a + s.itemCount, 0);
    expect(total).toBe(20);
    expect(math.blueprints[0]!.durationSeconds).toBe(25 * 60);
  });

  it("una pregunta `generated` nunca lleva clave de respuesta estática", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      for (const q of r.pack.questions) {
        if (q.kind !== "generated") continue;
        expect(q.answerSpec.type).toBe("engine");
        expect(JSON.stringify(q.answerSpec)).not.toContain("correctIds");
      }
    }
  });

  it("toda pregunta estática apunta a una opción que existe", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      for (const q of r.pack.questions) {
        if (q.kind !== "static") continue;
        expect(q.answerSpec.type).toBe("choice");
        if (q.answerSpec.type !== "choice") continue;
        const ids = new Set(q.body.options.map((o) => o.id));
        for (const c of q.answerSpec.correctIds) expect(ids.has(c)).toBe(true);
      }
    }
  });

  it("el pack de Español va en `es` y los otros cinco en `en`", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      const expected = r.code === "spanish" ? "es" : "en";
      expect(r.pack.course.locale).toBe(expected);
      for (const q of r.pack.questions) expect(q.locale).toBe(expected);
      // Y no hay contaminación cruzada de idiomas en el I18nText.
      for (const l of r.pack.modules.flatMap((m) => m.lessons)) {
        expect(Object.keys(l.title)).toEqual([expected]);
      }
    }
  });

  it("Español conserva tildes, ñ y signos de apertura", () => {
    const es = results.find((r) => r.code === "spanish")!.pack!;
    const text = JSON.stringify(es);
    expect(text).toContain("ñ");
    expect(text).toContain("é");
    expect(text).toContain("¿");
    expect(text).toContain("í");
    // Ni un carácter de reemplazo: eso sería una decodificación rota.
    expect(text).not.toContain("�");
  });

  it("ningún pack contiene el carácter de reemplazo (mojibake)", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      expect(JSON.stringify(r.pack).includes("�"), `${r.code} tiene mojibake`).toBe(false);
    }
  });

  it("todos los packs conservan emoji", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      expect(/\p{Extended_Pictographic}/u.test(JSON.stringify(r.pack)), r.code).toBe(true);
    }
  });

  it("cada pack declara al menos un hueco: ninguno lo extrajo todo", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      expect(r.pack.gaps.length, `${r.code} presume de cobertura total`).toBeGreaterThan(0);
      for (const g of r.pack.gaps) expect(g.reason.length).toBeGreaterThan(20);
    }
  });

  it("las rutas de trazabilidad usan `/` y apuntan a Y6A", () => {
    for (const r of results) {
      if (r.pack === null) continue;
      for (const q of r.pack.questions) {
        expect(q.source.file).not.toContain("\\");
        expect(q.source.file.startsWith("Y6A/")).toBe(true);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Solo los ids UUID: los de opción (`o1`, `o2`) son locales a su pregunta y
 * repetirse es su comportamiento correcto, no una colisión.
 */
function allIds(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) allIds(v, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "id" && typeof v === "string" && UUID_RE.test(v)) out.push(v);
      else allIds(v, out);
    }
  }
  return out;
}

function allHtml(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) allHtml(v, out);
  } else if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Un I18nText: sus valores son HTML saneado.
    if (typeof obj["es"] === "string" || typeof obj["en"] === "string") {
      for (const l of ["es", "en"]) {
        const v = obj[l];
        if (typeof v === "string") out.push(v);
      }
      return out;
    }
    for (const v of Object.values(obj)) allHtml(v, out);
  }
  return out;
}
