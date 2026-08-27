/**
 * Cabecera y pie públicos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Components, sin una sola línea de JavaScript de cliente. El menú de
 * móvil no es un desplegable con estado: es una segunda fila de anclajes con
 * scroll horizontal. Un desplegable exigiría hidratación, gestión de foco y
 * cierre con Escape para ser accesible; una fila de enlaces ya lo es.
 */
import Link from "next/link";

import { LocaleSwitcher, ThemeSwitcher } from "@/components/PreferenceSwitchers";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { Theme } from "@/lib/preferences";
import { ROUTES } from "@/lib/routes";

interface ChromeProps {
  readonly t: Dictionary;
  readonly locale: Locale;
  readonly theme: Theme;
}

/** Marca. Un SVG en línea: no hay petición extra ni imagen que pueda faltar. */
function Wordmark({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="shrink-0"
        focusable="false"
      >
        <rect width="32" height="32" rx="8" fill="var(--brand)" />
        <path d="M9 21V11h4.6a3.2 3.2 0 0 1 0 6.4H9" stroke="var(--amber)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="22" cy="20" r="2.6" fill="var(--teal)" />
      </svg>
      <span className="text-[15px] font-bold tracking-tight text-ink">{label}</span>
    </span>
  );
}

const NAV_ANCHORS = [
  { href: "#platform", key: "platform" },
  { href: "#subjects", key: "subjects" },
  { href: "#how", key: "howItWorks" },
  { href: "#schools", key: "forSchools" },
] as const;

export function SiteHeader({ t, locale }: Omit<ChromeProps, "theme">) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href={ROUTES.home} className="rounded-md">
          <Wordmark label={t.common.appName} />
          <span className="sr-only">{t.common.tagline}</span>
        </Link>

        <nav aria-label={t.nav.menu} className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV_ANCHORS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-alt hover:text-ink"
            >
              {t.nav[item.key]}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div className="hidden sm:block">
            <LocaleSwitcher current={locale} t={t} />
          </div>
          <Link
            href={ROUTES.login}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-deep"
          >
            {t.nav.login}
          </Link>
        </div>
      </div>

      {/* Barra secundaria en móvil: los anclajes no caben arriba. */}
      <div className="border-t border-line lg:hidden">
        <nav
          aria-label={t.nav.menu}
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6"
        >
          {NAV_ANCHORS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted"
            >
              {t.nav[item.key]}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ t, locale, theme }: ChromeProps) {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Wordmark label={t.common.appName} />
            <p className="mt-3 text-sm text-muted">{t.footer.builtOn}</p>
            <p className="mt-1 text-sm text-muted">{t.footer.dataNote}</p>
          </div>

          <div className="flex gap-12">
            <nav aria-label={t.footer.legal}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
                {t.footer.legal}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href={ROUTES.privacy} className="text-ink hover:text-teal">
                    {t.footer.privacy}
                  </Link>
                </li>
                <li>
                  <Link href={ROUTES.terms} className="text-ink hover:text-teal">
                    {t.footer.terms}
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label={t.footer.product}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
                {t.footer.product}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href={ROUTES.login} className="text-ink hover:text-teal">
                    {t.nav.login}
                  </Link>
                </li>
                <li>
                  <Link href={ROUTES.register} className="text-ink hover:text-teal">
                    {t.nav.register}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          {/*
            Aviso de copyright exigido por MASTER_PLAN §9. Literal, sin traducir:
            es una declaración legal, no una cadena de interfaz.
          */}
          <p className="text-sm text-muted">{t.footer.copyright}</p>
          <div className="flex items-center gap-2">
            <LocaleSwitcher current={locale} t={t} />
            <ThemeSwitcher current={theme} t={t} />
          </div>
        </div>
      </div>
    </footer>
  );
}
