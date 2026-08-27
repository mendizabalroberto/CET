/**
 * /learn — índice del alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component puro: no hay ni una interacción en esta pantalla, así que no
 * lleva un solo byte de JavaScript propio. Lo único que se hidrata es el puente
 * de idioma de `@cet/ui`, que es un contexto sin marcado.
 *
 * La RLS ya filtra por colegio; la consulta filtra ADEMÁS por `school_id`
 * (regla transversal 2 de `MODULES.md`). Ver `queries.ts`.
 *
 * ===========================================================================
 * AQUÍ HABÍA UN MEDIDOR DE DOMINIO, Y NO MEDÍA NADA
 * ===========================================================================
 * Cada curso llevaba un `MasteryMeter` alimentado por la media de
 * `skill_mastery`. Esa tabla tiene CERO filas en producción y ningún escritor:
 * ni función, ni trigger, ni política de insert. El medidor llevaba desde
 * siempre en su rama vacía, y el alumno no podía distinguir "no has practicado"
 * de "esto no lo rellena nadie". Se ha quitado en vez de dejarlo: un indicador
 * que no puede medir es peor que ninguno, porque enseña a no mirar los
 * indicadores. El progreso real, por grupo de práctica y derivado de eventos que
 * sí se escriben, está en `/practice`. Cuando exista la proyección de
 * `skill_mastery`, este medidor puede volver — con su fuente viva.
 */
import Link from "next/link";
import { resolveI18n } from "@cet/shared";
import { EmptyState, ErrorState } from "@cet/ui";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import { getStudentCourses } from "@/components/learn/queries";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";

export default async function LearnPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getLearnDictionary(locale).index;

  const courses = await getStudentCourses(student.schoolId);

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="mt-2 max-w-prose text-muted">{t.subtitle}</p>
        </header>

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

        {courses === null ? (
          <ErrorState
            title={learnI18n((d) => d.index.errorTitle)}
            body={learnI18n((d) => d.index.errorBody)}
          />
        ) : courses.length === 0 ? (
          <EmptyState
            title={learnI18n((d) => d.index.emptyTitle)}
            body={learnI18n((d) => d.index.emptyBody)}
          />
        ) : (
          courses.map((course) => (
            <section key={course.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xl font-bold text-ink">
                  {resolveI18n(course.title, locale)}
                </h2>
                <p className="text-sm text-muted">
                  {course.lessonCount === 1
                    ? t.lessonCountOne
                    : interpolate(t.lessonCount, { count: course.lessonCount })}
                </p>
              </div>

              {course.modules.length === 0 ? (
                <EmptyState
                  title={learnI18n((d) => d.index.emptyTitle)}
                  body={learnI18n((d) => d.index.emptyBody)}
                />
              ) : (
                <ol className="flex flex-col gap-4">
                  {course.modules.map((module) => (
                    <li key={module.id} className="rounded-2xl border border-line bg-card p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                        {interpolate(t.moduleLabel, { ord: module.ord })}
                      </h3>
                      <p className="mt-1 font-semibold text-ink">
                        {resolveI18n(module.title, locale)}
                      </p>

                      <ul className="mt-3 flex flex-col gap-1">
                        {module.lessons.map((lesson) => (
                          <li key={lesson.id}>
                            <Link
                              href={`/learn/${lesson.id}`}
                              className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              <span>
                                {resolveI18n(lesson.title, locale)}
                              </span>
                              {lesson.estimatedMinutes === null ? null : (
                                <span className="shrink-0 text-xs text-muted">
                                  {interpolate(t.minutes, { count: lesson.estimatedMinutes })}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))
        )}
      </div>
    </UiLocaleProvider>
  );
}
