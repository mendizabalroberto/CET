/**
 * `pnpm corpus` — revisar, procesar y subir el material educativo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 *   pnpm corpus status                      qué hay, por carril, y qué falta
 *   pnpm corpus doctor                      qué impide subir algo, y por qué
 *   pnpm corpus ingest [materia|ruta]       Y6A -> spans (determinista)
 *   pnpm corpus verify <candidatos.json>    la puerta: cita literal + esquema
 *   pnpm corpus review [--approve <id>]     cola de revisión humana
 *   pnpm corpus push [--packs]              siembra en Supabase
 *
 * REGLA DE ORO de este mando: **nada escribe en la base de datos sin `--apply`**.
 * Sin la bandera, cada subcomando dice exactamente lo que haría y sale con 0.
 * Subir contenido a la plataforma es una acción difícil de deshacer, y la
 * confirmación no debe depender de acordarse.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ingest, inventory, NotIngestibleError, type InventoryEntry } from "../../packages/content/src/corpus/ingest.ts";
import { verifyCandidate, type CandidateInput } from "../../packages/content/src/corpus/verify.ts";
import { makeSpan, type SourceDocument, type SourceSpan } from "../../packages/content/src/corpus/spans.ts";
import {
  cargarTranscripcion,
  nombreDeTranscripcion,
  TRANSCRIPTS_DIR,
} from "../../packages/content/src/corpus/transcript.ts";
import { contentPack, type ContentPack } from "../../packages/content/src/schema.ts";

import { connect, corpusTablesExist, PROJECT_REF } from "./db.ts";
import { publicarAprobados } from "./publish.ts";
import { BUCKET, subirOriginales } from "./upload.ts";
import { blueprintMismatches, persistDocument, seedPack, type SeedGap } from "./seed.ts";
import {
  apiKey,
  costeAcumulado,
  persistirPropuestas,
  proponerDocumento,
  type DocumentoParaProponer,
  type ResultadoDocumento,
} from "./propose.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const packsDir = join(repoRoot, "packages", "content", "packs");

const argv = process.argv.slice(2);
const command = argv[0] ?? "help";
const apply = argv.includes("--apply");
/**
 * Opciones que llevan valor. Sin esta lista, el "4" de `--parallel 4` se cuela
 * como si fuera el documento pedido, y el subcomando se queda buscando un
 * fichero llamado "4". Costo un lote entero.
 */
const CON_VALOR = new Set(["--rounds", "--parallel", "--limit", "--approve", "--reject", "--as"]);

/** Los argumentos que NO son opciones ni valores de opcion. */
const flagless = argv.slice(1).filter((a, i) => {
  if (a.startsWith("--")) return false;
  const anterior = argv[i]; // argv[i] es el elemento anterior, porque este slice empieza en 1
  return anterior === undefined || !CON_VALOR.has(anterior);
});

/** Lee una opcion con valor: `--rounds 3`. Devuelve undefined si no esta. */
function leerOpcion(nombre: string): string | undefined {
  const i = argv.indexOf(nombre);
  return i >= 0 ? argv[i + 1] : undefined;
}

function packFiles(): string[] {
  return readdirSync(packsDir).filter((f) => f.endsWith(".json")).sort();
}

/**
 * Lee un pack y lo VALIDA contra su Zod antes de devolverlo. Un pack corrupto
 * tiene que romper aquí, no a mitad de una transacción de sembrado.
 */
function readPack(file: string): ContentPack {
  return contentPack.parse(JSON.parse(readFileSync(join(packsDir, file), "utf8")));
}

function bar(n: number, of: number, width = 24): string {
  const filled = of === 0 ? 0 : Math.round((n / of) * width);
  return "#".repeat(filled) + ".".repeat(width - filled);
}

/* ========================================================================== */
/* status                                                                     */
/* ========================================================================== */

async function cmdStatus(): Promise<void> {
  const inv = inventory(repoRoot);

  console.log("\nY6A por carril de extraccion\n");
  const byMethod = new Map<string, InventoryEntry[]>();
  for (const e of inv) {
    const k = e.duplicateOf ? "duplicado" : e.method;
    byMethod.set(k, [...(byMethod.get(k) ?? []), e]);
  }
  const order = ["html_trainer", "office_xml", "plain", "text_layer", "vision", "duplicado"];
  const explain: Record<string, string> = {
    html_trainer: "ya extraido por el pipeline de trainers",
    office_xml: "determinista, listo",
    plain: "determinista, listo",
    text_layer: "determinista, FALTA el extractor de PDF",
    vision: "exige transcripcion mirando: DeepSeek no ve imagenes",
    duplicado: "mismo sha256 que otro fichero",
  };
  for (const k of order) {
    const list = byMethod.get(k) ?? [];
    if (list.length === 0) continue;
    console.log(
      `  ${k.padEnd(13)} ${String(list.length).padStart(3)}  ${bar(list.length, inv.length)}  ${explain[k]}`,
    );
  }
  console.log(`  ${"TOTAL".padEnd(13)} ${String(inv.length).padStart(3)}`);

  console.log("\nY6A por materia\n");
  const subjects = [...new Set(inv.map((e) => e.subjectCode))].sort();
  console.log(`  ${"materia".padEnd(10)} ${"total".padStart(5)} ${"listos".padStart(6)} ${"vision".padStart(6)} ${"pdf".padStart(4)}`);
  for (const s of subjects) {
    const list = inv.filter((e) => e.subjectCode === s && !e.duplicateOf);
    const ready = list.filter((e) => e.method === "office_xml" || e.method === "plain").length;
    const vision = list.filter((e) => e.method === "vision").length;
    const pdf = list.filter((e) => e.method === "text_layer").length;
    console.log(
      `  ${s.padEnd(10)} ${String(list.length).padStart(5)} ${String(ready).padStart(6)} ${String(vision).padStart(6)} ${String(pdf).padStart(4)}`,
    );
  }

  console.log("\nPacks en disco\n");
  let totalQ = 0;
  for (const f of packFiles()) {
    const p = readPack(f);
    const lessons = p.modules.reduce((a, m) => a + m.lessons.length, 0);
    totalQ += p.questions.length;
    console.log(
      `  ${f.replace(".json", "").padEnd(10)} ${String(lessons).padStart(3)} lecciones  ${String(p.questions.length).padStart(4)} preguntas`,
    );
  }
  console.log(`  ${"TOTAL".padEnd(10)} ${" ".repeat(15)}${String(totalQ).padStart(4)} preguntas`);

  await withDb(async (client) => {
    const { rows: q } = await client.query<{ n: string }>("select count(*)::text n from public.questions");
    const { rows: l } = await client.query<{ n: string }>("select count(*)::text n from public.lessons");
    console.log("\nEn la base de datos\n");
    console.log(`  lecciones  ${String(l[0]?.n).padStart(4)}`);
    console.log(`  preguntas  ${String(q[0]?.n).padStart(4)}   (de ${totalQ} extraidas)`);
    if (await corpusTablesExist(client)) {
      const { rows: d } = await client.query<{ n: string }>("select count(*)::text n from public.source_documents");
      const { rows: s } = await client.query<{ n: string }>("select count(*)::text n from public.source_spans");
      console.log(`  documentos ${String(d[0]?.n).padStart(4)}`);
      console.log(`  spans      ${String(s[0]?.n).padStart(4)}`);
    } else {
      console.log("  corpus     sin aplicar la migracion 0027_corpus.sql");
    }
  });
  console.log("");
}

