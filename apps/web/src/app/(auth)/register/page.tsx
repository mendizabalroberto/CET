/**
 * /register — solicitud de acceso, pendiente de aprobación del administrador.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Esta página NO crea cuentas. Escribe una fila en `registration_requests` con
 * `status = 'pending'`; el alta la hace un administrador desde el panel (M12).
 * Un registro libre en un producto usado por menores sería inaceptable.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { listActiveSchools } from "@/lib/data/schools";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.register.title };
}

export default async function RegisterPage() {
  const { t } = await getServerDictionary();
  const schools = await listActiveSchools();

  return (
    <div>
      <Link href={ROUTES.home} className="text-sm font-semibold text-teal">
        ← {t.common.back}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-ink">{t.register.title}</h1>
      <p className="mt-2 text-muted">{t.register.subtitle}</p>

      <div className="mt-7">
        <RegisterForm schools={schools} />
      </div>
    </div>
  );
}
