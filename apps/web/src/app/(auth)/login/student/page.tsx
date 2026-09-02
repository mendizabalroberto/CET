/**
 * /login/student — colegio → código → PIN.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { StudentLoginForm } from "@/components/auth/StudentLoginForm";
import { sesionYaAbierta } from "@/lib/auth/session";
import { SesionAbierta } from "@/components/auth/SesionAbierta";
import { listActiveSchools } from "@/lib/data/schools";
import { leerCookieDispositivo } from "@/lib/tutor/dispositivo";
import { alumnoDelDispositivo } from "@/lib/tutor/queries";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

/**
 * NO se declara `revalidate`: esta página lee cookies (idioma, tema) a través
 * del layout, así que Next la renderiza dinámicamente de todos modos y un
 * `revalidate` aquí sería una mentira tranquilizadora. Si el listado de
 * colegios llegara a pesar, se cachea la CONSULTA con `unstable_cache`, no la
 * página.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.chooseRole.student };
}

export default async function StudentLoginPage() {
  // Con sesión REAL detrás (no una cookie muerta) se va a su portada.
  // Informa, NO expulsa: ver la cabecera de `sesionYaAbierta`.
  const sesion = await sesionYaAbierta();

  const { t } = await getServerDictionary();
  const schools = await listActiveSchools();

  /*
   * ¿ESTE APARATO YA RECUERDA A ALGUIEN?
   *
   * Si la cookie trae un secreto valido, el formulario se queda en UNA pantalla
   * y UN campo. Si no trae nada, o el dispositivo fue anulado por el tutor, o
   * la cookie se perdio al borrar los datos del navegador, `alumnoDelDispositivo`
   * devuelve null y todo sigue exactamente como antes: colegio, codigo y PIN.
   *
   * No hay tercer caso ni pantalla de error. Un dispositivo que ya no vale no
   * es un fallo que haya que explicarle a un nino de diez anos: es, sin mas, un
   * dispositivo que no le conoce.
   */
  const secreto = await leerCookieDispositivo();
  const dispositivo = secreto === null ? null : await alumnoDelDispositivo(secreto);

  return (
    <div>
      <Link href={ROUTES.login} className="text-sm font-semibold text-teal">
        ← {t.common.back}
      </Link>

      {dispositivo === null ? (
        <h1 className="mt-4 text-2xl font-bold text-ink">{t.auth.chooseRole.student}</h1>
      ) : null}

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
      <div className="mt-7">
        <StudentLoginForm schools={schools} dispositivo={dispositivo ?? undefined} />
      </div>
    </div>
  );
}
