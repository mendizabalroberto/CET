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
import { Button, EmptyState, ErrorState, LessonBlock } from "@cet/ui";

import { ProveedorDeCronometro } from "@/components/learn/cronometro-de-pantalla";
import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import {
  LessonBlockObserver,
  LessonCompleteButton,
  LessonOpened,
} from "@/components/learn/LessonTracking";
import { getLesson } from "@/components/learn/queries";
import { Migas, type Miga } from "@/components/nav/Migas";
import { findPracticeTopic } from "@/components/learn/practice-topics";
import { TiempoEnPantalla } from "@/components/learn/TiempoEnPantalla";
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
          <Migas
            label={t.trailLabel}
            items={[
              { label: t.trailRoot, href: "/learn" },
              { label: t.notFoundTitle },
            ]}
          />
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

  // EL CURSO SI LLEVA A SU MATERIA. Aqui decia «curso y modulo van SIN href:
  // todavia no tienen pagina propia», y hacia tiempo que no era verdad:
  // `/learn/materia/[key]` existe y es la pantalla desde la que se llega a esta.
  // El escalon se pintaba como texto muerto, asi que desde una leccion NO habia
  // forma de subir un nivel — solo el boton de atras del navegador, que no es
  // navegacion, es deshacer. Reportado probando en produccion el 01/09/2026.
  //
  // El modulo SI se queda sin destino, y eso sigue estando bien: no tiene
  // pantalla propia. Un escalon sin destino se pinta como texto y no
  // desaparece: que no exista la pagina no es motivo para ocultarle al alumno
  // en que modulo esta.
  const migas: readonly Miga[] = [
    { label: t.trailRoot, href: "/learn" },
    ...(lesson.courseTitle ? [{ label: resolveI18n(lesson.courseTitle, locale), ...(lesson.subjectKey ? { href: `/learn/materia/${lesson.subjectKey}` } : {}) }] : []),
    ...(lesson.moduleTitle ? [{ label: resolveI18n(lesson.moduleTitle, locale) }] : []),
    { label: resolveI18n(lesson.title, locale) },
  ];

  return (
    <UiLocaleProvider locale={locale}>
      <LessonOpened lessonId={lesson.id} blockCount={lesson.blocks.length} />

      {/* El cronometro envuelve la leccion ENTERA y no solo la cabecera: mide
          mientras el alumno lee, y el boton de terminar —que esta en el pie—
          necesita leer el total para el resumen. Los bloques siguen pintandose
          en el servidor; este proveedor los recibe ya renderizados como
          `children` y no toca ni uno. */}
      <ProveedorDeCronometro pantalla="leccion" id={lesson.id} lessonId={lesson.id}>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          {/* Las migas sustituyen a DOS cosas: el enlace gris de "volver", que
              no decia a donde, y el parrafo de curso y modulo, que nombraba el
              sitio del alumno sin llevarle a ninguna parte. Ahora la misma
              informacion es la navegacion. */}
          <Migas label={t.trailLabel} items={migas} />
          <h1 className="text-2xl font-bold text-ink">{resolveI18n(lesson.title, locale)}</h1>
          {lesson.estimatedMinutes === null ? null : (
            <p className="text-sm text-muted">
              {interpolate(t.estimated, { count: lesson.estimatedMinutes })}
            </p>
          )}
          {/* En SU PROPIA linea, no al lado de la estimacion. Puestos uno junto
              a otro, «Unos 20 min · 4:12» se lee como una barra de progreso
              hacia los 20 —que es justo lo que este encargo prohibe, porque el
              20 esta en las 33 lecciones y no lo midio nadie—. Separados, el
              reloj dice lo unico que sabe: cuanto llevas. */}
          <TiempoEnPantalla />
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
            // `asChild`: por dentro sigue siendo un `<Link>` —navegacion sin
            // recarga, y el boton derecho y el central funcionan— pero se pinta
            // con el mismo `Button` que todo lo demas. El icono entra DENTRO
            // del enlace gracias al `Slottable` de `Button`.
            <Button asChild icon="practicar">
              <Link
                href={`/practice/${encodeURIComponent(practiceTopic.id)}`}
                data-cet-id="leccion.practicar"
                data-cet-value={practiceTopic.id}
              >
                {t.practiceThis}
              </Link>
            </Button>
          ) : null}
        </footer>
      </article>
      </ProveedorDeCronometro>
    </UiLocaleProvider>
  );
}
