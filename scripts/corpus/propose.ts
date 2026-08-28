/**
 * Contratos de corpus para DeepSeek: spans -> candidatos citados.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El motor de `scripts/deepseek/run-contract.mjs` está hecho para parches de
 * código: aísla un worktree, pide un diff unificado y vigila el territorio de
 * ficheros. Un contrato de corpus tiene otra forma —entra el texto de UN
 * documento, sale JSON, y la puerta es `verifyCandidate`— así que aquí va su
 * propio motor. Lo que sí se hereda, textual, son las cinco reglas del §6 del
 * traspaso y la contabilidad de tokens por pantalla.
 *
 * El territorio es el documento. Dos documentos distintos no comparten un solo
 * span, así que el lote paralelo no necesita la validación de territorios
 * disjuntos que exige el motor de código: aquí son disjuntos por construcción.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

import { verifyCandidate, type CandidateInput, type VerifyReport } from "../../packages/content/src/corpus/verify.ts";
import { makeSpan, type SourceSpan } from "../../packages/content/src/corpus/spans.ts";

const API = "https://api.deepseek.com/chat/completions";

/** Precio por millón de tokens, USD. Estimación impresa, no factura. */
const PRICE: Record<string, { in: number; cachedIn: number; out: number }> = {
  "deepseek-chat": { in: 0.27, cachedIn: 0.07, out: 1.1 },
  "deepseek-reasoner": { in: 0.55, cachedIn: 0.14, out: 2.19 },
};

/**
 * La clave se llama `DEEP_SEEK_API` — con guion bajo entre las dos palabras.
 * Un grep de "DEEPSEEK" no la encuentra. Si falta, el fallo tiene que ser claro
 * aquí y no un 401 desde la red tres pasos más adelante.
 */
export function apiKey(repoRoot: string): string {
  /* eslint-disable-next-line no-restricted-properties */
  const delEntorno = process.env["DEEP_SEEK_API"];
  if (delEntorno) return delEntorno.trim();
  const linea = readFileSync(join(repoRoot, "secrets", "accounts.env"), "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*DEEP_SEEK_API\s*=/.test(l));
  if (!linea) {
    throw new Error("secrets/accounts.env no define DEEP_SEEK_API (con guion bajo, no DEEPSEEK_API_KEY)");
  }
  const valor = linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!valor) throw new Error("DEEP_SEEK_API está definida pero vacía");
  return valor;
}

/* -------------------------------------------------------------------------- */
/* El prompt                                                                  */
/* -------------------------------------------------------------------------- */

/** Las cinco reglas del proyecto, textuales (HANDOFF-DEEPSEEK §6). */
const REGLAS = `1. Verifica ejecutando. Salida literal. Nunca "deberia funcionar".
2. Un dato plausible no es un dato correcto.
3. Un test verde puede estar pasando por el motivo equivocado.
4. Nunca debilites una defensa para que algo pase.
5. Muta lo minimo.`;

