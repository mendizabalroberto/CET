/**
 * El niño elige su PIN al abrir el enlace de su tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * UNA PANTALLA, UN CAMPO (bueno, dos casillas del mismo campo)
 * ---------------------------------------------------------------------------
 * El login de alumno se hizo en tres pasos con un motivo escrito en su
 * cabecera: «un niño de 11 años delante de tres campos a la vez se equivoca de
 * casilla». Aquí ese motivo se cumple mejor todavía, porque el enlace ya dice
 * quién es: no hay colegio que elegir ni código que teclear. Queda elegir el
 * PIN y entrar.
 *
 * POR QUÉ SE FIJA Y NO SE CAMBIA
 * El recorrido de siempre genera un PIN, alguien se lo dicta al niño y el niño
 * lo cambia. Aquí no hay PIN anterior que teclear porque nunca existió: el
 * enlace, que sirve una sola vez, ES la prueba de identidad. Una credencial
 * menos viajando por WhatsApp.
 */
"use client";

import { useActionState, useId } from "react";

import { PinInput } from "@/components/auth/PinInput";
import { useI18n } from "@/lib/i18n/provider";
import { canjearEnlace } from "@/lib/tutor/actions";

const ESTADO_INICIAL = { ok: false } as const;

interface ElegirPinFormProps {
  readonly token: string;
  /** Solo el nombre de pila. Nunca los apellidos, el curso ni el colegio. */
  readonly nombreDePila: string;
  readonly longitudDePin: 4 | 6;
}

export function ElegirPinForm({ token, nombreDePila, longitudDePin }: ElegirPinFormProps) {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(canjearEnlace, ESTADO_INICIAL);

  const errorId = useId();
  const R = t.tutor.redeem;

  /*
   * Las casillas se vacían solas cuando vuelve un error. Dejar escrito el PIN
   * fallido hace que el niño pulse otra vez con lo mismo — el mismo motivo por
   * el que `StudentLoginForm` remonta su `PinInput` con una `key`.
   */
  const intento = state.errorKey ? `${errorId}:${state.errorKey}` : "primero";

  const mensaje =
    state.errorKey === undefined
      ? null
      : (t.tutor.errors[state.errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">
          {fmt(R.greeting, { name: nombreDePila })}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{R.title}</h1>
        <p className="mt-2 text-muted">{fmt(R.body, { length: longitudDePin })}</p>
      </div>

      {mensaje ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      <PinInput
        key={`nuevo:${intento}`}
        name="pin"
        length={longitudDePin}
        label={R.pinLabel}
        {...(mensaje ? { errorId } : {})}
        autoFocus
        disabled={isPending}
      />

      <PinInput
        key={`repetido:${intento}`}
        name="pinRepetido"
        length={longitudDePin}
        label={R.repeatLabel}
        disabled={isPending}
      />

      <input type="hidden" name="token" value={token} />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-60"
      >
        {isPending ? R.submitting : R.submit}
      </button>
    </form>
  );
}
