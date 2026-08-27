/**
 * /account — índice de la cuenta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Esta página faltaba. `/account` estaba en `PROTECTED_AREAS` con los cuatro
 * roles permitidos, pero solo existían `/account/pin` y `/account/password`:
 * cualquier enlace a "Cuenta" caía en el 404 mudo del área privilegiada, que
 * está diseñado para no dar pistas — y aquí no daba pistas de que la culpa era
 * nuestra. Una ruta registrada y sin página es una promesa incumplida.
 *
 * Sirve a los cuatro roles porque el área los admite a los cuatro. Lo único que
 * cambia por rol es CÓMO se entra: el alumno con PIN, el personal con
 * contraseña. Se decide con el rol leído de la base, no con el claim.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getSessionState } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const state = await getSessionState();
  const locale = await resolveLocale(state.kind === "active" ? state.profile.locale : undefined);
  return { title: getDictionary(locale).account.title };
}

export default async function AccountPage() {
  const state = await getSessionState();

  // Cookie viva pero perfil inutilizable: se cierra sesión ANTES de volver al
  // login, o el middleware devolvería al usuario aquí sin fin. Es el mismo
  // razonamiento que documenta `requireRole`.
  if (state.kind === "stale") redirect(ROUTES.logout);
  if (state.kind === "anonymous") redirect(ROUTES.login);

  const profile = state.profile;
  const locale = await resolveLocale(profile.locale);
  const t = getDictionary(locale);
  const A = t.account;

  const esAlumno = profile.role === "student";

  // El código de alumno vive en `students`, no en `profiles`. Solo se consulta
  // si hace falta: al personal no le sobra una fila, le sobra la consulta.
  let studentCode: string | null = null;
  let schoolName: string | null = null;

  const supabase = await createClient();

  if (esAlumno) {
    const { data } = await supabase
      .from("students")
      .select("student_code")
      .eq("profile_id", profile.id)
      .maybeSingle();
    studentCode = (data as { student_code?: string } | null)?.student_code ?? null;
  }

  if (profile.schoolId !== null) {
    const { data } = await supabase
      .from("schools")
      .select("name")
      .eq("id", profile.schoolId)
      .maybeSingle();
    schoolName = (data as { name?: string } | null)?.name ?? null;
  }

  const filas: readonly { readonly etiqueta: string; readonly valor: string }[] = [
    { etiqueta: A.name, valor: profile.fullName },
    ...(studentCode !== null ? [{ etiqueta: A.code, valor: studentCode }] : []),
    ...(schoolName !== null ? [{ etiqueta: A.school, valor: schoolName }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">{A.title}</h1>
      <p className="mt-2 text-muted">{A.subtitle}</p>

      <dl className="mt-8 divide-y divide-line rounded-xl border-2 border-line bg-card">
        {filas.map((fila) => (
          <div key={fila.etiqueta} className="flex flex-wrap gap-2 px-5 py-4">
            <dt className="w-40 shrink-0 text-sm font-semibold text-muted">{fila.etiqueta}</dt>
            <dd className="text-ink">{fila.valor}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <Link
          href={esAlumno ? ROUTES.pinChange : ROUTES.passwordChange}
          className="flex items-center gap-4 rounded-xl border-2 border-line bg-card p-5 transition-colors hover:border-teal"
        >
          <span
            aria-hidden="true"
            className="h-11 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--teal)" }}
          />
          <span>
            <span className="block text-lg font-semibold text-ink">
              {esAlumno ? A.changePin : A.changePassword}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {esAlumno ? A.changePinHint : A.changePasswordHint}
            </span>
          </span>
        </Link>
      </div>

      <p className="mt-8">
        <Link href={esAlumno ? ROUTES.studentHome : ROUTES.staffHome} className="text-sm font-semibold text-teal">
          ← {t.common.back}
        </Link>
      </p>
    </div>
  );
}
