/**
 * Orquestación: seis HTML -> seis packs + informe de cobertura.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * IDEMPOTENCIA. Ejecutar esto dos veces produce ficheros byte-idénticos:
 *   - los ids son hashes deterministas (`ids.ts`);
 *   - el JSON se serializa con las claves ordenadas;
 *   - no se escribe ninguna marca de tiempo, ni versión de Node, ni ruta
 *     absoluta, ni nada que dependa de la máquina.
 * `verifyIdempotence()` lo comprueba de verdad: extrae dos veces y compara.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTrainer } from "./extract/html.ts";
import { allBlocks, countBlocks, countLessons, serializePack } from "./pack.ts";
import type { ContentPack } from "./schema.ts";
import { extractEnglish, ENGLISH_FILE } from "./subjects/english.ts";
import { extractIct, ICT_FILE } from "./subjects/ict.ts";
import { extractMath, MATH_FILE } from "./subjects/math.ts";
import { extractScience, SCIENCE_FILE } from "./subjects/science.ts";
import { extractSocials, SOCIALS_FILE } from "./subjects/socials.ts";
import { extractSpanish, SPANISH_FILE } from "./subjects/spanish.ts";

export interface SubjectPipeline {
  readonly code: ContentPack["subject"]["code"];
  /** Ruta relativa a la raíz del repo, siempre con `/`. */
  readonly file: string;
  readonly extract: (html: string) => ContentPack;
}

/**
 * Orden deliberado: Math primero, porque es el piloto del Hito 2 y porque si
 * algo se rompe queremos verlo en Math antes que en nada más.
 */
export const SUBJECTS: readonly SubjectPipeline[] = [
  { code: "math", file: MATH_FILE, extract: extractMath },
  { code: "science", file: SCIENCE_FILE, extract: extractScience },
  { code: "english", file: ENGLISH_FILE, extract: extractEnglish },
  { code: "spanish", file: SPANISH_FILE, extract: extractSpanish },
  { code: "socials", file: SOCIALS_FILE, extract: extractSocials },
  { code: "ict", file: ICT_FILE, extract: extractIct },
];

export interface SubjectResult {
  readonly code: ContentPack["subject"]["code"];
  readonly file: string;
  readonly pack: ContentPack | null;
  readonly error: string | null;
}

/**
 * Extrae una materia. NO traga el error: lo devuelve para que el informe de
 * cobertura pueda decir "Socials falló y por qué" en vez de mostrar un pack
 * ausente sin explicación.
 */
