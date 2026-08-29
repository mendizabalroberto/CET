/**
 * Invitar a un tutor desde el panel de administración.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ES LA SUTURA CON LA CONTRATACIÓN
 * ---------------------------------------------------------------------------
 * Hoy el superadmin teclea un correo y copia el enlace. Cuando exista el
 * proceso de compra, será ese proceso quien llame a `invitarTutor(email)` — la
 * misma acción de dominio, con la columna `contrato_ref` de `guardian_invites`
 * rellena en vez de vacía. Esta pantalla no tiene que desaparecer entonces:
 * seguirá siendo la forma de invitar a mano a quien haga falta.
 *
 * La URL se enseña una vez y no vuelve: la base guarda solo su SHA-256, así que
 * no hay consulta que pueda reconstruirla. Mismo trato que el PIN de un solo
 * uso, y por eso el aviso va pegado al enlace y no al pie.
 */
"use client";

import { useActionState, useState } from "react";

import { fill, type StaffDictionary } from "@/components/staff/i18n";
import { invitarTutor } from "@/lib/tutor/actions";

const ESTADO_INICIAL = { ok: false } as const;

export function InvitarTutor({ t }: { readonly t: StaffDictionary }) {
  const [state, formAction, isPending] = useActionState(invitarTutor, ESTADO_INICIAL);
  const [copiado, setCopiado] = useState(false);

  const I = t.admin.inviteTutor;

  const url = typeof state.values?.["url"] === "string" ? state.values["url"] : null;
  const email = typeof state.values?.["email"] === "string" ? state.values["email"] : null;

  const mensaje =
    state.errorKey === undefined
      ? null
      : state.errorKey === "emailFormat"
        ? I.errors.emailFormat
        : I.errors.generic;

  return (
    <section className="rounded-2xl border-2 border-line bg-card p-5">
      <h2 className="text-lg font-bold text-ink">{I.title}</h2>
      <p className="mt-2 text-muted">{I.body}</p>

      {mensaje !== null ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      {url !== null ? (
        <div className="mt-4 space-y-3">
          <p className="font-semibold text-ink">{fill(I.sentTo, { email: email ?? "" })}</p>

          <p className="rounded-lg border-l-4 border-teal bg-teal/10 px-4 py-3 text-[15px] font-semibold text-ink">
            {I.once}
          </p>

          <p className="break-all rounded-lg bg-bg px-4 py-3 font-mono text-sm text-ink">{url}</p>

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopiado(true);
              });
            }}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand"
          >
            {copiado ? I.copied : I.copy}
          </button>
        </div>
      ) : (
        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-2">
            <label htmlFor="invitar-tutor-email" className="block font-semibold text-ink">
              {I.emailLabel}
            </label>
            <input
              id="invitar-tutor-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-ink focus:border-teal focus-visible:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
          >
            {isPending ? I.submitting : I.submit}
          </button>
        </form>
      )}
    </section>
  );
}
