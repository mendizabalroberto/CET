/**
 * /learn — portada del alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Marcador de posición del Hito 1: la vía E entrega scaffold, landing y login.
 * El contenido real (lecciones, práctica, exámenes) llega en el Hito 2 sobre
 * @cet/engine y @cet/content.
 */
import { requireStudent } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";

export default async function LearnPage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getDictionary(locale);

  return (
    <section>
      <h1 className="text-2xl font-bold text-ink">{t.dashboard.studentTitle}</h1>
      <p className="mt-3 max-w-prose text-muted">{t.dashboard.comingSoon}</p>
    </section>
  );
}
