/**
 * /login/staff — email + contraseña.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { sesionYaAbierta } from "@/lib/auth/session";
import { SesionAbierta } from "@/components/auth/SesionAbierta";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.staff.title };
}

export default async function StaffLoginPage() {
  // Con sesión REAL detrás (no una cookie muerta) se va a su portada.
  // Informa, NO expulsa: ver la cabecera de `sesionYaAbierta`.
  const sesion = await sesionYaAbierta();

  const { t } = await getServerDictionary();

  return (
    <div>
      <Link href={ROUTES.login} className="text-sm font-semibold text-teal">
        ← {t.common.back}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-ink">{t.auth.staff.title}</h1>

      {/* Informa, no expulsa. Antes esto era un `redirect` y convertia el login
          en una puerta de un solo sentido: con la sesion de otra cuenta viva,
          esta pantalla te devolvia a su portada sin dejarte escribir nada. */}
      {sesion === null ? null : (
        <div className="mt-6">
          <SesionAbierta
            nombre={sesion.profile.fullName}
            casa={sesion.casa}
            textos={t.auth.sesionAbierta}
          />
        </div>
      )}
      <div className="mt-7">
        <StaffLoginForm />
      </div>
    </div>
  );
}
