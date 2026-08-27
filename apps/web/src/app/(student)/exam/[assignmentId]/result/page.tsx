/**
 * `/exam/[assignmentId]/result` — la nota.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El `attemptId` NO viene en la URL. Se resuelve aquí, en el servidor, a partir
 * de la asignación y de la sesión: así un alumno no puede ver el resultado de
 * otro cambiando un uuid en la barra de direcciones. RLS ya lo impediría —
 * `exam_attempts` filtra por `student_id = app.current_profile_id()` — pero
 * dejar un identificador ajeno en la URL invita a probar, y las dos capas
 * fallan hacia el mismo lado.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultView } from "@/components/exam-runner/ResultView";
import { getExamDictionary } from "@/components/exam-runner/dictionary";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

import { getAssignment } from "../../_lib/assignments";

export const dynamic = "force-dynamic";

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getExamDictionary(locale);

  const assignment = await getAssignment(assignmentId, locale);
  if (!assignment) notFound();

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <Link href="/exam" className="text-sm font-semibold text-muted underline">
        {t.result.backToList}
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-ink">{assignment.title}</h1>
        <p className="mt-2 text-muted">{t.result.heading}</p>
      </header>

      {assignment.latestAttemptId === null ? (
        // No ha hecho ninguno todavía. No es un error: es una pantalla vacía
        // honesta, con la salida puesta.
        <p className="text-muted">{t.lobby.alreadySubmittedBody}</p>
      ) : (
        <ResultView attemptId={assignment.latestAttemptId} locale={locale} />
      )}
    </section>
  );
}