const SISTEMA = `Eres un agente de contenido educativo para primaria (Year 6, 10-11 anos).
Trabajas SOLO con el texto que se te da. Escribes en el idioma del documento.

${REGLAS}

Tu encargo: convertir el material de UN documento en preguntas de examen y
bloques de leccion, cada uno CITANDO literalmente el material del que sale.

LA REGLA QUE LO GOBIERNA TODO:
Una cita es un trozo copiado CARACTER A CARACTER de un span. No la parafrasees,
no la corrijas, no le arregles la ortografia, no la completes. Se comprueba por
programa contra el original: si no esta literalmente, el candidato se rechaza
entero y has perdido la ronda.

Y la segunda, que es donde caen casi todos:
La RESPUESTA CORRECTA tiene que aparecer en lo que citas. No basta con citar el
parrafo del tema; hay que citar el trozo que sostiene la respuesta. Si el
material no dice cual es la respuesta, NO INVENTES LA PREGUNTA: saltatela. Es
preferible sacar cuatro preguntas solidas que doce de las que ocho mienten.

No uses conocimiento propio. Si sabes que el cobre conduce la electricidad pero
el documento no lo dice, esa pregunta no existe para este encargo.

FORMATO DE RESPUESTA - obligatorio:
UNICAMENTE un objeto JSON, sin prosa alrededor y sin bloque cercado:

{"candidates":[
  {"kind":"question",
   "payload":{
     "kind":"static","skillCode":"<uno de los permitidos>","format":"mcq_single",
     "locale":"<el del documento>","difficulty":2,"maxPoints":1,
     "gradingMode":"auto","tags":[],
     "body":{"stem":{"<locale>":"..."},
             "options":[{"id":"o1","html":{"<locale>":"..."}},
                        {"id":"o2","html":{"<locale>":"..."}},
                        {"id":"o3","html":{"<locale>":"..."}},
                        {"id":"o4","html":{"<locale>":"..."}}]},
     "answerSpec":{"type":"choice","correctIds":["o1"]}},
   "citations":[{"spanOrd":12,"quote":"copiado literal del span 12"}]}
]}

Reglas del formato:
- 'format' "mcq_single" exige EXACTAMENTE un id en correctIds, y al menos 2
  opciones. Usa 4 cuando el material de para cuatro.
- 'skillCode' tiene que ser uno de la lista que se te da. No inventes codigos.
- 'id' de opcion: o1, o2, o3, o4.
- Sin campo 'id' ni 'source': los pone el sistema.
- El texto de la opcion CORRECTA tiene que aparecer dentro de alguna de tus
  citas. Si para eso necesitas citar dos spans, cita dos.`;

/* -------------------------------------------------------------------------- */
/* La llamada                                                                 */
/* -------------------------------------------------------------------------- */

export interface Coste {
  usd: number;
  entrada: number;
  salida: number;
}

let TOTAL_USD = 0;

export function costeAcumulado(): number {
  return TOTAL_USD;
}

interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

async function preguntar(
  key: string,
  model: string,
  messages: Mensaje[],
  temp: number,
  etiqueta: string,
): Promise<{ texto: string; coste: Coste }> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: temp,
      max_tokens: model === "deepseek-reasoner" ? 32000 : 8000,
      // El modo JSON de DeepSeek: evita la mitad de los fallos de formato sin
      // tener que pedirlo por favor en el prompt.
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as {
    usage?: Record<string, number>;
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const u = json.usage ?? {};
  const p = PRICE[model] ?? PRICE["deepseek-chat"]!;
  const hit = u["prompt_cache_hit_tokens"] ?? 0;
  const miss = u["prompt_cache_miss_tokens"] ?? (u["prompt_tokens"] ?? 0) - hit;
  const salida = u["completion_tokens"] ?? 0;
  const usd = (miss / 1e6) * p.in + (hit / 1e6) * p.cachedIn + (salida / 1e6) * p.out;
  TOTAL_USD += usd;
  console.log(
    `    ${etiqueta}  entrada ${u["prompt_tokens"] ?? "?"} (cache ${hit})  salida ${salida}  ~ $${usd.toFixed(4)}  acumulado $${TOTAL_USD.toFixed(4)}`,
  );

  const texto = (json.choices?.[0]?.message?.content ?? "").trim();
  if (!texto) {
    throw new Error(`respuesta vacia (finish_reason=${json.choices?.[0]?.finish_reason ?? "?"})`);
  }
  return { texto, coste: { usd, entrada: u["prompt_tokens"] ?? 0, salida } };
}

/* -------------------------------------------------------------------------- */
/* Que clase de documento es                                                  */
/* -------------------------------------------------------------------------- */

/** Huecos en blanco: la marca de un ejercicio sin resolver. */
const HUECOS = /_{3,}|☐|□|→\s*$|\.{4,}/u;

