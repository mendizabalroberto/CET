/**
 * El enlace de acceso de un hijo: crear, copiar una vez, anular.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * LA URL SE ENSEÑA UNA VEZ Y NO VUELVE
 * ---------------------------------------------------------------------------
 * Vive en el estado de esta acción y en ningún otro sitio: la base guarda solo
 * su SHA-256, y ninguna consulta la puede reconstruir. Es el mismo trato que ya
 * recibe el PIN de un solo uso en el panel de administración, y por eso el
 * aviso va PEGADO al enlace y no al pie de la página — un tutor que cierre esta
 * pantalla sin copiarlo tiene que crear otro.
 */
"use client";

import { useActionState, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { crearEnlaceDeAcceso } from "@/lib/tutor/actions";

const ESTADO_INICIAL = { ok: false } as const;

export function EnlaceDeAcceso({
  studentId,
  yaTieneEnlace,
}: {
  readonly studentId: string;
  readonly yaTieneEnlace: boolean;
}) {
  const { t } = useI18n();
  const [state, formAction, isPending] = useActionState(crearEnlaceDeAcceso, ESTADO_INICIAL);
  const [copiado, setCopiado] = useState(false);

  const C = t.tutor.child;
  const url = typeof state.values?.["url"] === "string" ? state.values["url"] : null;

  const mensaje =
    state.errorKey === undefined
      ? null
      : (t.tutor.errors[state.errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

  return (
    <section className="rounded-2xl border-2 border-line bg-card p-5">
      <h2 className="text-lg font-bold text-ink">{C.linkTitle}</h2>
      <p className="mt-2 text-muted">{C.linkBody}</p>

      {mensaje ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      {url !== null ? (
        <div className="mt-4 space-y-3">
          {/* Aviso ANTES del enlace: quien lee de arriba abajo se entera de que
              no habrá una segunda oportunidad antes de decidir si copia. */}
          <p className="rounded-lg border-l-4 border-teal bg-teal/10 px-4 py-3 text-[15px] font-semibold text-ink">
            {C.linkOnce}
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
            {copiado ? C.linkCopied : C.linkCopy}
          </button>
        </div>
      ) : (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="studentId" value={studentId} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
          >
            {yaTieneEnlace ? C.linkRegenerate : C.linkGenerate}
          </button>
        </form>
      )}
    </section>
  );
}
