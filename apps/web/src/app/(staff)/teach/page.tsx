/**
 * /teach — portada del profesorado.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La comprobación de rol se repite aquí y no solo en el layout: una página
 * puede acabar renderizándose bajo otro layout tras una refactorización, y esa
 * suposición no debe ser lo único que protege los datos de un colegio.
 *
 * Server Component: no hay un solo `"use client"` en este fichero. Toda la
 * lectura ocurre en el servidor con la sesión del profesor (y por tanto con RLS
 * activa) y al cliente solo baja la presentación.
 */
import { redirect } from "next/navigation";

import { getStaffDictionary } from "@/components/staff/i18n";
import { loadTeachDashboard } from "@/components/staff/queries";
import { TeachDashboard } from "@/components/staff/TeachDashboard";
import { requireRole } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export default async function TeachPage() {
  const profile = await requireRole(["superadmin", "school_admin", "teacher"], {
    onDeny: "not-found",
  });
  const locale = await resolveLocale(profile.locale);
  const t = getStaffDictionary(locale);

  const data = await loadTeachDashboard(profile);

  // Un superadmin no pertenece a ningún colegio (DATA_MODEL §1), así que este
  // panel —que es el de UN colegio— no tiene contenido para él.
  if (data === null) redirect(ROUTES.adminHome);

  return <TeachDashboard data={data} locale={locale} t={t} />;
}
