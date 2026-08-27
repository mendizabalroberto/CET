/**
 * /learn/[lessonId] — lector de lección.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component. Los bloques se pintan EN EL SERVIDOR: son texto estático y
 * no hay razón para enviarlos dos veces (una en el HTML y otra en el payload de
 * React). Lo único que se hidrata son tres islas diminutas de medición
 * (`LessonTracking.tsx`) y el puente de idioma de `@cet/ui`.
 *
 * Todo el HTML de la base de datos pasa por `mapLessonBlocks`, que sanea con el
 * sanitizador de `@cet/ui` (contrato C5). Los componentes de `@cet/ui` vuelven a
 * sanear por dentro: dos barreras, ninguna opcional.
 */
import Link from "next/link";
import { resolveI18n } from "@cet/shared";
import { EmptyState, ErrorState, LessonBlock } from "@cet/ui";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import {
  LessonBlockObserver,
  LessonCompleteButton,
  LessonOpened,
} from "@/components/learn/LessonTracking";
import { getLesson } from "@/components/learn/queries";
import { findPracticeTopic } from "@/components/learn/practice-topics";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { requireStudent } from "@/lib/auth/session";
import { interpolate } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const dictionary = getLearnDictionary(locale);
  const t = dictionary.lesson;

  const lesson = await getLesson(lessonId, student.schoolId, locale);

  if (lesson === null) {
    return (
      <UiLocaleProvider locale={locale}>
        <div className="flex flex-col gap-6">
          <BackLink label={t.backToIndex} />
          <ErrorState
            title={learnI18n((d) => d.lesson.notFoundTitle)}
            body={learnI18n((d) => d.lesson.notFoundBody)}
          />
        </div>
      </UiLocaleProvider>
    );
  }

  // "Practicar esto": la primera skill de la lección para la que existe un
  // generador. Si no hay ninguna, no se enseña el enlace en vez de llevar al
  // alumno a una pantalla de error.
  const practiceTopic = lesson.skillCodes
    .map((code) => findPracticeTopic(code, dictionary))
    .find((topic) => topic !== undefined);

  return (
    <UiLocaleProvider locale={locale}>
      <LessonOpened lessonId={lesson.id} blockCount={lesson.blocks.length} />

      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <BackLink label={t.backToIndex} />
          {lesson.courseTitle || lesson.moduleTitle ? (
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {[lesson.courseTitle, lesson.moduleTitle]
                .filter((text) => text !== null)
                .map((text) => resolveI18n(text, locale))
                .join(" · ")}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold text-ink">{resolveI18n(lesson.title, locale)}</h1>
          {lesson.estimatedMinutes === null ? null : (
            <p className="text-sm text-muted">
              {interpolate(t.estimated, { count: lesson.estimatedMinutes })}
            </p>
          )}
        </header>

        {lesson.blocks.length === 0 ? (
          <EmptyState
            title={learnI18n((d) => d.lesson.emptyTitle)}
            body={learnI18n((d) => d.lesson.emptyBody)}
          />
        ) : (
          <div className="flex flex-col gap-1">
            {lesson.blocks.map((block) => (
              <LessonBlockObserver
                key={block.id}
                lessonId={lesson.id}
                blockId={block.id}
                kind={block.kind}
              >
                <LessonBlock content={block.content} />
              </LessonBlockObserver>
            ))}
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <LessonCompleteButton
            lessonId={lesson.id}
            label={t.markComplete}
            doneLabel={t.completed}
            className="text-sm font-semibold text-ink"
          />
          {practiceTopic ? (
            <Link
              href={`/practice/${encodeURIComponent(practiceTopic.id)}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-card focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t.practiceThis}
            </Link>
          ) : null}
        </footer>
      </article>
    </UiLocaleProvider>
  );
}

function BackLink({ label }: { readonly label: string }) {
  return (
    <Link
      href="/learn"
      className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {label}
    </Link>
  );
}
