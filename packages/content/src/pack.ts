/**
 * Ensamblado y validación de un content pack.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { I18nText, Locale } from "@cet/shared";
import { contentHash, stableId, stableStringify } from "./ids.ts";
import {
  contentPack,
  type ContentPack,
  type CourseModule,
  type ExamBlueprint,
  type Gap,
  type LessonBlock,
  type Question,
  type StudyPlan,
} from "./schema.ts";
import type { SkillDef } from "./skills.ts";

export interface SubjectExtractor {
  readonly code: ContentPack["subject"]["code"];
  /** Ruta relativa a la raíz del repo, con `/`. */
  readonly file: string;
  extract(html: string): ContentPack;
}

export interface AssembleInput {
  readonly subject: ContentPack["subject"];
  readonly courseCode: string;
  readonly courseName: I18nText;
  readonly yearLevel: number;
  readonly locale: Locale;
  readonly file: string;
  readonly skills: readonly SkillDef[];
  readonly modules: readonly CourseModule[];
  readonly questions: readonly Question[];
  readonly blueprints: readonly ExamBlueprint[];
  readonly studyPlan: StudyPlan | null;
  readonly gaps: readonly Gap[];
}

/**
 * Campos que la plataforma NECESITA y que los trainers Y6A no traen. Se rellenan
 * con un valor por defecto razonable y se DECLARAN como hueco en todos los packs.
 *
 * La alternativa — emitirlos en silencio — convertiría una suposición nuestra en
 * un dato con la misma apariencia que el material real del colegio. Un profesor
 * que vea "dificultad 2" tiene derecho a saber que eso no lo escribió nadie.
 */
const INVENTED_DEFAULTS: Gap = {
  area: "campos sin equivalente en el material original",
  reason:
    "los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.",
};

/**
 * Ensambla y VALIDA. Nunca devuelve un pack sin pasar por Zod: un pack inválido
 * que llega al sembrador falla en la base de datos, con un mensaje peor y a una
 * hora peor.
 */
export function assemblePack(input: AssembleInput): ContentPack {
  const skills = input.skills.map((s, ord) => ({
    id: stableId("skill", input.courseCode, s.code),
    code: s.code,
    parentCode: s.parentCode,
    name: s.name,
    ord,
  }));

  const draft = {
    packFormatVersion: 1 as const,
    subject: input.subject,
    course: {
      id: stableId("course", input.courseCode),
      code: input.courseCode,
      name: input.courseName,
      yearLevel: input.yearLevel,
      locale: input.locale,
      status: "published" as const,
      version: 1,
    },
    skills,
    modules: [...input.modules],
    questions: [...input.questions],
    blueprints: [...input.blueprints],
    studyPlan: input.studyPlan,
    gaps: [...input.gaps, INVENTED_DEFAULTS],
  };

  // La integridad se calcula sobre todo lo demás; si se incluyera a sí misma
  // sería un punto fijo imposible.
  const integrity = contentHash(draft);
  const parsed = contentPack.safeParse({ ...draft, integrity });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`El pack de ${input.subject.code} no valida:\n${issues}`);
  }
  return parsed.data;
}

/** Serialización canónica del pack: claves ordenadas, salto de línea final. */
export function serializePack(pack: ContentPack): string {
  return `${JSON.stringify(JSON.parse(stableStringify(pack)), null, 2)}\n`;
}

/**
 * Todos los bloques del pack, para el informe de cobertura: los de las
 * lecciones, los de la introducción del panel y las notas del plan de estudio.
 * Contar solo los de las lecciones haría que COVERAGE.md declarase menos
 * cobertura de la real — el error opuesto al que este informe quiere evitar,
 * pero error igual.
 */
export function allBlocks(pack: ContentPack): readonly LessonBlock[] {
  return [
    ...pack.modules.flatMap((m) => [...m.overview, ...m.lessons.flatMap((l) => l.blocks)]),
    ...(pack.studyPlan?.notes ?? []),
  ];
}

export function countBlocks(pack: ContentPack): number {
  return allBlocks(pack).length;
}

export function countLessons(pack: ContentPack): number {
  return pack.modules.reduce((acc, m) => acc + m.lessons.length, 0);
}