/** Ejecuta algo contra la base de datos, y si no se puede lo dice sin romper. */
async function withDb(fn: (client: Awaited<ReturnType<typeof connect>>) => Promise<void>): Promise<void> {
  let client: Awaited<ReturnType<typeof connect>> | null = null;
  try {
    client = await connect(repoRoot);
  } catch (error) {
    console.log("\nSin conexion a la base de datos:", error instanceof Error ? error.message : String(error));
    return;
  }
  try {
    await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/* ========================================================================== */
/* doctor — que impide subir, y por que                                        */
/* ========================================================================== */

function cmdDoctor(): void {
  const problems: SeedGap[] = [];
  for (const f of packFiles()) problems.push(...blueprintMismatches(readPack(f)));

  console.log("\nDesacuerdos entre el pack y el esquema\n");
  if (problems.length === 0) {
    console.log("  ninguno.");
  } else {
    for (const p of problems) console.log(`  · ${p.what}\n      ${p.why}\n`);
  }

  const inv = inventory(repoRoot);
  const pending = inv.filter((e) => e.method === "text_layer" && !e.duplicateOf).length;
  const vision = inv.filter((e) => e.method === "vision" && !e.duplicateOf).length;
  console.log("Carriles sin construir\n");
  console.log(`  · extractor de PDF con capa de texto: ${pending} ficheros esperando`);
  console.log(`  · transcripcion con vision: ${vision} ficheros que ningun extractor puede leer\n`);
  // Sale con 0 a proposito: doctor INFORMA, no es una puerta. La puerta es
  // `verify`, y esa si distingue verde de rojo por codigo de salida.
}

/* ========================================================================== */
/* ingest                                                                     */
/* ========================================================================== */

/**
 * Borra un documento del corpus para poder volver a ingerirlo.
 *
 * Hace falta porque los spans son INMUTABLES: mejorar el extractor no cambia lo
 * que ya se leyo. Es la propiedad correcta —una cita hecha ayer sigue apuntando
 * al texto de ayer— pero significa que una mejora no llega sola.
 *
 * BORRA TAMBIEN SUS CANDIDATOS, y hay que decirlo en voz alta: las propuestas
 * citaban spans que van a dejar de existir, asi que no se pueden conservar sin
 * mentir sobre a que apuntan. Se borran primero y a proposito, porque el
 * `on delete restrict` de las citas esta ahi justamente para que nadie borre un
 * span citado sin darse cuenta.
 */
async function borrarDocumento(
  client: Awaited<ReturnType<typeof connect>>,
  path: string,
): Promise<{ candidatos: number } | null> {
  const { rows } = await client.query<{ id: string }>(
    `select id from public.source_documents where path = $1`,
    [path],
  );
  const id = rows[0]?.id;
  if (id === undefined) return null;

  await client.query("begin");
  try {
    const { rowCount } = await client.query(
      `delete from public.content_candidates where document_id = $1`,
      [id],
    );
    await client.query(`delete from public.source_documents where id = $1`, [id]);
    await client.query("commit");
    return { candidatos: rowCount ?? 0 };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function cmdIngest(): Promise<void> {
  const target = flagless[0];
  const inv = inventory(repoRoot).filter((e) => !e.duplicateOf);
  // Todo menos los trainers HTML, que ya cubre el pipeline de packs.
  //
  // `vision` ENTRA, y antes no entraba: era un fallo. Un documento de vision con
  // su transcripcion ya escrita es tan ingerible como un .docx — la
  // transcripcion es su texto. Dejarlo fuera obligaba a ingerir las 33 imagenes
  // de una en una, por su ruta, mientras `ingest ict` decia "nada que ingerir"
  // con las diecinueve transcripciones ya en disco. Si aun no hay
  // transcripcion, `ingest()` lanza y se informa; eso no es motivo para no
  // mirar.
  const ingerible = (m: InventoryEntry["method"]): boolean => m !== "html_trainer";

  const chosen = inv.filter((e) => {
    if (!target) return ingerible(e.method);
    if (e.subjectCode === target) return ingerible(e.method);
    return e.path === target || e.path.endsWith(`/${target}`);
  });

  if (chosen.length === 0) {
    console.error(`\nNada que ingerir para \`${target ?? "(todo lo determinista)"}\`.\n`);
    process.exitCode = 1;
    return;
  }

  const docs: SourceDocument[] = [];
  let spans = 0;
  for (const e of chosen) {
    try {
      const doc = await ingest(repoRoot, e);
      docs.push(doc);
      spans += doc.spans.length;
      console.log(`  ok   ${String(doc.spans.length).padStart(4)} spans  ${e.path}`);
    } catch (error) {
      if (error instanceof NotIngestibleError) console.log(`  --   ${error.message}`);
      else throw error;
    }
  }
  console.log(`\n${docs.length} documentos, ${spans} spans.`);

  if (!apply) {
    console.log("Nada escrito. Anade --apply para subirlo a la base de datos.\n");
    return;
  }

  await withDb(async (client) => {
    if (!(await corpusTablesExist(client))) {
      console.error("\nFalta aplicar supabase/migrations/0027_corpus.sql.\n");
      process.exitCode = 1;
      return;
    }
    const reextraer = argv.includes("--reextract");
    let nuevos = 0;
    let rehechos = 0;
    for (const doc of docs) {
      if (reextraer) {
        const borrado = await borrarDocumento(client, doc.path);
        if (borrado !== null) {
          rehechos += 1;
          if (borrado.candidatos > 0) {
            console.log(`  rehecho    ${doc.path}  (${borrado.candidatos} candidatos descartados: citaban spans que ya no existen)`);
          }
        }
      }
      const r = await persistDocument(client, doc);
      if (r.alreadyThere) console.log(`  ya estaba  ${doc.path}`);
      else {
        nuevos += 1;
        console.log(`  subido     ${String(r.spans).padStart(4)} spans  ${doc.path}`);
      }
    }
    console.log(`\n${nuevos} documentos nuevos en la base de datos${rehechos > 0 ? `, ${rehechos} reextraidos` : ""}.\n`);
  });
}

/* ========================================================================== */
/* transcribe — el carril que ningun extractor puede recorrer                 */
/* ========================================================================== */

/**
 * Lista lo que espera una transcripcion, con el nombre exacto del fichero que
 * hay que escribir y el sha256 que tiene que llevar dentro.
 *
 * No transcribe: no puede. Aqui no hay texto que extraer, hay imagenes que
 * alguien con ojos tiene que leer. Lo que hace este subcomando es convertir eso
 * en una lista de encargos cerrados, que es lo unico que se puede repartir.
 */
async function cmdTranscribe(): Promise<void> {
  const inv = inventory(repoRoot).filter((e) => !e.duplicateOf);
  const materia = flagless[0];

  /**
   * Un PDF solo se sabe si sirve ABRIENDOLO.
   *
   * La heuristica de bytes lo llama `text_layer` porque declara fuentes, y solo
   * al extraerlo se ve si tiene texto de verdad o cuatro palabras sobre una
   * imagen. Antes este listado se fiaba de la heuristica, y por eso `La tilde
   * en los hiatos.pdf` —un escaneo con 31 caracteres por pagina— no aparecio
   * como pendiente en toda una sesion: no estaba hecho y tampoco figuraba por
   * hacer, que es la peor combinacion de un inventario.
   */
  async function necesitaVision(e: InventoryEntry): Promise<boolean> {
    if (e.method === "vision") return true;
    if (e.ext !== ".pdf") return false;
    try {
      await ingest(repoRoot, e);
      return false;
    } catch (error) {
      return error instanceof NotIngestibleError && error.entry.method === "vision";
    }
  }

  const pendientes: { entry: InventoryEntry; fichero: string; estado: string }[] = [];
  for (const e of inv) {
    if (materia !== undefined && e.subjectCode !== materia) continue;
    if (!(await necesitaVision(e))) continue;
    let estado = "PENDIENTE";
    try {
      if (cargarTranscripcion(repoRoot, e.path, e.checksum) !== null) estado = "hecha";
    } catch (error) {
      estado = error instanceof Error ? error.message.slice(0, 60) : "rota";
    }
    pendientes.push({ entry: e, fichero: nombreDeTranscripcion(e.path), estado });
  }

  const porHacer = pendientes.filter((p) => p.estado !== "hecha");
  console.log("");
  console.log(`${pendientes.length} documentos exigen vision, ${porHacer.length} sin transcribir`);
  console.log(`Escribe cada una en ${TRANSCRIPTS_DIR}/<fichero>`);
  console.log("");
  for (const p of pendientes) {
    console.log(`  ${p.estado === "hecha" ? "hecha    " : "PENDIENTE"}  ${p.entry.path}`);
    if (p.estado !== "hecha") {
      console.log(`             fichero:  ${p.fichero}`);
      console.log(`             checksum: ${p.entry.checksum}`);
      console.log(`             locale:   ${p.entry.subjectCode === "spanish" ? "es" : "en"}`);
    }
  }
  console.log("");
}

/* ========================================================================== */
/* verify — la puerta                                                          */
/* ========================================================================== */

interface CandidatesFile {
  document: string;
  candidates: CandidateInput[];
}

async function cmdVerify(): Promise<void> {
  const file = flagless[0];
  if (!file) {
    console.error("\nUso: pnpm corpus verify <candidatos.json>\n");
    process.exitCode = 1;
    return;
  }

  const data = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8")) as CandidatesFile;
  const entry = inventory(repoRoot).find((e) => e.path === data.document);
  if (!entry) {
    console.error(`\nEl documento \`${data.document}\` no esta en Y6A.\n`);
    process.exitCode = 1;
    return;
  }

  const doc = await ingest(repoRoot, entry);
  const spans = new Map<number, SourceSpan>(doc.spans.map((s) => [s.ord, s]));
  const skills = new Set<string>();
  for (const f of packFiles()) {
    const p = readPack(f);
    for (const s of p.skills) skills.add(s.code);
  }

  let ok = 0;
  const byCode = new Map<string, number>();
  data.candidates.forEach((cand, i) => {
    const report = verifyCandidate(cand, spans, skills);
    if (report.ok) {
      ok += 1;
      console.log(`  VERDE  #${i} ${cand.kind}`);
      return;
    }
    console.log(`  ROJO   #${i} ${cand.kind}`);
    for (const f of report.failures) {
      byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
      console.log(`         ${f.code}: ${f.detail}`);
    }
  });

  const rojo = data.candidates.length - ok;
  console.log(`\n${ok} verificados, ${rojo} rechazados.`);
  if (byCode.size > 0) {
    console.log("Motivos:");
    for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)} x ${code}`);
    }
  }
  console.log("");
  // Codigo de salida, nunca un grep sobre esta salida.
  process.exitCode = rojo > 0 ? 1 : 0;
}

/* ========================================================================== */
/* review                                                                     */
/* ========================================================================== */

async function cmdReview(): Promise<void> {
  const approveAt = argv.indexOf("--approve");
  const rejectAt = argv.indexOf("--reject");
  const id = approveAt >= 0 ? argv[approveAt + 1] : rejectAt >= 0 ? argv[rejectAt + 1] : null;

  await withDb(async (client) => {
    if (!(await corpusTablesExist(client))) {
      console.error("\nFalta aplicar supabase/migrations/0027_corpus.sql.\n");
      process.exitCode = 1;
      return;
    }

    if (id) {
      const status = approveAt >= 0 ? "approved" : "rejected";

      // Aprobar es un acto de una PERSONA, y la base lo exige: hay un check que
      // impide llegar a 'approved' sin `reviewed_by` y `reviewed_at`. No es
      // burocracia: es lo unico que distingue "un programa lo dio por bueno" de
      // "alguien se hace responsable de esto".
      //
      // Quien ejecuta este script se conecta como `postgres`, que no es un
      // perfil. Hay que decir a nombre de quien se firma: `--as <id o email>`,
      // o el unico superadmin activo si no hay ambiguedad.
      const quien = leerOpcion("--as");
      const { rows: firmantes } = await client.query<{ id: string; email: string | null }>(
        quien === undefined
          ? `select id, email from public.profiles where role = 'superadmin' and status = 'active'`
          : `select id, email from public.profiles where id::text = $1 or email = $1`,
        quien === undefined ? [] : [quien],
      );
      if (firmantes.length !== 1) {
        console.error(
          firmantes.length === 0
            ? "No hay a quien atribuir la aprobacion. Usa --as <id o email>."
            : `Hay ${firmantes.length} perfiles posibles. Concreta con --as <id o email>.`,
        );
        process.exitCode = 1;
        return;
      }
      const firmante = firmantes[0]!;

      if (!apply) {
        console.log(`Pondria ${id} en ${status}, firmado por ${firmante.email ?? firmante.id}. Anade --apply.`);
        return;
      }

      const { rowCount } = await client.query(
        `update public.content_candidates
            set status = $2::public.candidate_status, reviewed_at = now(), reviewed_by = $3
          where id = $1 and status in ('verified', 'pending')`,
        [id, status, firmante.id],
      );
      console.log(rowCount === 1 ? `\n${id} -> ${status}\n` : `\nNo habia un candidato verificado con id ${id}.\n`);
      return;
    }

    // Aprobacion por lotes. Firma igual que la individual: un lote no es una
    // excepcion a la firma, es la misma responsabilidad tomada de una vez.
    //
    // Deja fuera los `pending` a proposito. Esos vienen de hojas de ejercicios
    // sin resolver: pasaron la puerta mecanica, pero su fuente no contiene la
    // respuesta, asi que quien los apruebe tiene que leerlos uno a uno. Meterlos
    // en un lote seria justo el atajo que este sistema existe para no dar.
    if (argv.includes("--approve-all")) {
      const quien = leerOpcion("--as");
      const { rows: firmantes } = await client.query<{ id: string; email: string | null }>(
        quien === undefined
          ? `select id, email from public.profiles where role = 'superadmin' and status = 'active'`
          : `select id, email from public.profiles where id::text = $1 or email = $1`,
        quien === undefined ? [] : [quien],
      );
      if (firmantes.length !== 1) {
        console.error("No hay a quien atribuir la aprobacion. Usa --as <id o email>.");
        process.exitCode = 1;
        return;
      }
      const firmante = firmantes[0]!;

      const { rows: cuenta } = await client.query<{ verified: string; pending: string }>(
        `select count(*) filter (where status = 'verified')::text as verified,
                count(*) filter (where status = 'pending')::text as pending
           from public.content_candidates`,
      );
      const verificados = Number(cuenta[0]?.verified ?? "0");
      const pendientes = Number(cuenta[0]?.pending ?? "0");

      console.log(`${verificados} verificados se aprobarian, firmados por ${firmante.email ?? firmante.id}`);
      if (pendientes > 0) {
        console.log(`${pendientes} quedan fuera del lote: vienen de hojas de ejercicios sin resolver y hay que leerlos uno a uno`);
      }
      if (!apply) {
        console.log("Nada escrito. Anade --apply.");
        return;
      }
      const { rowCount } = await client.query(
        `update public.content_candidates
            set status = 'approved', reviewed_at = now(), reviewed_by = $1
          where status = 'verified'`,
        [firmante.id],
      );
      console.log(`${rowCount} aprobados.`);
      return;
    }

    const { rows } = await client.query<{ id: string; kind: string; status: string; path: string }>(
      `select c.id, c.kind::text, c.status::text, d.path
         from public.content_candidates c
         join public.source_documents d on d.id = c.document_id
        where c.status in ('pending','verified')
        order by c.created_at
        limit 50`,
    );
    console.log("\nCola de revision\n");
    if (rows.length === 0) console.log("  vacia.");
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.status.padEnd(9)} ${r.kind.padEnd(12)} ${r.path}`);
    }
    console.log("");
  });
}

