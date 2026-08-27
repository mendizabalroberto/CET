/**
 * Layout de personal (profesorado y administración).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `requireRole(..., { onDeny: "not-found" })`: quien no tenga rol suficiente
 * recibe un 404, no un 403. Un 403 confirma que la ruta existe; el 404 no dice
 * nada. Es la misma decisión que toma el middleware, repetida aquí a propósito
 * — si una de las dos capas falla, la otra sigue en pie.
 */
import { LocaleSwitcher } from "@/components/PreferenceSwitchers";
import { signOut } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { resolveLocale } from "@/lib/i18n/server";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["superadmin", "school_admin", "teacher"], {
    onDeny: "not-found",
  });

  const locale = await resolveLocale(profile.locale);
  const t = getDictionary(locale);

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <span className="font-bold tracking-tight text-ink">{t.common.appName}</span>
            <span className="ml-auto text-sm text-muted">{profile.fullName}</span>
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

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-line bg-card py-5">
          <p className="text-center text-xs text-muted">{t.footer.copyright}</p>
        </footer>
      </div>
    </LocaleProvider>
  );
}
