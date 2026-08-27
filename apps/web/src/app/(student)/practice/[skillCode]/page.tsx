/**
 * /practice/[skillCode] — el bucle rápido.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El servidor solo resuelve el tema y el idioma. Todo lo demás —generar, corregir
 * y pintar— corre en el cliente (AD-5): el feedback llega por debajo de 50 ms y
 * el bucle sigue funcionando con la red caída.
 *
 * `[skillCode]` acepta el `skillCode` de una skill (`math.fractions.simplify`,
 * que es lo que enlaza una lección) o el `engineKey` del generador
 * (`math.simplify`, que es lo que enlaza un chip). Ver `practice-topics.ts`.
 */
import Link from "next/link";

import { getLearnDictionary } from "@/components/learn/dictionary";
import { findPracticeTopic } from "@/components/learn/practice-topics";
import { PracticeSession } from "@/components/learn/PracticeSession";
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

        <PracticeSession topicId={topic?.id ?? skillCode} locale={locale} />
      </div>
    </UiLocaleProvider>
  );
}
