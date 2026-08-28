/**
 * /learn/materia/[key] — una materia por dentro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component puro, como el índice: aquí no hay interacción propia, sólo
 * enlaces. Lo único que se hidrata es el puente de idioma de `@cet/ui`.
 *
 * ===========================================================================
 * POR QUÉ LA URL LLEVA EL `code` Y NO EL UUID
 * ===========================================================================
 * `/learn/materia/math` se lee, se recuerda y se puede escribir a mano; un uuid
 * no. Y el `code` es estable: la fila de `subjects` puede recrearse y el enlace
 * sigue valiendo.
 *
 * La excepción son los cursos cuya materia no se puede ver (RLS, o la fila
 * borrada). Esos no se esconden —sus lecciones existen y el alumno las
 * necesita—: reciben una clave sintética `curso-<id>`, y ahí sí aparece un uuid
 * en la URL. Es consistente con `/learn/<lessonId>`, que lleva el uuid de la
 * lección desde el primer día. Ver `subject-grouping.ts`.
 *
 * ===========================================================================
 * QUÉ SE COMPRUEBA ANTES DE ENSEÑAR NADA
 * ===========================================================================
 * No se consulta la materia por su `code`. Se piden los cursos ACTIVADOS para
 * el colegio del alumno —la misma consulta del índice, con sus tres filtros— y
 * se busca la clave entre ellos. Así, una clave inventada o la de una materia
 * que el colegio no ha encendido no puede devolver nada: es `notFound()`, no
 * una pantalla vacía que insinúe que hay algo detrás.
 */
import { resolveI18n } from "@cet/shared";
import {
  EmptyState,
  ErrorState,
  ModuleSection,
  SubjectIcon,
  subjectIdentity,
  type LessonState as TileState,
  type LessonTileProps,
} from "@cet/ui";
import { notFound } from "next/navigation";

import { getLearnDictionary, learnI18n, learnI18nWith } from "@/components/learn/dictionary";
import { countLessons } from "@/components/learn/lesson-progress";
import type { LessonState } from "@/components/learn/lesson-progress";
import { getLessonProgress, getStudentCourses } from "@/components/learn/queries";
import {
  findSubjectGroup,
  groupCoursesBySubject,
} from "@/components/learn/subject-grouping";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { Migas } from "@/components/nav/Migas";
import { requireStudent } from "@/lib/auth/session";
import { interpolate } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";

/**
 * El estado de la lección para la ficha.
 *
 * `progress === null` es la consulta caída, y entonces NINGUNA lección lleva
 * estado: todas se pintan como sin empezar y la cabecera lo dice una vez. La
 * alternativa —pintar el estado de las que sí supiéramos— sería peor: el alumno
 * no puede distinguir una ficha "sin empezar porque no la has abierto" de una
 * "sin empezar porque no lo sabemos", y aquí no hay sitio para explicarlo ficha
 * a ficha.
 */
function tileState(
  progress: ReadonlyMap<string, LessonState> | null,
  lessonId: string,
): TileState {
  if (progress === null) return "not_started";
  const state = progress.get(lessonId);
  if (state === "completed") return "completed";
  if (state === "started") return "started";
  return "not_started";
}

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const d = getLearnDictionary(locale);
  const t = d.index;
  const s = d.subject;

  const [courses, progress] = await Promise.all([
    getStudentCourses(student.schoolId),
    getLessonProgress(student.schoolId, student.id),
  ]);

  if (courses === null) {
    return (
      <UiLocaleProvider locale={locale}>
        <div className="flex flex-col gap-4">
          <Migas
            label={d.lesson.trailLabel}
            items={[{ label: d.lesson.trailRoot, href: "/learn" }, { label: t.errorTitle }]}
          />
          <ErrorState
            title={learnI18n((x) => x.index.errorTitle)}
            body={learnI18n((x) => x.index.errorBody)}
          />
        </div>
      </UiLocaleProvider>
    );
  }

  const group = findSubjectGroup(groupCoursesBySubject(courses, locale), decodeURIComponent(key));
  // Ni una materia inventada ni una que el colegio no ha activado: para el
  // alumno, no existe. No se pinta una pantalla vacía con su nombre.
  if (group === null) notFound();

  const name = resolveI18n(group.name, locale);
  const identity = subjectIdentity(group.code);
  const counted = progress === null ? null : countLessons(group.lessonIds, progress);
  const varios = group.courses.length > 1;

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-6">
        <Migas
          label={d.lesson.trailLabel}
          items={[{ label: d.lesson.trailRoot, href: "/learn" }, { label: name }]}
        />

        <header className="flex items-center gap-4 rounded-2xl p-5" style={{ background: identity.soft }}>
          {/* El medallón: el único sitio donde el color de materia lleva algo
              encima, y está medido a >= 4.5:1 contra el blanco. */}
          <span
            className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-[var(--cet-ink-inverse)]"
            style={{ background: identity.fill }}
          >
            <SubjectIcon code={group.code} className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink">{name}</h1>
            <p className="mt-1 text-sm text-muted">
              {counted === null
                ? s.progressUnavailable
                : `${counted.completed} ${s.of} ${group.lessonIds.length} ${s.finished}`}
            </p>
          </div>
        </header>

        {group.courses.map((course) => (
          <section key={course.id} className="flex flex-col gap-4">
            {/* El título del curso sólo aparece cuando hay más de uno. Con uno
                solo repetiría el nombre de la materia que ya está en el <h1>. */}
            {varios ? (
              <h2 className="text-lg font-bold text-ink">{resolveI18n(course.title, locale)}</h2>
            ) : null}

            {course.modules.length === 0 ? (
              <EmptyState
                title={learnI18n((x) => x.index.emptyTitle)}
                body={learnI18n((x) => x.index.emptyBody)}
              />
            ) : (
              course.modules.map((module) => (
                <ModuleSection
                  key={module.id}
                  title={resolveI18n(module.title, locale)}
                  ord={module.ord}
                  ordLabel={learnI18nWith((x) => x.index.moduleLabel, { ord: module.ord })}
                  emptyLabel={learnI18n((x) => x.subject.emptyModule)}
                  lessons={module.lessons.map((lesson): LessonTileProps => {
                    const state = tileState(progress, lesson.id);
                    return {
                      title: resolveI18n(lesson.title, locale),
                      href: `/learn/${lesson.id}`,
                      state,
                      minutes: lesson.estimatedMinutes,
                      stateLabel: learnI18n((x) =>
                        state === "completed"
                          ? x.subject.stateCompleted
                          : state === "started"
                            ? x.subject.stateStarted
                            : x.subject.stateNotStarted,
                      ),
                      ...(lesson.estimatedMinutes === null
                        ? {}
                        : {
                            minutesLabel: learnI18nWith((x) => x.index.minutes, {
                              count: lesson.estimatedMinutes,
                            }),
                          }),
                    };
                  })}
                />
              ))
            )}
          </section>
        ))}

        {/* El recuento del pie repite la cifra de la cabecera a propósito: en
            una materia larga, la cabecera ya no se ve al llegar abajo. */}
        <p className="text-sm text-muted">
          {group.lessonIds.length === 1
            ? t.lessonCountOne
            : interpolate(t.lessonCount, { count: group.lessonIds.length })}
        </p>
      </div>
    </UiLocaleProvider>
  );
}