/**
 * ¿Es una hoja de ejercicios con las respuestas en blanco?
 *
 * Importa más de lo que parece. En `Classwork 27` el material imprime
 *
 *     Metals are usually:   ☐ conductors   ☐ insulators
 *
 * y no dice cuál es la buena. Un agente propone "Metals are usually
 * conductors", cita las dos opciones, y la verificación la da por buena: la
 * cita es literal y la respuesta aparece en lo citado. Pero la respuesta no
 * sale del documento — sale de lo que el modelo ya sabía.
 *
 * Ninguna regla de citas arregla eso, porque comparando subcadenas no se puede
 * distinguir "el material AFIRMA X" de "el material PREGUNTA por X". Lo que sí
 * se puede es reconocer la clase de documento: una hoja con huecos en blanco es
 * fuente de PREGUNTAS, no de RESPUESTAS. Sus candidatos entran en cuarentena
 * como `pending` —no como `verified`— y es una persona quien confirma la
 * respuesta.
 */
export function esHojaDeEjercicios(spans: { text: string }[]): boolean {
  if (spans.length === 0) return false;
  const conHueco = spans.filter((s) => HUECOS.test(s.text)).length;
  return conHueco / spans.length >= 0.15;
}

/* -------------------------------------------------------------------------- */
/* El contrato de un documento                                                */
/* -------------------------------------------------------------------------- */

export interface DocumentoParaProponer {
  id: string;
  path: string;
  subjectCode: string;
  locale: string;
  spans: { id: string; ord: number; kind: string; text: string; page: number | null }[];
}

export interface Propuesta {
  candidato: CandidateInput;
  report: VerifyReport;
  spanIds: Map<number, string>;
}

export interface ResultadoDocumento {
  documento: DocumentoParaProponer;
  /** El documento es una hoja de ejercicios: sus verdes van a `pending`. */
  hojaDeEjercicios: boolean;
  verdes: Propuesta[];
  /** Los que siguen en rojo al agotar las rondas. */
  rojos: Propuesta[];
  /**
   * Motivos de rechazo de TODAS las rondas, no solo de la ultima.
   *
   * Sin esto el informe miente por omision: un documento que en la primera
   * ronda produce nueve preguntas mal citadas y en la segunda las retira sale
   * como "0 rojos", y nadie se entera de que el prompt tiene un problema.
   */
  motivos: Map<string, number>;
  /** Cuantos candidatos se cayeron por el camino y el agente no rehizo. */
  descartados: number;
  rondas: number;
  usd: number;
  error: string | null;
}

/** Lo que se le enseña del documento: sus spans, numerados por `ord`. */
function cuerpoDelContrato(doc: DocumentoParaProponer, skills: string[]): string {
  const lineas = doc.spans.map(
    (s) => `[${s.ord}]${s.page === null ? "" : ` (p${s.page})`} ${s.text}`,
  );
  return `DOCUMENTO: ${doc.path}
MATERIA: ${doc.subjectCode}
IDIOMA: ${doc.locale}

SKILLS PERMITIDAS (usa exactamente uno de estos codigos):
${skills.map((s) => `  ${s}`).join("\n")}

SPANS (el numero entre corchetes es el spanOrd con el que se cita):
${lineas.join("\n")}

${
    esHojaDeEjercicios(doc.spans)
      ? `
ATENCION: este documento es una HOJA DE EJERCICIOS SIN RESOLVER. Imprime las
opciones y los huecos, pero NO dice cuales son las respuestas. Enumerar las dos
opciones no es decir cual es la buena.
Solo propon una pregunta si la respuesta esta AFIRMADA en algun span de este
mismo documento (una definicion, una regla, un ejemplo resuelto). Si el
documento solo pregunta, no hay preguntas que sacar: devuelve la lista vacia.
`
      : ""
}
Saca todas las preguntas que el material sostenga por si solo. Ni una mas.`;
}

/** Extrae el JSON aunque venga envuelto en un bloque cercado. */
function leerJson(texto: string): { candidates?: unknown[] } {
  const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(limpio) as { candidates?: unknown[] };
}

/**
 * Normaliza lo que devuelve el modelo a un `CandidateInput`.
 *
 * El id y el `source` los pone el sistema, no el agente: pedirle un uuid a un
 * modelo es pedirle que lo invente, y `source` tiene que apuntar al documento
 * de verdad, no a donde el modelo crea que estaba.
 */
