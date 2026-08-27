/**
 * /login/student — colegio → código → PIN.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { StudentLoginForm } from "@/components/auth/StudentLoginForm";
import { listActiveSchools } from "@/lib/data/schools";
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
  const { t } = await getServerDictionary();
  const schools = await listActiveSchools();

  return (
    <div>
      <Link href={ROUTES.login} className="text-sm font-semibold text-teal">
        ← {t.common.back}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-ink">{t.auth.chooseRole.student}</h1>

      <div className="mt-7">
        <StudentLoginForm schools={schools} />
      </div>
    </div>
  );
}
