/**
 * Consultas del área de alumno: cursos, módulos, lecciones y bloques.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * REGLA TRANSVERSAL 2 DE `MODULES.md`
 * ===========================================================================
 * La RLS ya filtra por colegio. Aun así, TODA consulta de este fichero filtra
 * también por `school_id` de forma explícita. No es desconfianza teórica: una
 * política mal escrita, un `grant` de más o una vista nueva sin `security
 * invoker` convierten la RLS en la única barrera, y una única barrera acaba
 * fallando. El filtro explícito hace que el fallo sea "no veo nada" en vez de
 * "veo el colegio de al lado".
 *
 * Ninguna de estas funciones lanza: devuelven `null` o listas vacías y dejan que
 * la página decida qué enseñarle a un niño de once años. Un `throw` aquí
 * significaría la pantalla roja de `app/error.tsx` por una lección sin bloques.
 */
import "server-only";

import type { Locale } from "@cet/shared";
import type { I18nText } from "@cet/shared";

import { createClient } from "@/lib/supabase/server";

import { mapLessonBlocks, readI18nText, type LessonBlockRow, type MappedLessonBlock } from "./block-mapping";

/** Bucket de Supabase Storage donde vive la media de lección. */
const MEDIA_BUCKET = "lesson-media";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El filtro AD-2 "lo global O lo mío" se escribe como una cadena de PostgREST.
 * Se valida el uuid antes de interpolarlo: aunque venga de la sesión y no del
 * usuario, interpolar sin comprobar en un lenguaje de filtros es exactamente el
 * hábito que un día se copia a un sitio donde el valor sí viene de fuera.
 */
function globalOrOwn(schoolId: string): string {
  if (!UUID_RE.test(schoolId)) {
    throw new Error("school_id no es un uuid; se aborta la consulta antes de construir el filtro.");
  }
  return `school_id.is.null,school_id.eq.${schoolId}`;
}

/* -------------------------------------------------------------------------- */
/* Tipos de salida                                                            */
/* -------------------------------------------------------------------------- */

export interface LessonSummary {
  readonly id: string;
  readonly ord: number;
  readonly title: I18nText;
  readonly estimatedMinutes: number | null;
}

export interface ModuleSummary {
  readonly id: string;
  readonly ord: number;
  readonly title: I18nText;
  readonly description: I18nText | null;
  readonly lessons: readonly LessonSummary[];
}

export interface CourseSummary {
  readonly id: string;
  readonly title: I18nText;
  readonly yearLevel: number;
  readonly subject: I18nText | null;
  readonly modules: readonly ModuleSummary[];
  readonly lessonCount: number;
  /** Media de `skill_mastery` del curso, 0..1. `null` si aún no ha practicado. */
  readonly mastery: number | null;
}

export interface LessonDetail {
  readonly id: string;
  readonly title: I18nText;
  readonly estimatedMinutes: number | null;
  readonly moduleTitle: I18nText | null;
  readonly courseTitle: I18nText | null;
  readonly blocks: readonly MappedLessonBlock[];
  /** Códigos de skill de la lección, para el enlace "Practicar esto". */
  readonly skillCodes: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Índice de cursos                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Los cursos que el colegio ha ACTIVADO para el alumno, con sus módulos y
 * lecciones publicadas.
 *
 * Son cinco consultas planas y no un `select` anidado a propósito: PostgREST
 * aplica mal los filtros sobre relaciones a tres niveles (`courses.status` no
 * filtra la fila padre, la excluye del embed), y un curso que aparece sin
 * lecciones es peor que no aparecer. Cinco `in (...)` sobre índices existentes
 * no son un N+1: son cinco viajes, pase lo que pase con el tamaño del catálogo.
 */
export async function getStudentCourses(
  schoolId: string,
  studentId: string,
): Promise<CourseSummary[] | null> {
  const supabase = await createClient();
  const scope = globalOrOwn(schoolId);

  const { data: activations, error: activationError } = await supabase
    .from("school_courses")
    .select("course_id")
    .eq("school_id", schoolId)
    .eq("is_active", true);

  if (activationError) return null;

  const courseIds = (activations ?? []).map((row) => row.course_id as string);
  if (courseIds.length === 0) return [];

  const [{ data: courses, error: courseError }, { data: modules }, { data: mastery }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id, name, year_level, subject_id")
        .in("id", courseIds)
        .eq("status", "published")
        .or(scope),
      supabase
        .from("course_modules")
        .select("id, course_id, ord, title, description")
        .in("course_id", courseIds)
        .or(scope)
        .order("ord", { ascending: true }),
      supabase
        .from("skill_mastery")
        .select("skill_id, mastery")
        .eq("student_id", studentId)
        .eq("school_id", schoolId),
    ]);

