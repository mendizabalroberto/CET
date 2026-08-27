/**
 * /account/pin — cambio de PIN (obligatorio en el primer acceso, AD-4).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Vive fuera del grupo `(student)` a propósito: aquel layout redirige AQUÍ
 * mientras `pin_must_change` sea true, así que si esta página estuviera dentro,
 * el alumno entraría en un bucle de redirecciones infinito.
 */
import type { Metadata } from "next";

import { PinChangeForm } from "@/components/auth/PinChangeForm";
import { requireStudent } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "PIN" };

export default async function PinChangePage() {
  const student = await requireStudent();
  const locale = await resolveLocale(student.locale);
  const t = getDictionary(locale);

  // La longitud la fija el colegio según la etapa (DATA_MODEL §1). Se lee de la
  // base de datos y no se codifica aquí: un colegio puede usar 6 en primaria.
  const supabase = await createClient();
  const { data: school } = await supabase
    .from("schools")
    .select("pin_length_primary, pin_length_secondary")
    .eq("id", student.schoolId)
    .maybeSingle();

  const pinLength =
    student.stage === "secondary"
      ? ((school?.pin_length_secondary as number | undefined) ?? 6)
      : ((school?.pin_length_primary as number | undefined) ?? 4);

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      <div className="mx-auto w-full max-w-lg px-4 py-12">
        <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{t.auth.pinChange.title}</h1>
          <p className="mt-2 text-muted">{t.auth.pinChange.subtitle}</p>

          <div className="mt-8">
            <PinChangeForm pinLength={pinLength} />
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted">{t.footer.copyright}</p>
      </div>
    </LocaleProvider>
  );
}
