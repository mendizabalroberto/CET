/**
 * Tests del corpus: extracción determinista y la puerta de verificación.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los tests de extracción corren contra los ficheros REALES de Y6A, no contra
 * un fixture cómodo. Un fixture inventado por mí demuestra que mi extractor
 * entiende mi propio XML; sirve de poco. El .docx real trae lo que trae: saltos
 * blandos a mitad de frase, emojis, tablas y párrafos vacíos.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { docxToSpans } from "../src/corpus/office.ts";
import { ingest, inventory } from "../src/corpus/ingest.ts";
import { checksumOf, normalizeForQuote, makeSpan, type SourceSpan } from "../src/corpus/spans.ts";
import { verifyCandidate, type CandidateInput } from "../src/corpus/verify.ts";
import {
  cargarTranscripcion,
  nombreDeTranscripcion,
  TranscripcionCaducaError,
  TRANSCRIPTS_DIR,
} from "../src/corpus/transcript.ts";
import { readZip, ZipError } from "../src/corpus/zip.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CW27 = join(repoRoot, "Y6A", "Science", "Classwork 27.docx");

/**
 * ¿Está el material fuente en este clon?
 *
 * `Y6A/` está en .gitignore a propósito: es material del centro educativo,
 * propiedad de terceros, y no se versiona. Por tanto NO existe en CI, ni en un
 * worktree, ni en el clon de nadie que no lo tenga aparte.
 *
 * Estos tests corren contra los ficheros reales —un fixture inventado por mí
 * demostraría que mi extractor entiende mi propio XML, que sirve de poco— así
 * que sin material se saltan, con un motivo legible, en vez de reventar la
 * suite con una cascada de ENOENT. Es el mismo patrón que ya usaba
 * `pipeline.test.ts`; no haberlo seguido dejó CI en rojo y tumbó dos contratos
 * de DeepSeek que verificaban con esta misma orden.
 */
const hayMaterial = existsSync(join(repoRoot, "Y6A"));
const describeConMaterial = hayMaterial ? describe : describe.skip;


describeConMaterial("readZip", () => {
  it("lee el directorio central de un .docx real", () => {
    const entries = readZip(readFileSync(CW27));
    expect(entries.has("word/document.xml")).toBe(true);
    expect(entries.get("word/document.xml")!.read().toString("utf8")).toContain("<w:body>");
  });

  it("rechaza lo que no es un ZIP en vez de devolver basura", () => {
    expect(() => readZip(Buffer.from("esto no es un zip"))).toThrow(ZipError);
  });
});

describeConMaterial("docxToSpans", () => {
  let spans: SourceSpan[];
  beforeAll(() => {
    spans = docxToSpans(readFileSync(CW27));
  });

  it("saca el título como heading, no como párrafo", () => {
    expect(spans[0]?.kind).toBe("heading");
    expect(spans[0]?.text).toContain("Classwork#27");
  });

  it("no emite spans vacíos", () => {
    expect(spans.every((s) => s.text.trim() !== "")).toBe(true);
  });

  it("da ord consecutivo desde 0: es la clave con la que se cita", () => {
    expect(spans.map((s) => s.ord)).toEqual(spans.map((_, i) => i));
  });

  it("parte por renglón, de modo que cada pregunta numerada es un span propio", () => {
    const numeradas = spans.filter((s) => /^\d+\.\s/.test(s.text));
    expect(numeradas.length).toBeGreaterThanOrEqual(4);
    // Si un span se tragara al siguiente, arrastraría dos numeraciones.
    for (const s of numeradas) expect(s.text.match(/(^|\s)\d+\.\s/g)?.length).toBe(1);
  });

  it("une la línea que continúa una frase partida por un salto blando", () => {
    const cw30 = docxToSpans(readFileSync(join(repoRoot, "Y6A", "Science", "Classwork 30.docx")));
    const suelta = cw30.find((s) => s.text.startsWith("symbols are simple"));
    expect(suelta).toBeUndefined();
    expect(cw30.some((s) => s.text.includes("Circuit symbols are simple"))).toBe(true);
  });

  it("el checksum es el del texto normalizado", () => {
    expect(spans[0]?.checksum).toBe(checksumOf(spans[0]!.text));
  });
});

