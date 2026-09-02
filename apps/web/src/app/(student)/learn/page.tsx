/**
 * /learn — el índice del alumno, ahora una rejilla de materias.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component puro: no hay ni una interacción en esta pantalla, así que no
 * lleva un solo byte de JavaScript propio. Lo único que se hidrata es el puente
 * de idioma de `@cet/ui`, que es un contexto sin marcado.
 *
 * La RLS ya filtra por colegio; las consultas filtran ADEMÁS por `school_id`
 * (regla transversal 2 de `MODULES.md`). Ver `queries.ts`.
 *
 * ===========================================================================
 * QUÉ HABÍA AQUÍ, Y POR QUÉ YA NO
 * ===========================================================================
 * Una lista anidada: `<section>` por curso, `<ol>` de módulos, `<ul>` de
 * lecciones. Todo el catálogo del colegio abierto de golpe, sin color, sin
 * avance, y con el título de cada lección como único sitio pulsable. Un alumno
 * de once años en una tableta no sabía por dónde iba ni cuánto le quedaba, y
 * tenía que leer para saber qué materia estaba mirando.
 *
 * Ahora se entra por materia. Cada tarjeta resume su avance y lleva a
 * `/learn/materia/[key]`, donde están sus módulos y sus lecciones.
 *
 * ===========================================================================
 * DE DÓNDE SALEN LAS CIFRAS, Y QUÉ PASA CUANDO NO SALEN
 * ===========================================================================
 * De `learning_events` (`lesson_opened` / `lesson_completed`), que son eventos
 * que la aplicación EMITE de verdad hoy. No de `skill_mastery`, que tiene cero
 * filas en producción y ningún escritor: aquí hubo un `MasteryMeter` colgado de
 * esa tabla, llevaba desde siempre pintando vacío, y era imposible distinguir
 * "no has practicado" de "esto no lo rellena nadie".
 *
 * Si la consulta de avance falla, `progress` es `null` y las tarjetas se pintan
 * SIN cifras, con un aviso. "Cero" es un dato; una consulta caída no lo es, y
 * decirle a un alumno que no ha terminado nada cuando no lo sabemos es mentirle
 * sobre su propio trabajo.
 */
import { resolveI18n } from "@cet/shared";
import { EmptyState, ErrorState, SubjectGrid, type SubjectCardProps } from "@cet/ui";
import Link from "next/link";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import { countLessons } from "@/components/learn/lesson-progress";
import { getLessonProgress, getStudentCourses } from "@/components/learn/queries";
import { groupCoursesBySubject } from "@/components/learn/subject-grouping";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

/**
 * Los seis rótulos que la tarjeta espera de la aplicación.
 *
 * AD-7: `@cet/ui` no escribe ni un literal de cara al usuario, así que los
 * textos viajan como `I18nText` desde el diccionario de la app. Se construyen
 * una vez, fuera del componente: son constantes, no dependen de la petición.
 */
const CARD_TEXT = {
  ofText: learnI18n((d) => d.subject.of),
  completedText: learnI18n((d) => d.subject.finished),
  startedText: learnI18n((d) => d.subject.onTheGo),
  notStartedText: learnI18n((d) => d.subject.notStarted),
  doneText: learnI18n((d) => d.subject.allDone),
  unavailableText: learnI18n((d) => d.subject.progressUnknown),
} as const;

export default async function LearnPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getLearnDictionary(locale).index;
  const s = getLearnDictionary(locale).subject;
  const hoy = getLearnDictionary(locale).today;

  // En paralelo: el catálogo y el avance son independientes, y que el avance
  // falle no puede retrasar ni impedir que se vean las lecciones.
  const [courses, progress] = await Promise.all([
    getStudentCourses(student.schoolId),
    getLessonProgress(student.schoolId, student.id),
  ]);

  const subjects: readonly SubjectCardProps[] =
    courses === null
      ? []
      : groupCoursesBySubject(courses, locale).map((group) => {
          const counted = progress === null ? null : countLessons(group.lessonIds, progress);
          return {
            code: group.code,
            name: resolveI18n(group.name, locale),
            href: `/learn/materia/${encodeURIComponent(group.key)}`,
            total: group.lessonIds.length,
            completed: counted?.completed ?? null,
            started: counted?.started ?? null,
            ...CARD_TEXT,
          };
        });

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="mt-2 max-w-prose text-muted">{t.subtitle}</p>
        </header>

        {/* EL DÍA VA PRIMERO. Con un plan de estudio, la pregunta que trae aquí
            al niño ya no es «¿qué materia?» sino «¿qué me toca hoy?». Sin plan,
            /learn/hoy lo dice con una frase y no inventa tareas. */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{hoy.title}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">{hoy.subtitle}</p>
          <Link
            href={ROUTES.studentToday}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-card focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {hoy.open}
          </Link>
        </section>

        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{t.practiceCta}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">{t.practiceCtaBody}</p>
          <Link
            href="/practice"
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-card focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t.practiceCta}
          </Link>
        </section>

        {/* El aviso va ANTES de la rejilla y no dentro de cada tarjeta: es una
            sola cosa que ha fallado, no seis. Repetirlo seis veces convertiría
            un aviso en ruido. */}
        {courses !== null && courses.length > 0 && progress === null ? (
          <p
            role="status"
            className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted"
          >
            {s.progressUnavailable}
          </p>
        ) : null}

        {courses === null ? (
          <ErrorState
            title={learnI18n((d) => d.index.errorTitle)}
            body={learnI18n((d) => d.index.errorBody)}
          />
        ) : subjects.length === 0 ? (
          <EmptyState
            title={learnI18n((d) => d.index.emptyTitle)}
            body={learnI18n((d) => d.index.emptyBody)}
          />
        ) : (
          <SubjectGrid subjects={subjects} />
        )}
      </div>
    </UiLocaleProvider>
  );
}