/* ========================================================================== */
/* propose — contratos DeepSeek en paralelo, uno por documento                */
/* ========================================================================== */

/**
 * Un documento, un contrato, un agente. El territorio de cada uno son sus
 * propios spans, y dos documentos no comparten ninguno: los territorios son
 * disjuntos por construccion, asi que el lote paralelo no necesita la
 * validacion previa que si exige el motor de codigo.
 *
 * Nada de lo que salga de aqui llega a un alumno. Entra en cuarentena
 * (`content_candidates`), verificado o rechazado, y espera revision humana.
 */
async function cmdPropose(): Promise<void> {
  const target = flagless[0];
  const model = argv.includes("--reasoner") ? "deepseek-reasoner" : "deepseek-chat";
  const rondas = Number(leerOpcion("--rounds") ?? 3);
  const paralelo = Number(leerOpcion("--parallel") ?? 4);
  const limite = leerOpcion("--limit");

  const key = apiKey(repoRoot);

  // Skills permitidas por materia: las del pack, que son las que la base
  // conoce. Un codigo inventado por el agente lo tumba la comprobacion 2.
  const skillsPorMateria = new Map<string, string[]>();
  for (const f of packFiles()) {
    const p = readPack(f);
    skillsPorMateria.set(p.subject.code, p.skills.map((s) => s.code));
  }

  await withDb(async (client) => {
    if (!(await corpusTablesExist(client))) {
      console.error("Falta aplicar supabase/migrations/0027_corpus.sql.");
      process.exitCode = 1;
      return;
    }

    const { rows: docs } = await client.query<{
      id: string;
      path: string;
      code: string;
      locale: string;
      candidatos: string;
    }>(
      `select d.id, d.path, s.code, d.locale,
              (select count(*) from public.content_candidates c where c.document_id = d.id)::text as candidatos
         from public.source_documents d
         join public.subjects s on s.id = d.subject_id
        order by d.path`,
    );

    const elegidos = docs.filter((d) => {
      if (target === undefined) return d.candidatos === "0";
      if (d.code === target) return true;
      return d.path === target || d.path.endsWith("/" + target);
    });

    const lote = limite === undefined ? elegidos : elegidos.slice(0, Number(limite));

    if (lote.length === 0) {
      console.log("Nada que proponer. Los documentos elegidos ya tienen candidatos, o no hay ninguno.");
      return;
    }

    console.log("");
    console.log(`${lote.length} documentos, modelo ${model}, ${rondas} rondas, ${paralelo} en paralelo`);
    if (!apply) console.log("SIN --apply: se llama a la API y se verifica, pero no se guarda nada.");
    console.log("");

    const resultados: ResultadoDocumento[] = [];
    for (let i = 0; i < lote.length; i += paralelo) {
      const tanda = lote.slice(i, i + paralelo);
      const hechos = await Promise.all(
        tanda.map(async (d) => {
          const { rows: spans } = await client.query<{
            id: string;
            ord: number;
            kind: string;
            span_text: string;
            page: number | null;
          }>(
            `select id, ord, kind::text, span_text, page from public.source_spans
              where document_id = $1 order by ord`,
            [d.id],
          );
          const doc: DocumentoParaProponer = {
            id: d.id,
            path: d.path,
            subjectCode: d.code,
            locale: d.locale,
            spans: spans.map((s) => ({ id: s.id, ord: s.ord, kind: s.kind, text: s.span_text, page: s.page })),
          };
          return proponerDocumento(key, doc, skillsPorMateria.get(d.code) ?? [], { model, rondas });
        }),
      );
      resultados.push(...hechos);
    }

    console.log("");
    let verdes = 0;
    let rojos = 0;
    for (const r of resultados) {
      const nombre = (r.documento.path.split("/").pop() ?? "").padEnd(42);
      if (r.error !== null) {
        console.log(`  ERROR  ${nombre} ${r.error}`);
        continue;
      }
      verdes += r.verdes.length;
      rojos += r.rojos.length;
      console.log(
        `  ${String(r.verdes.length).padStart(3)} verdes  ${String(r.rojos.length).padStart(3)} rojos  ` +
          `${r.rondas} ronda(s)  $${r.usd.toFixed(4)}  ${nombre}` +
          (r.hojaDeEjercicios ? "  [hoja de ejercicios -> pending]" : ""),
      );
    }

    // Por que cayeron los rojos: es lo que dice si el prompt esta mal o si el
    // material simplemente no sostiene mas preguntas.
    const motivos = new Map<string, number>();
    let descartados = 0;
    for (const r of resultados) {
      descartados += r.descartados;
      for (const [code, n] of r.motivos) motivos.set(code, (motivos.get(code) ?? 0) + n);
    }
    if (motivos.size > 0) {
      console.log("");
      console.log(`Motivos de rechazo (todas las rondas; ${descartados} candidatos retirados por el agente):`);
      for (const [code, n] of [...motivos].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(3)} x ${code}`);
      }
    }

    console.log("");
    console.log(`${verdes} verificados, ${rojos} rechazados. Coste ~ $${costeAcumulado().toFixed(4)}`);

    if (argv.includes("--show")) {
      for (const r of resultados) {
        if (r.verdes.length === 0) continue;
        console.log("");
        console.log(r.documento.path);
        for (const p of r.verdes) {
          const pl = p.candidato.payload as {
            body?: { stem?: Record<string, string>; options?: { id: string; html: Record<string, string> }[] };
            answerSpec?: { correctIds?: string[] };
            skillCode?: string;
          };
          const stem = Object.values(pl.body?.stem ?? {})[0] ?? "?";
          const correcta = pl.answerSpec?.correctIds?.[0];
          const texto = pl.body?.options?.find((o) => o.id === correcta);
          console.log(`  · ${stem}`);
          console.log(`      -> ${Object.values(texto?.html ?? {})[0] ?? "?"}   [${pl.skillCode ?? "?"}]`);
          for (const c of p.candidato.citations) console.log(`      cita [${c.spanOrd}] "${c.quote.slice(0, 70)}"`);
        }
      }
    }

    if (!apply) {
      console.log("Nada guardado. Anade --apply para meterlos en cuarentena.");
      console.log("");
      return;
    }

    let guardados = 0;
    let sinCita = 0;
    for (const r of resultados) {
      if (r.error !== null) continue;
      const res = await persistirPropuestas(client, r.documento.id, [...r.verdes, ...r.rojos], {
        model,
        rondas: r.rondas,
        hojaDeEjercicios: r.hojaDeEjercicios,
      });
      guardados += res.guardados;
      sinCita += res.sinCita;
    }
    console.log(`${guardados} candidatos en cuarentena${sinCita > 0 ? `, ${sinCita} descartados por citar un span inexistente` : ""}.`);
    console.log("");
  });
}

/* ========================================================================== */
/* recheck — volver a pasar la puerta sobre la cuarentena                     */
/* ========================================================================== */

/**
 * Vuelve a verificar TODO lo que hay en cuarentena, sin llamar a la API.
 *
 * Existe porque la puerta se endurece con lo que se aprende, y una regla nueva
 * que solo se aplica a lo que venga despues deja pasado un problema que ya
 * sabemos detectar. La primera version de la comprobacion 4 dejo entrar
 * preguntas de un examen sin resolver que citaban su propia linea de opciones;
 * cuando la regla mejoro, esas preguntas seguian ahi, marcadas `verified`.
 *
 * Lo aprobado por una persona NO se toca: si alguien reviso y dijo que si, un
 * cambio de regla no revoca su firma. Se avisa y se deja.
 */
async function cmdRecheck(): Promise<void> {
  await withDb(async (client) => {
    if (!(await corpusTablesExist(client))) {
      console.error("Falta aplicar supabase/migrations/0027_corpus.sql.");
      process.exitCode = 1;
      return;
    }

    const skills = new Set<string>();
    for (const f of packFiles()) for (const s of readPack(f).skills) skills.add(s.code);

    const { rows: candidatos } = await client.query<{
      id: string;
      kind: string;
      payload: unknown;
      status: string;
      document_id: string;
      path: string;
    }>(
      `select c.id, c.kind::text, c.payload, c.status::text, c.document_id, d.path
         from public.content_candidates c
         join public.source_documents d on d.id = c.document_id
        order by d.path, c.created_at`,
    );

    if (candidatos.length === 0) {
      console.log("La cuarentena esta vacia.");
      return;
    }

    // Spans por documento, una sola vez cada uno.
    const spansPorDoc = new Map<string, Map<number, SourceSpan>>();
    const ordPorSpanId = new Map<string, number>();
    for (const docId of new Set(candidatos.map((c) => c.document_id))) {
      const { rows } = await client.query<{ id: string; ord: number; span_text: string; page: number | null }>(
        `select id, ord, span_text, page from public.source_spans where document_id = $1 order by ord`,
        [docId],
      );
      const mapa = new Map<number, SourceSpan>();
      for (const r of rows) {
        mapa.set(r.ord, makeSpan(r.ord, "paragraph", r.span_text, r.page));
        ordPorSpanId.set(r.id, r.ord);
      }
      spansPorDoc.set(docId, mapa);
    }

    let siguenVerdes = 0;
    let caen = 0;
    let suben = 0;
    let intocables = 0;
    const nuevosMotivos = new Map<string, number>();

    for (const c of candidatos) {
      if (c.status === "approved") {
        intocables += 1;
        continue;
      }

      const { rows: citas } = await client.query<{ span_id: string; quote: string }>(
        `select span_id, quote from public.content_candidate_citations where candidate_id = $1`,
        [c.id],
      );
      const candidato: CandidateInput = {
        kind: c.kind === "lesson_block" ? "lesson_block" : "question",
        payload: c.payload,
        citations: citas
          .map((x) => ({ spanOrd: ordPorSpanId.get(x.span_id), quote: x.quote }))
          .filter((x): x is { spanOrd: number; quote: string } => x.spanOrd !== undefined),
      };

      const report = verifyCandidate(candidato, spansPorDoc.get(c.document_id) ?? new Map(), skills);
      const antes = c.status;
      // `pending` es de una hoja de ejercicios: si pasa la puerta sigue
      // esperando a una persona, no asciende solo a `verified`.
      const despues = report.ok ? (antes === "pending" ? "pending" : "verified") : "rejected";

      if (antes === despues) {
        if (report.ok) siguenVerdes += 1;
      } else if (despues === "rejected") {
        caen += 1;
        for (const f of report.failures) nuevosMotivos.set(f.code, (nuevosMotivos.get(f.code) ?? 0) + 1);
        console.log(`  CAE   ${c.path.split("/").pop()}  ${report.failures.map((f) => f.code).join(", ")}`);
      } else {
        suben += 1;
      }

      if (apply && antes !== despues) {
        await client.query(
          `update public.content_candidates
              set status = $2::public.candidate_status, verify_report = $3::jsonb
            where id = $1`,
          [c.id, despues, JSON.stringify(report)],
        );
      }
    }

    console.log("");
    console.log(`${candidatos.length} candidatos revisados`);
    console.log(`  ${siguenVerdes} siguen pasando`);
    console.log(`  ${caen} caen con las reglas de hoy`);
    if (suben > 0) console.log(`  ${suben} pasan ahora y antes no`);
    if (intocables > 0) console.log(`  ${intocables} aprobados por una persona: no se tocan`);
    if (nuevosMotivos.size > 0) {
      for (const [code, n] of [...nuevosMotivos].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(3)} x ${code}`);
      }
    }
    if (!apply) console.log("Nada escrito. Anade --apply para actualizar los estados.");
    console.log("");
  });
}

