/**
 * /register — alta de tutor, y SOLO con invitación.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * QUÉ ERA ESTA PÁGINA Y QUÉ ES AHORA
 * ---------------------------------------------------------------------------
 * Era una solicitud de acceso que escribía en `registration_requests` y esperaba
 * a que un administrador la aprobara. Su cabecera decía por qué: «un registro
 * libre en un producto usado por menores sería inaceptable». Ese criterio no ha
 * cambiado; lo que cambia es cómo se cumple.
 *
 * Ahora nadie entra en CET sin que alguien le haya dado un enlace. Sin `?t=`
 * válido esta página NO ENSEÑA UN FORMULARIO — no es un campo deshabilitado ni
 * un aviso al pie: no hay dónde escribir. Con un token válido, tres campos, y
 * el correo viene de la invitación.
 *
 * `registration_requests` no desaparece: sigue siendo la cola de peticiones de
 * personal de colegio, y sigue siendo asunto de `/admin`.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { AltaDeTutorForm } from "@/components/tutor/AltaDeTutorForm";
import { sesionYaAbierta } from "@/lib/auth/session";
import { SesionAbierta } from "@/components/auth/SesionAbierta";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { invitacionDelToken } from "@/lib/tutor/queries";

/** La URL lleva una credencial: que ningún rastreador la siga ni la publique. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.signUp.title, robots: { index: false, follow: false } };
}

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  // Informa, NO expulsa: ver la cabecera de `sesionYaAbierta`.
  const sesion = await sesionYaAbierta();

  const { t } = await getServerDictionary();
  const token = primerValor((await searchParams)["t"]);
  const invitacion = token === null ? null : await invitacionDelToken(token);

  if (token === null || invitacion === null) {
    const S = t.tutor.signUp;
    return (
      <div>
        <Link href={ROUTES.home} className="text-sm font-semibold text-teal">
          ← {t.common.back}
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-ink">{S.closedTitle}</h1>
        <p className="mt-3 max-w-prose text-muted">{S.closedBody}</p>

        <p className="mt-6">
          <Link href={ROUTES.login} className="font-semibold text-teal underline underline-offset-2">
            {t.auth.chooseRole.title}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link href={ROUTES.home} className="text-sm font-semibold text-teal">
        ← {t.common.back}
      </Link>

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
      <div className="mt-6">
        <AltaDeTutorForm token={token} email={invitacion.email} />
      </div>
    </div>
  );
}