describeConMaterial("inventory", () => {
  let inv: ReturnType<typeof inventory>;
  beforeAll(() => {
    inv = inventory(repoRoot);
  });

  it("clasifica los 71 ficheros de Y6A sin dejar ninguno sin carril", () => {
    expect(inv.length).toBe(71);
    expect(inv.every((e) => e.method !== undefined)).toBe(true);
  });

  it("detecta el duplicado exacto de Math por sha256", () => {
    const dups = inv.filter((e) => e.duplicateOf !== null);
    expect(dups.length).toBe(1);
    expect(dups[0]!.path).toContain("Grade 5 Math Exam");
  });

  it("manda al carril de visión lo que no tiene texto que extraer", () => {
    const ict = inv.filter((e) => e.subjectCode === "ict" && e.ext === ".jpg");
    expect(ict.length).toBe(19);
    expect(ict.every((e) => e.method === "vision")).toBe(true);
  });

  // Una imagen SIN transcripcion no se puede ingerir. Se construye la entrada a
  // mano en vez de coger una imagen real del repositorio: en cuanto alguien
  // transcribe esa imagen, el test empezaria a fallar sin que nada se hubiera
  // roto. Un test atado al estado del arbol miente en cuanto el arbol avanza.
  it("se niega a ingerir una imagen sin transcripcion, en vez de producir spans a medias", async () => {
    const sinTranscribir = {
      ...inv.find((e) => e.method === "vision")!,
      path: "Y6A/ICT/imagen-que-nadie-ha-transcrito.jpg",
      checksum: "f".repeat(64),
    };
    await expect(ingest(repoRoot, sinTranscribir)).rejects.toThrow(/transcripcion/);
  });

  // El PDF que en siete paginas aporta la palabra "notebooks" cinco veces. La
  // heuristica de bytes lo llama `text_layer`; solo al abrirlo se ve que es una
  // imagen con texto encima.
  //
  // Ya tiene transcripcion, asi que lo que se comprueba es la conducta buena:
  // el extractor descubre que su texto es decorativo y, en vez de rendirse,
  // usa la transcripcion. Antes se rendia con el fichero de vision ya escrito
  // al lado, y siete documentos de English se quedaban fuera del corpus.
  it("usa la transcripcion cuando el texto de un PDF resulta ser decorativo", async () => {
    const pobre = inv.find((e) => e.path.includes("ENGLISH INDEFINITE"))!;
    expect(pobre.method).toBe("text_layer");
    const doc = await ingest(repoRoot, pobre);
    expect(doc.extraction).toBe("vision");
    expect(doc.spans.length).toBeGreaterThan(20);
  });

  it("extrae de verdad un PDF con texto real, con su numero de pagina", async () => {
    const examen = inv.find((e) => e.path === "Y6A/Math/Grade 5 Math Exam.pdf")!;
    const doc = await ingest(repoRoot, examen);
    expect(doc.extraction).toBe("text_layer");
    expect(doc.pages).toBe(4);
    expect(doc.spans.length).toBeGreaterThan(100);
    expect(doc.spans.every((s) => s.page !== null && s.page >= 1 && s.page <= 4)).toBe(true);
  });
});

describe("normalizeForQuote", () => {
  it("unifica lo que rompe el copiado y nada más", () => {
    expect(normalizeForQuote("A  B")).toBe("A B");
    expect(normalizeForQuote("“hola”")).toBe('"hola"');
    expect(normalizeForQuote("uno—dos")).toBe("uno-dos");
  });

  it("no toca las mayúsculas ni las tildes: cambian el significado", () => {
    expect(normalizeForQuote("Sí, Ácido")).toBe("Sí, Ácido");
  });
});

/* -------------------------------------------------------------------------- */
/* La puerta                                                                  */
/* -------------------------------------------------------------------------- */

function spansOf(...texts: string[]): Map<number, SourceSpan> {
  return new Map(texts.map((t, i) => [i, makeSpan(i, "paragraph", t, null)]));
}

const SKILLS = new Set(["science.electricity.conductors"]);

