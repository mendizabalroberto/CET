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

import {
  readLessonEvents,
  summariseLessonEvents,
  type LessonState,
} from "./lesson-progress";
import { mapLessonBlocks, readI18nText, type LessonBlockRow, type MappedLessonBlock } from "./block-mapping";
import {
  LOOKBACK_DAYS,
  MAX_EVENT_ROWS,
  readAnsweredEvents,
  summarisePracticeEvents,
  type TopicProgress,
} from "./practice-progress";

/** Bucket de Supabase Storage donde vive la media de lección. */
const MEDIA_BUCKET = "lesson-media";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El filtro AD-2 "lo global O lo mío" se escribe como una cadena de PostgREST.
 * Se valida el uuid antes de interpolarlo: aunque venga de la sesión y no del
 * usuario, interpolar sin comprobar en un lenguaje de filtros es exactamente el
 * hábito que un día se copia a un sitio donde el valor sí viene de fuera.
 */
/**
 * `null` significa «alumno sin colegio»: el hijo de un tutor, que practica en
 * casa. No es un error ni un dato que falte — es un estado de primera clase
 * desde la refundación de la tenencia.
 *
 * Para él, el alcance es SOLO la biblioteca global (AD-2, `school_id IS NULL`).
 * Y eso es lo correcto en las dos direcciones: ve el contenido que cualquiera
 * puede ver, y no ve el de ningún colegio — tampoco por accidente, porque el
 * filtro no menciona ninguno.
 */
function globalOrOwn(schoolId: string | null): string {
  if (schoolId === null) return "school_id.is.null";
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
  /**
   * `subjects.code` (`math`, `ict`, …). Es la identidad de la materia para la
   * interfaz: de él salen el icono, el color y el sitio fijo en la rejilla, y
   * es lo que va en la URL de `/learn/materia/[code]`.
   *
   * `null` cuando el curso apunta a una materia que la RLS no deja ver o que se
   * ha borrado. La pantalla lo trata como una materia desconocida —icono
   * neutro— en vez de esconder el curso: las lecciones existen igual.
   */
  readonly subjectCode: string | null;
  readonly modules: readonly ModuleSummary[];
  readonly lessonCount: number;
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
export async function getStudentCourses(schoolId: string | null): Promise<CourseSummary[] | null> {
  const supabase = await createClient();
  const scope = globalOrOwn(schoolId);

  // Sin colegio no hay activaciones que consultar: `school_courses` es la tabla
  // con la que un colegio enciende un curso global, y el hijo de un tutor no
  // tiene colegio que encienda nada. Se salta el viaje y se sigue con la lista
  // vacia, que es la respuesta correcta y no un fallo.
  const { data: activations, error: activationError } =
    schoolId === null
      ? { data: [] as { course_id: string }[], error: null }
      : await supabase
          .from("school_courses")
          .select("course_id")
          .eq("school_id", schoolId)
          .eq("is_active", true);

  if (activationError) return null;

  const courseIds = (activations ?? []).map((row) => row.course_id as string);
  if (courseIds.length === 0) return [];

  // NO se consulta `skill_mastery`. Aquí había una tercera consulta que
  // alimentaba un `MasteryMeter` en `/learn`, y estaba muerta: la tabla tiene
  // CERO filas en producción porque nadie la escribe (ni función, ni trigger,
  // ni política de insert, ni la RPC `app.recompute_skill_mastery` que promete
  // `modules/analytics/CLAUDE.md`). El indicador llevaba desde siempre pintando
  // vacío, y era imposible distinguir "este alumno no ha practicado" de "esta
  // tabla no la rellena nadie". El progreso real del alumno sale de
  // `getPracticeProgress()`, más abajo. Ver
  // `apps/web/src/components/learn/progreso-tiene-fuente-viva.test.ts`.
  const [{ data: courses, error: courseError }, { data: modules }] =
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

  const [{ data: lessons }, { data: subjects }] = await Promise.all([
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
      : supabase.from("subjects").select("id, code, name").in("id", subjectIds).or(scope),
  ]);

  const subjectById = new Map<string, { name: I18nText | null; code: string | null }>(
    (subjects ?? []).map((row) => [
      row.id as string,
      {
        name: readI18nText(row.name),
        code: typeof row.code === "string" ? row.code : null,
      },
    ]),
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
      return {
        id,
        title,
        yearLevel: Number(row.year_level),
        subject: subjectById.get(row.subject_id as string)?.name ?? null,
        subjectCode: subjectById.get(row.subject_id as string)?.code ?? null,
        modules: courseModules,
        lessonCount: courseModules.reduce((total, module) => total + module.lessons.length, 0),
      };
    })
    .filter((course): course is CourseSummary => course !== null)
    .sort((a, b) => a.yearLevel - b.yearLevel);
}