/* ========================================================================== */
/* publish — la ultima pata: aprobados -> preguntas de verdad                 */
/* ========================================================================== */

/**
 * Lleva los candidatos APROBADOS a `questions` + `question_versions`, que es
 * donde el motor de examen los busca. Hasta aqui, aprobar no servia de nada:
 * un candidato `approved` seguia siendo una fila de una tabla que el alumno ni
 * siquiera puede leer.
 */
async function cmdPublish(): Promise<void> {
  await withDb(async (client) => {
    if (!(await corpusTablesExist(client))) {
      console.error("Falta aplicar supabase/migrations/0027_corpus.sql.");
      process.exitCode = 1;
      return;
    }

    const { rows: aprobados } = await client.query<{ n: string }>(
      `select count(*)::text n from public.content_candidates where status = 'approved'`,
    );
    const cuantos = Number(aprobados[0]?.n ?? "0");
    console.log("");
    console.log(`${cuantos} candidatos aprobados esperando publicacion`);

    if (cuantos === 0) {
      console.log("Aprueba alguno con `corpus review --approve <id> --apply`.");
      console.log("");
      return;
    }
    if (!apply) {
      console.log("Nada escrito. Anade --apply para publicarlos.");
      console.log("");
      return;
    }

    const doc = flagless[0];
    const r = await publicarAprobados(client, doc === undefined ? {} : { soloDocumento: doc });
    console.log(`${r.publicados} publicados.`);
    if (r.saltados.length > 0) {
      console.log(`${r.saltados.length} saltados:`);
      for (const s of r.saltados) console.log(`  ${s.id.slice(0, 8)}  ${s.motivo}`);
    }
    console.log("");
  });
}

