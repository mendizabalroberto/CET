/**
 * /admin — panel de administración.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La comprobación de rol se repite aquí y no solo en el layout: una página
 * puede acabar renderizándose bajo otro layout tras una refactorización, y esa
 * suposición no debe ser lo único que protege los datos de un colegio.
 *
 * `teacher` NO entra: `PROTECTED_AREAS` lo excluye en el middleware y
 * `requireRole` lo excluye aquí. El visor de auditoría, además, está cerrado
 * por RLS al `school_admin` (0012: `audit_log_select_admin`), así que aunque
 * las dos capas anteriores fallaran, un profesor no leería el log.
 *
 * EL COLEGIO DEL SUPERADMIN
 * ---------------------------------------------------------------------------
 * Un superadmin no pertenece a ningún colegio y no puede pertenecer: la
 * constraint `profiles_superadmin_has_no_school` lo impide para que no exista
 * un superadmin con tenant. Pero este panel es por colegio. Así que elige uno,
 * y la elección viaja en `?school=`.
 *
 * Antes, ese caso pintaba "Este registro no pertenece a tu colegio" — un
 * mensaje que además de inútil era FALSO: sugería una denegación de permisos
 * donde solo faltaba elegir. Un mensaje que miente sobre la causa cuesta más
 * caro que no tener mensaje: manda a quien lo lee a depurar el sitio erróneo.
 */
import Link from "next/link";

import { AdminPanel } from "@/components/staff/AdminPanel";
import { InvitarTutor } from "@/components/staff/InvitarTutor";
import { resolveAdminSchool } from "@/components/staff/admin-school";
import { getStaffDictionary } from "@/components/staff/i18n";
import { loadAdminData } from "@/components/staff/queries";
import { requireRole } from "@/lib/auth/session";
import { listActiveSchools } from "@/lib/data/schools";
import { resolveLocale } from "@/lib/i18n/server";

interface AdminPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `?school=a&school=b` llega como array. Se toma el primero y ya. */
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const profile = await requireRole(["superadmin", "school_admin"], { onDeny: "not-found" });
  const locale = await resolveLocale(profile.locale);
  const t = getStaffDictionary(locale);

  // Solo el superadmin necesita la lista, y solo él puede elegir. Para el resto
  // `resolveAdminSchool` descarta el parámetro sin mirarlo siquiera.
  const schools = profile.role === "superadmin" ? await listActiveSchools() : [];
  const params = await searchParams;
  const schoolId = resolveAdminSchool(profile, firstParam(params["school"]), schools);

  const data = schoolId === null ? null : await loadAdminData(profile, schoolId);

  if (data === null) {
    const P = t.admin.schoolPicker;

    return (
      <section>
        <h1 className="text-2xl font-bold text-ink">{t.admin.title}</h1>

        {profile.role === "superadmin" ? (
          <>
            {/* Invitar a un tutor NO depende del colegio elegido: un tutor no
                pertenece a ninguno. Por eso vive aqui arriba, alcanzable
                tambien mientras el superadmin no haya elegido colegio. */}
            <div className="mt-6">
              <InvitarTutor t={t} />
            </div>

            <p className="mt-8 max-w-prose text-muted">{P.body}</p>

            {schools.length === 0 ? (
              <p className="mt-6 text-muted">{P.empty}</p>
            ) : (
              <ul className="mt-6 space-y-3">
                {schools.map((school) => (
                  <li key={school.id}>
                    <Link
                      href={`/admin?school=${encodeURIComponent(school.id)}`}
                      className="flex items-center justify-between rounded-xl border-2 border-line bg-card px-5 py-4 transition-colors hover:border-teal"
                    >
                      <span className="font-semibold text-ink">{school.name}</span>
                      <span aria-hidden="true" className="text-teal">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          // Un school_admin aquí es un perfil sin colegio, que la constraint
          // `profiles_superadmin_has_no_school` declara imposible. Si aparece,
          // no se adivina nada: se dice que hay algo mal en la cuenta.
          <p className="mt-3 max-w-prose text-muted">{t.errors.forbiddenBody}</p>
        )}
      </section>
    );
  }

  return (
    <AdminPanel
      data={data}
      locale={locale}
      t={t}
      isSchoolAdmin={profile.role === "school_admin" || profile.role === "superadmin"}
    />
  );
}
