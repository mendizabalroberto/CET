/**
 * /practice/[skillCode] — el bucle rápido.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El servidor resuelve el tema, el idioma y —desde hoy— el progreso persistente
 * del alumno. Todo lo demás —generar, corregir y pintar— corre en el cliente
 * (AD-5): el feedback llega por debajo de 50 ms y el bucle sigue funcionando con
 * la red caída.
 *
 * `[skillCode]` acepta el `skillCode` de una skill (`math.fractions.simplify`,
 * que es lo que enlaza una lección) o el `engineKey` del generador
 * (`math.simplify`, que es lo que enlaza un chip). Ver `practice-topics.ts`.
 *
 * ===========================================================================
 * POR QUÉ EL PROGRESO SE CARGA AQUÍ Y NO EN LA ISLA
 * ===========================================================================
 * `PracticeSession` es cliente y no puede consultar la base de datos con la RLS
 * del alumno. Cargarlo aquí tiene además una consecuencia buena: el progreso es
 * el que había AL ENTRAR y no se mueve mientras el alumno responde. Una escalera
 * que sube sola mientras miras la pregunta compite con la pregunta, y el
 * marcador de la sesión (preguntas, aciertos, racha) ya cubre el "ahora mismo".
 * El progreso persistente se actualiza al volver a entrar, que es cuando el
 * alumno lo mira.
 */
import Link from "next/link";
import { EffortMeter, MasteryLadder } from "@cet/ui";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import { findPracticeTopic, MIXED_TOPIC_ID } from "@/components/learn/practice-topics";
import {
  answeredCountText,
  nextStepI18n,
  nextStepTargets,
  nextStepText,
} from "@/components/learn/practice-progress-text";
import { PracticeSession } from "@/components/learn/PracticeSession";
import { getPracticeProgress } from "@/components/learn/queries";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function PracticeTopicPage({
  params,
}: {
  params: Promise<{ skillCode: string }>;
}) {
  const { skillCode } = await params;
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const dictionary = getLearnDictionary(locale);
  const t = dictionary.practice;

  // Se resuelve en el SERVIDOR para no montar la isla de práctica con un tema
  // que no existe: así el caso de URL manipulada no carga el motor entero.
  const topic = findPracticeTopic(skillCode, dictionary);

  const progress = await getPracticeProgress(student.schoolId, student.id);
  const own = topic && topic.id !== MIXED_TOPIC_ID ? progress?.get(topic.id) : undefined;

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link
            href="/practice"
            className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t.backToTopics}
          </Link>
          <h1 className="text-2xl font-bold text-ink">
            {topic ? t.topics[topic.slug] : t.unknownTopicTitle}
          </h1>
          {topic ? <p className="text-muted">{t.topicHints[topic.slug]}</p> : null}
        </header>

        {/* El siguiente paso, en grande y una sola vez. Repetirlo en los diez
            chips sería ruido; aquí es lo primero que se lee al entrar al tema. */}
        {own && topic ? (
          <section
            aria-labelledby="siguiente-paso"
            className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4"
          >
            <h2 id="siguiente-paso" className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t.nextStepTitle}
            </h2>
            <MasteryLadder
              level={own.level}
              groupLabel={learnI18n((d) => d.practice.topics[topic.slug])}
              size="md"
              showLabel
            />
            {nextStepTargets(own.nextStep) > 0 ? (
              <EffortMeter
                targets={nextStepTargets(own.nextStep)}
                message={nextStepI18n(own.nextStep)}
              />
            ) : (
              <p className="text-sm font-semibold text-ink">
                {nextStepText(own.nextStep, dictionary, locale)}
              </p>
            )}
            <p className="text-xs text-muted">{answeredCountText(own.totalAnswered, dictionary)}</p>
          </section>
        ) : null}

        <PracticeSession
          topicId={topic?.id ?? skillCode}
          locale={locale}
          levels={
            progress === null
              ? null
              : Object.fromEntries(
                  [...progress].map(([key, value]) => [key, value.level] as const),
                )
          }
        />
      </div>
    </UiLocaleProvider>
  );
}
