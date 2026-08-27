/**
 * Esquemas Zod del content pack.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Un content pack es la representación JSON, validada e insertable, de un curso
 * completo: currículo (§2 de DATA_MODEL), contenido (§3), preguntas (§4) y
 * blueprints (§5). El sembrador de `supabase/seed` consume esto y nada más.
 *
 * Reglas que el esquema hace cumplir, no solo documenta:
 *   - todo id es un uuid (los genera `ids.ts`, deterministas);
 *   - todo texto visible es `I18nText` (AD-7);
 *   - todo elemento lleva `source` para poder auditar de dónde salió;
 *   - una pregunta `generated` NO puede llevar clave estática, y una `static`
 *     NO puede llevar `engineKey`. La unión discriminada lo hace imposible.
 */

import { z } from "zod";
import {
  blockKind,
  contentStatus,
  feedbackMode,
  gradingMode,
  i18nText,
  locale,
  questionFormat,
  answerKey,
  engineKey,
} from "@cet/shared";

/* -------------------------------------------------------------------------- */
/* Trazabilidad                                                               */
/* -------------------------------------------------------------------------- */

/**
 * De dónde salió cada elemento. Sin esto, auditar un pack de 400 preguntas
 * significa releer seis ficheros HTML a mano.
 *
 * `file`   ruta relativa a la raíz del repo, con `/` siempre (nunca `\`), para
 *          que un pack generado en Windows sea idéntico al generado en CI.
 * `symbol` símbolo JS (`BANK`, `TOPICS`) o selector estático (`#learn .topic`).
 * `index`  posición dentro de ese símbolo, cuando aplica.
 */
export const sourceRef = z.object({
  file: z.string().min(1).regex(/^[^\\]*$/, "usa `/` en las rutas, nunca `\\`"),
  symbol: z.string().min(1),
  index: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRef>;

export const uuid = z.string().uuid();

/* -------------------------------------------------------------------------- */
/* Bloques de lección (§3)                                                    */
/* -------------------------------------------------------------------------- */

/** Bloques de prosa: `.rule`, `.eg`, `.tip`, `.warn`, texto suelto. */
const proseContent = z.object({ html: i18nText });

/** `.steps` y `.chain`: una secuencia ordenada. */
const stepsContent = z.object({
  intro: i18nText.optional(),
  steps: z.array(i18nText).min(1),
});

/**
 * `table.t`: cabecera opcional + filas. Cada celda es HTML saneado.
 *
 * Una celda puede ser `null`: las tablas de Math abren con `<th></th>` para
 * dejar la esquina en blanco. Forzar `I18nText` ahí obligaría a inventar un
 * texto vacío — que el contrato de `I18nText` prohíbe, con razón. `null`
 * significa "celda vacía" y se distingue de "celda con la cadena vacía".
 */
const tableCell = i18nText.nullable();

const tableContent = z.object({
  caption: i18nText.optional(),
  headers: z.array(tableCell).optional(),
  rows: z.array(z.array(tableCell)).min(1),
});

/** Lo que NO se pudo convertir a datos (labs SVG, juegos). Solo el marcador. */
const interactiveContent = z.object({
  engineKey: z.string().min(1),
  caption: i18nText,
});

export const lessonBlock = z
  .object({
    id: uuid,
    ord: z.number().int().nonnegative(),
    kind: blockKind,
    content: z.union([proseContent, stepsContent, tableContent, interactiveContent]),
    source: sourceRef,
  })
  .superRefine((block, ctx) => {
    const shapeOk =
      block.kind === "steps"
        ? "steps" in block.content
        : block.kind === "table"
          ? "rows" in block.content
          : block.kind === "interactive"
            ? "engineKey" in block.content
            : "html" in block.content;
    if (!shapeOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `el contenido no corresponde al kind \`${block.kind}\``,
      });
    }
  });
export type LessonBlock = z.infer<typeof lessonBlock>;

/* -------------------------------------------------------------------------- */
/* Currículo (§2)                                                             */
/* -------------------------------------------------------------------------- */

export const skill = z.object({
  id: uuid,
  code: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "código jerárquico `materia.familia[.detalle]`"),
  parentCode: z.string().nullable(),
  name: i18nText,
  description: i18nText.optional(),
  ord: z.number().int().nonnegative(),
});
export type Skill = z.infer<typeof skill>;

export const lesson = z.object({
  id: uuid,
  ord: z.number().int().nonnegative(),
  title: i18nText,
  estimatedMinutes: z.number().int().positive(),
  skillCodes: z.array(z.string()).min(1),
  blocks: z.array(lessonBlock),
  source: sourceRef,
});
export type Lesson = z.infer<typeof lesson>;

