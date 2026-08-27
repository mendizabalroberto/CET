/**
 * /login/staff — email + contraseña.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { redirectIfSignedIn } from "@/lib/auth/session";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.staff.title };
}

export default async function StaffLoginPage() {
  // Con sesión REAL detrás (no una cookie muerta) se va a su portada.
  await redirectIfSignedIn();

  const { t } = await getServerDictionary();

  return (
    <div>
      <Link href={ROUTES.login} className="text-sm font-semibold text-teal">
        ← {t.common.back}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-ink">{t.auth.staff.title}</h1>

      <div className="mt-7">
        <StaffLoginForm />
      </div>
    </div>
  );
}