function normalizar(
  bruto: unknown,
  doc: DocumentoParaProponer,
  indice: number,
): CandidateInput | null {
  if (bruto === null || typeof bruto !== "object") return null;
  const c = bruto as Record<string, unknown>;
  const payload = c["payload"];
  if (payload === null || typeof payload !== "object") return null;
  const citas = Array.isArray(c["citations"]) ? c["citations"] : [];

  const p = payload as Record<string, unknown>;
  p["id"] = uuidDeterminista(`${doc.id}:${indice}`);
  p["source"] = { file: doc.path, symbol: "spans", index: indice };

  return {
    kind: c["kind"] === "lesson_block" ? "lesson_block" : "question",
    payload: p,
    citations: citas
      .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
      .map((x) => ({
        spanOrd: Number(x["spanOrd"]),
        // Un modelo puede devolver un objeto donde se le pidio una cadena; sin
        // esto acabaria guardando la cita "[object Object]".
        quote: typeof x["quote"] === "string" ? x["quote"] : "",
      })),
  };
}

/**
 * UUID determinista a partir de una semilla.
 *
 * El id lo pone el sistema y no el agente: pedirle un uuid a un modelo es
 * pedirle que lo invente, y ademas hace que reproponer el mismo documento
 * genere ids distintos para la misma pregunta. Con esto, el documento y la
 * posicion mandan.
 */