/* ========================================================================== */
/* upload — el fichero original, al bucket privado                            */
/* ========================================================================== */

/**
 * Guarda el ORIGINAL de cada documento del corpus. El corpus guarda lo que pone
 * dentro; esto guarda el fichero, para que un revisor que siga una cita hasta
 * el span pueda ver la pagina. En el carril de vision es lo que cierra la
 * cadena: ahi el span no es una copia, es la interpretacion de una imagen.
 */
async function cmdUpload(): Promise<void> {
  await withDb(async (client) => {
    if (!(await corpusTablesExist(client))) {
      console.error("Falta aplicar supabase/migrations/0027_corpus.sql.");
      process.exitCode = 1;
      return;
    }

    const { rows: pendientes } = await client.query<{ n: string; bytes: string }>(
      `select count(*)::text n, coalesce(sum(bytes), 0)::text bytes
         from public.source_documents where storage_path is null`,
    );
    const cuantos = Number(pendientes[0]?.n ?? "0");
    const mb = Number(pendientes[0]?.bytes ?? "0") / 1024 / 1024;

    console.log("");
    console.log(`${cuantos} originales sin subir (${mb.toFixed(1)} MB) al bucket privado \`${BUCKET}\``);

    if (cuantos === 0) {
      console.log("Todos subidos.");
      console.log("");
      return;
    }
    if (!apply) {
      console.log("Nada subido. Anade --apply.");
      console.log("");
      return;
    }

    const hechas = await subirOriginales(client, repoRoot, PROJECT_REF, { soloSinSubir: true });
    for (const h of hechas) {
      console.log(`  ${String(Math.round(h.bytes / 1024)).padStart(6)} KB  ${h.clave}`);
    }
    console.log("");
    console.log(`${hechas.length} originales subidos.`);
    console.log("");
  });
}