export const courseModule = z.object({
  id: uuid,
  ord: z.number().int().nonnegative(),
  title: i18nText,
  description: i18nText.optional(),
  /**
   * Contenido del panel "Learn" que NO pertenece a ninguna lección: la tarjeta
   * de introducción con la tabla de "qué entra en el examen".
   *
   * Existe porque English y Español lo escriben ahí, fuera de los acordeones, y
   * la primera versión de este pipeline lo tiraba sin decirlo. Un pipeline que
   * pierde contenido en silencio es peor que uno que falla.
   */
  overview: z.array(lessonBlock),
  lessons: z.array(lesson),
});
export type CourseModule = z.infer<typeof courseModule>;

/* -------------------------------------------------------------------------- */
/* Preguntas (§4)                                                             */
/* -------------------------------------------------------------------------- */

const questionOption = z.object({
  /** Id estable (`o1`…). La permutación de examen se guarda aparte. */
  id: z.string().regex(/^o[0-9]+$/),
  html: i18nText,
});

/** Pregunta estática del banco: enunciado y opciones congelados. */
const staticBody = z.object({
  stem: i18nText,
  options: z.array(questionOption).min(2),
});

/**
 * Pregunta generada: no hay enunciado, hay un contrato con `@cet/engine`.
 * `engineKey` DEBE existir en el registro del motor; el test de contrato de
 * `@cet/engine` es quien lo verifica en CI.
 */
const generatedBody = z.object({
  engineKey,
  paramSpec: z.record(z.unknown()),
});

/**
 * `answerSpec` de una pregunta generada NO es una clave: la clave la produce el
 * generador con la semilla del intento. Se marca explícitamente para que nadie
 * confunda "sin clave" con "clave vacía".
 */
const engineAnswerSpec = z.object({ type: z.literal("engine"), engineKey });

export const question = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("static"),
    id: uuid,
    skillCode: z.string().min(1),
    format: questionFormat,
    locale,
    body: staticBody,
    answerSpec: answerKey,
    hint: i18nText.optional(),
    solution: i18nText.optional(),
    difficulty: z.number().int().min(1).max(5),
    maxPoints: z.number().positive(),
    gradingMode,
    tags: z.array(z.string()),
    source: sourceRef,
  }),
  z.object({
    kind: z.literal("generated"),
    id: uuid,
    skillCode: z.string().min(1),
    format: questionFormat,
    locale,
    body: generatedBody,
    answerSpec: engineAnswerSpec,
    hint: i18nText.optional(),
    solution: i18nText.optional(),
    difficulty: z.number().int().min(1).max(5),
    maxPoints: z.number().positive(),
    gradingMode,
    tags: z.array(z.string()),
    source: sourceRef,
  }),
]);
export type Question = z.infer<typeof question>;

/* -------------------------------------------------------------------------- */
/* Blueprints (§5)                                                            */
/* -------------------------------------------------------------------------- */

export const blueprintSection = z.object({
  id: uuid,
  ord: z.number().int().nonnegative(),
  title: i18nText,
  itemCount: z.number().int().positive(),
  /** `{skillCodes, engineKey?, params?}` — lo que resuelve la materialización. */
  selection: z.object({
    skillCodes: z.array(z.string()).min(1),
    engineKey: engineKey.optional(),
    params: z.record(z.unknown()).optional(),
  }),
  source: z.enum(["bank", "generated", "mixed"]),
  pointsPerItem: z.number().positive(),
});
export type BlueprintSection = z.infer<typeof blueprintSection>;

