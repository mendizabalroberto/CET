/**
 * /teach/attempts/[attemptId] — reconstrucción forense de un intento.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es la pieza que el MASTER_PLAN pone como principio rector y `DATA_MODEL` §10
 * como criterio de aceptación: qué vio el alumno, en qué orden, qué versión,
 * qué respondió, cuándo, cuántas veces cambió de opinión y cómo se calificó.
 *
 * SEGURIDAD DE ESTA RUTA
 * ----------------------
 * El `attemptId` viene de la URL, es decir, del atacante. Tres barreras, en
 * este orden:
 *   1. `requireRole` — el rol se comprueba aquí además de en el middleware y
 *      en el layout.
 *   2. `loadAttemptReconstruction` filtra por `school_id` explícitamente y
 *      vuelve a comprobar el tenant sobre la fila devuelta.
 *   3. RLS en Postgres, que es la que manda de verdad.
 * Un intento de otro colegio devuelve `null` en el paso 2 y esta página
 * responde 404 — el MISMO 404 que un intento inexistente. Distinguirlos
 * confirmaría que el intento existe.
 */
import { notFound } from "next/navigation";

import { AttemptView } from "@/components/staff/AttemptView";
import { getStaffDictionary } from "@/components/staff/i18n";
import { loadAttemptReconstruction } from "@/components/staff/queries";
import { requireRole } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function AttemptPage({
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

  const data = await loadAttemptReconstruction(attemptId, profile);
  if (data === null) notFound();

  return <AttemptView data={data} locale={locale} t={t} canGrade />;
}