/* ========================================================================== */
/* enable — activar los cursos para un colegio                                */
/* ========================================================================== */

/**
 * Sembrar un curso NO lo hace visible. `courses.status = 'published'` dice que
 * el curso existe en la biblioteca global; `school_courses.is_active` dice que
 * ESTE colegio lo usa. DATA_MODEL lo separa a proposito: visibilidad no es
 * activacion. Sin esta segunda mitad, el contenido esta en la base y el alumno
 * no ve nada, que es exactamente donde estaba Math antes de 0003.
 */
async function cmdEnable(): Promise<void> {
  await withDb(async (client) => {
    const { rows: schools } = await client.query<{ id: string; name: string; status: string }>(
      `select id, name, status from public.schools order by name`,
    );
    if (schools.length === 0) {
      console.error("\nNo hay colegios.\n");
      process.exitCode = 1;
      return;
    }

    const pedido = flagless[0];
    const school = pedido
      ? schools.find((s) => s.id === pedido || s.name === pedido)
      : schools.length === 1
        ? schools[0]
        : undefined;
    if (!school) {
      console.log("\nIndica el colegio. Hay estos:\n");
      for (const s of schools) console.log(`  ${s.id}  ${s.status.padEnd(9)} ${s.name}`);
      console.log("");
      process.exitCode = 1;
      return;
    }

    const { rows: cursos } = await client.query<{
      id: string;
      code: string;
      activo: boolean;
    }>(
      `select co.id, s.code,
              coalesce((select sc.is_active from public.school_courses sc
                         where sc.course_id = co.id and sc.school_id = $1), false) as activo
         from public.courses co
         join public.subjects s on s.id = co.subject_id
        where co.school_id is null and co.status = 'published'
        order by s.code`,
      [school.id],
    );

    console.log(`
${school.name}
`);
    const pendientes = cursos.filter((c) => !c.activo);
    for (const c of cursos) {
      console.log(`  ${c.activo ? "activo  " : "APAGADO "} ${c.code}`);
    }

    if (pendientes.length === 0) {
      console.log("\nTodos activos.\n");
      return;
    }
    if (!apply) {
      console.log(`
Activaria ${pendientes.length}. Anade --apply.
`);
      return;
    }

    for (const c of pendientes) {
      await client.query(
        `insert into public.school_courses (school_id, course_id, is_active)
         values ($1, $2, true)
         on conflict (school_id, course_id) do update set is_active = true`,
        [school.id, c.id],
      );
    }
    console.log(`
${pendientes.length} cursos activados para ${school.name}.
`);
  });
}

