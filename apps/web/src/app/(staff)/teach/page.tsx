/**
 * /teach — portada del profesorado.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Marcador de posición del Hito 1. La comprobación de rol se repite aquí y no
 * solo en el layout: una página puede acabar renderizándose bajo otro layout
 * tras una refactorización, y esa suposición no debe ser lo único que protege
 * los datos de un colegio.
 */
import { requireRole } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";

export default async function TeachPage() {
  const profile = await requireRole(["superadmin", "school_admin", "teacher"], { onDeny: "not-found" });
  const locale = await resolveLocale(profile.locale);
  const t = getDictionary(locale);

  return (
    <section>
      <h1 className="text-2xl font-bold text-ink">{t.dashboard.staffTitle}</h1>
      <p className="mt-3 max-w-prose text-muted">{t.dashboard.comingSoon}</p>
    </section>
  );
}
