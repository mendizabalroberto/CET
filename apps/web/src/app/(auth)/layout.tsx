/**
 * Layout de autenticación.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Deliberadamente austero: sin navegación, sin anclajes, sin nada que distraiga
 * a un niño que solo tiene que hacer una cosa. La única salida es volver a la
 * portada.
 *
 * Aquí SÍ se monta `<LocaleProvider>`: los formularios son islas cliente y
 * necesitan el diccionario. La landing no lo monta porque no tiene ninguna.
 */
import Link from "next/link";

import { LocaleSwitcher } from "@/components/PreferenceSwitchers";
import { getServerDictionary } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { ROUTES } from "@/lib/routes";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getServerDictionary();

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      <div className="flex min-h-dvh flex-col bg-surface">
        <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-6">
          <Link href={ROUTES.home} className="text-[15px] font-bold tracking-tight text-ink">
            {t.common.appName}
          </Link>
          <LocaleSwitcher current={locale} t={t} />
        </header>

        <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 pb-16">
          <div className="rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
            {children}
          </div>
        </main>

        <footer className="mx-auto w-full max-w-lg px-4 pb-8">
          <p className="text-center text-xs text-muted">{t.footer.copyright}</p>
          <p className="mt-2 text-center text-xs">
            <Link href={ROUTES.privacy} className="text-muted underline underline-offset-2">
              {t.footer.privacy}
            </Link>
            <span className="px-2 text-muted" aria-hidden="true">
              ·
            </span>
            <Link href={ROUTES.terms} className="text-muted underline underline-offset-2">
              {t.footer.terms}
            </Link>
          </p>
        </footer>
      </div>
    </LocaleProvider>
  );
}
