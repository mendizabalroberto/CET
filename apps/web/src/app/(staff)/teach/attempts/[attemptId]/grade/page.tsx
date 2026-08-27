/**
 * /teach/attempts/[attemptId]/grade — corrección manual.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Solo lista los items cuya versión declara `grading_mode = 'manual'`. Guardar
 * INSERTA una fila nueva en `attempt_gradings` (nunca un UPDATE), con
 * `graded_by = 'manual'`, `grader_id` del profesor y su justificación; si ya
 * había nota, la nueva lleva `supersedes_id` apuntando a la hoja de la cadena.
 *
 * Las comprobaciones de esta página son solo para NO ENSEÑAR el formulario. Las
 * que cuentan están en `gradeItemManually`, que se vuelve a validar todo por su
 * cuenta: una Server Action es un endpoint HTTP y se invoca sin pasar por aquí.
 */
import { notFound } from "next/navigation";

import { GradePanel } from "@/components/staff/GradePanel";
import { getStaffDictionary } from "@/components/staff/i18n";
import { loadManualGradingView } from "@/components/staff/queries";
import { requireRole } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function GradeAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const profile = await requireRole(["superadmin", "school_admin", "teacher"], {
    onDeny: "not-found",
  });

  const { attemptId } = await params;
  const locale = await resolveLocale(profile.locale);
  const t = getStaffDictionary(locale);

  const data = await loadManualGradingView(attemptId, profile);
  if (data === null) notFound();

  return <GradePanel data={data} locale={locale} t={t} />;
}
