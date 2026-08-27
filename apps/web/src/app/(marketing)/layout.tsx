/**
 * Layout público (landing + páginas legales).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { getServerDictionary } from "@/lib/i18n/server";
import { getTheme } from "@/lib/preferences";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getServerDictionary();
  const theme = await getTheme();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader t={t} locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter t={t} locale={locale} theme={theme} />
    </div>
  );
}