/* ========================================================================== */
/* push                                                                       */
/* ========================================================================== */

async function cmdPush(): Promise<void> {
  const files = packFiles();
  console.log(`\n${files.length} packs: ${files.map((f) => f.replace(".json", "")).join(", ")}`);

  if (!apply) {
    console.log("\nNada escrito. Esto es lo que se sembraria:\n");
    for (const f of files) {
      const p = readPack(f);
      const lessons = p.modules.reduce((a, m) => a + m.lessons.length, 0);
      const blocks = p.modules.reduce(
        (a, m) => a + m.lessons.reduce((b, l) => b + l.blocks.length, 0),
        0,
      );
      console.log(
        `  ${f.replace(".json", "").padEnd(10)} ${String(p.skills.length).padStart(3)} skills  ` +
          `${String(lessons).padStart(3)} lecciones  ${String(blocks).padStart(4)} bloques  ` +
          `${String(p.questions.length).padStart(4)} preguntas`,
      );
    }
    console.log("\nAnade --apply para subirlo. Los blueprints NO se siembran: `pnpm corpus doctor`.\n");
    return;
  }

  await withDb(async (client) => {
    const allGaps: SeedGap[] = [];
    const fallos: string[] = [];
    for (const f of files) {
      const pack = readPack(f);
      process.stdout.write(`  ${f.replace(".json", "").padEnd(10)} ... `);
      try {
        const { counts, gaps } = await seedPack(client, pack);
        allGaps.push(...gaps);
        console.log(
          `${counts.lessons} lecciones, ${counts.blocks} bloques, ${counts.questions} preguntas, ` +
            `${counts.versions} versiones nuevas, ${counts.blueprints} blueprints`,
        );
      } catch (error) {
        // Una materia que falla no puede llevarse por delante a las otras cinco:
        // cada pack va en su propia transaccion justamente para esto.
        console.log("FALLO");
        const msg = error instanceof Error ? error.message : String(error);
        fallos.push(`${f.replace(".json", "")}: ${msg}`);
      }
    }
    if (fallos.length > 0) {
      console.log(`
${fallos.length} materias sin sembrar:
`);
      for (const f of fallos) console.log(`  x ${f}`);
      process.exitCode = 1;
    }
    if (allGaps.length > 0) {
      console.log(`\n${allGaps.length} cosas NO sembradas:\n`);
      for (const g of allGaps.slice(0, 20)) console.log(`  · ${g.what}\n      ${g.why}`);
      if (allGaps.length > 20) console.log(`  ... y ${allGaps.length - 20} mas.`);
    }
    console.log("");
  });
}

