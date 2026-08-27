/**
 * `/exam` — los exámenes que tiene puestos el alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component entero: no hay nada interactivo aquí, así que no hay ni un
 * byte de JavaScript. La interacción empieza en la antesala.
 *
 * El estado de cada tarjeta se dice con PALABRAS y no solo con color ("Listo
 * para empezar", "Entregado", "Cerrado"). Quien no distingue el verde del gris
 * tiene que poder saber, de un vistazo, cuál puede abrir.
 */
import Link from "next/link";
import { Badge, EmptyState, ErrorState } from "@cet/ui";

import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";
import { fmt, getExamDictionary } from "@/components/exam-runner/dictionary";

import { listAssignments, type AssignmentCard, type AssignmentStatus } from "./_lib/assignments";

export const dynamic = "force-dynamic";

const STATUS_TONE: Readonly<Record<AssignmentStatus, "success" | "neutral" | "warning">> = {
  available: "success",
  in_progress: "warning",
  submitted: "neutral",
  closed: "neutral",
  not_open: "neutral",
};

export default async function ExamListPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getExamDictionary(locale);
  const result = await listAssignments(locale);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{t.list.title}</h1>
        <p className="mt-2 text-muted">{t.list.subtitle}</p>
      </header>

      {result.kind === "error" ? (
        <ErrorState
          title={{ en: t.list.errorTitle, es: t.list.errorTitle }}
          body={{ en: t.list.errorBody, es: t.list.errorBody }}
        />
      ) : result.assignments.length === 0 ? (
        <EmptyState
          title={{ en: t.list.emptyTitle, es: t.list.emptyTitle }}
          body={{ en: t.list.emptyBody, es: t.list.emptyBody }}
        />
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {result.assignments.map((assignment) => (
            <li key={assignment.id}>
              <AssignmentRow assignment={assignment} locale={locale} t={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AssignmentRow({
  assignment,
  locale,
  t,
}: {
  assignment: AssignmentCard;
  locale: string;
  t: ReturnType<typeof getExamDictionary>;
}) {
  const statusLabel = {
    available: t.list.statusAvailable,
    in_progress: t.list.statusInProgress,
    submitted: t.list.statusSubmitted,
    closed: t.list.statusClosed,
    not_open: t.list.statusNotOpen,
  }[assignment.status];

  const minutes = Math.max(1, Math.round(assignment.durationSeconds / 60));
  const remaining = Math.max(0, assignment.maxAttempts - assignment.attemptsUsed);
  const openable = assignment.status === "available" || assignment.status === "in_progress";
  const reviewable = assignment.status === "submitted" && assignment.latestAttemptId !== null;

  return (
    /* `<Card>` de @cet/ui NO se puede usar aquí: llama a `useI18n()` y su
       fichero no lleva la directiva "use client", así que en un Server
       Component revienta en tiempo de ejecución. Se reproducen sus clases
       (hallazgo H-1 de REVIEW.md). */
    <article className="rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <h2 className="text-lg font-bold text-ink">{assignment.title}</h2>
        <Badge tone={STATUS_TONE[assignment.status]} className="ml-auto">
          {statusLabel}
        </Badge>
      </div>

      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>{fmt(t.list.questions, { count: assignment.questionCount })}</span>
        <span>{fmt(t.list.minutes, { count: minutes })}</span>
        <span>
          {remaining === 0
            ? t.list.noAttemptsLeft
            : remaining === 1 && assignment.maxAttempts > 1
              ? t.list.lastTry
              : fmt(t.list.attemptsLeft, { count: remaining, max: assignment.maxAttempts })}
        </span>
        {assignment.status === "not_open" && assignment.opensAt !== null ? (
          <span>{fmt(t.list.opensAt, { when: formatWhen(assignment.opensAt, locale) })}</span>
        ) : assignment.closesAt !== null ? (
          <span>{fmt(t.list.closesAt, { when: formatWhen(assignment.closesAt, locale) })}</span>
        ) : null}
      </p>

      {assignment.latestScoreRaw !== null && assignment.latestScoreMax !== null ? (
        <p className="mt-2 text-sm font-semibold text-ink">
          {fmt(t.list.score, { score: assignment.latestScoreRaw, max: assignment.latestScoreMax })}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {openable ? (
          <Link
            href={`/exam/${assignment.id}`}
            className="inline-flex min-h-touch items-center rounded-lg bg-[var(--cet-primary)] px-5 font-semibold text-[var(--cet-on-primary)]"
          >
            {assignment.status === "in_progress" ? t.list.resume : t.list.open}
          </Link>
        ) : null}
        {reviewable ? (
          <Link
            href={`/exam/${assignment.id}/result`}
            className="inline-flex min-h-touch items-center rounded-lg border border-line px-5 font-semibold text-ink"
          >
            {t.list.seeResult}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Fecha en el idioma del alumno y en la zona horaria del navegador... que en un
 * Server Component no existe. Se renderiza en UTC del servidor, que es lo mismo
 * que hace hoy el resto de la app; afinarlo a `schools.timezone` es trabajo del
 * módulo M08, dueño de las ventanas temporales.
 */
function formatWhen(iso: string, locale: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(parsed));
}
