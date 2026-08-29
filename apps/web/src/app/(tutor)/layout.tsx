/**
 * Layout de la zona del tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * TONO
 * ---------------------------------------------------------------------------
 * `modules/admin` §5.1 fija densidad y detalle técnico para personal adulto que
 * gobierna un colegio. Un padre no es eso: entra a ver a sus hijos, a mandar un
 * enlace y a poco más. Así que esta zona es de lectura, no de panel — ancho
 * corto, pocas cosas por pantalla, y ni un término técnico, tampoco en los
 * errores.
 *
 * La comprobación de rol se repite aquí y no se deja solo al middleware: una
 * página puede acabar renderizándose bajo otro layout tras una refactorización,
 * y esa suposición no debe ser lo único que protege los datos de un menor.
 */
import Link from "next/link";

import { LocaleSwitcher } from "@/components/PreferenceSwitchers";
import { requireRole } from "@/lib/auth/session";
import { getServerDictionary } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import { ROUTES } from "@/lib/routes";

export default async function TutorLayout({ children }: { children: React.ReactNode }) {
  // `not-found` y no 403, igual que `/admin`: un 403 le confirmaría a quien
  // sondea que esta zona existe y que hay algo dentro.
  await requireRole(["guardian"], { onDeny: "not-found" });

  const { locale, t } = await getServerDictionary();

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      <div className="flex min-h-dvh flex-col bg-surface">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-6">
          <Link href={ROUTES.tutorHome} className="text-[15px] font-bold tracking-tight text-ink">
            {t.common.appName}
          </Link>
          <div className="flex items-center gap-4">
            <LocaleSwitcher current={locale} t={t} />
            <Link href={ROUTES.logout} className="text-sm font-semibold text-teal">
              {t.common.signOut}
            </Link>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-2xl px-4 pb-8">
          <p className="text-center text-xs text-muted">{t.footer.copyright}</p>
        </footer>
      </div>
    </LocaleProvider>
  );
}