export const examBlueprint = z.object({
  id: uuid,
  code: z.string().min(1),
  title: i18nText,
  description: i18nText.optional(),
  /** `null` = sin límite. Socials e ICT cronometran pero no cortan. */
  durationSeconds: z.number().int().positive().nullable(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  allowBack: z.boolean(),
  feedbackMode,
  passThreshold: z.number().min(0).max(1),
  maxAttempts: z.number().int().positive().nullable(),
  sections: z.array(blueprintSection).min(1),
  source: sourceRef,
});
export type ExamBlueprint = z.infer<typeof examBlueprint>;

/* -------------------------------------------------------------------------- */
/* Plan de estudio                                                            */
/* -------------------------------------------------------------------------- */

export const studyPlanTask = z.object({
  ord: z.number().int().nonnegative(),
  text: i18nText,
  target: i18nText.optional(),
});

export const studyPlanDay = z.object({
  id: uuid,
  ord: z.number().int().nonnegative(),
  title: i18nText,
  tasks: z.array(studyPlanTask).min(1),
});

export const studyPlan = z.object({
  id: uuid,
  title: i18nText,
  days: z.array(studyPlanDay).min(1),
  /** "Las marcas que se pierden cada año", consejos de examen… */
  notes: z.array(lessonBlock),
  source: sourceRef,
});
export type StudyPlan = z.infer<typeof studyPlan>;

/* -------------------------------------------------------------------------- */
/* El pack                                                                    */
/* -------------------------------------------------------------------------- */

/** Lo que NO se extrajo, y por qué. Honestidad explícita, no silencio. */
export const gap = z.object({
  area: z.string().min(1),
  symbol: z.string().optional(),
  reason: z.string().min(1),
});
export type Gap = z.infer<typeof gap>;

export const contentPack = z
  .object({
    /** Versión del FORMATO del pack. Sube al romper compatibilidad. */
    packFormatVersion: z.literal(1),
    subject: z.object({
      code: z.enum(["math", "science", "english", "spanish", "socials", "ict"]),
      name: i18nText,
      icon: z.string().min(1),
      color: z.string().regex(/^#[0-9a-f]{6}$/),
      ord: z.number().int().nonnegative(),
    }),
    course: z.object({
      id: uuid,
      code: z.string().min(1),
      name: i18nText,
      yearLevel: z.number().int().min(1).max(13),
      locale,
      status: contentStatus,
      version: z.number().int().positive(),
    }),
    skills: z.array(skill).min(1),
    modules: z.array(courseModule).min(1),
    questions: z.array(question),
    blueprints: z.array(examBlueprint),
    studyPlan: studyPlan.nullable(),
    gaps: z.array(gap),
    /** sha256 truncado del resto del pack. Detecta deriva entre ejecuciones. */
    integrity: z.string().regex(/^[0-9a-f]{16}$/),
  })
  .superRefine((pack, ctx) => {
    const codes = new Set(pack.skills.map((s) => s.code));

    for (const s of pack.skills) {
      if (s.parentCode !== null && !codes.has(s.parentCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `skill \`${s.code}\` referencia un padre inexistente \`${s.parentCode}\``,
        });
      }
    }
    const refs: Array<[string, readonly string[]]> = [
      ...pack.modules.flatMap((m) =>
        m.lessons.map((l) => [`lección ${l.ord}`, l.skillCodes] as [string, readonly string[]]),
      ),
      ...pack.questions.map((q) => [`pregunta ${q.id}`, [q.skillCode]] as [string, readonly string[]]),
      ...pack.blueprints.flatMap((b) =>
        b.sections.map(
          (s) => [`blueprint ${b.code} §${s.ord}`, s.selection.skillCodes] as [string, readonly string[]],
        ),
      ),
    ];
    for (const [where, list] of refs) {
      for (const code of list) {
        if (!codes.has(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${where} referencia un skill inexistente \`${code}\``,
          });
        }
      }
    }

    // Todo id, en todo el pack, debe ser único: dos filas con el mismo uuid
    // rompen el seed con un error de clave primaria, en producción y tarde.
    const seen = new Map<string, string>();
    const claim = (id: string, what: string): void => {
      const prev = seen.get(id);
      if (prev !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `id duplicado ${id}: ${prev} y ${what}`,
        });
      }
      seen.set(id, what);
    };
    claim(pack.course.id, "course");
    for (const s of pack.skills) claim(s.id, `skill ${s.code}`);
    for (const m of pack.modules) {
      claim(m.id, `module ${m.ord}`);
      for (const b of m.overview) claim(b.id, `overview ${m.ord}.${b.ord}`);
      for (const l of m.lessons) {
        claim(l.id, `lesson ${m.ord}.${l.ord}`);
        for (const b of l.blocks) claim(b.id, `block ${m.ord}.${l.ord}.${b.ord}`);
      }
    }
    for (const q of pack.questions) claim(q.id, `question ${q.source.symbol}#${q.source.index ?? "?"}`);
    for (const b of pack.blueprints) {
      claim(b.id, `blueprint ${b.code}`);
      for (const s of b.sections) claim(s.id, `blueprint ${b.code} §${s.ord}`);
    }
    if (pack.studyPlan) {
      claim(pack.studyPlan.id, "studyPlan");
      for (const d of pack.studyPlan.days) claim(d.id, `plan día ${d.ord}`);
      for (const n of pack.studyPlan.notes) claim(n.id, `plan nota ${n.ord}`);
    }

    // El número de ítems del blueprint tiene que ser satisfacible con lo que el
    // pack trae. Un blueprint que pide 9 preguntas de un skill que solo tiene 4
    // produce un examen corto en silencio — justo el fallo que nadie ve.
    const bankBySkill = new Map<string, number>();
    for (const q of pack.questions) {
      if (q.kind !== "static") continue;
      bankBySkill.set(q.skillCode, (bankBySkill.get(q.skillCode) ?? 0) + 1);
    }
    for (const b of pack.blueprints) {
      for (const s of b.sections) {
        if (s.source !== "bank") continue;
        const available = s.selection.skillCodes.reduce(
          (acc, c) => acc + (bankBySkill.get(c) ?? 0),
          0,
        );
        if (available < s.itemCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `blueprint ${b.code} §${s.ord} pide ${s.itemCount} ítems pero el banco solo tiene ${available}`,
          });
        }
      }
    }
  });
export type ContentPack = z.infer<typeof contentPack>;