export function runSubject(repoRoot: string, subject: SubjectPipeline): SubjectResult {
  try {
    const html = readTrainer(join(repoRoot, subject.file));
    return { code: subject.code, file: subject.file, pack: subject.extract(html), error: null };
  } catch (err) {
    return {
      code: subject.code,
      file: subject.file,
      pack: null,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

export function runAll(repoRoot: string): SubjectResult[] {
  return SUBJECTS.map((s) => runSubject(repoRoot, s));
}

/** Escribe `packs/*.json` y `packs/COVERAGE.md`. Devuelve las rutas escritas. */
export function writePacks(outDir: string, results: readonly SubjectResult[]): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const r of results) {
    if (r.pack === null) continue;
    const path = join(outDir, `${r.code}.json`);
    writeFileSync(path, serializePack(r.pack), "utf8");
    written.push(path);
  }
  const coveragePath = join(outDir, "COVERAGE.md");
  writeFileSync(coveragePath, renderCoverage(results), "utf8");
  written.push(coveragePath);
  return written;
}

/**
 * Prueba real de idempotencia: extrae dos veces desde el disco y compara byte a
 * byte. Comparar un pack consigo mismo no probaría nada.
 */
export function verifyIdempotence(repoRoot: string): { ok: boolean; differing: string[] } {
  const differing: string[] = [];
  for (const subject of SUBJECTS) {
    const a = runSubject(repoRoot, subject);
    const b = runSubject(repoRoot, subject);
    if (a.pack === null || b.pack === null) {
      if (a.error !== b.error) differing.push(`${subject.code} (errores distintos)`);
      continue;
    }
    if (serializePack(a.pack) !== serializePack(b.pack)) differing.push(subject.code);
  }
  return { ok: differing.length === 0, differing };
}

/** Compara los packs en disco con los que produce el pipeline ahora. */
export function checkPacksUpToDate(outDir: string, results: readonly SubjectResult[]): string[] {
  const stale: string[] = [];
  for (const r of results) {
    if (r.pack === null) continue;
    const path = join(outDir, `${r.code}.json`);
    let onDisk: string;
    try {
      onDisk = readFileSync(path, "utf8");
    } catch {
      stale.push(`${r.code} (no existe en packs/)`);
      continue;
    }
    if (onDisk !== serializePack(r.pack)) stale.push(r.code);
  }
  return stale;
}

/* -------------------------------------------------------------------------- */
/* Informe de cobertura                                                       */
/* -------------------------------------------------------------------------- */

export function renderCoverage(results: readonly SubjectResult[]): string {
  const lines: string[] = [];
  lines.push("# COBERTURA DE EXTRACCIÓN — Y6A → content packs");
  lines.push("");
  lines.push("> Generado por `@cet/content`. **No editar a mano**: se reescribe en cada ejecución.");
  lines.push("> © 2026 Roberto Mendizabal. Todos los derechos reservados.");
  lines.push("");
  lines.push(
    "Este informe existe para decir lo que **no** se extrajo. Un pipeline que solo",
  );
  lines.push(
    "presume de lo que consiguió es un pipeline en el que no se puede confiar.",
  );
  lines.push("");

  lines.push("## Resumen");
  lines.push("");
  lines.push("| Materia | Idioma | Lecciones | Bloques | Preguntas | Generadas | Blueprints | Ítems | Plan | Skills |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");

  const totals = { lessons: 0, blocks: 0, questions: 0, generated: 0, blueprints: 0, items: 0, skills: 0 };

  for (const r of results) {
    if (r.pack === null) {
      lines.push(`| **${r.code}** | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |`);
      continue;
    }
    const p = r.pack;
    const lessons = countLessons(p);
    const blocks = countBlocks(p);
    const generated = p.questions.filter((q) => q.kind === "generated").length;
    const statics = p.questions.length - generated;
    const items = p.blueprints.reduce(
      (acc, b) => acc + b.sections.reduce((a, s) => a + s.itemCount, 0),
      0,
    );
    const planDays = p.studyPlan?.days.length ?? 0;

    totals.lessons += lessons;
    totals.blocks += blocks;
    totals.questions += statics;
    totals.generated += generated;
    totals.blueprints += p.blueprints.length;
    totals.items += items;
    totals.skills += p.skills.length;

    lines.push(
      `| **${p.subject.code}** | \`${p.course.locale}\` | ${lessons} | ${blocks} | ${statics} | ${generated} | ${p.blueprints.length} | ${items} | ${planDays} días | ${p.skills.length} |`,
    );
  }
  lines.push(
    `| **TOTAL** | | ${totals.lessons} | ${totals.blocks} | ${totals.questions} | ${totals.generated} | ${totals.blueprints} | ${totals.items} | | ${totals.skills} |`,
  );
  lines.push("");

  /* --- Fallos --- */
  const failed = results.filter((r) => r.pack === null);
  if (failed.length > 0) {
    lines.push("## ❌ Materias que fallaron");
    lines.push("");
    for (const r of failed) {
      lines.push(`### ${r.code}`);
      lines.push("");
      lines.push(`Fichero: \`${r.file}\``);
      lines.push("");
      lines.push("```");
      lines.push(r.error ?? "(sin mensaje)");
      lines.push("```");
      lines.push("");
    }
  }

  /* --- Detalle por materia --- */
  lines.push("## Detalle por materia");
  lines.push("");
  for (const r of results) {
    if (r.pack === null) continue;
    const p = r.pack;
    lines.push(`### ${p.subject.icon} ${p.subject.code} — \`${r.file}\``);
    lines.push("");

    lines.push("**Bloques por tipo**");
    lines.push("");
    const byKind = new Map<string, number>();
    for (const b of allBlocks(p)) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + 1);
    if (byKind.size === 0) {
      lines.push("_ninguno_");
    } else {
      lines.push("| kind | n |");
      lines.push("|---|---:|");
      for (const kind of [...byKind.keys()].sort()) {
        lines.push(`| \`${kind}\` | ${byKind.get(kind)} |`);
      }
    }
    lines.push("");

    lines.push("**Preguntas por skill**");
    lines.push("");
    const bySkill = new Map<string, number>();
    for (const q of p.questions) bySkill.set(q.skillCode, (bySkill.get(q.skillCode) ?? 0) + 1);
    if (bySkill.size === 0) {
      lines.push("_ninguna_");
    } else {
      lines.push("| skill | n |");
      lines.push("|---|---:|");
      for (const code of [...bySkill.keys()].sort()) {
        lines.push(`| \`${code}\` | ${bySkill.get(code)} |`);
      }
    }
    lines.push("");

    lines.push("**Blueprints**");
    lines.push("");
    for (const b of p.blueprints) {
      const items = b.sections.reduce((a, s) => a + s.itemCount, 0);
      const dur = b.durationSeconds === null ? "sin límite de tiempo" : `${b.durationSeconds / 60} min`;
      lines.push(`- \`${b.code}\` — ${b.sections.length} secciones, ${items} ítems, ${dur}`);
    }
    lines.push("");

    lines.push("**No extraído, y por qué**");
    lines.push("");
    if (p.gaps.length === 0) {
      lines.push("_nada: toda la fuente quedó cubierta._");
    } else {
      for (const g of p.gaps) {
        const sym = g.symbol === undefined ? "" : ` (\`${g.symbol}\`)`;
        lines.push(`- **${g.area}**${sym} — ${g.reason}`);
      }
    }
    lines.push("");
  }

  /* --- Nota transversal --- */
  lines.push("## Lo que ningún extractor puede hacer");
  lines.push("");
  lines.push(
    "Los **laboratorios interactivos** (Shape Lab, Circuit Lab, Mountain/Map/River Lab,",
  );
  lines.push(
    "Scratch Lab, Data Lab) y los **mini-juegos** no son contenido: son programas. Dibujan",
  );
  lines.push(
    "SVG en tiempo de ejecución, mantienen estado y evalúan la interacción del alumno.",
  );
  lines.push(
    "Ningún pipeline de extracción los convierte en `lesson_blocks` sin inventarse la mitad.",
  );
  lines.push("");
  lines.push("Lo que sí ocurre con ellos:");
  lines.push("");
  lines.push(
    "1. La **teoría** que los acompaña sí está extraída — vive en las lecciones.",
  );
  lines.push(
    "2. El **Shape Lab de Math** se reimplementa como el generador `math.shape` de `@cet/engine`, que produce el SVG en `renderedBody.figureSvg`. Es el único lab con ruta de migración cerrada.",
  );
  lines.push(
    "3. Los demás quedan como trabajo de un módulo de actividades interactivas, con sus formatos (`matching`, `ordering`, `hotspot`, `drag_drop`) ya presentes en `question_format` pero sin extractor.",
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}
