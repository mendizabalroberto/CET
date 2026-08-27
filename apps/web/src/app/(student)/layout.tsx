/**
 * Layout de alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * SEGUNDA barrera de autorización. El middleware ya filtró con los claims del
 * JWT; aquí se comprueba contra `profiles`/`students` con RLS activa, que es la
 * verdad. Si el middleware fallara o alguien añadiera una ruta sin registrarla
 * en `PROTECTED_AREAS`, este layout sigue cerrando la puerta.
 *
 * También impone el cambio de PIN del primer acceso (AD-4): mientras
 * `pin_must_change` sea true, no se entra a ninguna pantalla de alumno.
 * `/account/pin` vive en OTRO grupo de rutas precisamente para no quedar
 * atrapado en este redirect.
 */
import { redirect } from "next/navigation";

import { LocaleSwitcher } from "@/components/PreferenceSwitchers";
import { requireStudent } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { getDictionary } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { resolveLocale } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { TelemetryProvider } from "@/lib/telemetry/provider";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();

  if (student.pinMustChange) redirect(ROUTES.pinChange);

  // El idioma del alumno manda sobre la cookie del dispositivo: una tableta
  // compartida no debe imponerle el idioma del compañero anterior.
  const locale = await resolveLocale(student.locale);
  const t = getDictionary(locale);

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      {/* La telemetría se monta AQUÍ y no en el layout raíz: la landing y las
          páginas legales no generan eventos de aprendizaje y no deben cargar
          este JavaScript. */}
      <TelemetryProvider>
        <div className="flex min-h-dvh flex-col">
          <header className="border-b border-line bg-card">
            <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
              <span className="font-bold tracking-tight text-ink">{t.common.appName}</span>
              <span className="ml-auto text-sm text-muted">{student.fullName}</span>
              <LocaleSwitcher current={locale} t={t} />
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink"
                >
                  {t.common.signOut}
                </button>
              </form>
            </div>
          </header>

          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>

          <footer className="border-t border-line bg-card py-5">
            <p className="text-center text-xs text-muted">{t.footer.copyright}</p>
          </footer>
        </div>
      </TelemetryProvider>
    </LocaleProvider>
  );
}
