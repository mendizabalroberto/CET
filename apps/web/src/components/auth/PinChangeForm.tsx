/**
 * Cambio obligatorio de PIN en el primer acceso (AD-4).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El profesor genera el PIN inicial; el alumno lo cambia aquí por uno que solo
 * sabe él. Mientras `students.pin_must_change` sea true, el layout de alumno
 * redirige aquí, así que esta pantalla no se puede saltar navegando.
 */
"use client";

import { useActionState, useId } from "react";

import { authErrorMessage } from "@/components/auth/errorMessage";
import { PinInput } from "@/components/auth/PinInput";
import { changePin } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/auth/state";
import { useI18n } from "@/lib/i18n/provider";

export function PinChangeForm({ pinLength }: { pinLength: number }) {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(changePin, IDLE_STATE);

  const errorId = useId();
  const message = authErrorMessage(state.error, t, fmt, pinLength);
  const P = t.auth.pinChange;

  return (
    <form action={formAction} className="space-y-7">
      {message ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {message}
        </p>
      ) : null}

      <PinInput
        name="currentPin"
        length={pinLength}
        label={P.currentLabel}
        disabled={isPending}
        {...(state.field === "currentPin" && message ? { errorId } : {})}
      />

      <PinInput
        name="newPin"
        length={pinLength}
        label={P.newLabel}
        help={P.rules}
        disabled={isPending}
        {...(state.field === "newPin" && message ? { errorId } : {})}
      />

      <PinInput
        name="confirmPin"
        length={pinLength}
        label={P.confirmLabel}
        disabled={isPending}
        {...(state.field === "confirmPin" && message ? { errorId } : {})}
      />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-60"
      >
        {isPending ? P.saving : P.submit}
      </button>
    </form>
  );
}
