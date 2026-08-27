/**
 * /admin — panel de administración.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La comprobación de rol se repite aquí y no solo en el layout: una página
 * puede acabar renderizándose bajo otro layout tras una refactorización, y esa
 * suposición no debe ser lo único que protege los datos de un colegio.
 *
 * `teacher` NO entra: `PROTECTED_AREAS` lo excluye en el middleware y
 * `requireRole` lo excluye aquí. El visor de auditoría, además, está cerrado
 * por RLS al `school_admin` (0012: `audit_log_select_admin`), así que aunque
 * las dos capas anteriores fallaran, un profesor no leería el log.
 */
import { AdminPanel } from "@/components/staff/AdminPanel";
import { getStaffDictionary } from "@/components/staff/i18n";
import { loadAdminData } from "@/components/staff/queries";
import { requireRole } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function AdminPage() {
  const profile = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });
  const locale = await resolveLocale(profile.locale);
  const t = getStaffDictionary(locale);

  const data = await loadAdminData(profile);

  // Un superadmin sin colegio seleccionado no tiene un panel de colegio que
  // enseñar. La gestión multi-colegio es otra pantalla (M12 §1.1), y fingir
  // aquí un agregado de todos los colegios sería peor que decirlo.
  if (data === null) {
    return (
      <section>
        <h1 className="text-2xl font-bold text-ink">{t.admin.title}</h1>
        <p className="mt-3 max-w-prose text-muted">{t.errors.forbiddenBody}</p>
      </section>
    );
  }

  return (
    <AdminPanel
      data={data}
      locale={locale}
      t={t}
      isSchoolAdmin={profile.role === "school_admin" || profile.role === "superadmin"}
    />
  );
}