/* ========================================================================== */

function help(): void {
  console.log(`
pnpm corpus <subcomando>

  status                    que hay en Y6A, en los packs y en la base de datos
  doctor                    que impide subir algo, y por que
  ingest [materia|ruta]     Y6A -> spans citables       (--apply, --reextract)
  transcribe [materia]      lista lo que espera transcripcion de vision
  verify <candidatos.json>  la puerta: cita literal, esquema y respuesta citada
  review [--approve <id>]   cola de revision; --approve-all para el lote (--apply)
  push                      packs -> Supabase           (--apply para escribir)
  publish                   aprobados -> questions reales (--apply)
  upload                    los ficheros originales -> bucket privado (--apply)
  enable [colegio]          activa los cursos para un colegio (--apply)
  propose [materia|ruta]    contratos DeepSeek en paralelo -> cuarentena (--apply)
  recheck                   vuelve a pasar la puerta sobre la cuarentena (--apply)

Nada escribe en la base de datos sin --apply.
`);
}

const commands: Record<string, () => void | Promise<void>> = {
  status: cmdStatus,
  doctor: cmdDoctor,
  ingest: cmdIngest,
  verify: cmdVerify,
  review: cmdReview,
  push: cmdPush,
  enable: cmdEnable,
  propose: cmdPropose,
  recheck: cmdRecheck,
  publish: cmdPublish,
  upload: cmdUpload,
  transcribe: cmdTranscribe,
};

const run = commands[command];
if (!run) {
  help();
  process.exitCode = command === "help" ? 0 : 1;
} else {
  await Promise.resolve(run()).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
