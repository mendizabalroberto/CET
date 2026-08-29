/**
 * Alta de tutor a partir de una invitación.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * EL CORREO NO SE ELIGE, SE ENSEÑA
 * ---------------------------------------------------------------------------
 * Viene de la invitación y se pinta en un campo de solo lectura. No es una
 * comodidad: el servidor usa el correo de la fila de `guardian_invites` y
 * IGNORA lo que llegue en el formulario, así que un enlace reenviado por error
 * no le fabrica una cuenta a quien lo reenvió. El campo deshabilitado solo hace
 * visible una decisión que ya está tomada en el servidor.
 *
 * Y por eso mismo no hay correo de verificación aparte: la invitación se
 * entregó por ese buzón, así que abrirla ya demuestra que se controla.
 */
"use client";

import { useActionState, useId } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { altaDeTutor } from "@/lib/tutor/actions";

const ESTADO_INICIAL = { ok: false } as const;

interface AltaDeTutorFormProps {
  readonly token: string;
  readonly email: string;
}

export function AltaDeTutorForm({ token, email }: AltaDeTutorFormProps) {
  const { t } = useI18n();
  const [state, formAction, isPending] = useActionState(altaDeTutor, ESTADO_INICIAL);

  const errorId = useId();
  const emailId = useId();
  const nombreId = useId();
  const passwordId = useId();

  const S = t.tutor.signUp;

  const mensaje =
    state.errorKey === undefined
      ? null
      : (t.tutor.errors[state.errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <h1 className="text-2xl font-bold text-ink">{S.title}</h1>

      {mensaje ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      {state.successKey === "altaCompletadaEntraTu" ? (
        <p
          role="status"
          className="rounded-lg border-l-4 border-teal bg-teal/10 px-4 py-3 text-[15px] text-ink"
        >
          {S.doneSignInYourself}
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor={emailId} className="block font-semibold text-ink">
          {S.emailLabel}
        </label>
        {/* `readOnly` y no `disabled`: un campo deshabilitado no se anuncia
            igual en los lectores de pantalla y desaparece del recorrido de
            tabulación, y aquí el valor es información que el tutor necesita
            leer y confirmar antes de crear su cuenta. */}
        <input
          id={emailId}
          value={email}
          readOnly
          aria-describedby={`${emailId}-help`}
          className="w-full rounded-xl border-2 border-line bg-card/60 px-4 py-3 text-ink"
        />
        <p id={`${emailId}-help`} className="text-sm text-muted">
          {S.emailFixed}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={nombreId} className="block font-semibold text-ink">
          {S.fullNameLabel}
        </label>
        <input
          id={nombreId}
          name="fullName"
          autoComplete="name"
          required
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-ink focus:border-teal focus-visible:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={passwordId} className="block font-semibold text-ink">
          {S.passwordLabel}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          aria-describedby={`${passwordId}-help`}
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-ink focus:border-teal focus-visible:outline-none"
        />
        <p id={`${passwordId}-help`} className="text-sm text-muted">
          {S.passwordHelp}
        </p>
      </div>

      <input type="hidden" name="token" value={token} />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-60"
      >
        {isPending ? S.submitting : S.submit}
      </button>
    </form>
  );
}
