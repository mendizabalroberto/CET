import { EmptyState, ErrorState, SubjectIcon } from "@cet/ui";
import Link from "next/link";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

import { tareasDeHoy } from "./consulta";
import { presentarTareas } from "./presentar";

/**
 * /learn/hoy — lo que le toca al alumno hoy según su plan de estudio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component puro, como /learn: ni un byte de JavaScript propio. El niño
 * ve sus tareas de hoy y nada más: sin brecha, sin tendencia, sin atraso.
 *
 * Tres estados, y ninguno es una lista vacía: sin plan, día libre, o error.
 */

export default async function HoyPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const hoy = getLearnDictionary(locale).today;

  const resultado = await tareasDeHoy();
  const tareas = resultado.estado === "ok" ? presentarTareas(resultado.filas, locale) : [];

  return (
    <UiLocaleProvider locale={locale}>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-bold text-ink">{hoy.title}</h1>
          <p className="mt-2 max-w-prose text-muted">{hoy.subtitle}</p>
        </header>

        {resultado.estado === "error" ? (
          <ErrorState
            title={learnI18n((d) => d.today.errorTitle)}
            body={learnI18n((d) => d.today.errorBody)}
          />
        ) : !resultado.hayPlan ? (
          <EmptyState
            title={learnI18n((d) => d.today.noPlanTitle)}
            body={learnI18n((d) => d.today.noPlanBody)}
          />
        ) : tareas.length === 0 ? (
          <EmptyState
            title={learnI18n((d) => d.today.freeDayTitle)}
            body={learnI18n((d) => d.today.freeDayBody)}
          />
        ) : (
          <section>
            <ol className="flex flex-col gap-3">
              {tareas.map((tarea, indice) => {
                const total = tareas.length;
                const minutosLabel =
                  tarea.minutos === null
                    ? null
                    : hoy.minutes.replace("{count}", String(tarea.minutos));
                const taskOfLabel = hoy.taskOf
                  .replace("{n}", String(indice + 1))
                  .replace("{total}", String(total));

                return (
                  <li key={tarea.id}>
                    <Link
                      href={tarea.href}
                      className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <SubjectIcon code={tarea.subjectCode} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{tarea.titulo}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-1 text-sm text-muted">
                          <span>{tarea.tipo === "leccion" ? hoy.lesson : hoy.practice}</span>
                          {minutosLabel !== null ? <span>{minutosLabel}</span> : null}
                          <span>{taskOfLabel}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <Link
          href={ROUTES.studentHome}
          className="inline-flex w-fit items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-card focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {hoy.backToLessons}
        </Link>
      </div>
    </UiLocaleProvider>
  );
}
