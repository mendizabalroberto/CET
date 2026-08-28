/**
 * /practice — la parrilla de temas, ahora con el progreso persistente de cada
 * grupo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component sin JavaScript propio: sigue siendo una lista de enlaces. Lo
 * único que se hidrata es el puente de idioma de `@cet/ui`, que es un contexto
 * sin marcado. El bucle vive en `/practice/[skillCode]`.
 *
 * ===========================================================================
 * QUÉ PROGRESO SE PINTA Y CUÁNDO NO SE PINTA NADA
 * ===========================================================================
 * Hasta hoy los chips no decían nada: el alumno tenía que entrar en cada tema
 * para saber cómo lo llevaba, y al salir se perdía, porque lo que había era el
 * marcador de la SESIÓN. Aquí se enseña lo persistente, derivado de sus propias
 * respuestas guardadas (`learning_events`).
 *
 * Tres estados, y los tres son distintos a propósito:
 *   - la consulta falla  -> un aviso, y CERO indicadores. Una consulta caída no
 *     es un cero;
 *   - el grupo no tiene evidencia -> "Sin practicar todavía". No se dibuja una
 *     escalera vacía, que se leería como "vas mal" en la primera visita;
 *   - hay evidencia -> escalera + palabra del nivel + siguiente paso.
 *
 * El chip `mix` nunca lleva escalera: no es un grupo, es un sorteo entre los
 * demás. Sus respuestas se acreditan al grupo real. Ver `practice-progress.ts`.
 */
import { getLearnDictionary } from "@/components/learn/dictionary";
import { practiceTopics } from "@/components/learn/practice-topics";
import { PracticeTopicGrid } from "@/components/learn/PracticeTopicGrid";
import { getPracticeProgress } from "@/components/learn/queries";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function PracticeIndexPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const dictionary = getLearnDictionary(locale);
  const t = dictionary.practice;
  const topics = practiceTopics(dictionary);

  const progress = await getPracticeProgress(student.schoolId, student.id);

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="mt-2 max-w-prose text-muted">{t.subtitle}</p>
        </header>

        {progress === null ? (
          <p
            role="status"
            className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted"
          >
            {t.progressUnavailable}
          </p>
        ) : null}

        <PracticeTopicGrid
          topics={topics}
          dictionary={dictionary}
          progress={progress}
        />
      </div>
    </UiLocaleProvider>
  );
}
