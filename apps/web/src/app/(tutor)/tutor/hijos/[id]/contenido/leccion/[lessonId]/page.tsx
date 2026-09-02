/**
 * /tutor/hijos/[id]/contenido/leccion/[lessonId] — la lección, tal cual la lee el hijo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es `/learn/[lessonId]` MENOS tres cosas, y las tres ausencias son el diseño:
 *
 *   1. NO HAY TELEMETRÍA. Ni `LessonOpened`, ni `LessonBlockObserver`, ni
 *      cronómetro. Si el padre emitiera eventos, el informe de su hijo contaría
 *      como estudio del niño el rato que pasó mirando su padre — y ese informe
 *      es justo lo que el padre viene a leer. Se envenenaría a sí mismo. Además
 *      no podría: la ingesta de `/api/events` solo acepta a un alumno sobre sí
 *      mismo (0071), así que la petición se rechazaría; la razón de no ponerla
 *      no es que fallaría, es que no debe existir.
 *   2. NO HAY BOTÓN DE TERMINAR. Marcar como completada una lección que no ha
 *      hecho es falsear el trabajo de un menor.
 *   3. NO HAY «PRACTICAR ESTO». La práctica es del alumno; `/practice` es zona
 *      de `student` y llevar ahí a un tutor es un 404 mudo por diseño.
 *
 * LO QUE SÍ ES IDÉNTICO: los bloques. Salen de `getLesson`, ya saneados por el
 * sanitizador de `@cet/ui` (contrato C5), y `LessonBlock` vuelve a sanear por
 * dentro. Dos barreras, ninguna opcional, las mismas para las dos pantallas.
 *
 * QUIÉN AUTORIZA. `alcanceDeHijo()` decide si este adulto alcanza a este menor
 * —RLS, `app.puede_ver_alumno`— y `getLesson()` decide si esa lección está al
 * alcance de ese hijo, con sus tres comprobaciones de siempre: publicada, del
 * alcance correcto, y de un curso encendido. Aquí no se escribe ninguna de las
 * dos reglas.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveI18n } from "@cet/shared";
import { EmptyState, ErrorState, LessonBlock } from "@cet/ui";

import { getLesson } from "@/components/learn/queries";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { Migas, type Miga } from "@/components/nav/Migas";
import { dictI18n, interpolate } from "@/lib/i18n";
import { getServerDictionary } from "@/lib/i18n/server";
import { getLearnDictionary } from "@/components/learn/dictionary";
import { alcanceDeHijo } from "@/lib/tutor/queries";
import { rutasDeHijo } from "@/lib/tutor/rutas";

interface PageProps {
  readonly params: Promise<{ id: string; lessonId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.child.content.cardTitle };
}

export default async function LeccionDelHijoPage({ params }: PageProps) {
  const { id, lessonId } = await params;
  const { locale, t } = await getServerDictionary();

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const C = t.tutor.child.content;
  const rutas = rutasDeHijo(hijo.id);
  const raiz: Miga = { label: C.trailRoot, href: rutas.contenido };

  const lesson = await getLesson(lessonId, hijo.schoolId, locale);

  if (lesson === null) {
    return (
      <UiLocaleProvider locale={locale}>
        <div className="flex flex-col gap-6">
          <Migas label={C.trailLabel} items={[raiz, { label: C.lessonMissingTitle }]} />
          <ErrorState
            title={dictI18n((d) => d.tutor.child.content.lessonMissingTitle)}
            body={dictI18n((d) => d.tutor.child.content.lessonMissingBody)}
          />
        </div>
      </UiLocaleProvider>
    );
  }

  // El curso lleva a su materia; el módulo se queda sin destino porque no tiene
  // pantalla propia, y aun así se pinta: que no exista la página no es motivo
  // para ocultarle al padre en qué módulo está su hijo. Es la regla 2 de
  // `Migas.tsx`.
  const migas: readonly Miga[] = [
    raiz,
    ...(lesson.courseTitle
      ? [
          {
            label: resolveI18n(lesson.courseTitle, locale),
            ...(lesson.subjectKey ? { href: rutas.materia(lesson.subjectKey) } : {}),
          },
        ]
      : []),
    ...(lesson.moduleTitle ? [{ label: resolveI18n(lesson.moduleTitle, locale) }] : []),
    { label: resolveI18n(lesson.title, locale) },
  ];

  const tl = getLearnDictionary(locale).lesson;

  return (
    <UiLocaleProvider locale={locale}>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Migas label={C.trailLabel} items={migas} />
          <h1 className="text-2xl font-bold text-ink">{resolveI18n(lesson.title, locale)}</h1>
          {/* La estimación es la que ve el niño. NO se pinta ningún reloj: el
              tiempo que pasa el padre en esta pantalla no se mide, y un reloj
              corriendo daría a entender que sí. */}
          {lesson.estimatedMinutes === null ? null : (
            <p className="text-sm text-muted">
              {interpolate(tl.estimated, { count: lesson.estimatedMinutes })}
            </p>
          )}
        </header>

        {lesson.blocks.length === 0 ? (
          <EmptyState
            title={dictI18n((d) => d.tutor.child.content.emptyTitle)}
            body={dictI18n((d) => d.tutor.child.content.emptyBody)}
          />
        ) : (
          <div className="flex flex-col gap-1">
            {lesson.blocks.map((block) => (
              <LessonBlock key={block.id} content={block.content} />
            ))}
          </div>
        )}

        {/* El recordatorio va al PIE y no a la cabecera: arriba competiría con
            el título de la lección, y quien llega hasta aquí ya ha leído el
            aviso del índice. Repetirlo al final es donde puede surgir la duda
            —«¿y ahora qué, marco algo?»— y la respuesta es que no hay nada que
            marcar. */}
        <p role="note" className="border-t border-line pt-5 text-sm text-muted">
          {C.readOnly}
        </p>
      </article>
    </UiLocaleProvider>
  );
}
