/**
 * `/exam/[assignmentId]` — la antesala.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * LA REGLA DE ESTA PANTALLA: el cronómetro NO existe todavía. Aquí se explican
 * las condiciones con el reloj parado, y solo cuando el alumno pulsa el botón
 * se llama a `/start`, que es lo que escribe `server_deadline_at`.
 *
 * Las reglas están escritas para un lector de once años y en el orden en que le
 * importan: cuánto dura, cuántas preguntas, si puede volver atrás, y qué pasa
 * si se cae la red. Ese último punto va explícito y con todas las letras porque
 * es el miedo real, y porque decírselo ANTES es la diferencia entre un niño que
 * sigue respondiendo cuando parpadea el wifi y uno que se bloquea.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { StartExamButton } from "@/components/exam-runner/StartExamButton";
import { fmt, getExamDictionary } from "@/components/exam-runner/dictionary";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

import { getAssignment } from "../_lib/assignments";

export const dynamic = "force-dynamic";

export default async function ExamLobbyPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getExamDictionary(locale);

  const assignment = await getAssignment(assignmentId, locale);
  // Sin asignación visible: 404 y no 403. Un 403 le confirmaría al alumno que
  // ese examen existe en otra clase, y eso ya es información.
  if (!assignment) notFound();

  const minutes = Math.max(1, Math.round(assignment.durationSeconds / 60));
  const blocked =
    assignment.status === "closed"
      ? { title: t.lobby.closedTitle, body: t.lobby.closedBody }
      : assignment.status === "not_open"
        ? {
            title: t.lobby.notOpenTitle,
            body: fmt(t.lobby.notOpenBody, { when: assignment.opensAt ?? "" }),
          }
        : assignment.status === "submitted"
          ? { title: t.lobby.noAttemptsTitle, body: t.lobby.noAttemptsBody }
          : null;

  const rules: string[] = [
    fmt(t.lobby.ruleTime, { minutes }),
    fmt(t.lobby.ruleCount, { count: assignment.questionCount }),
    assignment.allowBack ? t.lobby.ruleBackAllowed : t.lobby.ruleBackForbidden,
    t.lobby.ruleAutosave,
    t.lobby.ruleNetwork,
    t.lobby.ruleReload,
    t.lobby.ruleBlank,
    assignment.feedbackMode === "never" ? t.lobby.ruleFeedbackNever : t.lobby.ruleFeedbackAfter,
  ];

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <Link href="/exam" className="text-sm font-semibold text-muted underline">
        {t.lobby.backToList}
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-ink">{assignment.title}</h1>
        <p className="mt-2 text-muted">{t.lobby.heading}</p>
      </header>

      {blocked ? (
        <div className="rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface-2)] px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{blocked.title}</h2>
          <p className="mt-2 text-muted">{blocked.body}</p>
          {assignment.latestAttemptId !== null ? (
            <Link
              href={`/exam/${assignment.id}/result`}
              className="mt-4 inline-flex min-h-touch items-center rounded-lg border border-line px-5 font-semibold text-ink"
            >
              {t.list.seeResult}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <section
            aria-labelledby="cet-rules-heading"
            className="rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] px-5 py-4 shadow-card"
          >
            <h2 id="cet-rules-heading" className="text-lg font-bold text-ink">
              {t.lobby.rulesTitle}
            </h2>
            {/* Lista y no párrafo: un niño repasando las condiciones con prisa
                lee viñetas, no un bloque de texto. */}
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-ink">
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>

          <StartExamButton
            assignmentId={assignment.id}
            locale={locale}
            runHref={`/exam/${assignment.id}/run`}
            resultHref={`/exam/${assignment.id}/result`}
            resuming={assignment.status === "in_progress"}
          />
        </>
      )}
    </section>
  );
}
