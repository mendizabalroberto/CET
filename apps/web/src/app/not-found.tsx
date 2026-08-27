/**
 * Página 404 global.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es la misma respuesta para "esta URL no existe" y para "no tienes permiso
 * sobre esta URL". Esa ambigüedad es intencionada: un alumno que teclea /admin
 * no debe poder deducir que /admin existe.
 */
import Link from "next/link";

import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export default async function NotFound() {
  const { t } = await getServerDictionary();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-bold tracking-widest text-muted">404</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">{t.errors.notFoundTitle}</h1>
        <p className="mt-3 text-muted">{t.errors.notFoundBody}</p>
        <Link
          href={ROUTES.home}
          className="mt-8 inline-block rounded-xl bg-brand px-6 py-3 font-semibold text-on-brand"
        >
          {t.errors.goHome}
        </Link>
      </div>
    </div>
  );
}
