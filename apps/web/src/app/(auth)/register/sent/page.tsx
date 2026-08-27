/**
 * /register/sent — acuse de la solicitud.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El acuse es SIEMPRE el mismo, se haya insertado la fila o no. Si dijera
 * "ese colegio no admite solicitudes", se podría enumerar qué colegios usan la
 * plataforma y con qué configuración.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.register.sentTitle };
}

export default async function RegisterSentPage() {
  const { t } = await getServerDictionary();

  return (
    <div className="text-center">
      <span
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--success)" }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5l5.2 5L20 7" />
        </svg>
      </span>

      <h1 className="mt-5 text-2xl font-bold text-ink">{t.register.sentTitle}</h1>
      <p className="mx-auto mt-3 max-w-sm text-muted">{t.register.sentBody}</p>

      <Link
        href={ROUTES.home}
        className="mt-8 inline-block rounded-xl bg-brand px-6 py-3 font-semibold text-on-brand"
      >
        {t.register.backHome}
      </Link>
    </div>
  );
}
