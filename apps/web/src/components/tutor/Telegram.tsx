/**
 * Los avisos por Telegram, desde el lado del padre: conectar, ver el enlace,
 * cortar.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * TRES ESTADOS, Y NINGUNO SE PUEDE SALTAR
 * ===========================================================================
 *   1. Sin conectar        → un botón, y nada más.
 *   2. Enlace ya generado  → el enlace VISIBLE y qué tiene que hacer con él.
 *   3. Conectado           → desde cuándo, y cómo cortarlo.
 *
 * El estado 2 existe porque el vínculo va al revés de lo que parece: un bot de
 * Telegram no puede escribir a quien no le ha escrito antes, así que el último
 * paso lo da el padre pulsando «Empezar» en su propio Telegram. Si esta
 * pantalla no lo dijera, el padre pulsaría el enlace, vería un chat, y se iría
 * sin pulsar nada — y no habría avisos, sin que nada explicara por qué.
 *
 * ===========================================================================
 * EL ENLACE SE ENSEÑA UNA VEZ Y NO VUELVE
 * ===========================================================================
 * Vive en el estado de la acción y en ningún otro sitio: la base guarda solo su
 * SHA-256. Mismo trato que la URL de `EnlaceDeAcceso` y que el PIN de un solo
 * uso del panel de administración. Quien cierre esta pantalla sin pulsarlo
 * genera otro — y por eso el botón nunca desaparece del todo.
 *
 * ===========================================================================
 * POR QUE LA PAGINA LE PONE UN `key` A ESTE COMPONENTE
 * ===========================================================================
 * `useActionState` sobrevive a los rerenderizados del servidor. Sin el `key`,
 * la URL que quedó en el estado del cliente seguiría pintada después de que el
 * webhook la quemara o de que el padre se desconectara: un enlace muerto, con
 * aspecto de vivo, en la pantalla de quien acaba de decir que no quiere avisos.
 * El `key` sale de `vinculadoAt`, que es justo lo que cambia en esos dos
 * momentos, y al cambiar tira el estado viejo.
 */
"use client";

import { useActionState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { desvincularTelegram, vincularTelegram } from "@/lib/tutor/actions";

const ESTADO_INICIAL = { ok: false } as const;

export function Telegram({
  vinculado,
  vinculadoAt,
}: {
  readonly vinculado: boolean;
  readonly vinculadoAt: string | null;
}) {
  const { t, fmt, locale } = useI18n();
  const [conectar, accionConectar, conectando] = useActionState(vincularTelegram, ESTADO_INICIAL);
  const [cortar, accionCortar, cortando] = useActionState(desvincularTelegram, ESTADO_INICIAL);

  const T = t.tutor.telegram;

  const url = typeof conectar.values?.["url"] === "string" ? conectar.values["url"] : null;

  // El error de cualquiera de las dos acciones, con el mismo tratamiento: al
  // padre le da igual cuál de los dos botones falló, lo que necesita saber es
  // que no ha pasado nada.
  const claveDeError = conectar.errorKey ?? cortar.errorKey;
  const mensaje =
    claveDeError === undefined
      ? null
      : (t.tutor.errors[claveDeError as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

  return (
    <section className="rounded-2xl border-2 border-line bg-card p-5">
      <h2 className="text-lg font-bold text-ink">{T.title}</h2>
      <p className="mt-2 text-muted">{T.body}</p>

      {mensaje ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      {url !== null ? (
        /* --- 2 · Enlace generado, esperando a que lo pulse ------------------ */
        <div className="mt-4 space-y-3">
          <p className="font-semibold text-ink">{T.pendingTitle}</p>
          <p className="text-[15px] text-ink">{T.pendingBody}</p>

          <a
            href={url}
            target="_blank"
            /* `noreferrer` además de `noopener`: no hay razón para contarle a
               Telegram desde qué pantalla del panel de un padre se llegó. */
            rel="noopener noreferrer"
            className="inline-block rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand"
          >
            {T.open}
          </a>

          {/* El enlace también en claro: en un móvil el botón abre la app, pero
              quien esté en el ordenador puede necesitar copiarlo al teléfono. */}
          <p className="break-all rounded-lg bg-bg px-4 py-3 font-mono text-sm text-ink">{url}</p>

          <p className="text-sm text-muted">{T.pendingExpires}</p>
        </div>
      ) : vinculado ? (
        /* --- 3 · Conectado -------------------------------------------------- */
        <div className="mt-4 space-y-3">
          <p className="font-semibold text-ink">{T.connected}</p>
          {vinculadoAt !== null ? (
            <p className="text-[15px] text-muted">
              {fmt(T.connectedSince, {
                date: new Date(vinculadoAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-GB"),
              })}
            </p>
          ) : null}

          <form action={accionCortar}>
            <button
              type="submit"
              disabled={cortando}
              className="rounded-xl border-2 border-line px-5 py-3 font-semibold text-ink disabled:opacity-60"
            >
              {cortando ? T.disconnecting : T.disconnect}
            </button>
          </form>
        </div>
      ) : (
        /* --- 1 · Sin conectar ----------------------------------------------- */
        <form action={accionConectar} className="mt-4">
          <button
            type="submit"
            disabled={conectando}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
          >
            {conectando ? T.enabling : T.enable}
          </button>
        </form>
      )}
    </section>
  );
}