function uuidDeterminista(semilla: string): string {
  const h = createHash("sha256").update(semilla, "utf8").digest("hex").slice(0, 32).split("");
  h[12] = "5"; // version
  h[16] = "8"; // variante RFC 4122
  const x = h.join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Ejecuta el contrato de un documento: propone, verifica, y reintenta con la
 * salida LITERAL del fallo hasta agotar las rondas.
 */
export async function proponerDocumento(
  key: string,
  doc: DocumentoParaProponer,
  skills: string[],
  opciones: { model: string; rondas: number },
): Promise<ResultadoDocumento> {
  const spanIds = new Map<number, string>(doc.spans.map((s) => [s.ord, s.id]));
  const spans = new Map<number, SourceSpan>(
    doc.spans.map((s) => [s.ord, makeSpan(s.ord, "paragraph", s.text, s.page)]),
  );
  const conjuntoSkills = new Set(skills);
  const etiqueta = doc.path.split("/").pop() ?? doc.path;

  const messages: Mensaje[] = [
    { role: "system", content: SISTEMA },
    { role: "user", content: cuerpoDelContrato(doc, skills) },
  ];

  const verdes: Propuesta[] = [];
  let rojos: Propuesta[] = [];
  const motivos = new Map<string, number>();
  let descartados = 0;
  let siguienteIndice = 0;
  let usd = 0;
  let ronda = 0;

  while (ronda < opciones.rondas) {
    ronda += 1;
    let texto: string;
    try {
      // La temperatura sube con la ronda: repetir a 0 devuelve el mismo error.
      const r = await preguntar(key, opciones.model, messages, Math.min((ronda - 1) * 0.3, 0.9), etiqueta);
      texto = r.texto;
      usd += r.coste.usd;
    } catch (error) {
      return {
        documento: doc,
        hojaDeEjercicios: esHojaDeEjercicios(doc.spans),
        verdes,
        rojos,
        motivos,
        descartados,
        rondas: ronda,
        usd,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    messages.push({ role: "assistant", content: texto });

    let brutos: unknown[];
    try {
      brutos = leerJson(texto).candidates ?? [];
    } catch {
      messages.push({ role: "user", content: "Eso no era JSON valido. Responde SOLO el objeto JSON." });
      continue;
    }

    descartados += rojos.length;
    rojos = [];
    brutos.forEach((bruto) => {
      // Contador PROPIO, monotono y que no se reinicia entre rondas.
      //
      // Antes el indice era `verdes.length + i`, y eso colisiona: si la ronda 1
      // deja dos verdes, el segundo se numero 2; en la ronda 2 el primer
      // candidato vuelve a ser 2 + 0 = 2. Dos preguntas distintas con el mismo
      // id determinista. No rompio nada —el publicador se nego a reescribir una
      // version inmutable— pero tres preguntas de la pagina 8 de ICT se
      // quedaron sin publicar y nadie lo habria notado sin mirar los saltados.
      const cand = normalizar(bruto, doc, siguienteIndice++);
      if (!cand) return;
      const report = verifyCandidate(cand, spans, conjuntoSkills);
      const propuesta: Propuesta = { candidato: cand, report, spanIds };
      if (report.ok) {
        verdes.push(propuesta);
      } else {
        rojos.push(propuesta);
        for (const f of report.failures) motivos.set(f.code, (motivos.get(f.code) ?? 0) + 1);
      }
    });

    if (rojos.length === 0) break;
    if (ronda >= opciones.rondas) break;

    // Se le devuelve la salida LITERAL del fallo, no un resumen. Es la
    // diferencia entre minutos y media hora (HANDOFF-DEEPSEEK §5.8).
    const informe = rojos
      .map((r, i) => {
        const stem = (r.candidato.payload as { body?: { stem?: Record<string, string> } }).body?.stem;
        const titulo = stem ? Object.values(stem)[0] : "(sin enunciado)";
        return `#${i} "${String(titulo).slice(0, 70)}"\n` + r.report.failures.map((f) => `   ${f.code}: ${f.detail}`).join("\n");
      })
      .join("\n");

    messages.push({
      role: "user",
      content: `${verdes.length} aceptadas. ${rojos.length} RECHAZADAS por la verificacion:

${informe}

Devuelve SOLO las corregidas, en el mismo formato JSON. No repitas las aceptadas.
Si una pregunta no se puede sostener con lo que el documento dice, no la corrijas: eliminala.`,
    });
  }

  return {
    documento: doc,
    hojaDeEjercicios: esHojaDeEjercicios(doc.spans),
    verdes,
    rojos,
    motivos,
    descartados,
    rondas: ronda,
    usd,
    error: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Persistencia                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Guarda los candidatos en cuarentena. Un candidato verde entra como
 * `verified`; uno rojo, como `rejected` **con su informe**, porque tirar la
 * evidencia obliga a pagar otra vez para saber qué pasó.
 *
 * Va todo en una transacción por documento: el trigger que exige al menos una
 * cita es DIFERIDO, así que candidato y citas tienen que estar en el mismo
 * COMMIT.
 */
export async function persistirPropuestas(
  client: pg.Client,
  documentId: string,
  propuestas: Propuesta[],
  meta: { model: string; rondas: number; hojaDeEjercicios: boolean },
): Promise<{ guardados: number; sinCita: number }> {
  let guardados = 0;
  let sinCita = 0;

  for (const p of propuestas) {
    // Una cita a un span inexistente no tiene fila que referenciar: la FK la
    // rechazaria y se llevaria por delante toda la transaccion. Se descarta
    // aqui, contada, en vez de reventar el lote.
    const citasResueltas = p.candidato.citations
      .map((c) => ({ spanId: p.spanIds.get(c.spanOrd), quote: c.quote }))
      .filter((c): c is { spanId: string; quote: string } => c.spanId !== undefined);
    if (citasResueltas.length === 0) {
      sinCita += 1;
      continue;
    }

    await client.query("begin");
    try {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.content_candidates
           (document_id, kind, payload, status, verify_report, model, rounds)
         values ($1, $2::public.candidate_kind, $3::jsonb, $4::public.candidate_status, $5::jsonb, $6, $7)
         returning id`,
        [
          documentId,
          p.candidato.kind,
          JSON.stringify(p.candidato.payload),
          // Verde en una hoja de ejercicios no es "verificado": es "propuesto,
          // y alguien tiene que decir si la respuesta es esa".
          p.report.ok ? (meta.hojaDeEjercicios ? "pending" : "verified") : "rejected",
          JSON.stringify(p.report),
          meta.model,
          meta.rondas,
        ],
      );
      const candidateId = rows[0]!.id;
      for (const c of citasResueltas) {
        await client.query(
          `insert into public.content_candidate_citations (candidate_id, span_id, quote)
           values ($1, $2, $3)
           on conflict do nothing`,
          [candidateId, c.spanId, c.quote],
        );
      }
      await client.query("commit");
      guardados += 1;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  }
  return { guardados, sinCita };
}