  if (courseError) return null;
  const courseRows = courses ?? [];
  if (courseRows.length === 0) return [];

  const visibleCourseIds = courseRows.map((row) => row.id as string);
  const moduleRows = (modules ?? []).filter((row) =>
    visibleCourseIds.includes(row.course_id as string),
  );
  const moduleIds = moduleRows.map((row) => row.id as string);

  const subjectIds = [
    ...new Set(courseRows.map((row) => row.subject_id as string).filter(Boolean)),
  ];

  const [{ data: lessons }, { data: subjects }, { data: skills }] = await Promise.all([
    moduleIds.length === 0
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase
          .from("lessons")
          .select("id, module_id, ord, title, estimated_minutes")
          .in("module_id", moduleIds)
          .eq("status", "published")
          .or(scope)
          .order("ord", { ascending: true }),
    subjectIds.length === 0
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from("subjects").select("id, name").in("id", subjectIds).or(scope),
    supabase.from("skills").select("id, course_id").in("course_id", visibleCourseIds).or(scope),
  ]);

  const subjectById = new Map<string, I18nText | null>(
    (subjects ?? []).map((row) => [row.id as string, readI18nText(row.name)]),
  );

  const lessonsByModule = new Map<string, LessonSummary[]>();
  for (const row of lessons ?? []) {
    const title = readI18nText(row.title);
    if (title === null) continue;
    const moduleId = row.module_id as string;
    const list = lessonsByModule.get(moduleId) ?? [];
    list.push({
      id: row.id as string,
      ord: Number(row.ord),
      title,
      estimatedMinutes: row.estimated_minutes === null ? null : Number(row.estimated_minutes),
    });
    lessonsByModule.set(moduleId, list);
  }

  // Mastery media por curso. Solo cuentan las skills con datos: promediar
  // incluyendo las que nunca se han practicado daría 4 % a un alumno que domina
  // las tres cosas que ha visto, y eso desanima sin motivo.
  const masteryBySkill = new Map<string, number>(
    (mastery ?? []).map((row) => [row.skill_id as string, Number(row.mastery)]),
  );
  const masteryByCourse = new Map<string, { sum: number; count: number }>();
  for (const row of skills ?? []) {
    const value = masteryBySkill.get(row.id as string);
    if (value === undefined) continue;
    const courseId = row.course_id as string;
    const acc = masteryByCourse.get(courseId) ?? { sum: 0, count: 0 };
    masteryByCourse.set(courseId, { sum: acc.sum + value, count: acc.count + 1 });
  }

  const modulesByCourse = new Map<string, ModuleSummary[]>();
  for (const row of moduleRows) {
    const title = readI18nText(row.title);
    if (title === null) continue;
    const courseId = row.course_id as string;
    const list = modulesByCourse.get(courseId) ?? [];
    list.push({
      id: row.id as string,
      ord: Number(row.ord),
      title,
      description: readI18nText(row.description),
      lessons: lessonsByModule.get(row.id as string) ?? [],
    });
    modulesByCourse.set(courseId, list);
  }

  return courseRows
    .map((row): CourseSummary | null => {
      const title = readI18nText(row.name);
      if (title === null) return null;
      const id = row.id as string;
      const courseModules = modulesByCourse.get(id) ?? [];
      const acc = masteryByCourse.get(id);
      return {
        id,
        title,
        yearLevel: Number(row.year_level),
        subject: subjectById.get(row.subject_id as string) ?? null,
        modules: courseModules,
        lessonCount: courseModules.reduce((total, module) => total + module.lessons.length, 0),
        mastery: acc && acc.count > 0 ? acc.sum / acc.count : null,
      };
    })
    .filter((course): course is CourseSummary => course !== null)
    .sort((a, b) => a.yearLevel - b.yearLevel);
}

