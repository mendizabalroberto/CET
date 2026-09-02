/**
 * /tutor/hijos/[id]/contenido/materia/[key] — una materia del hijo, por dentro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El gemelo de `/learn/materia/[key]`, con dos diferencias y solo dos: el
 * alcance sale del hijo en vez de la sesión, y los destinos apuntan a las
 * pantallas del tutor. Todo lo demás —el agrupado, el estado de cada ficha, el
 * medallón de la materia— es el mismo código, a propósito: el padre tiene que
 * ver la misma rejilla que su hijo, no una versión de padre.
 *
 * QUÉ SE COMPRUEBA ANTES DE ENSEÑAR NADA. Igual que en la del alumno: no se
 * consulta la materia por su `code`, se piden los cursos que están al alcance
 * DEL HIJO y se busca la clave entre ellos. Una clave inventada, o la de una
 * materia que su colegio no ha encendido, es `notFound()` y no una pantalla
 * vacía que insinúe que hay algo detrás.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

import { getLearnDictionary, learnI18n, learnI18nWith } from "@/components/learn/dictionary";
import { countLessons, type LessonState } from "@/components/learn/lesson-progress";
import { getLessonProgress, getStudentCourses } from "@/components/learn/queries";
import { findSubjectGroup, groupCoursesBySubject } from "@/components/learn/subject-grouping";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { Migas } from "@/components/nav/Migas";
import { dictI18n } from "@/lib/i18n";
import { getServerDictionary } from "@/lib/i18n/server";
import { alcanceDeHijo } from "@/lib/tutor/queries";
import { rutasDeHijo } from "@/lib/tutor/rutas";

/**
 * `progress === null` es la consulta caída, y entonces NINGUNA lección lleva
 * estado: todas se pintan como sin empezar y la cabecera lo dice una vez. La
 * alternativa —pintar el estado de las que sí supiéramos— dejaría al padre sin
 * poder distinguir «no la ha abierto» de «no lo sabemos», que sobre el trabajo
 * de su hijo son cosas muy distintas.
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

interface PageProps {
  readonly params: Promise<{ id: string; key: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.child.content.cardTitle };
}

export default async function MateriaDelHijoPage({ params }: PageProps) {
  const { id, key } = await params;
  const { locale, t } = await getServerDictionary();

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const C = t.tutor.child.content;
  const rutas = rutasDeHijo(hijo.id);
  const d = getLearnDictionary(locale);
  const s = d.subject;
  // La raíz de la miga es el índice de materias del hijo, no `/tutor`: dos
  // escalones bastan aquí, y el camino de vuelta a la ficha ya lo da el índice.
  const raiz = { label: C.trailRoot, href: rutas.contenido };

  const [courses, progress] = await Promise.all([
    getStudentCourses(hijo.schoolId),
    getLessonProgress(hijo.schoolId, hijo.id),
  ]);

  if (courses === null) {
    return (
      <UiLocaleProvider locale={locale}>
        <div className="flex flex-col gap-4">
          <Migas label={C.trailLabel} items={[raiz, { label: C.errorTitle }]} />
          <ErrorState
            title={dictI18n((x) => x.tutor.child.content.errorTitle)}
            body={dictI18n((x) => x.tutor.child.content.errorBody)}
          />
        </div>
      </UiLocaleProvider>
    );
  }

  const group = findSubjectGroup(groupCoursesBySubject(courses, locale), decodeURIComponent(key));
  if (group === null) notFound();

  const name = resolveI18n(group.name, locale);
  const identity = subjectIdentity(group.code);
  const counted = progress === null ? null : countLessons(group.lessonIds, progress);
  const varios = group.courses.length > 1;

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-6">
        <Migas label={C.trailLabel} items={[raiz, { label: name }]} />

        <header className="flex items-center gap-4 rounded-2xl p-5" style={{ background: identity.soft }}>
          <span
            className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-[var(--cet-ink-inverse)]"
            style={{ background: identity.fill }}
          >
            <SubjectIcon code={group.code} className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            {/* `h2`: el `h1` del área es el nombre del hijo y lo pone el layout. */}
            <h2 className="text-xl font-bold text-ink">{name}</h2>
            <p className="mt-1 text-sm text-muted">
              {counted === null
                ? s.progressUnavailable
                : `${counted.completed} ${s.of} ${group.lessonIds.length} ${s.finished}`}
            </p>
          </div>
        </header>

        {group.courses.map((course) => (
          <section key={course.id} className="flex flex-col gap-4">
            {/* El título del curso solo aparece cuando hay más de uno: con uno
                repetiría el nombre de la materia que ya está en el <h1>. */}
            {varios ? (
              <h3 className="text-lg font-bold text-ink">{resolveI18n(course.title, locale)}</h3>
            ) : null}

            {course.modules.length === 0 ? (
              <EmptyState
                title={dictI18n((x) => x.tutor.child.content.emptyTitle)}
                body={dictI18n((x) => x.tutor.child.content.emptyBody)}
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
                      href: rutas.leccion(lesson.id),
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
      </div>
    </UiLocaleProvider>
  );
}
