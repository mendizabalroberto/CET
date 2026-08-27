/**
 * `/exam/[assignmentId]/run` — el examen en curso.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El Server Component se limita a autorizar y a resolver el idioma. TODO lo
 * demás es del cliente, y a propósito: los ítems se piden a `/start`, que es
 * idempotente, de modo que llegar aquí por primera vez, recargar a mitad y
 * volver tras dos minutos sin red son EXACTAMENTE el mismo camino de código.
 * Un camino de recuperación distinto del normal es un camino que solo se ejerce
 * el día que falla algo.
 */
import { ExamRunner } from "@/components/exam-runner/ExamRunner";
import { requireStudent } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ExamRunPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);

  return (
    <ExamRunner
      assignmentId={assignmentId}
      locale={locale}
      resultHref={`/exam/${assignmentId}/result`}
    />
  );
}