/* -------------------------------------------------------------------------- */
/* Lección                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Una lección con sus bloques ya mapeados y SANEADOS.
 *
 * Comprueba tres cosas antes de devolver nada, y las tres importan:
 *   1. la lección está `published` — un borrador no se le enseña a un alumno;
 *   2. su `school_id` es global o el suyo;
 *   3. el curso al que pertenece está ACTIVADO para su colegio. Sin este tercer
 *      paso, adivinar un uuid daría acceso a una lección global de un curso que
 *      el colegio nunca encendió.
 */
export async function getLesson(
  lessonId: string,
  schoolId: string,
  locale: Locale,
): Promise<LessonDetail | null> {
  if (!UUID_RE.test(lessonId)) return null;

  const supabase = await createClient();
  const scope = globalOrOwn(schoolId);

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("id, module_id, title, estimated_minutes")
    .eq("id", lessonId)
    .eq("status", "published")
    .or(scope)
    .maybeSingle();

  if (error || !lesson) return null;

  const title = readI18nText(lesson.title);
  if (title === null) return null;

  const { data: module } = await supabase
    .from("course_modules")
    .select("id, course_id, title")
    .eq("id", lesson.module_id as string)
    .or(scope)
    .maybeSingle();

  if (!module) return null;

  const courseId = module.course_id as string;

  const [{ data: activation }, { data: course }] = await Promise.all([
    supabase
      .from("school_courses")
      .select("course_id")
      .eq("school_id", schoolId)
      .eq("course_id", courseId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("courses").select("id, name").eq("id", courseId).or(scope).maybeSingle(),
  ]);

  // El curso no está encendido para este colegio: para el alumno, no existe.
  if (!activation) return null;

  const { data: blocks } = await supabase
    .from("lesson_blocks")
    .select("id, ord, kind, content, media_id")
    .eq("lesson_id", lessonId)
    .or(scope)
    .order("ord", { ascending: true });

  const blockRows = blocks ?? [];
  const mediaIds = [
    ...new Set(
      blockRows
        .map((row) => row.media_id as string | null)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const mediaById = new Map<string, { src: string; alt: I18nText }>();
  if (mediaIds.length > 0) {
    const { data: media } = await supabase
      .from("media_assets")
      .select("id, storage_path, alt_text")
      .in("id", mediaIds)
      .or(scope);

    for (const row of media ?? []) {
      const alt = readI18nText(row.alt_text);
      if (alt === null) continue;
      const {
        data: { publicUrl },
      } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(row.storage_path as string);
      mediaById.set(row.id as string, { src: publicUrl, alt });
    }
  }

  const rows: LessonBlockRow[] = blockRows.map((row) => ({
    id: row.id as string,
    ord: Number(row.ord),
    kind: row.kind as string,
    content: row.content,
    media: mediaById.get((row.media_id as string | null) ?? "") ?? null,
  }));

  const { data: lessonSkills } = await supabase
    .from("lesson_skills")
    .select("skill_id, skills(code)")
    .eq("lesson_id", lessonId);

  const skillCodes = (lessonSkills ?? [])
    .map((row) => {
      const joined = (row as { skills?: { code?: unknown } | { code?: unknown }[] }).skills;
      const first = Array.isArray(joined) ? joined[0] : joined;
      return typeof first?.code === "string" ? first.code : null;
    })
    .filter((code): code is string => code !== null);

  return {
    id: lesson.id as string,
    title,
    estimatedMinutes: lesson.estimated_minutes === null ? null : Number(lesson.estimated_minutes),
    moduleTitle: readI18nText(module.title),
    courseTitle: course ? readI18nText(course.name) : null,
    blocks: mapLessonBlocks(rows, locale),
    skillCodes,
  };
}