/* -------------------------------------------------------------------------- */
/* Progreso por grupo de práctica                                             */
/* -------------------------------------------------------------------------- */

/**
 * Cómo lleva el alumno cada grupo de práctica, a partir de sus propias
 * respuestas registradas en `learning_events`.
 *
 * Por qué se agrega EN JAVASCRIPT y no con un `group by` en SQL: PostgREST no
 * expone agregación sobre `jsonb` sin una vista o una RPC, y ninguna de las dos
 * existe hoy. La consulta está acotada por los dos lados —`LOOKBACK_DAYS` poda
 * particiones (`learning_events` está particionada por mes en `server_ts`) y
 * `MAX_EVENT_ROWS` corta el tamaño— y se apoya en el índice
 * `learning_events_student_ts_idx (student_id, server_ts desc)`, que ya existe.
 * Con eso el coste es constante por carga de pantalla, no proporcional al
 * histórico del alumno.
 *
 * Devuelve `null` si la consulta falla. La pantalla entonces NO pinta ningún
 * indicador: prefiere no decir nada a decir cero, porque "cero" es un dato y una
 * consulta caída no lo es. Ver `practice-progress.ts`.
 */
export async function getPracticeProgress(
  schoolId: string | null,
  studentId: string,
): Promise<Map<string, TopicProgress> | null> {
  if (schoolId !== null && !UUID_RE.test(schoolId)) return null;
  if (!UUID_RE.test(studentId)) return null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("learning_events")
    .select("payload")
    // La RLS ya limita a `student_id = auth.uid()`; el filtro explícito por
    // colegio es la regla transversal 2 de `MODULES.md`.
    .eq("student_id", studentId)
    // `is null` y no `eq` cuando no hay colegio: en Postgres `= NULL` no es
    // falso, es NULL, y una comparacion asi no devuelve NINGUNA fila. El
    // alumno sin colegio veria su progreso siempre vacio y sin error.
    .filter("school_id", schoolId === null ? "is" : "eq", schoolId)
    .eq("event_type", "practice_item_answered")
    .gte("server_ts", since)
    // El orden es parte del contrato de `summarisePracticeEvents`: la ventana
    // reciente son las primeras filas de cada grupo.
    .order("server_ts", { ascending: false })
    .limit(MAX_EVENT_ROWS);

  if (error) return null;

  return summarisePracticeEvents(readAnsweredEvents(data ?? []));
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
  schoolId: string | null,
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

/* -------------------------------------------------------------------------- */
/* Avance por lección                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Qué lecciones ha empezado y cuáles ha terminado el alumno.
 *
 * Misma disciplina y MISMA VENTANA que `getPracticeProgress()`: son las mismas
 * `LOOKBACK_DAYS` y `MAX_EVENT_ROWS` de `practice-progress`, no una copia. Dos
 * ventanas distintas para el mismo alumno en la misma pantalla serían un bug
 * silencioso — la tarjeta de materia y el chip de práctica dirían cosas
 * distintas del mismo día.
 *
 * Se piden sólo las dos columnas que se usan (`lesson_id`, `event_type`) y no la
 * fila entera: el `payload` de una lección larga trae el `dwellMs` de cada
 * bloque, y aquí no se mira. Es la diferencia entre traer kilobytes y traer
 * bytes por evento.
 *
 * Devuelve `null` si la consulta falla, y la pantalla entonces NO pinta ninguna
 * cifra. "Cero" es un dato; una consulta caída no lo es.
 */
export async function getLessonProgress(
  schoolId: string | null,
  studentId: string,
): Promise<Map<string, LessonState> | null> {
  if (schoolId !== null && !UUID_RE.test(schoolId)) return null;
  if (!UUID_RE.test(studentId)) return null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("learning_events")
    .select("lesson_id, event_type")
    // La RLS ya limita a `student_id = auth.uid()`; el filtro explícito por
    // colegio es la regla transversal 2 de `MODULES.md`.
    .eq("student_id", studentId)
    .filter("school_id", schoolId === null ? "is" : "eq", schoolId)
    .in("event_type", ["lesson_opened", "lesson_completed"])
    .gte("server_ts", since)
    .order("server_ts", { ascending: false })
    .limit(MAX_EVENT_ROWS);

  if (error) return null;

  // `summariseLessonEvents` no depende del orden de llegada —`completed` gana
  // siempre— así que el `order` de arriba sólo sirve para que el recorte a
  // MAX_EVENT_ROWS se quede con lo reciente, no con lo primero que hubo.
  return summariseLessonEvents(readLessonEvents(data ?? []));
}
