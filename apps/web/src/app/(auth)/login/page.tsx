/**
 * /login — selector de rol.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Dos enlaces, cero JavaScript. Preguntar "¿quién eres?" antes de pedir
 * credenciales evita el formulario-navaja-suiza donde el alumno intenta meter
 * su código en el campo de correo.
 *
 * No filtra nada: que existan alumnos y personal es evidente para cualquiera.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { sesionYaAbierta } from "@/lib/auth/session";
import { SesionAbierta } from "@/components/auth/SesionAbierta";
import { ROUTES } from "@/lib/routes";
import { getServerDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.nav.login };
}

export default async function LoginRolePage() {
  // Con sesión REAL detrás (no una cookie muerta) se va a su portada.
  // Informa, NO expulsa: ver la cabecera de `sesionYaAbierta`.
  const sesion = await sesionYaAbierta();

  const { t } = await getServerDictionary();
  const C = t.auth.chooseRole;

  const options = [
    { href: "/login/student", title: C.student, hint: C.studentHint, accent: "var(--teal)" },
    { href: "/login/staff", title: C.staff, hint: C.staffHint, accent: "var(--brand)" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{C.title}</h1>
      {/* Informa, no expulsa. Antes esto era un `redirect` y convertia el acceso
          en una puerta de un solo sentido: con la sesion de otra cuenta viva,
          esta pantalla te devolvia a su portada sin dejarte escribir nada. */}
      {sesion === null ? null : (
        <div className="mt-6">
          <SesionAbierta
            nombre={sesion.profile.fullName}
            casa={sesion.casa}
            rutaDeSalida={ROUTES.logout}
            textos={t.auth.sesionAbierta}
          />
        </div>
      )}

      <p className="mt-2 text-muted">{C.subtitle}</p>

      <ul className="mt-8 space-y-3">
        {options.map((option) => (
          <li key={option.href}>
            <Link
              href={option.href}
              className="flex items-center gap-4 rounded-xl border-2 border-line bg-card p-5 transition-colors hover:border-teal"
            >
              <span
                className="h-11 w-1.5 shrink-0 rounded-full"
                style={{ background: option.accent }}
                aria-hidden="true"
              />
              <span>
                <span className="block text-lg font-semibold text-ink">{option.title}</span>
                <span className="mt-0.5 block text-sm text-muted">{option.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
