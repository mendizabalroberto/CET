/**
 * /practice — la parrilla de temas.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component sin JavaScript propio: es una lista de enlaces. El bucle vive
 * en `/practice/[skillCode]`, y elegir tema cambia la URL — así el alumno puede
 * volver atrás, recargar o guardar en favoritos su tema flojo.
 */
import Link from "next/link";

import { getLearnDictionary } from "@/components/learn/dictionary";
import { practiceTopics } from "@/components/learn/practice-topics";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function PracticeIndexPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const dictionary = getLearnDictionary(locale);
  const t = dictionary.practice;
  const topics = practiceTopics(dictionary);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="mt-2 max-w-prose text-muted">{t.subtitle}</p>
      </header>

      <nav aria-label={t.topicLegend}>
        <h2 className="sr-only">{t.chooseTopic}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/practice/${encodeURIComponent(topic.id)}`}
                className="flex min-h-11 flex-col justify-center rounded-2xl border-2 border-line bg-card px-4 py-3 text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="font-semibold">{t.topics[topic.slug]}</span>
                <span className="text-sm text-muted">{t.topicHints[topic.slug]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
