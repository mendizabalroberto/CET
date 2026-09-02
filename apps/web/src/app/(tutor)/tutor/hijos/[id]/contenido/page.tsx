/**
 * /tutor/hijos/[id]/contenido — las materias de un hijo, vistas por su padre.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTA PANTALLA EXISTE
 * ===========================================================================
 * La ficha del hijo contesta «¿está estudiando?» con cifras: minutos, rachas,
 * destrezas. No contestaba la siguiente pregunta, que es la que hace un padre
 * en cuanto ve el informe: «¿estudiando QUÉ?». Un renglón que dice «45 min en
 * Fracciones» no le deja mirar Fracciones.
 *
 * Aquí mira. Es el mismo catálogo, con el mismo avance, que su hijo tiene
 * delante en `/learn`.
 *
 * ===========================================================================
 * ES LA MISMA CONSULTA, NO UNA PARECIDA
 * ===========================================================================
 * `getStudentCourses` y `getLessonProgress` son LAS DE `/learn`, llamadas con
 * el alcance del hijo. Copiarlas aquí habría creado un segundo catálogo que un
 * día diría algo distinto del que ve el niño, y un padre que ve una lección
 * que su hijo no tiene —o al revés— no tiene forma de saber cuál de las dos
 * pantallas miente.
 *
 * ===========================================================================
 * QUIÉN AUTORIZA
 * ===========================================================================
 * Nadie de este fichero. `alcanceDeHijo()` consulta con la sesión del tutor
 * bajo `app.puede_ver_alumno`; si el id no es de un hijo suyo no hay fila y
 * esto responde 404 —y 404 y no 403, porque un 403 confirmaría que ese id
 * existe, que es información sobre un menor ajeno—.
 *
 * Y el contenido lo autoriza `app.can_read_content`, que mira el colegio DEL
 * LECTOR. Pasarle el `school_id` del hijo a la consulta no le abre a este
 * adulto el contenido de ese centro: como mucho ve lo global. Por eso, cuando
 * el hijo tiene colegio, la pantalla avisa de que puede estar viendo menos.
 * Ver la cabecera de `alcanceDeHijo` en `lib/tutor/queries.ts`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveI18n } from "@cet/shared";
import { EmptyState, ErrorState, SubjectGrid, type SubjectCardProps } from "@cet/ui";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import { countLessons } from "@/components/learn/lesson-progress";
import { getLessonProgress, getStudentCourses } from "@/components/learn/queries";
import { groupCoursesBySubject } from "@/components/learn/subject-grouping";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { dictI18n, interpolate } from "@/lib/i18n";
import { getServerDictionary } from "@/lib/i18n/server";
import { alcanceDeHijo } from "@/lib/tutor/queries";
import { rutasDeHijo } from "@/lib/tutor/rutas";

/** «Leo Mendizabal García» -> «Leo», igual que en la ficha. */
function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/**
 * Los seis rótulos que la tarjeta de materia espera de la aplicación (AD-7:
 * `@cet/ui` no escribe ni un literal de cara al usuario). Son exactamente los
 * de `/learn`: el padre lee lo mismo que su hijo.
 */
const CARD_TEXT = {
  ofText: learnI18n((d) => d.subject.of),
  completedText: learnI18n((d) => d.subject.finished),
  startedText: learnI18n((d) => d.subject.onTheGo),
  notStartedText: learnI18n((d) => d.subject.notStarted),
  doneText: learnI18n((d) => d.subject.allDone),
  unavailableText: learnI18n((d) => d.subject.progressUnknown),
} as const;

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.child.content.cardTitle };
}

export default async function ContenidoDelHijoPage({ params }: PageProps) {
  const { id } = await params;
  const { locale, t } = await getServerDictionary();

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const C = t.tutor.child.content;
  const rutas = rutasDeHijo(hijo.id);
  const pila = nombreDePila(hijo.nombre);

  const [courses, progress] = await Promise.all([
    getStudentCourses(hijo.schoolId),
    getLessonProgress(hijo.schoolId, hijo.id),
  ]);

  const s = getLearnDictionary(locale).subject;

  const subjects: readonly SubjectCardProps[] =
    courses === null
      ? []
      : groupCoursesBySubject(courses, locale).map((group) => {
          const counted = progress === null ? null : countLessons(group.lessonIds, progress);
          return {
            code: group.code,
            name: resolveI18n(group.name, locale),
            href: rutas.materia(group.key),
            total: group.lessonIds.length,
            completed: counted?.completed ?? null,
            started: counted?.started ?? null,
            ...CARD_TEXT,
          };
        });

  return (
    <UiLocaleProvider locale={locale}>
      <section className="space-y-6">
        {/* `h2` Y NO `h1`: el `h1` de esta área es el nombre del hijo, y lo pone
            el layout junto a las pestañas. Dos `h1` en la misma página dejan a
            quien navega por encabezados sin saber cuál es el título. */}
        <header>
          <h2 className="text-xl font-bold text-ink">{interpolate(C.title, { name: pila })}</h2>
          <p className="mt-2 text-muted">{C.subtitle}</p>
        </header>

        {/* EL AVISO DE «SOLO ESTÁS MIRANDO» VA ARRIBA Y UNA SOLA VEZ.
            Un padre que abre la lección de su hijo y ve un botón de terminar
            —que aquí no existe— se pregunta si al pulsarlo le está falseando el
            avance. Decirlo antes de entrar quita esa duda para las tres
            pantallas; repetirlo en cada lección sería ruido. */}
        <p role="note" className="rounded-2xl border-2 border-line bg-card px-5 py-4 text-sm text-muted">
          {C.readOnly}
        </p>

        {/* Solo cuando el hijo tiene colegio: para quien aprende en casa, la
            biblioteca global ES su biblioteca entera y no falta nada que
            advertir. */}
        {hijo.schoolId !== null ? (
          <section className="rounded-2xl border-2 border-line bg-card p-5">
            {/* `h3`: cuelga del `h2` de esta pantalla, que a su vez cuelga del
                `h1` del área. Saltarse un nivel rompe el índice que construye
                un lector de pantalla. */}
            <h3 className="text-lg font-bold text-ink">{C.partialTitle}</h3>
            <p className="mt-2 text-muted">{C.partialBody}</p>
          </section>
        ) : null}

        {/* El aviso de avance caído va ANTES de la rejilla y no dentro de cada
            tarjeta: es una sola cosa que ha fallado, no seis. */}
        {courses !== null && courses.length > 0 && progress === null ? (
          <p
            role="status"
            className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted"
          >
            {s.progressUnavailable}
          </p>
        ) : null}

        {/* EL VACÍO Y EL ERROR SE DICEN CON LAS PALABRAS DEL TUTOR, y no con
            las del alumno: «Aún no tienes lecciones» es falso aquí —no son
            suyas, son de su hijo— y «Inténtalo otra vez» dirigido a un niño
            suena distinto que dirigido a un adulto. El catálogo se comparte;
            el registro no. */}
        {courses === null ? (
          <ErrorState
            title={dictI18n((d) => d.tutor.child.content.errorTitle)}
            body={dictI18n((d) => d.tutor.child.content.errorBody)}
          />
        ) : subjects.length === 0 ? (
          <EmptyState
            title={dictI18n((d) => d.tutor.child.content.emptyTitle)}
            body={dictI18n((d) => d.tutor.child.content.emptyBody)}
          />
        ) : (
          <SubjectGrid subjects={subjects} />
        )}
      </section>
    </UiLocaleProvider>
  );
}
