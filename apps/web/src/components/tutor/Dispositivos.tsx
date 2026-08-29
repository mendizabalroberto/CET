/**
 * Los aparatos que recuerdan a un hijo, y el botón de olvidarlos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * LO QUE SE ENSEÑA DE CADA APARATO
 * ---------------------------------------------------------------------------
 * «Chrome en Android» y cuándo se usó por última vez. Ni el user-agent, ni la
 * IP, ni el secreto — que además no existe fuera de la cookie del propio
 * aparato. Es lo justo para que un padre reconozca cuál está anulando, que es
 * la única decisión que esta lista le pide.
 *
 * «Olvidar» no borra la fila: le pone `revoked_at`. Un aparato anulado deja de
 * abrir la cuenta, y queda constancia de que existió y de cuándo dejó de valer.
 */
"use client";

import { useActionState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { olvidarDispositivo } from "@/lib/tutor/actions";
import type { DispositivoRow } from "@/lib/tutor/queries";

const ESTADO_INICIAL = { ok: false } as const;

export function Dispositivos({ dispositivos }: { readonly dispositivos: readonly DispositivoRow[] }) {
  const { t, fmt, locale } = useI18n();
  const [state, formAction, isPending] = useActionState(olvidarDispositivo, ESTADO_INICIAL);

  const C = t.tutor.child;

  const mensaje =
    state.errorKey === undefined
      ? null
      : (t.tutor.errors[state.errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

  return (
    <section className="rounded-2xl border-2 border-line bg-card p-5">
      <h2 className="text-lg font-bold text-ink">{C.devicesTitle}</h2>

      {mensaje ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      {dispositivos.length === 0 ? (
        <p className="mt-2 text-muted">{C.devicesEmpty}</p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {dispositivos.map((dispositivo) => (
              <li
                key={dispositivo.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {dispositivo.etiqueta ?? dispositivo.agenteFamilia ?? "—"}
                  </p>
                  {dispositivo.ultimoUso !== null ? (
                    <p className="text-sm text-muted">
                      {fmt(C.devicesLastSeen, {
                        when: new Date(dispositivo.ultimoUso).toLocaleDateString(
                          locale === "es" ? "es-ES" : "en-GB",
                        ),
                      })}
                    </p>
                  ) : null}
                </div>

                <form action={formAction}>
                  <input type="hidden" name="deviceId" value={dispositivo.id} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-xl border-2 border-line px-4 py-2 font-semibold text-ink disabled:opacity-60"
                  >
                    {C.devicesForget}
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-sm text-muted">{C.devicesForgetHelp}</p>
        </>
      )}
    </section>
  );
}
