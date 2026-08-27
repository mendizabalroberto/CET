/**
 * Solicitud de registro. Queda pendiente de aprobación del administrador.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Minimización de datos (MASTER_PLAN §9): se piden cuatro cosas y ninguna más.
 * Ni fecha de nacimiento, ni teléfono, ni dirección. Lo que no se pide no se
 * puede filtrar.
 */
"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { authErrorMessage } from "@/components/auth/errorMessage";
import type { SchoolOption } from "@/components/auth/StudentLoginForm";
import { submitRegistration } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/auth/state";
import { useI18n } from "@/lib/i18n/provider";
import { ROUTES } from "@/lib/routes";

const FIELD =
  "w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-base text-ink focus:border-teal focus-visible:outline-none";

const YEAR_LEVELS = Array.from({ length: 13 }, (_, i) => i + 1);

export function RegisterForm({ schools }: { schools: readonly SchoolOption[] }) {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(submitRegistration, IDLE_STATE);

  const schoolId = useId();
  const nameId = useId();
  const yearId = useId();
  const emailId = useId();
  const noteId = useId();
  const consentId = useId();
  const errorId = useId();

  const message = authErrorMessage(state.error, t, fmt);
  const R = t.register;

  return (
    <form action={formAction} className="space-y-5">
      {message ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {message}
        </p>
      ) : null}

      <div>
        <label htmlFor={schoolId} className="mb-1.5 block font-semibold text-ink">
          {R.schoolLabel}
        </label>
        <select id={schoolId} name="schoolId" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            {R.schoolPlaceholder}
          </option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={nameId} className="mb-1.5 block font-semibold text-ink">
          {R.fullNameLabel}
        </label>
        <input id={nameId} name="fullName" required maxLength={120} autoComplete="off" className={FIELD} />
      </div>

      <div>
        <label htmlFor={yearId} className="mb-1.5 block font-semibold text-ink">
          {R.yearLevelLabel}
        </label>
        <select id={yearId} name="requestedYearLevel" required defaultValue="6" className={FIELD}>
          {YEAR_LEVELS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={emailId} className="mb-1.5 block font-semibold text-ink">
          {R.guardianEmailLabel}
        </label>
        <input
          id={emailId}
          name="guardianEmail"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          aria-describedby={`${emailId}-help`}
          className={FIELD}
        />
        <p id={`${emailId}-help`} className="mt-1.5 text-sm text-muted">
          {R.guardianEmailHelp}
        </p>
      </div>

      <div>
        <label htmlFor={noteId} className="mb-1.5 block font-semibold text-ink">
          {R.noteLabel}
        </label>
        <textarea id={noteId} name="note" rows={3} maxLength={1000} className={FIELD} />
      </div>

      <div className="flex gap-3 rounded-xl border border-line bg-surface-alt p-4">
        <input
          id={consentId}
          name="consent"
          type="checkbox"
          required
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--teal)]"
        />
        <label htmlFor={consentId} className="text-sm leading-relaxed text-ink">
          {R.consent}{" "}
          <Link href={ROUTES.privacy} className="font-semibold text-teal underline underline-offset-2">
            {t.footer.privacy}
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-brand px-6 py-3.5 font-semibold text-on-brand disabled:opacity-60"
      >
        {isPending ? R.submitting : R.submit}
      </button>
    </form>
  );
}
