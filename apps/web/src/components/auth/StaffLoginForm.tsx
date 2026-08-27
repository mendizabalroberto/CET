/**
 * Login de personal: email + contraseña.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
"use client";

import { useActionState, useId } from "react";

import { authErrorMessage } from "@/components/auth/errorMessage";
import { signInStaff } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/auth/state";
import { useI18n } from "@/lib/i18n/provider";

const FIELD =
  "w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-base text-ink focus:border-teal focus-visible:outline-none";

export function StaffLoginForm() {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(signInStaff, IDLE_STATE);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const message = authErrorMessage(state.error, t, fmt);
  const S = t.auth.staff;

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
        <label htmlFor={emailId} className="mb-1.5 block font-semibold text-ink">
          {S.emailLabel}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder={S.emailPlaceholder}
          {...(message ? { "aria-describedby": errorId } : {})}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={passwordId} className="mb-1.5 block font-semibold text-ink">
          {S.passwordLabel}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          {...(message ? { "aria-describedby": errorId } : {})}
          className={FIELD}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-brand px-6 py-3.5 font-semibold text-on-brand disabled:opacity-60"
      >
        {isPending ? S.signingIn : S.signIn}
      </button>
    </form>
  );
}