function pregunta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-5111-8111-111111111111",
    kind: "static",
    skillCode: "science.electricity.conductors",
    format: "mcq_single",
    locale: "en",
    difficulty: 2,
    maxPoints: 1,
    gradingMode: "auto",
    body: {
      stem: { en: "Which material lets electricity flow?" },
      options: [
        { id: "o1", html: { en: "Copper" } },
        { id: "o2", html: { en: "Plastic" } },
      ],
    },
    answerSpec: { type: "choice", correctIds: ["o1"] },
    tags: [],
    source: { file: "Y6A/Science/Classwork 27.docx", symbol: "spans", index: 0 },
    ...overrides,
  };
}

describe("verifyCandidate", () => {
  const spans = spansOf("Copper is a conductor: it allows electricity to flow.");

  it("da verde a una pregunta citada literalmente y con la respuesta en la cita", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta(),
      citations: [{ spanOrd: 0, quote: "Copper is a conductor" }],
    };
    expect(verifyCandidate(cand, spans, SKILLS)).toEqual({ ok: true, failures: [] });
  });

  it("tolera comillas y espacios distintos, que es lo que rompe al copiar", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta(),
      citations: [{ spanOrd: 0, quote: "Copper is  a conductor" }],
    };
    expect(verifyCandidate(cand, spans, SKILLS).ok).toBe(true);
  });

  it("rechaza una cita que no está en el original aunque suene igual", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta(),
      citations: [{ spanOrd: 0, quote: "Copper is a good conductor" }],
    };
    const r = verifyCandidate(cand, spans, SKILLS);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("quote_not_literal");
  });

  it("rechaza citar un span que no existe", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta(),
      citations: [{ spanOrd: 99, quote: "lo que sea" }],
    };
    expect(verifyCandidate(cand, spans, SKILLS).failures[0]?.code).toBe("span_missing");
  });

  // El test que justifica todo el sistema: la cita es impecable y la pregunta
  // miente igual. Sin la comprobación 4 esto pasaría en verde.
  it("rechaza la pregunta cuya cita es correcta pero cuya respuesta marcada NO lo es", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta({ answerSpec: { type: "choice", correctIds: ["o2"] } }),
      citations: [{ spanOrd: 0, quote: "Copper is a conductor" }],
    };
    const r = verifyCandidate(cand, spans, SKILLS);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("answer_not_cited");
  });

  // Classwork 27 es una HOJA DE EJERCICIOS: imprime las dos opciones con la
  // casilla en blanco y no dice cual es la buena. Citar la opcion impresa para
  // justificar la respuesta no demuestra nada, y sin esta regla la
  // comprobacion 4 se satisface sola en cualquier ejercicio sin resolver.
  it("no acepta como prueba la propia opcion impresa de una hoja de ejercicios", () => {
    const hoja = spansOf("Metals are usually:", "☐ conductors", "☐ insulators");
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta({
        body: {
          stem: { en: "Metals are usually:" },
          options: [
            { id: "o1", html: { en: "conductors" } },
            { id: "o2", html: { en: "insulators" } },
          ],
        },
      }),
      citations: [
        { spanOrd: 0, quote: "Metals are usually:" },
        { spanOrd: 1, quote: "☐ conductors" },
      ],
    };
    const r = verifyCandidate(cand, hoja, SKILLS);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("answer_not_cited");
  });

  it("sigue aceptando una cita que dice de verdad cual es la respuesta", () => {
    const texto = spansOf("Metals are usually:", "Metals are usually conductors of electricity.");
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta({
        body: {
          stem: { en: "Metals are usually:" },
          options: [
            { id: "o1", html: { en: "conductors" } },
            { id: "o2", html: { en: "insulators" } },
          ],
        },
      }),
      citations: [{ spanOrd: 1, quote: "Metals are usually conductors" }],
    };
    expect(verifyCandidate(cand, texto, SKILLS).ok).toBe(true);
  });

  // Un examen sin resolver imprime sus cuatro opciones en una linea. Contiene
  // la respuesta correcta y tambien las tres falsas: no afirma nada. Sin esta
  // regla, cualquier examen en blanco justifica todas sus propias respuestas.
  it("no acepta como prueba la linea que enumera todas las opciones", () => {
    const examen = spansOf("6. 25.6 / 1,000 =", "a) 0.256 b) 2.56 c) 0.0256 d) 25,600");
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta({
        format: "mcq_single",
        body: {
          stem: { en: "25.6 / 1,000 =" },
          options: [
            { id: "o1", html: { en: "0.0256" } },
            { id: "o2", html: { en: "0.256" } },
            { id: "o3", html: { en: "2.56" } },
            { id: "o4", html: { en: "25,600" } },
          ],
        },
      }),
      citations: [
        { spanOrd: 0, quote: "6. 25.6 / 1,000 =" },
        { spanOrd: 1, quote: "a) 0.256 b) 2.56 c) 0.0256 d) 25,600" },
      ],
    };
    const r = verifyCandidate(cand, examen, SKILLS);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("answer_not_cited");
  });

  it("rechaza una skill que no existe en la taxonomía", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: pregunta({ skillCode: "science.inventada.total" }),
      citations: [{ spanOrd: 0, quote: "Copper is a conductor" }],
    };
    expect(verifyCandidate(cand, spans, SKILLS).failures.map((f) => f.code)).toContain(
      "unknown_skill",
    );
  });

  it("para en la forma y no finge haber comprobado el resto", () => {
    const cand: CandidateInput = {
      kind: "question",
      payload: { esto: "no es una pregunta" },
      citations: [{ spanOrd: 0, quote: "Copper is a conductor" }],
    };
    const r = verifyCandidate(cand, spans, SKILLS);
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]?.code).toBe("schema");
  });

  it("un candidato sin ninguna cita no pasa", () => {
    const cand: CandidateInput = { kind: "question", payload: pregunta(), citations: [] };
    expect(verifyCandidate(cand, spans, SKILLS).failures.map((f) => f.code)).toContain(
      "no_citations",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Transcripciones: el carril de vision                                       */
/* -------------------------------------------------------------------------- */

describe("cargarTranscripcion", () => {
  const raiz = join(tmpdir(), "cet-transcript-test");
  const destino = join(raiz, TRANSCRIPTS_DIR);
  const ruta = "Y6A/ICT/pagina.jpg";
  const suma = "a".repeat(64);

  function escribir(datos: unknown): void {
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, nombreDeTranscripcion(ruta)), JSON.stringify(datos), "utf8");
  }

  const valida = {
    path: ruta,
    checksum: suma,
    locale: "en",
    pages: 1,
    transcribedBy: "claude-vision",
    gaps: ["la esquina inferior derecha esta cortada"],
    spans: [
      { page: 1, kind: "heading", text: "Hardware and Software" },
      { page: 1, kind: "paragraph", text: "Hardware is the physical part of a computer." },
    ],
  };

  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true });
  });

  it("devuelve null cuando aun no hay transcripcion: eso no es un error", () => {
    mkdirSync(destino, { recursive: true });
    expect(cargarTranscripcion(raiz, ruta, suma)).toBeNull();
  });

  it("carga los spans con ord consecutivo, que es con lo que se cita", () => {
    escribir(valida);
    const t = cargarTranscripcion(raiz, ruta, suma)!;
    expect(t.spans.map((s) => s.ord)).toEqual([0, 1]);
    expect(t.spans[0]?.kind).toBe("heading");
    expect(t.gaps).toHaveLength(1);
  });

  // El fallo que este checksum existe para impedir: una transcripcion vieja
  // sobre una imagen nueva no rompe nada, describe otra cosa. Y nadie lo ve.
  it("se niega a usar una transcripcion de otra version del fichero", () => {
    escribir(valida);
    expect(() => cargarTranscripcion(raiz, ruta, "b".repeat(64))).toThrow(TranscripcionCaducaError);
  });

  it("rechaza una transcripcion sin spans en vez de ingerir un documento vacio", () => {
    escribir({ ...valida, spans: [] });
    expect(() => cargarTranscripcion(raiz, ruta, suma)).toThrow();
  });

  it("rechaza un kind que no existe", () => {
    escribir({ ...valida, spans: [{ page: 1, kind: "parrafo", text: "x" }] });
    expect(() => cargarTranscripcion(raiz, ruta, suma)).toThrow();
  });

  it("da nombres de fichero distintos a la pagina 1 y a la 10", () => {
    expect(nombreDeTranscripcion("Y6A/ICT/paginas-1.jpg")).not.toBe(
      nombreDeTranscripcion("Y6A/ICT/paginas-10.jpg"),
    );
  });
});
