/**
 * Frontera de error de la app.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Obligatoriamente un Client Component: React necesita `reset()` para volver a
 * montar el subárbol. Es de los poquísimos "use client" justificados aquí.
 *
 * NO se muestra `error.message`. En producción Next lo enmascara, pero en
 * desarrollo puede contener nombres de tablas o de columnas, y esta pantalla la
 * ve un niño de 11 años: un volcado técnico no le sirve de nada y a un curioso
 * le sirve de mapa.
 */
"use client";

import { useEffect } from "react";

import { useOptionalI18n } from "@/lib/i18n/provider";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // `useOptionalI18n` y no `useI18n`: las páginas públicas no montan provider,
  // y un boundary que lanza al renderizarse deja al usuario sin nada.
  const { t } = useOptionalI18n();

  useEffect(() => {
    // El `digest` es el único identificador seguro: correlaciona lo que vio el
    // usuario con la traza completa del servidor sin filtrar nada.
     
    console.error("[cet] error boundary", error.digest ?? "sin digest");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-ink">{t.errors.genericTitle}</h1>
        <p className="mt-3 text-muted">{t.errors.genericBody}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 rounded-xl bg-brand px-6 py-3 font-semibold text-on-brand"
        >
          {t.errors.retry}
        </button>
      </div>
    </div>
  );
}
